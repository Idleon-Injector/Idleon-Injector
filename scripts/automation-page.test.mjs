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
let slowOffBefore = 0; // ms the game takes before it applies a switch-off
let failNextToggle = false; // the next switch fails in the game
let holdNextListRead = null; // a promise the next automation list read waits on, answering what it read before
let slowUpdate = 0; // ms each session update takes
let holdNextUpdate = null; // a promise the next session update waits on before the game answers it
let slowSave = 0; // ms each config file save takes
let failSave = false; // the config file save fails
let holdNextConfigRead = null; // a promise the next config read waits on, answering what it read before
let failNextConfigRead = false; // the next config read fails
let failNextListRead = false; // the next automation list read fails
let failListReadAt = null; // the automation list read with this number (listAsked once it arrived) fails
let holdNextOff = null; // a promise the next switch-off waits on before the game applies it
let holdNextOn = null; // a promise the next switch-on waits on before the game applies it
let holdNextOnAnswer = null; // a promise the next switch-on waits on after the game applied it, before it answers
// The startup cheats in the config file: a save writes them, a read gives them back.
let fileStartup = [];
// What the fake game has done, for tests to wait on: switches applied, automation list reads asked and answered.
const applied = [];
const order = []; // ["toggle", cheat, on] as a switch arrives, ["save"] as a config file save lands, ["list"] as a list read answers
let listAsked = 0;
let listAnswered = 0;
let configAnswered = 0;
let configAsked = 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    order.push(["toggle", action, on]);
    const automation = getAutomations().find(({ cheat }) => cheat === action);
    if (!on) await wait(slowOffBefore);
    if (!on && holdNextOff) {
        const hold = holdNextOff;
        holdNextOff = null;
        await hold;
    }
    if (on && holdNextOn) {
        const hold = holdNextOn;
        holdNextOn = null;
        await hold;
    }
    if (failNextToggle) {
        failNextToggle = false;
        return res.json({ ok: false, message: "the cheat broke" });
    }
    const result = switchAutomation(automation.id, on);
    applied.push([action, on]);
    if (on) await wait(slowOnAnswer);
    if (on && holdNextOnAnswer) {
        const hold = holdNextOnAnswer;
        holdNextOnAnswer = null;
        await hold;
    }
    res.json(result);
});
const readComputedRoute = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { name } = await req.json();
    if (name !== "list") return readComputedRoute(req, res);
    listAsked++;
    if (failNextListRead || listAsked === failListReadAt) {
        failNextListRead = false;
        listAnswered++;
        return res.status(500).json({ error: "the game didn't answer" });
    }
    const hold = holdNextListRead;
    holdNextListRead = null;
    let read;
    await readComputedRoute(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    if (hold) await hold;
    listAnswered++;
    order.push(["list"]);
    res.json(read);
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    const body = await req.json();
    updates.push(body);
    await wait(slowUpdate);
    if (holdNextUpdate) {
        const hold = holdNextUpdate;
        holdNextUpdate = null;
        await hold;
    }
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
    order.push(["save"]);
    fileStartup = body.startupCheats ?? fileStartup; // the server merges a partial save into the file
    res.json({ ok: true });
});
const readConfig = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    configAsked++;
    const hold = holdNextConfigRead;
    holdNextConfigRead = null;
    if (failNextConfigRead) {
        failNextConfigRead = false;
        return res.status(500).json({ error: "the config didn't load" });
    }
    let read;
    await readConfig(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    read = structuredClone({ ...read, startupCheats: [...fileStartup] });
    if (hold) await hold;
    configAnswered++;
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
// The fake API answers in-process, so once the fake game has answered, the page's handling of it is queued as
// promises: one timer turn later it has run, however busy the machine is.
const handled = () => settle(0);
// Every step queued so far has run (a queued no-op twice: a step's own follow-up is queued as it ends).
const queueIdle = async () => {
    const { inTurn } = await importRepo("src/ui/components/views/account/automation.js");
    await inTurn(() => {});
    await inTurn(() => {});
    await handled();
};
// A second automation, "automation testkit", for the bulk switches; defined once, by whichever test needs it first.
const testKit = async () => {
    if (getAutomations().some(({ id }) => id === "test.kit")) return;
    const { defineAutomation } = await importRepo("src/cheats/core/automations.js");
    defineAutomation({
        id: "test.kit",
        cheat: "automation testkit",
        label: "Test kit",
        interval: 1000,
        tick() {},
        status: () => "Ticking",
    });
};
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
    // One queue: the item's save waits for the Refresh ahead of it, and the Refresh's (older) read is dropped.
    let release;
    holdNextConfigRead = new Promise((resolve) => (release = resolve));
    try {
        await until(() => button(shops, "Refresh"), "Refresh");
        const asked = configAsked;
        void button(shops, "Refresh").listeners.click({ preventDefault() {} });
        await until(() => configAsked > asked, "the Refresh's config read to be held");
        const sent = updates.length;
        void checkbox(pickRow("Grand Drift")).listeners.change({ target: { checked: true } });
        await handled();
        assert.equal(updates.length, sent, "the save waits for the read queued before it");
    } finally {
        release();
    }
    await until(() => fileShops()?.some(({ id, on }) => id === "0:item1" && on), "the item to save");
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
    // Each save sends only its own edit: the first (10) is taken, the second (20) is refused.
    refuseUpdateNumber = updates.length + 2;
    const first = picks.set("0:item1", { stopAt: 10 });
    const second = picks.set("0:item1", { stopAt: 20 }).catch((error) => error);
    await first;
    assert.match((await second).message, /busy/);
    slowUpdate = 0;
    refuseUpdateNumber = null;
    assert.ok(
        (await gameShops()).some(({ id, stopAt }) => id === "0:item1" && stopAt === 10),
        "the game has 10"
    );
    assert.equal(picks.get("0:item1").stopAt.val, 10, "so the field shows 10");
    await picks.set("0:item1", { stopAt: null });
});

test("review 2: an overview read that started before a switch doesn't put the old state back", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) === "Off", "the overview to read Shops off");
    let releaseRead;
    let releaseOn;
    holdNextListRead = new Promise((resolve) => (releaseRead = resolve));
    holdNextOn = new Promise((resolve) => (releaseOn = resolve)); // the switch, once its turn comes, waits here
    try {
        const asked = listAsked;
        void button(overview, "Refresh").listeners.click({ preventDefault() {} });
        await until(() => listAsked > asked, "the Refresh's read to be held");
        const toggled = commands.length;
        void checkbox(row(overview, "Shops")).listeners.change({ target: { checked: true } });
        await handled();
        assert.notEqual(statusOf(overview), "Off", "the click shows at once");
        const answered = listAnswered;
        releaseRead();
        await until(() => listAnswered > answered && commands.length > toggled, "the read, then the switch's turn");
        await handled();
        assert.notEqual(statusOf(overview), "Off", "the read queued before the click (Off) doesn't put it back");
    } finally {
        releaseRead();
        releaseOn();
    }
    await queueIdle();
    assert.equal(shopsOn(), true);
    assert.notEqual(statusOf(overview), "Off");
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
    await testKit();
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

// A second reader's review of 99dacf9: each sequence it reproduced.
const fieldText = (name) => {
    const input = field(name);
    return String(input.value ?? input.attributes.value ?? "");
};

test("reader: a stop-at typed while a refused save is still answering is saved after it", async () => {
    await ui.switchAutomation("automation shops", false);
    slowUpdate = 30;
    refuseNextUpdates = 1;
    const input = field("Lucky Whisker");
    input.listeners.input({ target: { value: "10" } });
    metric("Lucky Whisker").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    const before = updates.length;
    await until(() => updates.length > before, "10 to be sent");
    input.listeners.input({ target: { value: "20" } });
    metric("Lucky Whisker").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    // Saved to the file means the game took it first.
    await until(
        () => fileShops()?.some(({ id, stopAt }) => id === "0:item0" && stopAt === 20),
        () => `20 to be saved, field shows "${fieldText("Lucky Whisker")}"`
    );
    slowUpdate = 0;
    assert.ok((await gameShops()).some(({ id, stopAt }) => id === "0:item0" && stopAt === 20));
    await typeStopAt("Lucky Whisker", "");
    await ui.switchAutomation("automation shops", false);
});

test("reader: a refused save elsewhere leaves text typed (not yet entered) in another field", async () => {
    field("Golden Bramble").listeners.input({ target: { value: "33" } });
    refuseNextUpdates = 1;
    await checkbox(pickRow("Tiny Spark")).listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Tiny Spark")), "the refusal (said after the read-back)");
    assert.equal(fieldText("Golden Bramble"), "33");
    metric("Golden Bramble").listeners.keydown({ key: "Escape", target: field("Golden Bramble"), preventDefault() {} });
});

test("reader: Shops is switched on only if the game ended up running an item a save switched on", async () => {
    await ui.switchAutomation("automation shops", false);
    const picks = ui.createAutomationPicks("shops", { cheat: "automation shops" });
    picks.sync(await gameShops());
    // A: X on and Y's stop-at, both refused: nothing runs, so Shops stays off.
    slowUpdate = 20;
    refuseNextUpdates = 2;
    await Promise.all([
        picks.set("0:item2", { on: true }).catch(() => {}),
        picks.set("0:item0", { stopAt: 5 }).catch(() => {}),
    ]);
    assert.equal(shopsOn(), false, "both refused: the game runs no item, so Shops stays off");
    // B: X on (taken), then X off (refused): the game runs X, so Shops goes on.
    refuseUpdateNumber = updates.length + 2;
    const sent = updates.length;
    const on = picks.set("0:item2", { on: true });
    await until(() => updates.length > sent, "its list (X on) to be sent before X goes off");
    await Promise.all([on, picks.set("0:item2", { on: false }).catch(() => {})]);
    slowUpdate = 0;
    refuseUpdateNumber = null;
    assert.ok(
        (await gameShops()).some(({ id, on }) => id === "0:item2" && on),
        "the game runs X"
    );
    assert.equal(shopsOn(), true);
    await picks.set("0:item2", { on: false });
    await ui.switchAutomation("automation shops", false);
});

test("reader: the Shops tab's own switch shows Shops running after an item's file save failed", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) === "Off", "the tab to read Shops off");
    failSave = true;
    await checkbox(pickRow("Tiny Spark")).listeners.change({ target: { checked: true } });
    await until(() => /disk is full/.test(text(pickRow("Tiny Spark"))), "the failure");
    failSave = false;
    assert.equal(shopsOn(), true);
    await until(
        () => statusOf(shops) !== "Off",
        () => `the tab's switch to show Shops on, not ${statusOf(shops)}`
    );
    await checkbox(pickRow("Tiny Spark")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "0:item2" && on), "the item off");
    await ui.switchAutomation("automation shops", false);
});

test("reader: an item switched on just after Shops' Off leaves Shops on now and at start", async () => {
    await ui.switchAutomation("automation shops", true);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) !== "Off", "the tab to read Shops on");
    let release;
    holdNextOff = new Promise((resolve) => (release = resolve));
    try {
        const asked = commands.length;
        void checkbox(row(shops, "Shops")).listeners.change({ target: { checked: false } });
        await until(() => commands.length > asked, "the Off to reach the game and be held");
        const sent = updates.length;
        void checkbox(pickRow("Royal Pebble")).listeners.change({ target: { checked: true } });
        await handled();
        assert.equal(updates.length, sent, "the item's save waits behind the held Off");
        assert.equal(shopsOn(), true, "the Off isn't applied yet");
    } finally {
        release();
    }
    await until(() => /save-state--success/.test(saveState("Royal Pebble")) && shopsOn(), "the item, then Shops on");
    assert.ok(fileStartup.includes("automation shops"), "the item, clicked last, puts Shops back at start too");
    await checkbox(pickRow("Royal Pebble")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "1:item3" && on), "the item off");
    await ui.switchAutomation("automation shops", false);
});
test("reader: a refused switch shows off with its reason, and a save elsewhere doesn't send it again", async () => {
    refuseNextUpdates = 1;
    await checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Sleepy Fang")), "the refusal");
    assert.match(text(pickRow("Sleepy Fang")), /busy/);
    await typeStopAt("Royal Pebble", "7");
    assert.ok(!(await gameShops()).some(({ id, on }) => id === "1:item4" && on), "Sleepy Fang stays off");
    assert.match(saveState("Sleepy Fang"), /save-state--error/, "and keeps saying why");
    await typeStopAt("Royal Pebble", "");
});

test("reader: an item's file failure goes once a later save writes the file", async () => {
    failSave = true;
    await checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: true } });
    await until(() => /disk is full/.test(text(pickRow("Sleepy Fang"))), "the file failure");
    failSave = false;
    await typeStopAt("Royal Pebble", "7");
    assert.ok(
        fileShops().some(({ id, on }) => id === "1:item4" && on),
        "the file has it now"
    );
    await until(() => !/save-state--error/.test(saveState("Sleepy Fang")), "its file failure to go");
    await checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "1:item4" && on), "Sleepy Fang off");
    await typeStopAt("Royal Pebble", "");
    await ui.switchAutomation("automation shops", false);
});

test("reader: an older switch's failure isn't said once a newer switch worked", async () => {
    await ui.switchAutomation("automation shops", true);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) !== "Off", "the overview to read Shops on");
    slowOffBefore = 40;
    failNextToggle = true;
    const box = checkbox(row(overview, "Shops"));
    const asked = commands.length;
    const reads = listAnswered;
    const configs = configAnswered;
    void box.listeners.change({ target: { checked: false } });
    await until(() => commands.length > asked, "the Off to reach the game");
    void box.listeners.change({ target: { checked: true } });
    // Each switch reads the list and the config back after it ends (the On also reads the config for its startup
    // change): every read answered means both switches are done.
    await until(
        () => shopsOn() && listAnswered >= reads + 2 && configAnswered >= configs + 3,
        "both switches and their read-backs"
    );
    await handled();
    slowOffBefore = 0;
    assert.equal(shopsOn(), true);
    assert.doesNotMatch(text(row(overview, "Shops")), /cheat broke/);
    await ui.switchAutomation("automation shops", false);
});

test("reader: the Shops tab's switch read that a newer one overtook is dropped", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) === "Off", "the tab to read Shops off");
    let release;
    holdNextListRead = new Promise((resolve) => (release = resolve));
    const asked = listAsked;
    void button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => listAsked > asked, "the Refresh's read to be held");
    await checkbox(row(shops, "Shops")).listeners.change({ target: { checked: true } });
    await until(() => statusOf(shops) !== "Off", "the switch's own read to show Shops on");
    const answered = listAnswered;
    release();
    await until(() => listAnswered > answered, "the held read to be answered");
    await handled();
    assert.notEqual(statusOf(shops), "Off", "the older read was dropped");
    await ui.switchAutomation("automation shops", false);
});

// Found walking the four questions over every await after the reader's review.
test("walk: a refused save whose read-back fails still says why the save failed", async () => {
    refuseNextUpdates = 1;
    failNextConfigRead = true; // the read-back after the refusal
    await checkbox(pickRow("Golden Crown Hat")).listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Golden Crown Hat")), "the failure");
    assert.match(text(pickRow("Golden Crown Hat")), /busy/, "the refusal, not the read");
    failNextConfigRead = false;
});

test("walk: a switch that fails says why, even when reading the game back fails too", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) === "Off", "the tab to read Shops off");
    failNextToggle = true;
    failNextListRead = true; // the Shops tab's read-back after the switch
    await checkbox(row(shops, "Shops")).listeners.change({ target: { checked: true } });
    await until(() => /cheat broke|didn't answer/.test(text(row(shops, "Shops"))), "a failure to be said");
    assert.match(text(row(shops, "Shops")), /cheat broke/, "the switch's own failure");
    failNextListRead = false;
});

// CodeRabbit's fourth review of #105, on the one-queue structure.
test("round 4: Shops switched off after an item was switched on stays off", async () => {
    await ui.switchAutomation("automation shops", true);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) !== "Off", "the tab to read Shops on");
    let release;
    holdNextUpdate = new Promise((resolve) => (release = resolve));
    try {
        const sent = updates.length;
        void checkbox(pickRow("Grand Drift")).listeners.change({ target: { checked: true } });
        await until(() => updates.length > sent, "the item's save to reach the game and be held");
        void checkbox(row(shops, "Shops")).listeners.change({ target: { checked: false } });
        await handled();
    } finally {
        release();
    }
    await queueIdle();
    assert.equal(shopsOn(), false, "the Off, clicked after the item, wins");
    assert.ok(!fileStartup.includes("automation shops"), "and at start");
    await checkbox(pickRow("Grand Drift")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "0:item1" && on), "the item off");
});

test("round 4: a refused item whose read-back fails doesn't start Shops", async () => {
    await ui.switchAutomation("automation shops", false);
    refuseNextUpdates = 1;
    failNextConfigRead = true; // the read-back after the refusal
    await checkbox(pickRow("Golden Bramble")).listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Golden Bramble")), "the refusal");
    failNextConfigRead = false;
    assert.match(text(pickRow("Golden Bramble")), /busy/, "the refusal is said");
    assert.equal(shopsOn(), false, "the game refused the item, so Shops stays off");
});

test("round 4: when the file and the start both fail, the item's row says the file failed", async () => {
    await ui.switchAutomation("automation shops", false);
    failSave = true;
    failNextToggle = true; // Shops' start
    await checkbox(pickRow("Velvet Stone")).listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Velvet Stone")), "the failure");
    failSave = false;
    failNextToggle = false;
    assert.match(text(pickRow("Velvet Stone")), /not saved to the file/, "the save's own failure comes first");
    await checkbox(pickRow("Velvet Stone")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "1:item7" && on), "the item off");
});

test("round 4: when Shops can't start and its read-back fails too, the item's row says why it couldn't start", async () => {
    await ui.switchAutomation("automation shops", false);
    failNextToggle = true; // Shops' start
    failListReadAt = listAsked + 2; // ensureOn's own read works; the Shops tab's read-back after it fails
    await checkbox(pickRow("Lucky Whisker")).listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Lucky Whisker")), "the failure");
    failListReadAt = null;
    failNextToggle = false;
    assert.match(text(pickRow("Lucky Whisker")), /cheat broke/, "the start's failure, not the read's");
    await checkbox(pickRow("Lucky Whisker")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "0:item0" && on), "the item off");
});

test("round 4: Enable all after switching one automation off switches it back on with the rest", async () => {
    await testKit();
    switchAutomation("account.automation.shops", true);
    switchAutomation("test.kit", false);
    fileStartup = ["automation shops"];
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => row(overview, "Test kit") && button(overview, "Enable all"), "both rows and Enable all");
    let release;
    holdNextOff = new Promise((resolve) => (release = resolve));
    try {
        const asked = commands.length;
        void checkbox(row(overview, "Shops")).listeners.change({ target: { checked: false } });
        await until(() => commands.length > asked, "the Off to reach the game and be held");
        await until(() => button(overview, "Enable all"), "Enable all");
        void button(overview, "Enable all").listeners.click({ preventDefault() {} });
        await handled();
    } finally {
        release();
    }
    await queueIdle();
    const on = getAutomations()
        .filter(({ on }) => on)
        .map(({ id }) => id)
        .sort();
    assert.deepEqual(on, ["account.automation.shops", "test.kit"], "Enable all, clicked after the Off, switches both");
    assert.deepEqual(fileStartup.sort(), ["automation shops", "automation testkit"]);
    switchAutomation("account.automation.shops", false);
    switchAutomation("test.kit", false);
});

// A second reader's review of 9a3241c.
test("reader 2: a newer stop-at the game refuses on a row whose switch started Shops ends showing the refusal", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) === "Off", "the tab to read Shops off");
    let release;
    holdNextUpdate = new Promise((resolve) => (release = resolve));
    try {
        const sent = updates.length;
        void checkbox(pickRow("Tiny Spark")).listeners.change({ target: { checked: true } });
        await until(() => updates.length > sent, "the switch's save to reach the game and be held");
        refuseUpdateNumber = updates.length + 1; // the stop-at's save
        const input = field("Tiny Spark");
        input.listeners.input({ target: { value: "20" } });
        metric("Tiny Spark").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        await handled();
    } finally {
        release();
    }
    await queueIdle();
    refuseUpdateNumber = null;
    assert.equal(shopsOn(), true, "the switch, taken, started Shops");
    assert.match(saveState("Tiny Spark"), /save-state--error/, "the newer stop-at's refusal is what the row shows");
    assert.match(text(pickRow("Tiny Spark")), /busy/);
    await checkbox(pickRow("Tiny Spark")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "0:item2" && on), "the item off");
    await ui.switchAutomation("automation shops", false);
});

test("reader 2: with `cheat`, a save turns the automation on only when the game took the item", async () => {
    await ui.switchAutomation("automation shops", false);
    const picks = ui.createAutomationPicks("shops", { cheat: "automation shops" });
    picks.sync(await gameShops());
    refuseNextUpdates = 1;
    await picks.set("0:item5", { on: true }).catch(() => {});
    assert.equal(shopsOn(), false, "refused: Shops stays off");
    await picks.set("0:item5", { on: true });
    assert.equal(shopsOn(), true, "taken: Shops goes on in the same step");
    assert.ok(fileStartup.includes("automation shops"), "and at start");
    await picks.set("0:item5", { on: false });
    await ui.switchAutomation("automation shops", false);
});

test("reader 2: on, then off before the save runs, saves each in turn and leaves the item off", async () => {
    await ui.switchAutomation("automation shops", false);
    const picks = ui.createAutomationPicks("shops", { cheat: "automation shops" });
    picks.sync(await gameShops());
    let release;
    const hold = new Promise((resolve) => (release = resolve));
    const ahead = ui.inTurn(() => hold); // a step ahead of the saves
    const first = picks.set("0:item5", { on: true });
    const second = picks.set("0:item5", { on: false });
    release();
    await Promise.all([ahead, first, second]);
    assert.ok(!(await gameShops()).some(({ id, on }) => id === "0:item5" && on), "the game runs no item");
    // Each click is its own step, as if clicked slowly: the On ran the item, so it started the automation, and the
    // Off leaves the automation on (an item's switch never stops it).
    assert.equal(shopsOn(), true);
    await ui.switchAutomation("automation shops", false);
});

test("reader 2: a read the game answers late is said, and a switch clicked meanwhile still wins", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) === "Off", "the overview to read Shops off");
    const timeout = ui.steps.timeoutMs;
    ui.steps.timeoutMs = 100;
    let release;
    let answered;
    const from = order.length;
    holdNextListRead = new Promise((resolve) => (release = resolve));
    try {
        await until(() => button(overview, "Refresh"), "Refresh");
        const asked = listAsked;
        void button(overview, "Refresh").listeners.click({ preventDefault() {} });
        await until(() => listAsked > asked, "the Refresh's read to be held");
        await until(() => /still waiting/.test(text(overview)), "the overview to say the read is still waiting");
        void checkbox(row(overview, "Shops")).listeners.change({ target: { checked: true } });
        await handled();
        assert.notEqual(statusOf(overview), "Off", "the click shows at once");
    } finally {
        ui.steps.timeoutMs = timeout;
        answered = listAnswered;
        release();
    }
    // The late read (Off) lands before the switch runs: the row keeps the click, then shows what the switch did.
    await until(() => listAnswered > answered, "the held read to be answered");
    await handled();
    assert.notEqual(statusOf(overview), "Off", "the late read doesn't put Off back");
    await until(
        () => shopsOn() && !/still waiting/.test(text(overview)),
        () => `the switch to run and the outcomes to replace the notices, not ${text(overview)}`
    );
    const sequence = order.slice(from).map(([kind, , on]) => (kind === "toggle" ? `toggle ${on}` : kind));
    assert.ok(sequence.indexOf("list") < sequence.indexOf("toggle true"), "the switch ran after the late read ended");
    const reads = listAnswered;
    await until(() => button(overview, "Refresh"), "Refresh");
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => listAnswered > reads, "a new Refresh");
    await handled();
    assert.notEqual(statusOf(overview), "Off", "the new Refresh reads the On");
    assert.doesNotMatch(text(overview), /still waiting/);
    await ui.switchAutomation("automation shops", false);
});

test("reader 2: a new click on an automation's switch clears its last failure while the retry runs", async () => {
    await ui.switchAutomation("automation shops", true);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) !== "Off", "the overview to read Shops on");
    failNextToggle = true;
    await checkbox(row(overview, "Shops")).listeners.change({ target: { checked: false } });
    await until(() => /cheat broke/.test(text(row(overview, "Shops"))), "the failure to be said");
    let release;
    holdNextOff = new Promise((resolve) => (release = resolve));
    try {
        const asked = commands.length;
        void checkbox(row(overview, "Shops")).listeners.change({ target: { checked: false } });
        await until(() => commands.length > asked, "the retry to reach the game and be held");
        assert.doesNotMatch(text(row(overview, "Shops")), /cheat broke/, "the old failure goes when the retry starts");
    } finally {
        release();
    }
    await queueIdle();
    assert.equal(shopsOn(), false);
});

// CodeRabbit's fifth review of #105: each step sends what the game accepted plus its own change, and a step the game
// answers late holds the queue instead of letting a later step run under it.
const { updateSessionConfig } = await importRepo("src/ui/services/api.js");

test("round 5: an On the game answers after the deadline can't undo an Off clicked after it", async () => {
    await ui.switchAutomation("automation shops", false);
    const timeout = ui.steps.timeoutMs;
    ui.steps.timeoutMs = 100;
    let release;
    holdNextOnAnswer = new Promise((resolve) => (release = resolve));
    const notices = [];
    const from = order.length;
    let on;
    let off;
    try {
        on = ui.switchAutomation("automation shops", true, (notice) => notices.push(notice));
        await until(() => notices.length, "the On to say it is still waiting");
        assert.match(notices[0], /still waiting/);
        assert.equal(shopsOn(), true, "the game applied the On");
        off = ui.switchAutomation("automation shops", false);
    } finally {
        ui.steps.timeoutMs = timeout;
        release();
    }
    await Promise.all([on, off]);
    const sequence = order.slice(from).map(([kind, , value]) => (kind === "toggle" ? `toggle ${value}` : kind));
    assert.deepEqual(sequence, ["toggle true", "save", "toggle false", "save"], "the On ended before the Off began");
    assert.equal(shopsOn(), false);
    assert.ok(!fileStartup.includes("automation shops"), "the On's late startup change came before the Off, not after");
});

test("round 5: an item's save doesn't carry a switch queued after it", async () => {
    const picks = await freshPicks();
    let release;
    const hold = new Promise((resolve) => (release = resolve));
    const ahead = ui.inTurn(() => hold); // a step ahead of the saves
    const first = picks.set("0:item1", { stopAt: 9 });
    refuseUpdateNumber = updates.length + 2; // the switch's own save
    const second = picks.set("1:item5", { on: true }).catch((error) => error);
    release();
    await Promise.all([ahead, first]);
    assert.match((await second).message, /busy/);
    refuseUpdateNumber = null;
    const sentFirst = updates.at(-2).cheatConfig.automation.shops;
    assert.ok(!sentFirst.some(({ id }) => id === "1:item5"), "the stop-at's save sent only its own change");
    assert.ok(!(await gameShops()).some(({ id, on }) => id === "1:item5" && on), "the game doesn't run it");
    assert.ok(!fileShops().some(({ id, on }) => id === "1:item5" && on), "nor does the file");
    assert.equal(picks.get("1:item5").on.val, false);
    await picks.set("0:item1", { stopAt: null });
});

test("round 5: a refused item whose read-back fails isn't sent with a later save", async () => {
    const picks = await freshPicks();
    refuseNextUpdates = 1;
    failNextConfigRead = true; // the read-back after the refusal
    await assert.rejects(picks.set("1:item5", { on: true }), /busy/);
    failNextConfigRead = false;
    assert.equal(picks.get("1:item5").on.val, false, "it shows what the game had");
    await picks.set("0:item1", { stopAt: 4 });
    assert.ok(!saved().some(({ id }) => id === "1:item5"), "the later save doesn't send it");
    await picks.set("0:item1", { stopAt: null });
});

test("round 5: an edit made while a Refresh reads keeps what the Refresh read", async () => {
    // Another client switches Sleepy Fang on behind the page's back.
    await updateSessionConfig({
        cheatConfig: { automation: { shops: [...(await gameShops()), { id: "1:item4", on: true }] } },
    });
    let release;
    holdNextConfigRead = new Promise((resolve) => (release = resolve));
    try {
        await until(() => button(shops, "Refresh"), "Refresh");
        const asked = configAsked;
        void button(shops, "Refresh").listeners.click({ preventDefault() {} });
        await until(() => configAsked > asked, "the Refresh's config read to be held");
        const input = field("Lucky Whisker");
        input.listeners.input({ target: { value: "15" } });
        metric("Lucky Whisker").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        await handled();
    } finally {
        release();
    }
    await until(() => saved().some(({ id, stopAt }) => id === "0:item0" && stopAt === 15), "the stop-at to save");
    assert.ok(
        saved().some(({ id, on }) => id === "1:item4" && on),
        "the save keeps Sleepy Fang, which the Refresh read"
    );
    assert.equal(checkbox(pickRow("Sleepy Fang")).attributes.checked, true, "and its switch shows it on");
    await checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "1:item4" && on), "Sleepy Fang off");
    await typeStopAt("Lucky Whisker", "");
    await ui.switchAutomation("automation shops", false);
});

test("round 5: a switch that fails, with the read after it failing too, doesn't keep the click", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) === "Off", "the tab to read Shops off");
    failNextToggle = true;
    failNextListRead = true; // the Shops tab's read-back after the switch
    const box = checkbox(row(shops, "Shops"));
    await box.listeners.change({ target: { checked: true } });
    await until(() => /cheat broke/.test(text(row(shops, "Shops"))), "the failure to be said");
    failNextListRead = false;
    assert.equal(box.checked, false, "the switch doesn't show the click as if it worked");
    assert.match(statusOf(shops), /unknown/i, "it may have switched, so it isn't known until a read");
    await button(shops, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(shops) === "Off", "the next read to show it again");
});

test("round 5: a failed switch doesn't overwrite a newer click", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) === "Off", "the overview to read Shops off");
    let releaseOn;
    let releaseOff;
    holdNextOn = new Promise((resolve) => (releaseOn = resolve));
    holdNextOff = new Promise((resolve) => (releaseOff = resolve));
    failNextToggle = true; // the On
    const box = checkbox(row(overview, "Shops"));
    try {
        const asked = commands.length;
        void box.listeners.change({ target: { checked: true } });
        await until(() => commands.length > asked, "the On to reach the game and be held");
        void box.listeners.change({ target: { checked: false } });
        releaseOn();
        await until(() => commands.length > asked + 1, "the On to fail and the Off to reach the game");
        await handled();
        assert.equal(statusOf(overview), "Off", "the newer click shows, not the failed On");
        assert.equal(box.attributes.checked, false, "and so does the switch");
    } finally {
        releaseOn();
        releaseOff();
    }
    await queueIdle();
    assert.equal(shopsOn(), false);
    assert.equal(statusOf(overview), "Off");
    // Once both clicks' runs end, each sets the switch to what shows: the Off.
    await until(
        () => box.checked === false,
        () => `the switch to end off, not ${box.checked}`
    );
});

test("round 5: a stop-at that isn't a whole number is refused after the row's file failure went", async () => {
    failSave = true;
    await typeStopAt("Velvet Stone", "12");
    await until(() => /disk is full/.test(text(pickRow("Velvet Stone"))), "the file failure");
    failSave = false;
    await typeStopAt("Royal Pebble", "7"); // another row writes the file
    await until(() => !/save-state--error/.test(saveState("Velvet Stone")), "the file failure to go");
    const input = field("Velvet Stone");
    input.listeners.input({ target: { value: "-5" } }); // the field drops a "." as it is typed, not a "-"
    metric("Velvet Stone").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--error/.test(saveState("Velvet Stone")), "the field to refuse -5");
    assert.match(text(pickRow("Velvet Stone")), /whole number/);
    metric("Velvet Stone").listeners.keydown({ key: "Escape", target: input, preventDefault() {} });
    await typeStopAt("Velvet Stone", "");
    await typeStopAt("Royal Pebble", "");
});

test("round 5 sweep: the overview's Disable all shows what the game answered when the read after it fails", async () => {
    await ui.switchAutomation("automation shops", true);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) !== "Off" && button(overview, "Disable all"), "the overview to read Shops on");
    const disable = button(overview, "Disable all");
    await disable.listeners.click({ preventDefault() {} });
    failListReadAt = listAsked + 2; // the bulk switch's own read works; the page's read after it fails
    await disable.listeners.click({ preventDefault() {} });
    await until(() => !shopsOn() && listAnswered >= failListReadAt, "the switch and the failed read");
    await queueIdle();
    failListReadAt = null;
    assert.equal(statusOf(overview), "Off", "the game answered the Off, so the row shows it");
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) === "Off" && !/didn't answer/.test(text(overview)), "a read that works");
});

// A second reader's review of b47f9d7: the deadline is a notice while a step waits, and the outcome replaces it.
const lateBy = async (ms, body) => {
    const timeout = ui.steps.timeoutMs;
    ui.steps.timeoutMs = ms;
    try {
        return await body();
    } finally {
        ui.steps.timeoutMs = timeout;
    }
};

test("reader 3: a switch row says it is still waiting while the game hasn't answered, then shows the outcome", async () => {
    await ui.switchAutomation("automation shops", false);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(overview) === "Off", "the overview to read Shops off");
    let release;
    holdNextOnAnswer = new Promise((resolve) => (release = resolve));
    try {
        await lateBy(100, async () => {
            void checkbox(row(overview, "Shops")).listeners.change({ target: { checked: true } });
            await until(() => /still waiting/.test(text(row(overview, "Shops"))), "the row to say it is still waiting");
        });
    } finally {
        release();
    }
    await until(
        () => !/still waiting/.test(text(row(overview, "Shops"))) && statusOf(overview) !== "Off",
        () => `the outcome to replace the notice, not ${text(row(overview, "Shops"))}`
    );
    await queueIdle();
    assert.doesNotMatch(text(row(overview, "Shops")), /still waiting/);
    assert.equal(shopsOn(), true);
    await ui.switchAutomation("automation shops", false);
});

test("reader 3: an item row says it is still waiting, then shows the save worked", async () => {
    let release;
    holdNextUpdate = new Promise((resolve) => (release = resolve));
    try {
        await lateBy(100, async () => {
            void checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: true } });
            await until(() => /still waiting/.test(text(pickRow("Sleepy Fang"))), "the row to say it is still waiting");
        });
    } finally {
        release();
    }
    await until(() => /save-state--success/.test(saveState("Sleepy Fang")), "the save to show it worked");
    assert.doesNotMatch(text(pickRow("Sleepy Fang")), /still waiting/);
    await checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: false } });
    await until(() => !saved().some(({ id, on }) => id === "1:item4" && on), "Sleepy Fang off");
    await ui.switchAutomation("automation shops", false);
});

test("reader 3: an item row says it is still waiting, then why the game refused", async () => {
    let release;
    holdNextUpdate = new Promise((resolve) => (release = resolve));
    refuseUpdateNumber = updates.length + 1;
    try {
        await lateBy(100, async () => {
            void checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: true } });
            await until(() => /still waiting/.test(text(pickRow("Sleepy Fang"))), "the row to say it is still waiting");
        });
    } finally {
        release();
    }
    await until(() => /busy/.test(text(pickRow("Sleepy Fang"))), "the refusal to replace the notice");
    refuseUpdateNumber = null;
    assert.doesNotMatch(text(pickRow("Sleepy Fang")), /still waiting/);
    assert.match(saveState("Sleepy Fang"), /save-state--error/);
});

test("reader 3: Shops' Enable all says it is still waiting, then the notice goes when it worked", async () => {
    await ui.switchAutomation("automation shops", false);
    await until(() => button(shops, "Enable all"), "Enable all");
    let release;
    holdNextUpdate = new Promise((resolve) => (release = resolve));
    try {
        await lateBy(100, async () => {
            void button(shops, "Enable all").listeners.click({ preventDefault() {} });
            await until(() => /still waiting/.test(text(shops)), "the bar to say it is still waiting");
        });
    } finally {
        release();
    }
    await until(() => shopsOn() && !/still waiting/.test(text(shops)), "the outcome to replace the notice");
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await button(shops, "Disable all").listeners.click({ preventDefault() {} });
    await until(() => !saved().some(({ on }) => on), "everything off");
    await ui.switchAutomation("automation shops", false);
});

test("reader 3: the overview's Enable all says it is still waiting, then the notice goes when it worked", async () => {
    await testKit(); // a second automation, so it runs alone too
    await ui.switchAutomation("automation shops", false);
    await button(overview, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => button(overview, "Enable all"), "Enable all");
    let release;
    holdNextOnAnswer = new Promise((resolve) => (release = resolve));
    try {
        await lateBy(100, async () => {
            void button(overview, "Enable all").listeners.click({ preventDefault() {} });
            await until(() => /still waiting/.test(text(overview)), "the bar to say it is still waiting");
        });
    } finally {
        release();
    }
    await until(
        () => shopsOn() && !/still waiting/.test(text(overview)),
        () => `the outcome to replace the notice, not ${text(overview)}`
    );
    await queueIdle();
    assert.doesNotMatch(text(overview), /still waiting/);
    switchAutomation("account.automation.shops", false);
    switchAutomation("test.kit", false);
});

test("reader 3: a step waiting behind a late one says so too", async () => {
    let release;
    const hold = new Promise((resolve) => (release = resolve));
    const ahead = ui.inTurn(() => hold); // an earlier step the game hasn't answered
    const notices = [];
    const sent = commands.length;
    const behind = lateBy(100, () => ui.switchAutomation("automation shops", true, (notice) => notices.push(notice)));
    await until(() => notices.length, "the queued switch to say it is still waiting");
    assert.equal(commands.length, sent, "it hasn't run: it waits behind the earlier step");
    release();
    await Promise.all([ahead, behind]);
    assert.equal(shopsOn(), true);
    await ui.switchAutomation("automation shops", false);
});

// Leftovers the reader-3 fixes named: a wait isn't a failure, and a notice stays while any step is still late.
const failurePanel = (root) => text(byClass(root, "empty-state--failed")[0]);

test("reader 3: a slow Refresh says it is still waiting on the page's line, not under the read-failed title", async () => {
    await until(() => button(shops, "Refresh"), "Refresh");
    let release;
    holdNextListRead = new Promise((resolve) => (release = resolve));
    try {
        await lateBy(100, async () => {
            const asked = listAsked;
            void button(shops, "Refresh").listeners.click({ preventDefault() {} });
            await until(() => listAsked > asked, "the Refresh's read to be held");
            await until(
                () => byClass(shops, "said--line").some((line) => /still waiting/.test(text(line))),
                "the page's line to say it is still waiting"
            );
        });
        assert.doesNotMatch(failurePanel(shops), /still waiting/, "not under SHOP READ FAILED");
    } finally {
        release();
    }
    await until(() => !/still waiting/.test(text(shops)), "the read's end to clear the notice");
    assert.equal(failurePanel(shops), "SHOP READ FAILED", "and the read-failed panel says nothing");
});

test("reader 3: an item row's notice stays while its second slow save still waits", async () => {
    await ui.switchAutomation("automation shops", false);
    let releaseFirst;
    let releaseSecond;
    holdNextUpdate = new Promise((resolve) => (releaseFirst = resolve));
    const sent = updates.length;
    try {
        await lateBy(100, async () => {
            void checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: true } });
            await until(() => updates.length > sent, "the switch's save to reach the game and be held");
            const input = field("Sleepy Fang");
            input.listeners.input({ target: { value: "6" } });
            metric("Sleepy Fang").listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
            await until(() => /still waiting/.test(text(pickRow("Sleepy Fang"))), "the row to say it is still waiting");
        });
        holdNextUpdate = new Promise((resolve) => (releaseSecond = resolve));
        releaseFirst();
        await until(() => updates.length > sent + 1, "the switch to end and the stop-at's save to be held");
        await handled();
        assert.match(text(pickRow("Sleepy Fang")), /still waiting/, "the stop-at still waits, so the notice stays");
    } finally {
        releaseFirst();
        releaseSecond?.();
    }
    await until(
        () =>
            /save-state--success/.test(saveState("Sleepy Fang")) && !/still waiting/.test(text(pickRow("Sleepy Fang"))),
        () => `both outcomes to replace the notice, not ${text(pickRow("Sleepy Fang"))}`
    );
    await checkbox(pickRow("Sleepy Fang")).listeners.change({ target: { checked: false } });
    await typeStopAt("Sleepy Fang", "");
    await until(() => !saved().some(({ id }) => id === "1:item4"), "Sleepy Fang cleared");
    await ui.switchAutomation("automation shops", false);
});

// The re-read of 1c38c56.
const laterClickKeepsNotice = async (page) => {
    await ui.switchAutomation("automation shops", false);
    await button(page, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => statusOf(page) === "Off", "the page to read Shops off");
    const box = checkbox(row(page, "Shops"));
    let releaseRead;
    let releaseOff;
    holdNextListRead = new Promise((resolve) => (releaseRead = resolve)); // the On's read-back
    try {
        await lateBy(100, async () => {
            const asked = listAsked;
            void box.listeners.change({ target: { checked: true } });
            await until(() => listAsked > asked, "the On to end and its read-back to be held");
            void box.listeners.change({ target: { checked: false } });
            await until(() => /still waiting/.test(text(row(page, "Shops"))), "the Off's notice");
        });
        holdNextOff = new Promise((resolve) => (releaseOff = resolve));
        const toggled = commands.length;
        releaseRead();
        await until(() => commands.length > toggled, "the On's outcome, then the Off to reach the game and be held");
        await handled();
        assert.match(text(row(page, "Shops")), /still waiting/, "the Off still waits, so its notice stays");
    } finally {
        releaseRead();
        releaseOff?.();
    }
    await until(
        () => !shopsOn() && statusOf(page) === "Off" && !/still waiting/.test(text(row(page, "Shops"))),
        () => `the Off's outcome to replace the notice, not ${text(row(page, "Shops"))}`
    );
};

test("reader 3: a switch row's notice stays while a later click still waits, after an earlier click's outcome", () =>
    laterClickKeepsNotice(overview));

test("reader 3: on the Shops tab too, a later click's notice outlasts an earlier click's outcome", () =>
    laterClickKeepsNotice(shops));

const shownText = (node) =>
    node?.nodeType === 1 && classes(node).split(" ").includes("is-hidden-until-ready")
        ? ""
        : typeof node === "string"
          ? node
          : node?.nodeType === 3
            ? node.data
            : (node?.childNodes ?? []).map(shownText).join("");

for (const [name, path] of [
    ["the overview", "src/ui/pages/account/automation/1-overview.js"],
    ["the Shops tab", "src/ui/pages/account/automation/2-shops.js"],
]) {
    test(`reader 3: ${name}'s slow first load shows that it is still waiting, outside the hidden body`, async () => {
        let release;
        holdNextListRead = new Promise((resolve) => (release = resolve));
        const asked = listAsked;
        let page;
        try {
            await lateBy(100, async () => {
                page = (await importRepo(path)).default.component();
                await until(() => listAsked > asked, "the first read to be held");
                await until(
                    () => /still waiting/.test(shownText(page)),
                    () => `a shown notice, not ${shownText(page)}`
                );
            });
        } finally {
            release();
        }
        await until(() => !/still waiting/.test(text(page)), "the first read's end to clear the notice");
    });
}
