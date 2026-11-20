// Classes › Grimoire › Automation (#92) on the fake game. One line per bone type says what it owns and what it saves
// for; each upgrade has its stop-at level, its High / Low / Balanced choice and its switch, and the bones share one
// saving %. Every change saves cheatConfig.automation.grimoire ({ saving, items }) to the game and the config file,
// switching an upgrade on turns the automation on, and after each save the page reads the game again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router } = await createFakeApi();
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const updates = [];
const saves = [];
let refuseUpdate = false;
let holdGrimoireReads = null; // grimoire reads wait on this, then answer what they read before it
let fileStartup = [];
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    res.json(switchAutomation(getAutomations().find(({ cheat }) => cheat === action).id, on));
});
const readComputedRoute = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { name } = await req.json();
    const hold = name === "grimoire" ? holdGrimoireReads : null;
    if (!hold) return readComputedRoute(req, res);
    let read;
    await readComputedRoute(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    await hold;
    res.json(read);
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    const body = await req.json();
    updates.push(body);
    if (refuseUpdate) return res.json({ message: "Config update failed", details: "the game is busy" });
    return update(req, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    saves.push(body);
    fileStartup = body.startupCheats ?? fileStartup;
    res.json({ ok: true });
});
const readConfig = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    let read;
    await readConfig(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    res.json(structuredClone({ ...read, startupCheats: [...fileStartup] }));
});
await loadUi(router);
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(typeof node.attributes.class === "function" ? "" : node.attributes.class);
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));
const row = (root, name) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
const tag = (root, name) => elements(root).find((node) => node.nodeName === name);
const checkbox = (node) =>
    elements(node).find((entry) => entry.nodeName === "input" && entry.attributes.type === "checkbox");
const button = (root, label) =>
    elements(root).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${typeof what === "function" ? what() : what}`);
}

const { readComputed } = await importRepo("src/ui/services/api.js");
const { cleanName } = await importRepo("src/ui/components/views/account/accountShared.js");
const game = await readComputed("automation", "grimoire");
const named = (id) => cleanName(game.upgrades[id].name, "", { stripMarker: true });
const page = (await importRepo("src/ui/pages/classes/grimoire/2-automation.js")).default.component();
await until(() => row(page, named(0)), "the Automation tab to load");

const saved = () => updates.at(-1)?.cheatConfig.automation.grimoire;
const grimoireOn = () => getAutomations().find(({ cheat }) => cheat === "automation grimoire").on;
const pick = (id) => row(page, named(id));
const saveState = (node) => classes(byClass(node, "save-state")[0]);
const subLine = (node) => text(byClass(node, "account-row__sub-label")[0]);
const choose = async (id, value) => {
    const since = updates.length;
    await tag(pick(id), "select").listeners.change({ target: { value } });
    await until(() => updates.length > since, "the priority to save");
};
const choice = (id) =>
    elements(tag(pick(id), "select"))
        .filter((node) => node.nodeName === "option" && node.attributes.selected)
        .map(text);
const savingRow = () => row(page, "Saving");
async function typeSaving(value) {
    const input = elements(savingRow()).find((node) => node.nodeName === "input");
    input.listeners.input({ target: { value } });
    const since = updates.length;
    byClass(savingRow(), "account-field-metric")[0].listeners.keydown({
        key: "Enter",
        target: input,
        preventDefault() {},
    });
    await until(() => updates.length > since || /save-state--error/.test(saveState(savingRow())), "the saving % save");
    await settle();
}

test("the tab shows the switch, one line per bone type, the saving %, and every upgrade with its level", () => {
    assert.ok(row(page, "Grimoire"), "the automation's own switch");
    assert.deepEqual(
        ["Femur", "Ribcage", "Cranium", "Bovinae"].map((name) => text(row(page, name))),
        [
            "FemurNothing switched on48.2K owned",
            "RibcageNothing switched on9.1K owned",
            "CraniumNothing switched on650 owned",
            "BovinaeNothing switched on0 owned",
        ]
    );
    assert.equal(
        byClass(page, "automation-pick").length,
        game.upgrades.length + 1,
        "every upgrade, and the saving row"
    );

    // Notes: the next level's cost in its bone, a lock with what unlocks it, or the max level.
    const open = game.upgrades.find(({ unlocked, level, max }) => unlocked && level < max);
    assert.match(subLine(pick(open.id)), new RegExp(`^Next level [\\d.,KMB]+ ${open.bone}$`));
    const locked = game.upgrades.find(({ unlocked }) => !unlocked);
    assert.match(subLine(pick(locked.id)), /^Unlocks at [\d.,K]+ total levels$/);
    const maxed = game.upgrades.find(({ level, max }) => max !== null && level >= max);
    assert.equal(subLine(pick(maxed.id)), "Max level");
    assert.match(text(pick(maxed.id)), new RegExp(`LV ${maxed.level} / ${maxed.max}`));
});

test("switching an upgrade on saves it with the saving % and turns the Grimoire automation on, now and at start", async () => {
    assert.equal(grimoireOn(), false);
    await checkbox(pick(0)).listeners.change({ target: { checked: true } });
    await until(() => grimoireOn() && /save-state--success/.test(saveState(pick(0))), "the automation to go on");
    assert.deepEqual(saved(), { saving: 10, items: [{ id: "0", on: true }] });
    assert.deepEqual(commands, [["automation grimoire", true]]);
    assert.deepEqual(fileStartup, ["automation grimoire"]);
    assert.ok(
        saves.some((body) => body.cheatConfig?.automation.grimoire.items.length === 1),
        "the file too"
    );
    await until(() => subLine(row(page, "Femur")) === "Buying cheapest first", "the bone line to read the game again");
});

test("a High or Low choice saves, and the bone line reads what it now saves for from the game", async () => {
    const id = game.upgrades.find(({ unlocked, level, max, bone }) => bone === "femur" && unlocked && level < max).id;
    await choose(id, "2");
    assert.deepEqual(
        saved().items.find((item) => item.id === String(id)),
        { id: String(id), on: false, priority: 2 },
        "a switched-off upgrade keeps its priority"
    );
    // Off upgrades aren't bought or saved for; switched on, it is the goal.
    await checkbox(pick(id)).listeners.change({ target: { checked: true } });
    await until(() => saved().items.some((item) => item.id === String(id) && item.on), "the switch to save");
    assert.equal((await readComputed("automation", "grimoire")).bones[0].goal.id, id);
    await until(
        () => subLine(row(page, "Femur")).startsWith(`Saving for ${named(id)} (`),
        () => `the Femur line to say it saves, not "${subLine(row(page, "Femur"))}"`
    );
    assert.deepEqual(choice(id), ["Low"]);

    // Back to Balanced: nothing to save for, and no priority kept.
    await choose(id, "0");
    assert.equal(
        saved().items.find((item) => item.id === String(id)).priority,
        undefined,
        "Balanced is saved as no priority"
    );
    await until(() => subLine(row(page, "Femur")) === "Buying cheapest first", "the Femur line to buy again");
});

test("a refused priority save puts the game's choice back and says why at the row", async () => {
    refuseUpdate = true;
    await choose(1, "1");
    await until(() => /save-state--error/.test(saveState(pick(1))), "the row to show the failure");
    assert.deepEqual(choice(1), ["Balanced"]);
    assert.match(text(pick(1)), /busy/);
    refuseUpdate = false;

    // The next save of the row works and clears it.
    await choose(1, "1");
    await until(() => /save-state--success/.test(saveState(pick(1))), "the retry to save");
    assert.deepEqual(choice(1), ["High"]);
    assert.doesNotMatch(text(pick(1)), /busy/);
    await choose(1, "0");
});

test("the saving % saves on Enter, and a value outside 0 to 100 is refused at its field", async () => {
    await typeSaving("25");
    assert.equal(saved().saving, 25);
    assert.ok(saved().items.length > 0, "the picks go with it");

    const before = updates.length;
    await typeSaving("150");
    assert.equal(updates.length, before, "nothing saved");
    assert.match(text(savingRow()), /0 to 100/);
    await typeSaving("10");
    assert.equal(saved().saving, 10);
});

test("a read that answers after a newer one doesn't put the older bones back", async () => {
    await checkbox(pick(2)).listeners.change({ target: { checked: true } });
    await until(() => saved().items.some((item) => item.id === "2" && item.on), "upgrade 2 to go on");
    let release;
    holdGrimoireReads = new Promise((resolve) => (release = resolve));
    // Low makes it the goal, but that read is held; Balanced's read answers first, with nothing to save for.
    await choose(2, "2");
    await settle();
    holdGrimoireReads = null;
    await choose(2, "0");
    await until(() => subLine(row(page, "Femur")) === "Buying cheapest first", "the newer read");
    release();
    await settle(50);
    assert.equal(subLine(row(page, "Femur")), "Buying cheapest first", "the held, older read is dropped");
});

test("Enable all switches every upgrade on in one save; Disable all asks Click again and keeps the priorities", async () => {
    await choose(3, "1");
    const before = updates.length;
    await button(page, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => updates.length > before && !button(page, "Enable all"), "every upgrade to go on");
    assert.ok(saved().items.length === game.upgrades.length && saved().items.every(({ on }) => on));

    const disable = button(page, "Disable all");
    const since = updates.length;
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, since, "the first click writes nothing");
    await disable.listeners.click({ preventDefault() {} });
    await until(() => updates.length > since, "every upgrade to go off");
    assert.ok(saved().items.every(({ on }) => !on));
    assert.deepEqual(
        saved().items.find(({ id }) => id === "3"),
        { id: "3", on: false, priority: 1 }
    );
    await switchAutomation("classes.automation.grimoire", false);
});
