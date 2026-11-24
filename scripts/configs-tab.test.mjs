// Settings › Configs (#198): a row per config; Use switches, Delete asks once more first, a failure is said on its
// row with the reason, and Save current as new says a refused name beside the field.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.requestAnimationFrame = () => {};
const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const { Configs } = await importRepo("src/ui/components/config/Configs.js");

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const list = (active, own = ["My config"]) => ({
    active,
    list: [
        { name: "Light", shipped: true, about: "Quality of life only", changed: false, cheats: 9 },
        { name: "AFK", shipped: true, about: "Light, plus help while idling", changed: false, cheats: 28 },
        ...own.map((name) => ({ name, shipped: false, cheats: 0 })),
    ],
});

/** The server's configs route, answering with `answer(body)`; returns the requests it got. */
function fakeRoute(answer) {
    const asked = [];
    router.post("/api/configs", async (req, res) => {
        const body = await req.json();
        asked.push(body);
        const { status = 200, ...reply } = answer(body);
        res.status(status).json(reply);
    });
    return asked;
}

const open = (configs) => {
    const state = van.state(configs);
    let changed = 0;
    const root = Configs({ configs: state, onChanged: async () => changed++ });
    const row = (name) =>
        elements(root).find((n) => n.getAttribute?.("role") === "listitem" && text(n).startsWith(name));
    const press = (name, word) => {
        const node = elements(row(name)).find((n) => n.nodeName === "button" && text(n) === word);
        return node.listeners.click({ currentTarget: node, target: node });
    };
    return { root, state, row, press, changed: () => changed };
};

test("each config is a row: its line, In use on the one in use, Use on the others, Delete only on own ones", async () => {
    const { root, row } = open(list("Light"));
    await until(() => row("My config"), "the rows");
    assert.match(text(row("Light")), /Quality of life only · 9 cheats.*In use/);
    assert.doesNotMatch(text(row("Light")), /Use$|Delete/);
    assert.match(text(row("AFK")), /28 cheatsUse$/);
    assert.match(text(row("My config")), /No cheatsDeleteUse$/);
    assert.ok(text(root).includes("Save current as new"));
});

test("Use switches and the page reads the settings again; a cheat that didn't start is said on that row", async () => {
    const asked = fakeRoute(() => ({
        configs: list("AFK"),
        game: { gameApplied: true, failed: [{ cheat: "w7 sushitools", reason: "Keep the in-game Sushi board open." }] },
    }));
    const { row, press, state, changed } = open(list("Light"));
    await until(() => row("AFK"), "the rows");
    press("AFK", "Use");
    await until(() => state.val.active === "AFK", "the switch");
    assert.deepEqual(asked, [{ action: "use", name: "AFK" }]);
    assert.equal(changed(), 1);
    await until(() => text(row("AFK")).includes("didn't start"), "the failure");
    assert.match(text(row("AFK")), /w7 sushitools didn't start\. Keep the in-game Sushi board open\./);
});

test("Delete asks once more before it deletes, and leaves the settings in use alone", async () => {
    const asked = fakeRoute(() => ({ configs: list("Light", []) }));
    const { row, press, changed } = open(list("Light"));
    await until(() => row("My config"), "the rows");
    press("My config", "Delete");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(asked, [], "the first press only asks");
    press("My config", "Delete");
    await until(() => !row("My config"), "the row to go");
    assert.deepEqual(asked, [{ action: "remove", name: "My config" }]);
    assert.equal(changed(), 0, "the settings in use are not read again, so unsaved edits stay");
});

test("a refused name is said beside the field, and the field keeps it", async () => {
    fakeRoute(() => ({ status: 400, error: "That name is taken." }));
    const { root } = open(list("Light"));
    const field = elements(root).find((n) => n.nodeName === "input");
    field.listeners.input({ target: { value: "light" } });
    const form = elements(root).find((n) => n.nodeName === "form");
    form.listeners.submit({ preventDefault() {}, currentTarget: form });
    await until(() => text(root).includes("That name is taken."), "the refusal");
});

test("in Settings, Use switches on one press when nothing is unsaved, and asks first when something is", async () => {
    const asked = fakeRoute(({ name }) => ({ configs: list(name) }));
    const { saveConfigFile } = await importRepo("src/ui/services/api.js");
    await saveConfigFile({ startupCheats: ["godlike reach"] });
    const { Config } = await importRepo("src/ui/components/views/Config.js");
    const root = Config();
    const row = (name) =>
        elements(root).find((n) => n.getAttribute?.("role") === "listitem" && text(n).startsWith(name));
    const press = (name, word) => {
        const node = elements(row(name)).find((n) => n.nodeName === "button" && text(n) === word);
        return node.listeners.click({ currentTarget: node, target: node });
    };
    await until(() => row("AFK"), "the Configs tab");
    await new Promise((resolve) => setTimeout(resolve, 50)); // the open-time sync
    press("AFK", "Use");
    await until(() => asked.length === 1, "the switch");

    // An edit on the Startup tab that isn't saved: the next switch asks first.
    const field = elements(root).find(
        (n) => n.nodeName === "input" && String(n.getAttribute?.("class")).includes("startup-cheat-input")
    );
    field.listeners.change({ target: { value: "godlike crit" } });
    await until(() => row("Light"), "the rows");
    press("Light", "Use");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(asked.length, 1, "the first press only asks");
    press("Light", "Use");
    await until(() => asked.length === 2, "the second press");
});

test("in Settings, Delete, Reset of a config not in use and Save current as new keep unsaved edits", async () => {
    let own = ["Mine", "Old"];
    let lightChanged = true;
    let active = "Mine";
    const configsNow = () => {
        const configs = list(active, own);
        configs.list[0].changed = lightChanged;
        return configs;
    };
    const asked = fakeRoute(({ action, name }) => {
        if (action === "remove") own = own.filter((n) => n !== name);
        if (action === "reset") lightChanged = false;
        if (action === "saveAs") ((own = [...own, name]), (active = name));
        return { configs: configsNow() };
    });
    const { saveConfigFile } = await importRepo("src/ui/services/api.js");
    await saveConfigFile({ startupCheats: ["godlike reach"] });
    const { Config } = await importRepo("src/ui/components/views/Config.js");
    const root = Config();
    const row = (name) =>
        elements(root).find((n) => n.getAttribute?.("role") === "listitem" && text(n).startsWith(name));
    const press = (name, word) => {
        const node = elements(row(name)).find((n) => n.nodeName === "button" && text(n) === word);
        return node.listeners.click({ currentTarget: node, target: node });
    };
    const byClass = (name) =>
        elements(root).find((n) => n.nodeName === "input" && String(n.getAttribute?.("class")).includes(name));
    await until(() => byClass("startup-cheat-input"), "the Startup rows");
    await new Promise((resolve) => setTimeout(resolve, 50)); // the open-time sync
    byClass("startup-cheat-input").listeners.change({ target: { value: "godlike crit" } });
    const kept = () => byClass("startup-cheat-input")?.attributes.value === "godlike crit";
    await until(kept, "the edit in the field");

    // Save current as new: its answer brings this test's list.
    byClass("configs-new__name").listeners.input({ target: { value: "Copy" } });
    const form = elements(root).find((n) => n.nodeName === "form");
    await form.listeners.submit({ preventDefault() {}, currentTarget: form });
    await until(() => row("Copy"), "the new config");
    assert.ok(kept(), "Save current as new kept the edit");

    press("Old", "Delete");
    press("Old", "Delete");
    await until(() => !row("Old"), "the deleted row to go");
    assert.ok(kept(), "Delete kept the edit");

    press("Light", "Reset");
    press("Light", "Reset");
    await until(() => !text(row("Light")).includes("Changed"), "Light reset");
    assert.ok(kept(), "Reset of a config not in use kept the edit");
    assert.deepEqual(
        asked.map(({ action }) => action),
        ["saveAs", "remove", "reset"]
    );
});
