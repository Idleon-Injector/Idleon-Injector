// World 3 › Construction › Automation (#92) on the fake game: Construction's switch, the build queue beside the title,
// and a row per building in the menu's three rows of nine, each with its bonus, build line, level, next cost, a
// stop-at, "Save for it" and a switch. A change saves cheatConfig.automation.construction (a plain list); switching a building on switches
// Construction on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, fileSent, status, until } = kit;
const tab = (await importRepo("src/ui/pages/world-3/construction/3-automation.js")).default.component();
const row = (name) => kit.row(tab, name);
const byName = (index) =>
    byClass(tab, "automation-pick").map((node) => text(byClass(node, "account-row__name")[0]))[index];
await until(() => row("Talent Book Library"), "the tab to load");
// A read-only value of a row, by its column ("Level", "Next level").
const value = (node, column) =>
    text(
        byClass(node, "value-cell")
            .find((cell) => text(byClass(cell, "value-cell__label")[0]) === column)
            ?.childNodes.at(-1)
    );
const saved = (name) => kit.saveSwitch(row(name)).attributes.checked;

test("the tab shows the switch, the build queue and a row per building in the menu's three rows", () => {
    assert.equal(status(tab, "Construction"), "Off");
    assert.match(text(tab), /5 of 8 slots building · Slot 8 kept for the jelly · 420 build\/hr/, "beside the title");
    assert.deepEqual(byClass(tab, "account-section__title").map(text), ["Settings", "Buildings", "Towers", "Shrines"]);
    assert.deepEqual(
        byClass(tab, "account-section")
            .slice(1)
            .map((section) => byClass(section, "automation-pick").length),
        [9, 9, 9]
    );
    const library = row("Talent Book Library");
    assert.match(text(library), /\+65% Checkout Refresh Speed/, "the panel's bonus line");
    assert.equal(value(library, "Level"), "14 / 101");
    assert.equal(value(library, "Next level"), "80");
    assert.match(text(library), /Paid with Redox Salts · in slot 1 · 29% · 42m left/);
    assert.match(text(row("Chest Space")), /Build Salt Lick first/);
    assert.equal(value(row("Chest Space"), "Next level"), "Locked");
    assert.equal(value(row("Cost Cruncher"), "Next level"), "Max");
    assert.match(text(row(byName(6))), /built, waiting for salt/);
    assert.equal(saved("Talent Book Library"), false);
});

test("a small salt cost shows whole, rounded up like the game", async () => {
    const block = kit.fixture.computed._customBlock_WorkbenchStuff;
    const cost = block.TowerSaltCost;
    block.TowerSaltCost = (b, ...rest) => (b === 1 ? 79.4 : cost(b, ...rest));
    try {
        await kit.button(tab, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
        assert.equal(value(row("Talent Book Library"), "Next level"), "80");
        assert.doesNotMatch(text(row("Talent Book Library")), /79\.4/);
    } finally {
        block.TowerSaltCost = cost;
        await kit.button(tab, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
    }
});

test("switching a building on saves it and turns Construction on, now and at start", async () => {
    await kit.flip(row("Talent Book Library"), true);
    assert.deepEqual(sent("construction"), [{ id: "1", on: true }]);
    assert.deepEqual(fileSent("construction"), [{ id: "1", on: true }]);
    assert.equal(kit.running("automation construction"), true);
    assert.deepEqual(kit.fake.startup, ["automation construction"]);
});

test("Save for it saves with the building, and off saves none", async () => {
    await kit.flipSave(row("Talent Book Library"), true);
    assert.deepEqual(sent("construction"), [{ id: "1", on: true, save: true }]);
    assert.equal(saved("Talent Book Library"), true);
    await kit.flipSave(row("Talent Book Library"), false);
    assert.deepEqual(sent("construction"), [{ id: "1", on: true }]);
});

test("a Save for it the game refuses goes back to the saved one and says why; the next save clears it", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flipSave(row("Talent Book Library"), true);
    assert.equal(saved("Talent Book Library"), false);
    assert.match(text(row("Talent Book Library")), /the game is busy/);
    await kit.flipSave(row("Talent Book Library"), true);
    assert.equal(saved("Talent Book Library"), true);
    assert.doesNotMatch(text(row("Talent Book Library")), /the game is busy/);
});

test("a stop-at saves on Enter beside Save for it", async () => {
    await kit.type(row("Talent Book Library"), "30");
    assert.deepEqual(sent("construction"), [{ id: "1", on: true, stopAt: 30, save: true }]);
});

test("Enable all switches every building on in one save; Disable all asks in the tray, then keeps Save for it", async () => {
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("construction").filter(({ on }) => on).length, 27);
    await kit.askAndConfirm(tab, "Disable all", "Disable 27 buildings?");
    assert.ok(sent("construction").every(({ on }) => !on));
    assert.equal(sent("construction").find(({ id }) => id === "1").save, true, "Save for it stays");
});
