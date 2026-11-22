// World 4 › Cooking › Automation (#92) on the fake game: a Kitchens sub-tab (the spices with their saving %, then each
// kitchen's Speed, Fire and Luck with High / Low / Balanced, a stop-at and a switch) and a Meals sub-tab. A change
// saves cheatConfig.automation.kitchens, meals or one spice's place in kitchenSaving; switching an item on switches
// Cooking on; the tab reads the game again after every save; Enable all / Disable all cover the open sub-tab.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, elements, sent, fileSent, status, until } = kit;
const tab = (await importRepo("src/ui/pages/world-4/cooking/5-automation.js")).default.component();
const ariaIs = (label) => (node) => node.attributes["aria-label"] === label;
const rowOf = (label) => byClass(tab, "account-row").find((node) => elements(node).some(ariaIs(label)));
const SPICE = "Encroaching Forest Spice saving %";
const shownSavings = () =>
    byClass(tab, "automation-setting").filter((node) => !(node.parentNode.attributes.hidden || node.parentNode.hidden));
await until(() => rowOf("Buy Kitchen 1 Speed"), "the tab to load");

test("the tab lists each kitchen's Speed, Fire and Luck, and each meal, with what the game shows", () => {
    assert.equal(status(tab, "Cooking"), "Off");
    assert.match(text(rowOf("Buy Kitchen 1 Speed")), /Speed1\.5K\/hr · next level 121 Grasslands Spice/);
    assert.match(text(rowOf("Buy Kitchen 2 Luck")), /1\.25x · next level 311 Stinky Sewers Spice/);
    assert.match(text(rowOf("Buy Kitchen 5 Speed")), /Kitchen not bought yet/);
    assert.match(text(rowOf("Buy Mossy Pebble Pie")), /\+30\.49% Ember Bramble · 1\.23K held · next level 600/);
    assert.match(text(rowOf("Buy Mossy Pebble Pie")), /LV 14 \/ 90/);
    assert.match(text(rowOf("Buy Ember Bramble Pie")), /Not discovered yet/);
    assert.match(text(tab), /2 Food Lust stacks: the priciest meal goes first/);
    assert.match(text(tab), /No kitchen upgrade is switched on/);
    assert.equal(shownSavings().length, 0, "no spice is in use yet");
});

test("switching an upgrade on saves it, turns Cooking on now and at start, and shows its spice's saving", async () => {
    await kit.flip(rowOf("Buy Kitchen 2 Speed"), true);
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true }]);
    assert.deepEqual(fileSent("kitchens"), [{ id: "3", on: true }]);
    assert.equal(sent("kitchenSaving"), undefined, "the saving list saves only when it changes");
    assert.equal(kit.running("automation cooking"), true);
    assert.deepEqual(kit.fake.startup, ["automation cooking"]);
    assert.equal(shownSavings().length, 1, "only the spice it pays with");
    await until(() => /held · (saving for|buying cheapest first)/.test(text(rowOf(SPICE))), "the spice line");
});

test("the priority choice saves High, Low and back to Balanced", async () => {
    const row = rowOf("Buy Kitchen 2 Speed");
    await kit.choose(row, "save for it", 1);
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true, save: true }]);
    await kit.choose(row, "save for it", 1);
    assert.equal(sent("kitchens")[0].save, true);
    await kit.choose(row, "save for it", 0);
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true }]);
});

test("a stop-at and a spice's saving % save on Enter; a saving over 100 is refused at its field", async () => {
    await kit.type(rowOf("Buy Kitchen 2 Speed"), "150");
    assert.deepEqual(sent("kitchens"), [{ id: "3", on: true, stopAt: 150 }]);
    await kit.type(rowOf(SPICE), "35");
    assert.equal(sent("kitchenSaving")[2], 35, "spice 2 is Encroaching Forest");
    assert.equal(sent("kitchenSaving")[0], 10, "the others keep theirs");
    const before = kit.updates.length;
    await kit.type(rowOf(SPICE), "101");
    assert.equal(kit.updates.length, before);
    assert.match(text(rowOf(SPICE)), /a whole number from 0 to 100/);
});

test("a save the game refuses puts the switch back and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flip(rowOf("Buy Kitchen 1 Fire"), true);
    assert.equal(kit.checkbox(rowOf("Buy Kitchen 1 Fire")).checked, false);
    assert.match(text(rowOf("Buy Kitchen 1 Fire")), /the game is busy/);
});

test("switched off, a spice line says only what it holds", async () => {
    await kit.flip(kit.row(tab, "Cooking"), false);
    await until(() => status(tab, "Cooking") === "Off", "the switch to go off");
    assert.match(text(rowOf(SPICE)), /held/);
    assert.doesNotMatch(text(rowOf(SPICE)), /saving for|buying cheapest first/);
});

test("on the Meals tab, Enable all switches every meal on in one save; Disable all asks Click again first", async () => {
    await byClass(tab, "account-page-btn")
        .find((node) => text(node).trim() === "Meals")
        .listeners.click({ preventDefault() {} });
    await kit.settle();
    const kitchensBefore = sent("kitchens");
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.ok(sent("meals").length > 1 && sent("meals").every(({ on }) => on));
    assert.deepEqual(sent("kitchens"), kitchensBefore, "the kitchens stay as they were");
    assert.equal(kit.running("automation cooking"), true);
    await kit.clickTwice(tab, "Disable all");
    assert.ok(sent("meals").every(({ on }) => !on));
});
