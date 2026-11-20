// Pets on at start: choosing pets also makes "w1 companion" a startup cheat, so the pets come back after a restart;
// clearing them takes it off the list. Startup cheats toggle, so with "w1" (every W1 cheat) listed it isn't added.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
// Click again places its tooltip on the next frame and on <body>, as in the menu.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const { updateSessionConfig } = await importRepo("src/ui/services/api.js");

// What the page hands the config file save (the fake API's own save writes nothing).
const saves = [];
router.routes.POST.set("/api/config/save", async (req, res) => {
    saves.push(await req.json());
    res.json({ ok: true });
});

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const byClass = (root, name) =>
    elements(root).filter((node) => String(node.attributes.class).split(" ").includes(name));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const page = (await importRepo("src/ui/pages/world-1/pets/pets.js")).default.component();
// Plain pets: a token pet's click removes its token instead, and an owned one shows OWNED.
const plainPets = () =>
    byClass(page, "companion-card-wrap")
        .filter((card) => /NOT SELECTED/.test(text(card)))
        .map((card) => card.childNodes.find((node) => node.nodeName === "button"));
await until(() => byClass(page, "companion-card-wrap").length > 3, "the pets to load");
const clearAll = elements(page).find((node) => node.nodeName === "button" && text(node) === "Clear all");
// Clear all asks in place first (#25): the first press arms it, the second clears.
const press = (button) => button.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: button });
const saved = async (click) => {
    const count = saves.length;
    await click();
    await until(() => saves.length > count, "the config save");
    await new Promise((resolve) => setTimeout(resolve, 30)); // the save's answer reaches the page
    return saves.at(-1).startupCheats;
};

test("clearing every pet takes w1 companion off the startup cheats", async () => {
    await updateSessionConfig({ startupCheats: ["godlike reach", "w1 companion"] });
    assert.deepEqual(
        await saved(async () => {
            await press(clearAll);
            await press(clearAll);
        }),
        ["godlike reach"]
    );
    // Only what it changed: a whole config read before another page's change would put that change back.
    assert.deepEqual(saves.at(-1).cheatConfig, { w1: { companion: { companions: "none" } } });
    assert.equal(saves.at(-1).injectorConfig, undefined);
});

// Unselected once the first test cleared them.
let first, second, third;

test("choosing a pet adds w1 companion to the startup cheats, once", async () => {
    await until(() => plainPets().length >= 3, "unselected pets");
    [first, second, third] = plainPets();
    await updateSessionConfig({ startupCheats: ["godlike reach"] });
    assert.deepEqual(await saved(() => first.listeners.click({})), ["godlike reach", "w1 companion"]);
    await updateSessionConfig({ startupCheats: ["godlike reach", "w1 companion"] });
    assert.deepEqual(await saved(() => second.listeners.click({})), ["godlike reach", "w1 companion"]);
});

test("with every W1 cheat on at start, choosing a pet adds nothing that would toggle it back off", async () => {
    await updateSessionConfig({ startupCheats: ["w1"] });
    assert.deepEqual(await saved(() => third.listeners.click({})), ["w1"]);
});

// The file and the session took the choice and the game didn't: the reason is said on the page, and the card shows the
// read after it, what the file holds.
test("a pet choice the game didn't take is said on the page, and its card shows what was saved", async () => {
    await until(() => plainPets().length >= 1, "an unselected pet");
    const [pet] = plainPets();
    const wrap = byClass(page, "companion-card-wrap").find((card) => card.childNodes.includes(pet));
    const routes = router.routes.POST;
    const update = routes.get("/api/config/update");
    routes.set("/api/config/update", async (req, res) => {
        await update(req, { status: () => ({ json() {} }), json() {} });
        res.json({
            message: "Configuration updated on server, but failed to apply in game",
            details: "The game is busy",
        });
    });
    const count = saves.length;
    try {
        await pet.listeners.click({});
        await until(() => /The game is busy/.test(text(page)), "the reason on the page");
        await until(() => !/NOT SELECTED/.test(text(wrap)), "the card to show the saved choice");
        assert.equal(saves.length, count + 1, "the file took it first");
    } finally {
        routes.set("/api/config/update", update);
    }
});
