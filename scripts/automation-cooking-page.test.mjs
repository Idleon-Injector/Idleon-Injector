// World 4 › Cooking › Automation (#92) on the fake game: one section per kitchen (Speed, Fire, Luck) with a stop-at, a
// High / Low / Balanced choice and a switch per upgrade, a saving % per spice in use, and a row per meal. Every edit
// saves cheatConfig.automation.kitchens (+ kitchenSaving) or .meals to the game and the config file; switching one on
// turns Cooking on, and a save the game refuses puts the control back and says why at the row.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// An automation a test leaves on keeps its timer; don't let it keep the process alive.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router } = await createFakeApi();
// The fake game's cheats don't run; this one runs the real automation switch, as the game's cheat does.
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const updates = [];
const saves = [];
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
const ariaIs = (label) => (node) => node.attributes["aria-label"] === label;
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
const cookingOn = () => getAutomations().find(({ cheat }) => cheat === "automation cooking").on;
const sent = (key) => updates.findLast((body) => body.cheatConfig.automation[key])?.cheatConfig.automation[key];

const tab = (await importRepo("src/ui/pages/world-4/cooking/5-automation.js")).default.component();
const control = (label) => elements(tab).find(ariaIs(label));
// The row holding the control `label` names.
const rowOf = (label) => byClass(tab, "account-row").find((node) => elements(node).some(ariaIs(label)));
const saveState = (label) => classes(byClass(rowOf(label), "save-state")[0] ?? { attributes: {} });
async function type(label, value) {
    const input = control(label);
    input.listeners.input({ target: { value } });
    const since = updates.length;
    byClass(rowOf(label), "account-field-metric")[0].listeners.keydown({
        key: "Enter",
        target: input,
        preventDefault() {},
    });
    await until(() => updates.length > since || /save-state--error/.test(saveState(label)), `${label} to save`);
    await settle();
}
await until(() => control("Buy Kitchen 1 Speed"), "the Automation tab to load");

test("the tab lists each kitchen's Speed, Fire and Luck, and each meal, with what the game shows", () => {
    assert.deepEqual(
        byClass(tab, "account-section__title")
            .map(text)
            .filter((title) => title.startsWith("KITCHEN")),
        ["KITCHEN 1", "KITCHEN 2", "KITCHEN 3", "KITCHEN 4", "KITCHEN 5", "KITCHEN 6"]
    );
    assert.match(text(rowOf("Buy Kitchen 1 Speed")), /Speed1\.5K\/hr · next level 121 Grasslands Spice/);
    assert.match(text(rowOf("Buy Kitchen 2 Luck")), /1\.25x · next level 311 Stinky Sewers Spice/);
    assert.match(text(rowOf("Buy Kitchen 5 Speed")), /Kitchen not bought yet/);
    assert.match(text(rowOf("Buy Mossy Pebble Pie")), /\+30\.49% Ember Bramble · 1\.23K held · next level 600/);
    assert.match(text(rowOf("Buy Mossy Pebble Pie")), /LV 14 \/ 90/);
    assert.match(text(rowOf("Buy Ember Bramble Pie")), /Not discovered yet/);
    assert.match(text(tab), /2 Food Lust stacks: the priciest meal goes first/);
    assert.match(text(tab), /No kitchen upgrade is switched on/);
});

test("switching an upgrade on saves it, turns Cooking on now and at start, and shows its spice's saving", async () => {
    assert.equal(cookingOn(), false);
    await control("Buy Kitchen 2 Speed").listeners.change({ target: { checked: true } });
    await until(() => cookingOn() && /save-state--success/.test(saveState("Buy Kitchen 2 Speed")), "Cooking to go on");
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true }]);
    assert.equal(sent("kitchenSaving").length, 21, "the saving list goes with it, as read");
    assert.deepEqual(commands, [["automation cooking", true]]);
    assert.deepEqual(fileStartup, ["automation cooking"]);
    assert.deepEqual(
        saves.findLast((body) => body.cheatConfig).cheatConfig.automation.kitchens,
        [{ id: "3", on: true }],
        "and to the file"
    );
    const spiceRow = byClass(tab, "automation-saving").find((node) => /Encroaching Forest Spice/.test(text(node)));
    assert.equal(
        Boolean(spiceRow.parentNode.attributes.hidden || spiceRow.parentNode.hidden),
        false,
        "the spice it pays with shows its saving row"
    );
    assert.equal(
        byClass(tab, "automation-saving").filter(
            (node) => !(node.parentNode.attributes.hidden || node.parentNode.hidden)
        ).length,
        1,
        "only that one"
    );
});

test("the priority choice saves High, Low and back to Balanced", async () => {
    await control("Kitchen 2 Speed priority").listeners.change({ target: { value: "1" } });
    await until(() => sent("kitchens")?.[0]?.priority === 1, "High to save");
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true, priority: 1 }]);
    await control("Kitchen 2 Speed priority").listeners.change({ target: { value: "2" } });
    await until(() => sent("kitchens")[0].priority === 2, "Low to save");
    await control("Kitchen 2 Speed priority").listeners.change({ target: { value: "" } });
    await until(() => !("priority" in sent("kitchens")[0]), "Balanced to save");
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true }]);
});

test("a stop-at and a spice's saving % save on Enter; a saving over 100 is refused at its field", async () => {
    await type("Kitchen 2 Speed stop at", "150");
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true, stopAt: 150 }]);

    const saving = "Encroaching Forest Spice: % of what it saves for that Balanced items may spend";
    await type(saving, "35");
    assert.equal(sent("kitchenSaving")[2], 35, "spice 2 is Encroaching Forest");
    assert.equal(sent("kitchenSaving")[0], 10, "the others keep theirs");

    const before = updates.length;
    await type(saving, "101");
    assert.equal(updates.length, before, "nothing saved");
    assert.match(text(rowOf(saving)), /a whole number from 0 to 100/);
});

test("a save the game refuses puts the switch back and says why at the row", async () => {
    refuseUpdate = true;
    await control("Buy Kitchen 1 Fire").listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Buy Kitchen 1 Fire")), "the refusal");
    refuseUpdate = false;
    assert.equal(control("Buy Kitchen 1 Fire").checked, false);
    assert.match(text(rowOf("Buy Kitchen 1 Fire")), /the game is busy/);
    assert.equal(sent("kitchens").length, 2, "it was sent");
    // The next save carries only what the game holds.
    await control("Buy Kitchen 1 Luck").listeners.change({ target: { checked: true } });
    await until(() => sent("kitchens").some(({ id }) => id === "2"), "the next save");
    assert.deepEqual(
        sent("kitchens").map(({ id }) => id),
        ["2", "3"]
    );

    // A refused priority goes back to what the game holds, so the next save doesn't carry it.
    refuseUpdate = true;
    await control("Kitchen 2 Speed priority").listeners.change({ target: { value: "1" } });
    await until(() => /save-state--error/.test(saveState("Kitchen 2 Speed priority")), "the priority refusal");
    refuseUpdate = false;
    await control("Buy Kitchen 1 Luck").listeners.change({ target: { checked: false } });
    await until(() => sent("kitchens").length === 1, "the next save");
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true, stopAt: 150 }]);
});

test("on the Meals tab, Enable all switches every meal on in one save; Disable all asks Click again first", async () => {
    button(tab, "Meals").listeners.click({ preventDefault() {} });
    await settle();
    const before = updates.length;
    await button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => updates.length > before && sent("meals")?.length === 28, "every meal to go on");
    assert.equal(updates.length, before + 1, "one save");
    assert.ok(sent("meals").every(({ on }) => on));
    assert.equal(sent("kitchens").length, 1, "kitchens stay as they were");

    const disable = button(tab, "Disable all");
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, before + 1, "the first click saves nothing");
    await disable.listeners.click({ preventDefault() {} });
    await until(() => !sent("meals")?.length, "every meal to go off");
    await switchAutomation("w4.cooking.automation", false);
});
