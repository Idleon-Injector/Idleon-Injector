// Account › Automation (#92) on the fake game. The overview lists every "automation …" toggle with its switch and
// status; a switch runs the cheat and keeps it in the startup cheats, Enable all runs on one click and Disable all
// asks "Click again" first (#25). The Shops tab lists the shops by world; an item's switch and its stop-at (saved on
// Enter, empty for no limit) save cheatConfig.automation.shops to the game and the config file, and a save the game
// refuses puts the row back and says why at the row.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
// The fake game's cheats don't run; this one runs the real automation switch, as the game's cheat does.
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const saves = [];
const updates = [];
let refuseUpdate = false;
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    const automation = getAutomations().find(({ cheat }) => cheat === action);
    res.json(switchAutomation(automation.id, on));
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    const body = await req.json();
    updates.push(body);
    if (refuseUpdate) return res.json({ message: "Config update failed", details: "the game is busy" });
    return update(req, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    saves.push(await req.json());
    res.json({ ok: true });
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
const startup = () => saves.at(-1).startupCheats;
const shopsOn = () => getAutomations().find(({ cheat }) => cheat === "automation shops").on;

const overview = (await importRepo("src/ui/pages/account/automation/1-overview.js")).default.component();
await until(() => row(overview, "Shops"), "the overview to list Shops");

test("the overview lists the automation toggles only, each with its status", () => {
    assert.deepEqual(
        byClass(overview, "account-row__name").map(text),
        ["Shops"],
        "Sushi Auto Play and autoboss are not automation toggles"
    );
    assert.equal(text(byClass(row(overview, "Shops"), "automation-row__status")[0]), "Off");
    assert.equal(button(overview, "Disable all"), undefined, "nothing runs, so nothing to disable");
});

test("a switch turns the automation on now and at every start, and off again", async () => {
    const box = checkbox(row(overview, "Shops"));
    await box.listeners.change({ target: { checked: true } });
    await until(() => saves.length === 1, "the config file to save");
    assert.deepEqual(commands.at(-1), ["automation shops", true]);
    assert.equal(shopsOn(), true);
    assert.deepEqual(startup(), ["automation shops"]);
    await until(
        () => text(byClass(row(overview, "Shops"), "automation-row__status")[0]) === "No shop item is switched on",
        () =>
            `the status to show the game line, not ${text(byClass(row(overview, "Shops"), "automation-row__status")[0])}`
    );

    await box.listeners.change({ target: { checked: false } });
    await until(() => saves.length === 2, "the config file to save");
    assert.equal(shopsOn(), false);
    assert.deepEqual(startup(), []);
});

test("Enable all runs on one click; Disable all asks Click again and writes nothing until the second", async () => {
    await until(() => button(overview, "Enable all"), "Enable all");
    await button(overview, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => shopsOn() && button(overview, "Disable all"), "every automation to run");
    assert.deepEqual(startup(), ["automation shops"]);

    const since = commands.length;
    const disable = button(overview, "Disable all");
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(commands.length, since, "the first click runs nothing");
    assert.equal(shopsOn(), true);

    await disable.listeners.click({ preventDefault() {} });
    await until(() => !shopsOn(), "the automation to stop");
    assert.deepEqual(commands.slice(since), [["automation shops", false]]);
    assert.deepEqual(startup(), []);
});

const shops = (await importRepo("src/ui/pages/account/automation/2-shops.js")).default.component();
await until(() => row(shops, "Lucky Whisker"), "the Shops tab to load");
const pickRow = (name) => row(shops, name);
const saved = () => updates.at(-1).cheatConfig.automation.shops;
const field = (name) =>
    elements(pickRow(name)).find((node) => node.nodeName === "input" && node.attributes.type !== "checkbox");
const metric = (name) => byClass(pickRow(name), "account-field-metric")[0];
const saveState = (name) => classes(byClass(pickRow(name), "save-state")[0]);
async function typeStopAt(name, value) {
    const input = field(name);
    input.listeners.input({ target: { value } });
    const since = updates.length;
    metric(name).listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => updates.length > since || /save-state--error/.test(saveState(name)), `${name}'s stop-at save`);
    await settle();
}

test("the Shops tab shows the shop automation's switch, the shops by world, and today's stock", () => {
    assert.ok(row(shops, "Shops"), "the same switch as the overview");
    assert.deepEqual(
        byClass(shops, "account-sub-tab-btn").map((node) => text(node).trim()),
        ["W1", "W2", "W3", "W4", "W5", "W6", "W7"]
    );
    assert.match(text(pickRow("Lucky Whisker")), /Left 50/);
    assert.match(text(pickRow("Grand Drift")), /Left 0/, "sold out still lists");
});

test("an item's switch and stop-at save the shop list to the game and the config file", async () => {
    const savesBefore = saves.length;
    await checkbox(pickRow("Lucky Whisker")).listeners.change({ target: { checked: true } });
    await until(() => saves.length > savesBefore, "the switch to save");
    assert.deepEqual(saved(), [{ id: "0:item0", on: true }]);

    await typeStopAt("Lucky Whisker", "250");
    assert.deepEqual(saved(), [{ id: "0:item0", on: true, stopAt: 250 }]);

    // A switched-off item keeps its stop-at; an empty stop-at is no limit.
    await checkbox(pickRow("Lucky Whisker")).listeners.change({ target: { checked: false } });
    await until(() => !saved()[0].on, "the switch to save");
    assert.deepEqual(saved(), [{ id: "0:item0", on: false, stopAt: 250 }]);
    await typeStopAt("Lucky Whisker", "");
    assert.deepEqual(saved(), [], "nothing left to keep");
    assert.equal(field("Lucky Whisker").attributes.placeholder, "No limit");
});

test("a save the game refuses puts the switch back and says why at the row", async () => {
    refuseUpdate = true;
    const box = checkbox(pickRow("Tiny Spark"));
    await box.listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Tiny Spark")), "the row to show the failure");
    assert.equal(box.checked, false);
    assert.match(text(pickRow("Tiny Spark")), /busy/);
    refuseUpdate = false;
});

test("a stop-at that isn't a whole number is refused at its field and nothing is saved", async () => {
    const before = updates.length;
    const input = field("Royal Pebble");
    input.listeners.input({ target: { value: "-5" } });
    metric("Royal Pebble").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--error/.test(saveState("Royal Pebble")), "the field to refuse");
    assert.equal(updates.length, before);
    assert.match(text(pickRow("Royal Pebble")), /whole number/);

    // Escape puts the saved value back.
    metric("Royal Pebble").listeners.keydown({ key: "Escape", target: input, preventDefault() {} });
    await settle();
    assert.doesNotMatch(saveState("Royal Pebble"), /save-state--error/);
});

test("quick switch flips save one after another, so the file keeps the last choice", async () => {
    const box = checkbox(pickRow("Golden Bramble"));
    const flips = [true, false, true].map((checked) => box.listeners.change({ target: { checked } }));
    await Promise.all(flips);
    await until(() => /save-state--success/.test(saveState("Golden Bramble")), "the saves to end");
    await settle(50);
    assert.deepEqual(saved(), [{ id: "1:item5", on: true }]);
    assert.equal(box.checked, true);
});
