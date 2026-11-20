// World 3 › Construction › Automation (#92) on the fake game: the construction automation's switch, the build queue,
// then a row per building in the menu's three rows (Buildings, Towers, Shrines) with its bonus, LV / max, next salt
// cost and where it is in its build. A building's switch, priority (High / Low / Balanced) and stop-at save
// cheatConfig.automation.construction to the game and the config file; switching one on turns Construction on; a save
// the game refuses puts the row back and says why at the row. Enable all runs on one click, Disable all asks
// "Click again" first (#25).
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// An automation a test leaves on keeps its timer; don't let it keep the process alive.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router } = await createFakeApi();
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const CHEAT = "automation construction";
const commands = [];
const updates = [];
const saves = [];
let refuseUpdate = false;
let slowUpdate = 0; // ms each session update takes
let fileStartup = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    res.json(switchAutomation(getAutomations().find(({ cheat }) => cheat === action).id, on));
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    const body = await req.json();
    updates.push(body);
    await wait(slowUpdate);
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
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${typeof what === "function" ? what() : what}`);
}

const tab = (await importRepo("src/ui/pages/world-3/construction/3-automation.js")).default.component();
const row = (name) => byClass(tab, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
await until(() => row("Mossy Pebble Tower"), "the tab to load");
const checkbox = (name) => elements(row(name)).find((node) => node.attributes.type === "checkbox");
const priority = (name) => elements(row(name)).find((node) => node.nodeName === "select");
const chosen = (name) =>
    text(elements(priority(name)).find((node) => node.nodeName === "option" && node.attributes.selected === true));
const pick = (name, value) => priority(name).listeners.change({ target: { value } });
const field = (name) =>
    elements(row(name)).find((node) => node.nodeName === "input" && node.attributes.type !== "checkbox");
const metric = (name) => byClass(row(name), "account-field-metric")[0];
const saveState = (name) => classes(byClass(row(name), "save-state")[0]);
const button = (label) =>
    elements(tab).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
const saved = () => updates.at(-1)?.cheatConfig.automation.construction ?? [];
const fileList = () => saves.findLast((body) => body.cheatConfig)?.cheatConfig.automation.construction;
const constructionOn = () => getAutomations().find(({ cheat }) => cheat === CHEAT).on;
const settled = (name) => until(() => /save-state--success/.test(saveState(name)), `${name}'s save`);
const enterStopAt = (name, value) => {
    const input = field(name);
    input.listeners.input({ target: { value } });
    metric(name).listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
};
// Brings a building to what a test starts from, through the page, so each test also runs alone; after the tests
// before it, it is already there and nothing is saved.
async function given(name, id, { on, priority, stopAt }) {
    const has = () => saved().find((entry) => entry.id === id) ?? {};
    if (on && !has().on) {
        await checkbox(name).listeners.change({ target: { checked: true } });
        await until(() => has().on && constructionOn(), `${name} to go on`);
        await settled(name);
    }
    if (priority && has().priority !== priority) {
        await pick(name, String(priority));
        await until(() => has().priority === priority, `${name}'s priority`);
        await settled(name);
    }
    if (stopAt && has().stopAt !== stopAt) {
        enterStopAt(name, String(stopAt));
        await until(() => has().stopAt === stopAt, `${name}'s stop-at`);
    }
}

test("the tab shows the switch, the build queue and a row per building in the menu's three rows", () => {
    assert.ok(row("Construction"), "the same switch as the overview");
    assert.equal(
        text(row("Build queue")),
        "Build queue5 of 8 slots building · slot 8 kept free for the jelly · 420 build/hr"
    );
    assert.deepEqual(byClass(tab, "account-section__title").map(text), [
        "AUTOMATION",
        "BUILDINGS",
        "TOWERS",
        "SHRINES",
    ]);
    assert.deepEqual(
        byClass(tab, "account-section")
            .slice(1)
            .map((section) => byClass(section, "automation-pick").length),
        [9, 9, 9]
    );

    // Building 1: in the first (gilded) slot, 1000 + 250 needed, 370 done, at 420/h x3.
    const mossy = text(row("Mossy Pebble Tower"));
    assert.match(mossy, /\+26% Lucky Lantern gain/, "the panel's bonus line");
    assert.match(mossy, /LV 14 \/ 50/);
    assert.match(mossy, /Next level 80 Explosive Salts · in slot 1 · 29% · 42m left/);
    assert.match(text(row("Lucky Lantern Tower")), /Locked: build Ember Bramble Tower first/);
    assert.match(text(row("Grand Stone Tower")), /Max level/);
    assert.match(text(row(byName(6))), /built, waiting for salt/);
    assert.equal(chosen("Mossy Pebble Tower"), "Balanced");
});

test("switching a building on saves it and turns Construction on, now and at start", async () => {
    assert.equal(constructionOn(), false);
    await checkbox("Mossy Pebble Tower").listeners.change({ target: { checked: true } });
    await until(() => constructionOn() && /save-state--success/.test(saveState("Mossy Pebble Tower")), "it to go on");
    assert.deepEqual(saved(), [{ id: "1", on: true }]);
    assert.deepEqual(commands, [[CHEAT, true]]);
    assert.deepEqual(fileStartup, [CHEAT]);
    await until(() => fileList()?.length === 1, "the file save");
});

test("a priority saves with the building, and Balanced saves none", async () => {
    await given("Mossy Pebble Tower", "1", { on: true });
    await pick("Mossy Pebble Tower", "1");
    await settled("Mossy Pebble Tower");
    assert.deepEqual(saved(), [{ id: "1", on: true, priority: 1 }]);
    assert.equal(chosen("Mossy Pebble Tower"), "High");

    // A switched-off building keeps its priority, so it is there when switched on again.
    await pick("Frost Fang Tower", "2");
    await settled("Frost Fang Tower");
    assert.deepEqual(saved(), [
        { id: "1", on: true, priority: 1 },
        { id: "2", on: false, priority: 2 },
    ]);

    await pick("Frost Fang Tower", "");
    await settled("Frost Fang Tower");
    assert.deepEqual(saved(), [{ id: "1", on: true, priority: 1 }], "nothing left to keep");
    assert.equal(chosen("Frost Fang Tower"), "Balanced");
});

test("quick priority changes save one after another, and the last one stays", async () => {
    slowUpdate = 20;
    await Promise.all(["2", "", "1", "2"].map((value) => pick("Copper Spark Tower", value)));
    slowUpdate = 0;
    await settled("Copper Spark Tower");
    assert.deepEqual(
        saved().find(({ id }) => id === "0"),
        { id: "0", on: false, priority: 2 }
    );
    assert.equal(chosen("Copper Spark Tower"), "Low");
});

test("a priority the game refuses goes back to the saved one and says why at the row; the next save clears it", async () => {
    await given("Mossy Pebble Tower", "1", { priority: 1 });
    refuseUpdate = true;
    await pick("Mossy Pebble Tower", "2");
    await until(() => /save-state--error/.test(saveState("Mossy Pebble Tower")), "the row to show the failure");
    assert.equal(chosen("Mossy Pebble Tower"), "High", "read back, not the refused Low");
    assert.equal(priority("Mossy Pebble Tower").value, "1");
    assert.match(text(row("Mossy Pebble Tower")), /busy/);

    refuseUpdate = false;
    await pick("Mossy Pebble Tower", "2");
    await settled("Mossy Pebble Tower");
    assert.doesNotMatch(text(row("Mossy Pebble Tower")), /busy/);
    assert.equal(chosen("Mossy Pebble Tower"), "Low");
});

test("a stop-at saves on Enter beside the priority", async () => {
    await given("Mossy Pebble Tower", "1", { on: true, priority: 2 });
    enterStopAt("Mossy Pebble Tower", "30");
    await until(() => saved().find(({ id }) => id === "1")?.stopAt === 30, "the stop-at save");
    assert.deepEqual(
        saved().find(({ id }) => id === "1"),
        { id: "1", on: true, stopAt: 30, priority: 2 }
    );
});

test("Enable all switches every building on in one save; Disable all asks Click again, then keeps priorities", async () => {
    await given("Copper Spark Tower", "0", { priority: 2 });
    await given("Mossy Pebble Tower", "1", { on: true, priority: 2, stopAt: 30 });
    const before = updates.length;
    await button("Enable all").listeners.click({ preventDefault() {} });
    await until(() => updates.length > before && !button("Enable all"), "every building to go on");
    assert.equal(updates.length, before + 1, "one save");
    assert.equal(saved().length, 27);
    assert.ok(saved().every(({ on }) => on));

    const disable = button("Disable all");
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, before + 1, "the first click writes nothing");

    await disable.listeners.click({ preventDefault() {} });
    await until(() => updates.length === before + 2, "the second click to save");
    assert.ok(saved().every(({ on }) => !on));
    assert.deepEqual(
        saved().filter(({ priority, stopAt }) => priority !== undefined || stopAt !== undefined),
        [
            { id: "0", on: false, priority: 2 },
            { id: "1", on: false, stopAt: 30, priority: 2 },
        ],
        "stop-at and priority stay"
    );
    assert.equal(constructionOn(), true, "the buildings' switches don't stop Construction");
    await switchAutomation("w3.construction.automation", false);
});

function byName(index) {
    return byClass(tab, "automation-pick").map((node) => text(byClass(node, "account-row__name")[0]))[index];
}
