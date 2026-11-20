// Settings › Cheat Config number fields: only a number reaches Apply (an emptied cap field once applied "",
// which the game reads as a cap of 0), and caps shown as 1e+21 take E-notation instead of losing the "e".
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
const { store } = await loadUi(router);
globalThis.requestAnimationFrame = () => {};

const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};

async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const sent = [];
const realUpdate = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    const body = await req.json();
    sent.push(body.cheatConfig.maxval);
    return realUpdate({ json: async () => body }, res);
});

const { VIEWS } = await importRepo("src/ui/state/constants.js");
const { Config } = await importRepo("src/ui/components/views/Config.js");
store.app.activeTab = VIEWS.CONFIG.id;
const page = Config();
const field = (key) =>
    elements(elements(page).find((n) => n.attributes?.["data-config-key"] === `cheatConfig.maxval.${key}`)).find(
        (n) => n.nodeName === "input"
    );
await until(() => field("creditcap") && field("bones"), "the settings to load");

// What the field shows: VanJS binds a plain field's value as an attribute on the fake DOM.
const shown = (input) => input.value ?? input.attributes.value;
// What the player does, as the browser reports it.
const edit = (input, value) => {
    input.listeners.focus({ target: input });
    input.value = value;
    input.listeners.input({ target: input });
    input.listeners.blur({ target: input });
};
const apply = async () => {
    const count = sent.length;
    const btn = elements(page).find((n) => n.attributes?.id === "update-config-button");
    btn.listeners.click({ currentTarget: btn });
    await until(() => sent.length > count, "Apply to send the settings");
    return sent.at(-1);
};

test("an emptied or half-typed cap field is refused in place and Apply keeps the cap", async () => {
    const cap = field("creditcap");
    const before = shown(cap);
    // 1e400 and Infinity parse to Infinity, which Apply would send as null: a cap of 0 again.
    for (const typed of ["", "-", "abc", "1e400", "Infinity"]) {
        edit(cap, typed);
        assert.equal(shown(cap), before, `"${typed}" is put back to the cap it would have replaced`);
        assert.equal((await apply()).creditcap, Number(before), `"${typed}" never reaches the game`);
    }
});

test("a cap cleared with Backspace and left empty keeps the cap it held, not the last digit", async () => {
    for (const key of ["creditcap", "bones"]) {
        const cap = field(key);
        const before = shown(cap);
        cap.listeners.focus({ target: cap });
        // Each Backspace is one input event; the prefixes on the way are numbers too ("1000", "1e+2", "1").
        for (let typed = before; typed.length > 0; ) {
            typed = typed.slice(0, -1);
            cap.value = typed;
            cap.listeners.input({ target: cap });
        }
        cap.listeners.blur({ target: cap });
        assert.equal(shown(cap), before, `${key} shows the cap it held`);
        assert.equal((await apply())[key], Number(before), `${key} keeps the cap it held`);
    }
});

test("a cap shown as 1e+21 takes E-notation", async () => {
    const bones = field("bones");
    assert.equal(shown(bones), "1e+21");
    edit(bones, "2e21");
    assert.equal(shown(bones), "2e+21");
    assert.equal((await apply()).bones, 2e21);
    edit(bones, "5b");
    assert.equal((await apply()).bones, 5e9, "the k/m/b/t shorthand still works");
});
