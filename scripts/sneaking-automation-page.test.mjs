// World 6 › Sneaking › Automation (#92) on the fake game. The tab shows the sneaking automation's switch, the jade
// owned, the saving % and every Ninja Knowledge upgrade with its bonus, level, next cost or lock. An upgrade's switch,
// stop-at and High / Low / Balanced pick, and the saving %, save cheatConfig.automation.sneaking to the game and the
// config file; switching one on switches Sneaking on; a save the game refuses puts the control back and says why there.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router } = await createFakeApi();
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const saves = [];
const updates = [];
let refuseUpdate = false;
let fileStartup = [];
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    res.json(switchAutomation(getAutomations().find(({ cheat }) => cheat === action).id, on));
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
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${typeof what === "function" ? what() : what}`);
}

const tab = (await importRepo("src/ui/pages/world-6/sneaking/5-automation.js")).default.component();
const row = (name) => byClass(tab, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
await until(() => row("Way of Stealth"), "the tab to load");

const checkbox = (node) =>
    elements(node).find((entry) => entry.nodeName === "input" && entry.attributes.type === "checkbox");
const field = (node) =>
    elements(node).find((entry) => entry.nodeName === "input" && entry.attributes.type !== "checkbox");
const pick = (name) => elements(row(name)).find((node) => node.nodeName === "select");
const button = (label) =>
    elements(tab).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
const saveState = (node) => classes(byClass(node, "save-state")[0]);
const saved = () => updates.at(-1)?.cheatConfig.automation.sneaking;
const fileSaved = () => saves.findLast((body) => body.cheatConfig)?.cheatConfig.automation.sneaking;
const sneakingOn = () => getAutomations().find(({ cheat }) => cheat === "automation sneaking").on;
async function type(node, value) {
    const input = field(node);
    input.listeners.input({ target: { value } });
    const since = updates.length;
    byClass(node, "account-field-metric")[0].listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => updates.length > since || /save-state--error/.test(saveState(node)), "the field's save");
    await settle();
}
const choose = async (name, value) => {
    const since = updates.length;
    await pick(name).listeners.change({ target: { value } });
    await until(() => updates.length > since, `${name}'s priority to save`);
    await settle();
};

test("the tab shows Sneaking's switch, the jade, the saving % and every upgrade but the placeholder", () => {
    assert.ok(row("Sneaking"), "the same switch as the overview");
    assert.match(text(tab), /42\.5M JADE/);
    assert.equal(byClass(tab, "automation-pick").length, 31 + 1, "31 upgrades and the saving row");
    assert.equal(row("Name"), undefined, "row 9 is the game's placeholder");
    // Way of Stealth: level 40, (40 + 10 omni levels) * 1 = 50%, 50 * 1.08^40 jade.
    assert.match(text(row("Way of Stealth")), /LV 40/);
    assert.match(text(row("Way of Stealth")), /\+50%/);
    assert.match(text(row("Way of Stealth")), /Next level 1\.09K jade/);
    assert.match(text(row("Mastery Loot")), /Unlocks once Centurion Lineage has a level/);
    assert.match(text(row("Centurion Lineage")), /Unlocks with Sneaking mastery/);
    assert.match(text(row("Strange Symbols")), /Unlocks at level 1 of the W7 Coral Reef's Ninja Knowledge upgrade/);
    assert.deepEqual(
        elements(pick("Way of Stealth"))
            .filter((node) => node.nodeName === "option")
            .map(text),
        ["High", "Low", "Balanced"]
    );
});

test("switching an upgrade on while Sneaking is off switches Sneaking on too, now and at start", async () => {
    assert.equal(sneakingOn(), false);
    await checkbox(row("Way of Stealth")).listeners.change({ target: { checked: true } });
    await until(() => sneakingOn() && /save-state--success/.test(saveState(row("Way of Stealth"))), "Sneaking on");
    assert.deepEqual(saved(), { saving: 10, items: [{ id: "13", on: true }] });
    assert.deepEqual(commands, [["automation sneaking", true]]);
    assert.deepEqual(fileStartup, ["automation sneaking"]);
    await until(
        () => text(byClass(row("Sneaking"), "automation-row__status")[0]) !== "Off",
        "the tab's own switch row to show it on"
    );
});

test("a priority, a stop-at and the saving % save the whole group to the game and the file", async () => {
    await choose("Way of Stealth", "1");
    assert.deepEqual(saved(), { saving: 10, items: [{ id: "13", on: true, priority: 1 }] });
    await type(row("Way of Stealth"), "60");
    assert.deepEqual(saved().items, [{ id: "13", on: true, stopAt: 60, priority: 1 }]);
    await type(row("Saving"), "25");
    assert.deepEqual(saved(), { saving: 25, items: [{ id: "13", on: true, stopAt: 60, priority: 1 }] });
    await until(() => fileSaved()?.saving === 25, "the file save");
    assert.deepEqual(fileSaved(), saved());

    // Low is 2; Balanced is saved as no priority; a switched-off upgrade keeps its stop-at and priority.
    await choose("Looting Ambition", "2");
    assert.deepEqual(saved().items.at(-1), { id: "14", on: false, priority: 2 });
    await choose("Looting Ambition", "");
    assert.equal(
        saved().items.some(({ id }) => id === "14"),
        false,
        "nothing left to keep"
    );
});

test("a saving % outside 0 to 100 is refused at its field and nothing is saved", async () => {
    const before = updates.length;
    for (const value of ["101", "-1", "half"]) {
        await type(row("Saving"), value);
        assert.match(saveState(row("Saving")), /save-state--error/);
        assert.match(text(row("Saving")), /whole number from 0 to 100/);
        byClass(row("Saving"), "account-field-metric")[0].listeners.keydown({
            key: "Escape",
            target: field(row("Saving")),
            preventDefault() {},
        });
        await settle();
    }
    assert.equal(updates.length, before);
});

test("a priority the game refuses goes back to what the game holds and says why at the row", async () => {
    refuseUpdate = true;
    await choose("Way of Stealth", "2");
    await until(() => /save-state--error/.test(saveState(row("Way of Stealth"))), "the row to show the failure");
    assert.match(text(row("Way of Stealth")), /busy/);
    refuseUpdate = false;
    await settle();
    const chosen = elements(pick("Way of Stealth")).find((node) => node.attributes.selected === true);
    assert.equal(chosen.attributes.value, "1", "back to High, what the game holds");
});

test("Disable all asks Click again, then switches every upgrade off keeping stop-at and priority", async () => {
    const disable = button("Disable all");
    const before = updates.length;
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, before, "the first click saves nothing");
    await disable.listeners.click({ preventDefault() {} });
    await until(() => updates.length > before, "the upgrades to switch off");
    await settle();
    assert.deepEqual(saved().items, [{ id: "13", on: false, stopAt: 60, priority: 1 }]);
    assert.equal(saved().saving, 25);
    assert.equal(sneakingOn(), true, "only the overview stops Sneaking itself");
});

test("Enable all switches every upgrade on in one save", async () => {
    const before = updates.length;
    await button("Enable all").listeners.click({ preventDefault() {} });
    await until(() => updates.length > before && !button("Enable all"), "every upgrade to go on");
    assert.equal(updates.length, before + 1, "one save");
    assert.equal(saved().items.length, 31);
    assert.ok(saved().items.every(({ on }) => on));
    await switchAutomation("w6.automation.sneaking", false);
});
