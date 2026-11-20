// Account › Automation (#92) on the fake game. The overview lists every "automation …" toggle with its switch and
// status; a switch runs the cheat and keeps it in the startup cheats, Enable all runs on one click and Disable all
// asks "Click again" first (#25). The Shops tab lists the shops by world; an item's switch and its stop-at (saved on
// Enter, empty for no limit) save cheatConfig.automation.shops to the game and the config file, and a save the game
// refuses puts the row back and says why at the row.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// An automation a test leaves on (a filtered run, a failed assertion) keeps its timer; like loadGame, don't let it
// keep the process alive. A root after() hook can't do it: with top-level awaits between tests it runs too early.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router } = await createFakeApi();
// The fake game's cheats don't run; this one runs the real automation switch, as the game's cheat does.
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const saves = [];
const updates = [];
let refuseUpdate = false;
let refuseNextUpdates = 0; // how many of the next session updates the game refuses
let refuseUpdateNumber = null; // refuse the session update with this number (updates.length once it arrived)
let slowOnAnswer = 0; // ms the game takes to answer a switch-on it has already applied
let holdNextListRead = null; // a promise the next automation list read waits on, answering what it read before
let slowUpdate = 0; // ms each session update takes
let slowSave = 0; // ms each config file save takes
let failSave = false; // the config file save fails
let holdNextConfigRead = null; // a promise the next config read waits on, answering what it read before
// The startup cheats in the config file: a save writes them, a read gives them back.
let fileStartup = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    const automation = getAutomations().find(({ cheat }) => cheat === action);
    const result = switchAutomation(automation.id, on);
    if (on) await wait(slowOnAnswer);
    res.json(result);
});
const readComputedRoute = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { name } = await req.json();
    const hold = name === "list" ? holdNextListRead : null;
    if (!hold) return readComputedRoute(req, res);
    holdNextListRead = null;
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
    await wait(slowUpdate);
    if (refuseUpdate || refuseNextUpdates > 0 || updates.length === refuseUpdateNumber) {
        refuseNextUpdates = Math.max(0, refuseNextUpdates - 1);
        return res.json({ message: "Config update failed", details: "the game is busy" });
    }
    return update(req, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    await wait(slowSave);
    if (failSave) return res.status(500).json({ error: "the disk is full" });
    saves.push(body);
    fileStartup = body.startupCheats ?? fileStartup; // the server merges a partial save into the file
    res.json({ ok: true });
});
const readConfig = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    const hold = holdNextConfigRead;
    holdNextConfigRead = null;
    let read;
    await readConfig(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    read = structuredClone({ ...read, startupCheats: [...fileStartup] });
    if (hold) await hold;
    res.json(read);
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
const startup = () => fileStartup;
// The shop list the last config file save that carried one wrote.
const fileShops = () => saves.findLast((body) => body.cheatConfig)?.cheatConfig.automation.shops;
const shopsOn = () => getAutomations().find(({ cheat }) => cheat === "automation shops").on;

const overview = (await importRepo("src/ui/pages/account/automation/1-overview.js")).default.component();
await until(() => row(overview, "Shops"), "the overview to list Shops");

test("the overview lists the automation toggles only, each with its status", () => {
    assert.deepEqual(
        byClass(overview, "account-row__name").map(text),
        ["Bubbles", "Shops"],
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
    assert.deepEqual(startup(), ["automation bubbles", "automation shops"]);

    const since = commands.length;
    const disable = button(overview, "Disable all");
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(commands.length, since, "the first click runs nothing");
    assert.equal(shopsOn(), true);

    await disable.listeners.click({ preventDefault() {} });
    await until(() => !shopsOn(), "the automation to stop");
    assert.deepEqual(commands.slice(since), [
        ["automation bubbles", false],
        ["automation shops", false],
    ]);
    assert.deepEqual(startup(), []);
});

const shops = (await importRepo("src/ui/pages/account/automation/2-shops.js")).default.component();
await until(() => row(shops, "Lucky Whisker"), "the Shops tab to load");
const pickRow = (name) => row(shops, name);
const saved = () => updates.at(-1)?.cheatConfig.automation.shops ?? [];
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

test("switching an item on while Shops is off switches Shops on too, now and at start", async () => {
    assert.equal(shopsOn(), false);
    const since = commands.length;
    await checkbox(pickRow("Lucky Whisker")).listeners.change({ target: { checked: true } });
    await until(
        () => shopsOn() && /save-state--success/.test(saveState("Lucky Whisker")),
        () =>
            `Shops to go on: ${shopsOn()} ${saveState("Lucky Whisker")} ${JSON.stringify(commands.slice(since))} ${text(pickRow("Lucky Whisker"))}`
    );
    assert.deepEqual(saved(), [{ id: "0:item0", on: true }]);
    assert.deepEqual(commands.slice(since), [["automation shops", true]]);
    assert.deepEqual(startup(), ["automation shops"]);
    await until(
        () => text(byClass(row(shops, "Shops"), "automation-row__status")[0]) !== "Off",
        "the tab's own switch row to show it on"
    );

    // With Shops on, another item doesn't run the cheat again; switching items off leaves Shops on.
    await checkbox(pickRow("Lucky Whisker")).listeners.change({ target: { checked: false } });
    await checkbox(pickRow("Royal Pebble")).listeners.change({ target: { checked: true } });
    await until(() => saved().some(({ id, on }) => id === "1:item3" && on), "the second item to save");
    await settle();
    assert.deepEqual(commands.slice(since), [["automation shops", true]]);
    assert.equal(shopsOn(), true);
    await checkbox(pickRow("Royal Pebble")).listeners.change({ target: { checked: false } });
    await until(() => !saved().length, "the item to save off");
    assert.equal(shopsOn(), true, "items keep their own switches; the overview stops Shops");
});

test("an item's switch and stop-at save the shop list to the game and the config file", async () => {
    const savesBefore = saves.length;
    await checkbox(pickRow("Lucky Whisker")).listeners.change({ target: { checked: true } });
    await until(() => saves.length > savesBefore, "the switch to save");
    assert.deepEqual(saved(), [{ id: "0:item0", on: true }]);

    await typeStopAt("Lucky Whisker", "250");
    assert.deepEqual(saved(), [{ id: "0:item0", on: true, stopAt: 250 }]);
    await until(() => fileShops()?.[0]?.stopAt === 250, "the file save");
    assert.deepEqual(fileShops(), [{ id: "0:item0", on: true, stopAt: 250 }]);

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

test("Shops: Enable all switches every item on in one click and one save, and Shops with them", async () => {
    await switchAutomation("account.automation.shops", false);
    const before = updates.length;
    await button(shops, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => shopsOn() && updates.length > before && !button(shops, "Enable all"), "every item to go on");
    assert.equal(updates.length, before + 1, "one save");
    const total = byClass(shops, "automation-pick").length;
    assert.equal(saved().length, total);
    assert.ok(saved().every(({ on }) => on));
    assert.deepEqual(startup(), ["automation shops"]);
});

test("Shops: Disable all asks Click again, then switches every item off and keeps stop-ats", async () => {
    // Its own items on, so it runs alone too (--test-name-pattern).
    await checkbox(pickRow("Velvet Stone")).listeners.change({ target: { checked: true } });
    await until(() => saved().some(({ id, on }) => id === "1:item7" && on), "Velvet Stone to switch on");
    await typeStopAt("Velvet Stone", "40");
    const disable = button(shops, "Disable all");
    const before = updates.length;
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, before, "the first click saves nothing");

    await disable.listeners.click({ preventDefault() {} });
    await until(() => updates.length > before, "the items to switch off");
    await settle();
    assert.deepEqual(saved(), [{ id: "1:item7", on: false, stopAt: 40 }]);
    assert.equal(shopsOn(), true, "only the overview stops Shops itself");
    await switchAutomation("account.automation.shops", false);
});

// CodeRabbit's review of #105.
const ui = await importRepo("src/ui/components/views/account/automation.js");
const { fetchConfig } = await importRepo("src/ui/services/api.js");
const gameShops = async () => (await fetchConfig()).cheatConfig.automation.shops;
const statusOf = (root) => text(byClass(row(root, "Shops"), "automation-row__status")[0]);
const freshPicks = async () => {
    const picks = ui.createAutomationPicks("shops");
    picks.sync(await gameShops());
    return picks;
};

test("review: a startup change and an item save that overlap both reach the config file", async () => {
    await ui.switchAutomation("automation shops", false);
    const picks = await freshPicks();
    slowSave = 20;
    await Promise.all([ui.switchAutomation("automation shops", true), picks.set("0:item1", { stopAt: 7 })]);
    slowSave = 0;
    assert.deepEqual(fileStartup, ["automation shops"], "the item save didn't write back the old startup list");
    await picks.set("0:item1", { stopAt: null });
    await ui.switchAutomation("automation shops", false);
});

test("review: a failed save doesn't undo an edit made after it", async () => {
    const picks = await freshPicks();
    slowUpdate = 20;
    refuseNextUpdates = 1;
    const first = picks.set("0:item1", { stopAt: 10 }).catch((error) => error);
    const second = picks.set("0:item1", { stopAt: 20 });
    assert.match((await first).message, /busy/);
    await second;
    slowUpdate = 0;
    assert.equal(picks.get("0:item1").stopAt.val, 20);
    assert.ok(saved().some(({ id, stopAt }) => id === "0:item1" && stopAt === 20));
    await picks.set("0:item1", { stopAt: null });
});

test("review: a file save that fails after the game took the change shows what the game has, and why", async () => {
    await ui.switchAutomation("automation shops", false);
    failSave = true;
    const box = checkbox(pickRow("Tiny Spark"));
    await box.listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Tiny Spark")), "the row to show the failure");
    assert.match(text(pickRow("Tiny Spark")), /disk is full/);
    assert.ok(
        (await gameShops()).some(({ id, on }) => id === "0:item2" && on),
        "the game buys it"
    );
    assert.equal(box.checked, true, "so the switch stays on");
    assert.equal(shopsOn(), true, "and Shops starts with it, as when the file saves");

    // The overview's switch: the game runs Shops, the file didn't save; the row says both.
    await checkbox(row(overview, "Shops")).listeners.change({ target: { checked: true } });
    await until(() => /disk is full/.test(text(row(overview, "Shops"))), "the overview row to say why");
    assert.equal(shopsOn(), true);
    await until(() => statusOf(overview) !== "Off", "the overview row to show Shops running");
    failSave = false;
    await checkbox(pickRow("Tiny Spark")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id }) => id === "0:item2"), "the item to switch off");
    await ui.switchAutomation("automation shops", false);
});

test("review: a stop-at typed while the last one saves is saved after it", async () => {
    slowUpdate = 30;
    const input = field("Lucky Whisker");
    input.listeners.input({ target: { value: "10" } });
    metric("Lucky Whisker").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await settle(5);
    input.listeners.input({ target: { value: "20" } });
    metric("Lucky Whisker").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => saved().some(({ id, stopAt }) => id === "0:item0" && stopAt === 20), "20 to save");
    slowUpdate = 0;
    await settle(80);
    assert.equal(saved().find(({ id }) => id === "0:item0").stopAt, 20);
    await typeStopAt("Lucky Whisker", "");
});

test("review: an overview bulk switch that fails part-way shows what the game now runs", async () => {
    // Another test switched Shops off behind the overview's back; Refresh reads it again.
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => button(overview, "Enable all"), "Enable all");
    failSave = true;
    await button(overview, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => /disk is full/.test(text(overview)), "the bulk failure to be said");
    failSave = false;
    assert.equal(shopsOn(), true);
    await until(() => statusOf(overview) !== "Off", "the row to show Shops running");
    await ui.switchAutomation("automation shops", false);
});

test("review: an item switched on while Shops already runs still puts Shops in the startup cheats", async () => {
    switchAutomation("account.automation.shops", true); // on in the game only, say from the Cheats page
    fileStartup = [];
    const since = commands.length;
    await checkbox(pickRow("Royal Pebble")).listeners.change({ target: { checked: true } });
    await until(() => fileStartup.includes("automation shops"), "Shops to be in the startup cheats");
    assert.deepEqual(commands.slice(since), [], "the cheat doesn't run again");
    await checkbox(pickRow("Royal Pebble")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id }) => id === "1:item3"), "the item to switch off");
    await ui.switchAutomation("automation shops", false);
});

test("review: a refresh that read the config before an item saved doesn't put the old picks back", async () => {
    let release;
    holdNextConfigRead = new Promise((resolve) => (release = resolve));
    await until(() => button(shops, "Refresh"), "Refresh");
    void button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await settle(5);
    await checkbox(pickRow("Grand Drift")).listeners.change({ target: { checked: true } });
    await until(() => saved().some(({ id, on }) => id === "0:item1" && on), "the item to save");
    await until(() => /save-state--success/.test(saveState("Grand Drift")), "the item save to end");
    release();
    await settle(50);
    // The next save carries the whole list: Grand Drift must still be in it.
    await checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: true } });
    await until(() => saved().some(({ id }) => id === "1:item4"), "the second item to save");
    assert.ok(
        saved().some(({ id, on }) => id === "0:item1" && on),
        "Grand Drift kept"
    );
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await until(() => !saved().some(({ on }) => on), "everything off");
    await ui.switchAutomation("automation shops", false);
});

test("review: with every item on and Shops off, Enable all still switches Shops on", async () => {
    await until(() => button(shops, "Enable all"), "Enable all");
    await button(shops, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => shopsOn() && saved().every(({ on }) => on), "every item and Shops on");
    await ui.switchAutomation("automation shops", false);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => button(shops, "Enable all"), "Enable all to be available with Shops off");
    await button(shops, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => shopsOn(), "Shops to go on");
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await until(() => !saved().some(({ on }) => on), "everything off");
    await ui.switchAutomation("automation shops", false);
});

// CodeRabbit's second review of #105.
test("review 2: an Off clicked while an On is still answering leaves the automation off, now and at start", async () => {
    await ui.switchAutomation("automation shops", false);
    slowOnAnswer = 40;
    const on = ui.switchAutomation("automation shops", true);
    await settle(5);
    const off = ui.switchAutomation("automation shops", false);
    await Promise.all([on, off]);
    slowOnAnswer = 0;
    assert.equal(shopsOn(), false);
    assert.deepEqual(fileStartup, [], "the On's startup change didn't land after the Off");
});

test("review 2: a refused save goes back to what the game took, not to an older edit", async () => {
    const picks = await freshPicks();
    slowUpdate = 10;
    // The first save sends 20 (both edits are in by then) and is taken; the second is refused.
    refuseUpdateNumber = updates.length + 2;
    const first = picks.set("0:item1", { stopAt: 10 });
    const second = picks.set("0:item1", { stopAt: 20 }).catch((error) => error);
    await first;
    assert.match((await second).message, /busy/);
    slowUpdate = 0;
    refuseUpdateNumber = null;
    assert.ok(
        (await gameShops()).some(({ id, stopAt }) => id === "0:item1" && stopAt === 20),
        "the game has 20"
    );
    assert.equal(picks.get("0:item1").stopAt.val, 20, "so the field keeps 20");
    await picks.set("0:item1", { stopAt: null });
});

test("review 2: an overview read that started before a switch doesn't put the old state back", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) === "Off", "the overview to read Shops off");
    let release;
    holdNextListRead = new Promise((resolve) => (release = resolve));
    void button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await settle(5);
    await checkbox(row(overview, "Shops")).listeners.change({ target: { checked: true } });
    await until(() => statusOf(overview) !== "Off", "the switch's own read to show Shops on");
    release();
    await settle(50);
    assert.notEqual(statusOf(overview), "Off", "the older read was dropped");
    await until(() => button(overview, "Disable all"), "Disable all to stay available");
    await ui.switchAutomation("automation shops", false);
});

// CodeRabbit's third review of #105, and the same mistakes elsewhere on the pages.
test("review 3: two refused saves leave the stop-at at what the game holds, not at the first edit", async () => {
    const picks = await freshPicks();
    assert.equal(picks.get("0:item1").stopAt.val, null);
    slowUpdate = 10;
    refuseNextUpdates = 2;
    const first = picks.set("0:item1", { stopAt: 10 }).catch((error) => error);
    const second = picks.set("0:item1", { stopAt: 20 }).catch((error) => error);
    await Promise.all([first, second]);
    slowUpdate = 0;
    assert.ok(!(await gameShops()).some(({ id }) => id === "0:item1"), "the game took neither");
    assert.equal(picks.get("0:item1").stopAt.val, null, "so the field shows no limit");
});

test("review 3: after the file failed, Enter on the same stop-at saves it to the file", async () => {
    failSave = true;
    await typeStopAt("Lucky Whisker", "10");
    assert.match(text(pickRow("Lucky Whisker")), /disk is full/);
    failSave = false;
    const before = saves.length;
    const input = field("Lucky Whisker");
    metric("Lucky Whisker").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(
        () => saves.length > before,
        () => `the file save, not ${saveState("Lucky Whisker")}`
    );
    assert.ok(fileShops().some(({ id, stopAt }) => id === "0:item0" && stopAt === 10));
    await typeStopAt("Lucky Whisker", "");
});

test("review 3 sibling: Shops' Enable all starts Shops even when the file save fails", async () => {
    await ui.switchAutomation("automation shops", false);
    failSave = true;
    await until(() => button(shops, "Enable all"), "Enable all");
    await button(shops, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => /disk is full/.test(text(shops)), "the failure to be said");
    failSave = false;
    assert.equal(shopsOn(), true, "the game took every item, so Shops runs");
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await until(() => !saved().some(({ on }) => on), "everything off");
    await ui.switchAutomation("automation shops", false);
});

test("review 3 sibling: the overview's Enable all puts a running automation back in the startup cheats", async () => {
    switchAutomation("account.automation.shops", true); // running, but its startup save failed earlier
    fileStartup = [];
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => button(overview, "Enable all"), "Enable all, though Shops runs");
    await button(overview, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => fileStartup.includes("automation shops"), "Shops to be in the startup cheats");
    await ui.switchAutomation("automation shops", false);
});

test("review 3 sibling: the overview's Disable all stops every automation, even after one's file save fails", async () => {
    // A second automation, so the bulk switch has one after the failing one.
    const { defineAutomation } = await importRepo("src/cheats/core/automations.js");
    defineAutomation({
        id: "test.kit",
        cheat: "automation testkit",
        label: "Test kit",
        interval: 1000,
        tick() {},
        status: () => "Ticking",
    });
    switchAutomation("account.automation.shops", true);
    switchAutomation("test.kit", true);
    fileStartup = ["automation shops", "automation testkit"];
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => row(overview, "Test kit") && button(overview, "Disable all"), "both rows and Disable all");
    failSave = true;
    const disable = button(overview, "Disable all");
    await disable.listeners.click({ preventDefault() {} });
    await disable.listeners.click({ preventDefault() {} });
    await until(() => /disk is full/.test(text(overview)), "the failure to be said");
    failSave = false;
    const on = () =>
        getAutomations()
            .filter(({ on }) => on)
            .map(({ id }) => id);
    await until(
        () => !on().length,
        () => `every automation to stop, not ${on()}`
    );
    switchAutomation("test.kit", false);
});
