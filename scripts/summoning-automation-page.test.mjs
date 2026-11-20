// World 6 › Summoning › Automation (#92) on the fake game. One section per essence colour (what it owns, what it is
// doing, its saving %) with its upgrades: name, the board's bonus text, LV badge, stop-at, priority and switch.
// Switching an upgrade on switches Summoning on; a pick or saving save reads the game back, worked or not; an older
// read that answers last doesn't put back what a newer one showed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router, game } = await createFakeApi();
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const updates = [];
let refuseUpdate = false;
let holdNextRead = null; // a promise the next summoning read waits on, answering what it read before
let fileStartup = [];
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    const automation = getAutomations().find(({ cheat }) => cheat === action);
    res.json(switchAutomation(automation.id, on));
});
const readComputedRoute = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { name } = await req.json();
    const hold = name === "summoning" ? holdNextRead : null;
    if (!hold) return readComputedRoute(req, res);
    holdNextRead = null;
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
const button = (root, label) =>
    elements(root).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
const summoningOn = () => getAutomations().find(({ cheat }) => cheat === "automation summoning").on;
const saved = () =>
    updates.findLast((body) => body.cheatConfig.automation.summoning)?.cheatConfig.automation.summoning.items;

const tab = (await importRepo("src/ui/pages/world-6/summoning/4-automation.js")).default.component();
const pick = (name) =>
    byClass(tab, "automation-pick").find((node) => text(byClass(node, "account-row__name")[0]) === name);
await until(() => pick("Familiar"), "the tab to load");
const sections = () => byClass(tab, "account-section");
const section = (colour) =>
    sections().find((node) => text(byClass(node, "account-section__title")[0]) === `${colour} ESSENCE`);
const statusOf = (colour) => text(byClass(section(colour), "automation-colour-status")[0]);
const checkbox = (node) =>
    elements(node).find((entry) => entry.nodeName === "input" && entry.attributes.type === "checkbox");
const choice = (name) => elements(pick(name)).find((node) => node.nodeName === "select");
const saveState = (node) => classes(byClass(node, "save-state")[0]);
const savingRow = (colour) => byClass(section(colour), "automation-saving")[0];
const savingField = (colour) => elements(savingRow(colour)).find((node) => node.nodeName === "input");
const savingValue = (colour) => {
    const input = savingField(colour);
    const value = input.value ?? input.attributes.value;
    return typeof value === "function" ? value() : value;
};
async function typeSaving(colour, value) {
    const input = savingField(colour);
    input.listeners.input({ target: { value } });
    byClass(savingRow(colour), "account-field-metric")[0].listeners.keydown({
        key: "Enter",
        target: input,
        preventDefault() {},
    });
}

test("one section per essence colour, each with what it owns, its saving % and its upgrades", () => {
    assert.deepEqual(
        sections()
            .map((node) => text(byClass(node, "account-section__title")[0]))
            .slice(1),
        ["WHITE", "GREEN", "YELLOW", "BLUE", "PURPLE", "RED", "CYAN", "TEAL"].map((colour) => `${colour} ESSENCE`)
    );
    assert.match(text(section("WHITE")), /4\.2M owned/);
    assert.equal(statusOf("WHITE"), "Nothing switched on");
    assert.equal(savingValue("WHITE"), "10");
    // The Familiar row: the board's bonus text, the familiars owned per tier, the level against its max.
    const familiar = text(pick("Familiar"));
    assert.match(familiar, /\+15% Royal Pebble bonus/);
    assert.match(familiar, /Familiars: 6 Slime, 3 Vrumbi, 1 Bloomy/);
    assert.match(familiar, /LV 15 \/ 50/);
    assert.match(familiar, /Next level 165 white essence/, "a cost under 1000 rounds up, as the board shows it");
    // A row whose parent has no level says what unlocks it; it can still be switched on ahead.
    const locked = byClass(tab, "automation-pick").filter((node) => /Unlocks once .+ has a level/.test(text(node)));
    assert.ok(locked.length > 0);
    assert.ok(
        locked.every((node) => checkbox(node).attributes.disabled === undefined),
        "switchable ahead"
    );
    assert.ok(
        byClass(tab, "automation-row").some((node) => /Summoning/.test(text(node))),
        "the switch row"
    );
});

test("switching an upgrade on saves it, and turns Summoning on now and at start", async () => {
    assert.equal(summoningOn(), false);
    await checkbox(pick("Familiar")).listeners.change({ target: { checked: true } });
    await until(() => summoningOn() && /save-state--success/.test(saveState(pick("Familiar"))), "Summoning to go on");
    assert.deepEqual(saved(), [{ id: "2", on: true }]);
    assert.deepEqual(commands.at(-1), ["automation summoning", true]);
    assert.deepEqual(fileStartup, ["automation summoning"]);
    await until(
        () => statusOf("WHITE") === "Buying cheapest first",
        () => statusOf("WHITE")
    );
});

test("a priority saves with the upgrade, and the colour's line reads the game's new goal", async () => {
    await choice("Familiar").listeners.change({ target: { value: "2" } });
    await until(() => saved()?.[0]?.priority === 2, "the priority to save");
    assert.deepEqual(saved(), [{ id: "2", on: true, priority: 2 }]);
    await until(
        () => /^Saving for Familiar \(/.test(statusOf("WHITE")),
        () => statusOf("WHITE")
    );
    assert.equal(statusOf("GREEN"), "Nothing switched on", "another colour's goal is its own");

    // Balanced again: no goal, and no priority kept in the list.
    await choice("Familiar").listeners.change({ target: { value: "" } });
    await until(() => saved()?.[0] && !("priority" in saved()[0]), "Balanced to save");
    await until(
        () => statusOf("WHITE") === "Buying cheapest first",
        () => statusOf("WHITE")
    );
});

test("a priority the game refuses goes back to what the game holds, and says why at the row", async () => {
    refuseUpdate = true;
    const select = choice("Familiar");
    select.value = "1"; // the player's pick
    await select.listeners.change({ target: select });
    await until(() => /save-state--error/.test(saveState(pick("Familiar"))), "the row to show the failure");
    assert.match(text(pick("Familiar")), /busy/);
    assert.equal(select.value, "", "Balanced, as the game has it");
    refuseUpdate = false;
});

test("a colour's saving % saves on Enter, refuses what isn't 0 to 100, and reads the game back", async () => {
    const before = updates.length;
    await typeSaving("WHITE", "150");
    await until(() => /save-state--error/.test(saveState(savingRow("WHITE"))), "the field to refuse");
    assert.match(text(savingRow("WHITE")), /0 to 100/);
    assert.equal(updates.length, before, "nothing is sent");

    await typeSaving("WHITE", "25");
    await until(() => /save-state--success/.test(saveState(savingRow("WHITE"))), "the saving to save");
    assert.deepEqual(updates.at(-1), { cheatConfig: { automation: { summoningSaving: { white: 25 } } } });
    assert.equal((await gameSaving()).white, 25);
    assert.equal((await gameSaving()).green, 10, "only that colour changes");

    // Refused: the reason shows at the field, which reads what the game holds now (50, set elsewhere since),
    // not the 25 it showed; the next save clears the reason.
    await updateSessionConfig({ cheatConfig: { automation: { summoningSaving: { white: 50 } } } });
    refuseUpdate = true;
    await typeSaving("WHITE", "40");
    await until(() => /save-state--error/.test(saveState(savingRow("WHITE"))), "the refusal");
    assert.match(text(savingRow("WHITE")), /busy/);
    await until(
        () => savingValue("WHITE") === "50",
        () => `the field to read 50, not ${savingValue("WHITE")}`
    );
    refuseUpdate = false;
    await typeSaving("WHITE", "30");
    await until(() => /save-state--success/.test(saveState(savingRow("WHITE"))), "the retry");
    assert.doesNotMatch(text(savingRow("WHITE")), /busy/);
});

const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
async function gameSaving() {
    return (await fetchConfig()).cheatConfig.automation.summoningSaving;
}

test("an older read that answers last doesn't put back what a newer one showed", async () => {
    let release;
    holdNextRead = new Promise((resolve) => (release = resolve));
    const refresh = button(tab, "Refresh");
    void refresh.listeners.click({ preventDefault() {} });
    await settle();
    game.gga.Summon[2][0] = 999; // essence arrives after the first read looked
    await checkbox(pick("Familiar")).listeners.change({ target: { checked: false } });
    await until(() => /999 owned/.test(text(section("WHITE"))), "the newer read to show 999");
    release();
    await settle(60);
    assert.match(text(section("WHITE")), /999 owned/);
});

test("Enable all switches every upgrade on in one save; Disable all asks Click again first", async () => {
    await switchAutomation("w6.automation.summoning", false);
    const before = updates.length;
    await button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => summoningOn() && updates.length > before && !button(tab, "Enable all"), "every upgrade on");
    assert.equal(updates.length, before + 1, "one save");
    const total = byClass(tab, "automation-pick").length;
    assert.equal(saved().length, total);
    assert.ok(saved().every(({ on }) => on));

    const disable = button(tab, "Disable all");
    const sent = updates.length;
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, sent, "the first click saves nothing");
    await disable.listeners.click({ preventDefault() {} });
    await until(() => saved().every(({ on }) => !on), "every upgrade off");
    await switchAutomation("w6.automation.summoning", false);
});
