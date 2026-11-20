// World 7 › Bubba › Automation (#92) on the fake game. Each upgrade row has High / Low / Balanced, a stop-at and a
// switch; the meat section has what it is doing (only while it runs) and the saving %. A change saves
// cheatConfig.automation.bubba (a plain list) or bubbaSaving to the game and the config file; switching an upgrade on
// switches the Bubba automation on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, field, sent, fileSent, selected, status, until } = kit;
const page = (await importRepo("src/ui/pages/world-7/bubba/2-automation.js")).default.component();
const row = (name) => kit.row(page, name);
const meatLine = () => text(byClass(page, "automation-goal")[0] ?? "");
await until(() => row("Grand Stone"), "the Bubba automation tab to load");

test("the tab shows the Bubba switch, meat, the saving % and every upgrade with its next cost", () => {
    assert.equal(status(page, "Bubba"), "Off");
    assert.match(text(page), /12\.5K owned/);
    assert.equal(meatLine(), "", "switched off, the tab says what it would do nowhere");
    assert.equal(String(field(row("Saving")).attributes.value), "10");
    assert.match(text(row("Grand Stone")), /Next level 40 meat/);
    assert.match(text(row("Grand Stone")), /LV 0 \/ 5/);
    assert.match(text(row("Hollow Drift")), /Max level/);
    assert.equal(byClass(page, "automation-pick").length, 28);
    assert.ok(
        byClass(page, "automation-pick").some((node) => /Unlocks at 1M meat made/.test(text(node))),
        "a locked upgrade says what unlocks it and can still be switched on"
    );
});

test("switching an upgrade on saves the list and switches Bubba on, now and at start", async () => {
    await kit.flip(row("Grand Stone"), true);
    assert.deepEqual(sent("bubba"), [{ id: "0", on: true }]);
    assert.deepEqual(fileSent("bubba"), [{ id: "0", on: true }]);
    assert.equal(kit.running("automation bubba"), true);
    assert.deepEqual(kit.fake.startup, ["automation bubba"]);
    await until(
        () => meatLine() === "Buying cheapest first",
        () => `the status to follow: ${meatLine()}`
    );
});

test("a priority saves on the item, and the status line follows after the save", async () => {
    await kit.flip(row("Tiny Tide"), true);
    await kit.choose(row("Tiny Tide"), "priority", 1); // Low
    assert.deepEqual(sent("bubba"), [
        { id: "0", on: true },
        { id: "1", on: true, priority: 2 },
    ]);
    assert.equal(selected(row("Tiny Tide")), "Low");
    await until(
        () => meatLine() === "Saving for Tiny Tide (64 meat)",
        () => `the goal: ${meatLine()}`
    );
    await kit.choose(row("Tiny Tide"), "priority", 2); // Balanced
    assert.deepEqual(sent("bubba")[1], { id: "1", on: true }, "Balanced leaves no priority");
    await until(
        () => meatLine() === "Buying cheapest first",
        () => `the status to follow: ${meatLine()}`
    );
});

test("the saving % saves on Enter to its own key; one over 100 is refused at its field", async () => {
    await kit.type(row("Saving"), "25");
    assert.equal(sent("bubbaSaving"), 25);
    assert.equal(fileSent("bubbaSaving"), 25);
    const before = kit.updates.length;
    await kit.type(row("Saving"), "150");
    assert.equal(kit.updates.length, before);
    assert.match(text(row("Saving")), /a whole number from 0 to 100/);
});

test("a save the game refuses puts the switch back and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flip(row("Royal Crown"), true);
    assert.equal(kit.checkbox(row("Royal Crown")).checked, false);
    assert.match(text(row("Royal Crown")), /the game is busy/);
});

test("switched off, the meat line goes and the switch row says Off", async () => {
    await kit.flip(row("Bubba"), false);
    await until(() => status(page, "Bubba") === "Off", "the switch row to say Off");
    assert.equal(meatLine(), "");
});

test("Enable all switches every upgrade on in one save; Disable all asks Click again and keeps priorities", async () => {
    await kit.choose(row("Tiny Tide"), "priority", 0); // High
    await kit.button(page, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("bubba").filter(({ on }) => on).length, 28);
    assert.equal(kit.running("automation bubba"), true, "and Bubba with them");
    await kit.clickTwice(page, "Disable all");
    assert.ok(sent("bubba").every(({ on }) => !on));
    assert.equal(sent("bubba").find(({ id }) => id === "1").priority, 1, "High stays");
});
