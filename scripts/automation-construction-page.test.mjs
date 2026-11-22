// World 3 › Construction › Automation (#92) on the fake game: Construction's switch, the build queue line, and a row
// per building in the menu's three rows of nine, each with its bonus, build line, High / Low / Balanced, a stop-at
// and a switch. A change saves cheatConfig.automation.construction (a plain list); switching a building on switches
// Construction on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, fileSent, selected, status, until } = kit;
const tab = (await importRepo("src/ui/pages/world-3/construction/3-automation.js")).default.component();
const row = (name) => kit.row(tab, name);
const byName = (index) =>
    byClass(tab, "automation-pick").map((node) => text(byClass(node, "account-row__name")[0]))[index];
await until(() => row("Talent Book Library"), "the tab to load");

test("the tab shows the switch, the build queue and a row per building in the menu's three rows", () => {
    assert.equal(status(tab, "Construction"), "Off");
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
    const library = text(row("Talent Book Library"));
    assert.match(library, /\+65% Checkout Refresh Speed/, "the panel's bonus line");
    assert.match(library, /LV 14 \/ 101/);
    assert.match(library, /Next level 80 Redox Salts · in slot 1 · 29% · 42m left/);
    assert.match(text(row("Chest Space")), /Locked: build Salt Lick first/);
    assert.match(text(row("Cost Cruncher")), /Max level/);
    assert.match(text(row(byName(6))), /built, waiting for salt/);
    assert.equal(selected(row("Talent Book Library")), "No");
});

test("a small salt cost shows whole, rounded up like the game", async () => {
    const block = kit.fixture.computed._customBlock_WorkbenchStuff;
    const cost = block.TowerSaltCost;
    block.TowerSaltCost = (b, ...rest) => (b === 1 ? 79.4 : cost(b, ...rest));
    try {
        await kit.button(tab, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
        assert.match(text(row("Talent Book Library")), /Next level 80 Redox Salts/);
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

test("a priority saves with the building, and Balanced saves none", async () => {
    await kit.choose(row("Talent Book Library"), "save for it", 1);
    assert.deepEqual(sent("construction"), [{ id: "1", on: true, save: true }]);
    await kit.choose(row("Talent Book Library"), "save for it", 1);
    assert.deepEqual(sent("construction"), [{ id: "1", on: true, save: true }]);
    assert.equal(selected(row("Talent Book Library")), "Yes");
    await kit.choose(row("Talent Book Library"), "save for it", 0);
    assert.deepEqual(sent("construction"), [{ id: "1", on: true }]);
});

test("a priority the game refuses goes back to the saved one and says why; the next save clears it", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.choose(row("Talent Book Library"), "save for it", 1);
    assert.equal(selected(row("Talent Book Library")), "No");
    assert.match(text(row("Talent Book Library")), /the game is busy/);
    await kit.choose(row("Talent Book Library"), "save for it", 1);
    assert.equal(selected(row("Talent Book Library")), "Yes");
    assert.doesNotMatch(text(row("Talent Book Library")), /the game is busy/);
});

test("a stop-at saves on Enter beside the priority", async () => {
    await kit.type(row("Talent Book Library"), "30");
    assert.deepEqual(sent("construction"), [{ id: "1", on: true, stopAt: 30, save: true }]);
});

test("Enable all switches every building on in one save; Disable all asks Click again, then keeps priorities", async () => {
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("construction").filter(({ on }) => on).length, 27);
    await kit.clickTwice(tab, "Disable all");
    assert.ok(sent("construction").every(({ on }) => !on));
    assert.equal(sent("construction").find(({ id }) => id === "1").save, true, "High stays");
});
