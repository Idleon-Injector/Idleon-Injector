// Account › Clickers › Automation › Bubba (#92) on the fake game. Each upgrade row has its level, next cost, a stop-at,
// "Save for it" and a switch; Bubba's switch row says what it is doing, and the saving % has its own row. A change saves
// cheatConfig.automation.bubba (a plain list) or bubbaSaving to the game and the config file; switching an upgrade on
// switches the Bubba automation on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, field, sent, fileSent, status, until } = kit;
// The Clickers page, every clicker's tab mounted; Bubba's is the third.
const page = (await importRepo("src/ui/pages/automation/clickers/clickers.js")).ClickersAutomation();
const bubbaTools = () => byClass(page, "automation-tools")[2];
// Bubba's own rows (its tab's table: the other tabs have a "While saving" too).
const row = (name) => kit.row(byClass(page, "automation-rows")[2], name);
const meatLine = () => status(page, "Bubba");
// The fake game has no character in a map, so a running automation says it waits for one (the game's own line; the
// game-side tests cover "Saving for").
const WAITING = "Waiting for a character to be in game";
// Switched on by an upgrade's save, its row says so before the game's own line (#214).
const BY_UPGRADE = `On, since an upgrade was switched on. ${WAITING}`;
// A read-only value of a row, by its column ("Level", "Next level").
const value = (node, column) =>
    text(
        byClass(node, "value-cell")
            .find((cell) => text(byClass(cell, "value-cell__label")[0]) === column)
            ?.childNodes.at(-1)
    );
await until(() => row("Grand Stone"), "the Bubba automation tab to load");
// Bubba's tab open, so the title's stats are its meat.
await byClass(page, "tabbed-list__tab")
    .find((node) => text(node).trim() === "Bubba")
    .listeners.click({ preventDefault() {} });

test("the tab shows the Bubba switch, meat, the saving % and every upgrade with its next cost", () => {
    assert.equal(status(page, "Bubba"), "Off");
    assert.match(text(page), /12\.5K meat/, "beside the title");
    assert.equal(String(field(row("While saving")).attributes.value), "10");
    assert.equal(value(row("Grand Stone"), "Next level"), "40");
    assert.equal(value(row("Grand Stone"), "Level"), "0 / 5");
    assert.equal(value(row("Hollow Drift"), "Next level"), "Max");
    assert.equal(byClass(byClass(page, "automation-rows")[2], "automation-pick").length, 28);
    assert.ok(
        byClass(byClass(page, "automation-rows")[2], "automation-pick").some((node) =>
            /Unlocks at 1M meat made/.test(text(node))
        ),
        "a locked upgrade says what unlocks it and can still be switched on"
    );
});

test("small amounts show whole, like the game: a cost rounded up, the meat held rounded down", async () => {
    const block = kit.fixture.computed._customBlock_Bubbastuff;
    const cost = block.UpgCost;
    const meat = kit.gga.Bubba[0][0];
    block.UpgCost = (i, ...rest) => (i === 0 ? 39.2 : cost(i, ...rest));
    kit.gga.Bubba[0][0] = 149.36;
    try {
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
        assert.equal(value(row("Grand Stone"), "Next level"), "40");
        assert.match(text(page), /149 meat/);
        assert.doesNotMatch(text(page), /149\.36|39\.2/);
    } finally {
        block.UpgCost = cost;
        kit.gga.Bubba[0][0] = meat;
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
    }
});

test("switching an upgrade on saves the list and switches Bubba on, now and at start, and its row says why", async () => {
    await kit.flip(row("Grand Stone"), true);
    assert.deepEqual(sent("bubba"), [{ id: "0", on: true }]);
    assert.deepEqual(fileSent("bubba"), [{ id: "0", on: true }]);
    assert.equal(kit.running("automation bubba"), true);
    assert.deepEqual(kit.fake.startup, ["automation bubba"]);
    await until(
        () => meatLine() === BY_UPGRADE,
        () => `the status to follow: ${meatLine()}`
    );
});

test("Save for it saves on the item, and the status line follows after the save", async () => {
    await kit.flip(row("Tiny Tide"), true);
    await kit.flipSave(row("Tiny Tide"), true);
    assert.deepEqual(sent("bubba"), [
        { id: "0", on: true },
        { id: "1", on: true, save: true },
    ]);
    assert.equal(kit.saveSwitch(row("Tiny Tide")).attributes.checked, true);
    assert.equal(meatLine(), BY_UPGRADE, "the switch row keeps the game's own line");
    await kit.flipSave(row("Tiny Tide"), false);
    assert.deepEqual(sent("bubba")[1], { id: "1", on: true }, "off leaves no save in the list");
    assert.equal(kit.saveSwitch(row("Tiny Tide")).attributes.checked, false);
});

test("the saving % saves on Enter to its own key; one over 100 is refused at its field", async () => {
    await kit.type(row("While saving"), "25");
    assert.equal(sent("bubbaSaving"), 25);
    assert.equal(fileSent("bubbaSaving"), 25);
    const before = kit.updates.length;
    await kit.type(row("While saving"), "150");
    assert.equal(kit.updates.length, before);
    assert.match(text(row("While saving")), /a whole number from 0 to 100/);
});

test("a save the game refuses puts the switch back and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flip(row("Royal Crown"), true);
    assert.equal(kit.checkbox(row("Royal Crown")).checked, false);
    assert.match(text(row("Royal Crown")), /the game is busy/);
});

test("switched off, the switch row says Off", async () => {
    await kit.flip(row("Bubba"), false);
    await until(() => status(page, "Bubba") === "Off", "the switch row to say Off");
});

test("Enable all switches every upgrade on in one save; Disable all asks in the tray and keeps Save for it", async () => {
    await kit.flipSave(row("Tiny Tide"), true);
    await kit.button(bubbaTools(), "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("bubba").filter(({ on }) => on).length, 28);
    assert.equal(kit.running("automation bubba"), true, "and Bubba with them");
    await kit.askAndConfirm(page, "Disable all", "Disable 28 Bubba upgrades?");
    assert.ok(sent("bubba").every(({ on }) => !on));
    assert.equal(sent("bubba").find(({ id }) => id === "1").save, true, "Save for it stays");
});
