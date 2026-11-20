// World 1 › Owl › Automation and World 2 › Kangaroo › Automation (#92) on the fake game. Each upgrade row shows its
// level, next cost or what unlocks it, a stop-at level, High / Low / Balanced and a switch; the saving % has its own
// row. Every change saves cheatConfig.automation.<clicker> (and <clicker>Saving) to the game and the config file;
// switching an upgrade on switches its automation on; a save the game refuses puts the row back, says why at the row,
// and the next save that works clears it. Enable all covers every clicker on the tab; Disable all asks "Click again".
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// An automation a test leaves on keeps its timer; don't let it keep the process alive.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router, game } = await createFakeApi();
const { gga } = game;
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const saves = [];
const updates = [];
let refuseNextUpdates = 0; // how many of the next session updates the game refuses
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
    if (refuseNextUpdates > 0) {
        refuseNextUpdates--;
        return res.json({ message: "Config update failed", details: "the game is busy" });
    }
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
const byTag = (node, tag) => elements(node).find((entry) => entry.nodeName === tag);
const checkbox = (node) =>
    elements(node).find((entry) => entry.nodeName === "input" && entry.attributes.type === "checkbox");
const field = (node) =>
    elements(node).find((entry) => entry.nodeName === "input" && entry.attributes.type !== "checkbox");
const button = (root, label) =>
    elements(root).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
// The priority options in the order the row lists them, by their option value.
const [HIGH, LOW, BALANCED] = ["0", "1", "2"];
const saveState = (node) => classes(byClass(node, "save-state")[0]);
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${typeof what === "function" ? what() : what}`);
}
const running = (cheat) => getAutomations().find((entry) => entry.cheat === cheat).on;
const sent = (key) => updates.findLast((body) => key in body.cheatConfig.automation)?.cheatConfig.automation[key];
// The list the last save sent, once a save after `since` (updates.length before the change) has gone out.
const sentSince = (since, key) =>
    updates.slice(since).findLast((body) => key in body.cheatConfig.automation)?.cheatConfig.automation[key];
const fileSent = (key) =>
    saves.findLast((body) => body.cheatConfig && key in body.cheatConfig.automation)?.cheatConfig.automation[key];
// The option shown; the page binds each option's `selected` (an attribute in this fake DOM).
const selected = (node) => elements(node).find((o) => o.nodeName === "option" && o.attributes.selected === true);
async function type(node, value) {
    const input = field(node);
    input.listeners.input({ target: { value } });
    const since = updates.length;
    byClass(node, "account-field-metric")[0].listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => updates.length > since || /save-state--error/.test(saveState(node)), "the field's save");
    await settle();
}

const owl = (await importRepo("src/ui/pages/world-1/owl/2-automation.js")).default.component();
await until(() => row(owl, "The Great Mega Reset"), "the Owl's Automation tab to load");
const orion = (name) => row(owl, name);

test("the Owl tab lists Orion's switch, feathers, the saving % and every upgrade with its level and cost", () => {
    assert.ok(row(owl, "Orion"), "the same switch as the overview");
    assert.equal(text(byClass(row(owl, "Orion"), "automation-row__status")[0]), "Off");
    assert.match(text(owl), /4\.2B feathers · 3\.1M per second/);
    assert.equal(byClass(owl, "automation-pick").length, 9);
    assert.match(text(orion("Feather Generation")), /LV 14/);
    assert.match(text(orion("Feather Generation")), /Next level 2\.78K feathers/);
    assert.match(text(orion("The Great Mega Reset")), /Unlocks at 100B feathers produced/, "locked stays listed");
    assert.equal(field(row(owl, "Saving")).attributes.value, "10", "the saving % the game holds");
});

test("the preset shows: The Great Mega Reset is High and Feather Restart Low, both off", () => {
    assert.equal(text(selected(orion("The Great Mega Reset"))), "High");
    assert.equal(text(selected(orion("Feather Restart"))), "Low");
    assert.equal(text(selected(orion("Feather Generation"))), "Balanced");
    assert.equal(checkbox(orion("The Great Mega Reset")).attributes.checked, false);
});

test("switching an upgrade on keeps the preset, saves it, and switches Orion on now and at start", async () => {
    const since = commands.length;
    await checkbox(orion("Feather Generation")).listeners.change({ target: { checked: true } });
    await until(
        () => running("automation orion") && /save-state--success/.test(saveState(orion("Feather Generation"))),
        "Orion to go on"
    );
    assert.deepEqual(sent("orion"), [
        { id: "8", on: false, priority: 1 },
        { id: "4", on: false, priority: 2 },
        { id: "0", on: true },
    ]);
    assert.deepEqual(fileSent("orion"), sent("orion"), "the config file got the same list");
    assert.equal(sent("orionSaving"), undefined, "the saving % saves on its own, not with the list");
    assert.deepEqual(commands.slice(since), [["automation orion", true]]);
    assert.deepEqual(fileStartup, ["automation orion"]);
});

test("a priority saves on change; Balanced leaves no priority in the list", async () => {
    const pick = byTag(orion("Feather Cheapener"), "select");
    let since = updates.length;
    await pick.listeners.change({ target: { value: LOW } });
    await until(
        () => sentSince(since, "orion")?.some(({ id, priority }) => id === "3" && priority === 2),
        "Low to save"
    );
    assert.equal(text(selected(orion("Feather Cheapener"))), "Low");

    since = updates.length;
    await byTag(orion("Feather Restart"), "select").listeners.change({ target: { value: BALANCED } });
    await until(() => sentSince(since, "orion")?.every(({ id }) => id !== "4"), "Balanced to drop the off, plain row");
    assert.equal(text(selected(orion("Feather Restart"))), "Balanced");
});

test("two quick priority picks save in order, and the last one stands", async () => {
    slowUpdate = 40;
    const pick = byTag(orion("Shiny Feathers"), "select");
    const since = updates.length;
    const first = pick.listeners.change({ target: { value: HIGH } });
    const second = pick.listeners.change({ target: { value: LOW } });
    await Promise.all([first, second]);
    await until(
        () => sentSince(since, "orion")?.find(({ id }) => id === "6")?.priority === 2,
        "the second pick to save last"
    );
    await settle(100);
    slowUpdate = 0;
    assert.equal(sent("orion").find(({ id }) => id === "6").priority, 2);
    assert.equal(text(selected(orion("Shiny Feathers"))), "Low");
});

test("the saving % saves on Enter; a value out of range is refused at the row and nothing is sent", async () => {
    const saving = row(owl, "Saving");
    await type(saving, "25");
    assert.equal(sent("orionSaving"), 25);
    assert.equal(fileSent("orionSaving"), 25);

    const before = updates.length;
    await type(saving, "150");
    assert.equal(updates.length, before, "nothing is sent");
    assert.match(saveState(saving), /save-state--error/);
    assert.match(text(saving), /a whole number from 0 to 100/);

    await type(saving, "30");
    assert.equal(sent("orionSaving"), 30);
    assert.doesNotMatch(saveState(saving), /error/, "the next save that works clears the failure");
});

test("a save the game refuses puts the switch back, says why at the row, and a retry works", async () => {
    const node = orion("Bonuses of Orion");
    refuseNextUpdates = 1;
    await checkbox(node).listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState(node)), "the refusal to show");
    assert.equal(checkbox(node).checked, false, "the switch reads the game again");
    assert.match(text(node), /the game is busy/);

    await checkbox(node).listeners.change({ target: { checked: true } });
    await until(() => sent("orion").some(({ id, on }) => id === "1" && on), "the retry to save");
    await until(
        () => !/save-state--error/.test(saveState(node)) && checkbox(node).checked,
        "the retry to clear the failure and leave the switch on"
    );
});

test("a stop-at level saves on Enter, empty is no limit", async () => {
    const node = orion("Feather Generation");
    await type(node, "40");
    assert.equal(sent("orion").find(({ id }) => id === "0").stopAt, 40);
    await type(node, "");
    // An off row with no limit and no priority leaves the list, which is no limit too.
    assert.equal(sent("orion").find(({ id }) => id === "0")?.stopAt, undefined);
});

test("after a save the tab reads the game again, so the level and cost follow", async () => {
    const node = orion("Feather Generation");
    const before = gga.OptionsListAccount[254];
    gga.OptionsListAccount[254] = before + 3; // the game moved on since the tab read it
    await type(node, "90");
    await until(() => new RegExp(`LV ${before + 3}`).test(text(node)), "the level the game holds now");
    gga.OptionsListAccount[254] = before;
});

test("Disable all asks Click again, then switches every upgrade off and keeps the priorities", async () => {
    // An upgrade on and Feather Cheapener Low, whatever ran before.
    let since = updates.length;
    await checkbox(orion("Feather Generation")).listeners.change({ target: { checked: true } });
    await until(() => sentSince(since, "orion"), "Feather Generation to save");
    since = updates.length;
    await byTag(orion("Feather Cheapener"), "select").listeners.change({ target: { value: LOW } });
    await until(() => sentSince(since, "orion"), "Low to save");
    await until(() => button(owl, "Disable all"), "Disable all");

    const disable = button(owl, "Disable all");
    const before = updates.length;
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, before, "the first click saves nothing");

    await disable.listeners.click({ preventDefault() {} });
    await until(() => sent("orion").every(({ on }) => !on), "every upgrade to switch off");
    assert.equal(sent("orion").find(({ id }) => id === "8").priority, 1, "High stays");
    assert.equal(sent("orion").find(({ id }) => id === "3").priority, 2, "Low stays");
});

const kangaroo = (await importRepo("src/ui/pages/world-2/kangaroo/2-automation.js")).default.component();
await until(() => row(kangaroo, "Slick Hook"), "the Kangaroo's Automation tab to load");

test("the Kangaroo tab has Poppy and the Tar Pit, each with its own switch, currency and saving %", () => {
    assert.ok(row(kangaroo, "Poppy") && row(kangaroo, "Tar Pit"));
    assert.match(text(kangaroo), /3\.4M fish/);
    assert.match(text(kangaroo), /8\.4K tartar fish/);
    assert.equal(byClass(kangaroo, "automation-setting").length, 2);
    assert.match(text(row(kangaroo, "Oily Worm")), /Needs more megafish/);
    assert.match(text(row(kangaroo, "Greatest Catch")), /Unlocks at 2\.1B fish caught/);
});

test("Enable all on the Kangaroo tab switches every upgrade on, and Poppy and the Tar Pit with them", async () => {
    await button(kangaroo, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => running("automation poppy") && running("automation tarpit"), "both automations to go on");
    await until(() => sent("tarpit")?.length === 8 && sent("tarpit").every(({ on }) => on), "the Tar Pit list");
    const poppy = updates.findLast((body) => body.cheatConfig.automation.poppy)?.cheatConfig.automation.poppy;
    assert.equal(poppy.length, 12);
    assert.ok(poppy.every(({ on }) => on));
    assert.ok(fileStartup.includes("automation poppy") && fileStartup.includes("automation tarpit"));
    // Enable all saves the lists only; each saving % stays as it was.
    assert.equal(sent("tarpitSaving"), undefined);
    assert.equal(sent("poppySaving"), undefined);
});
