// World 6 › Sneaking › Automation (#92) on the fake game: Sneaking's switch, the jade, the saving %, and every Ninja
// Knowledge upgrade but the game's placeholder with its bonus or lock, level, next cost, a stop-at, "Save for it" and a
// switch. A change saves cheatConfig.automation.sneaking (a plain list) or sneakingSaving; switching an upgrade
// on switches Sneaking on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, fileSent, status, until } = kit;
const tab = (await importRepo("src/ui/pages/world-6/sneaking/2-automation.js")).default.component();
const row = (name) => kit.row(tab, name);
await until(() => row("Way of Stealth"), "the tab to load");
// A read-only value of a row, by its column ("Level", "Next level").
const value = (node, column) =>
    text(
        byClass(node, "value-cell")
            .find((cell) => text(byClass(cell, "value-cell__label")[0]) === column)
            ?.childNodes.at(-1)
    );
const saved = (name) => kit.saveSwitch(row(name)).attributes.checked;

test("the tab shows Sneaking's switch, the jade, the saving % and every upgrade but the placeholder", () => {
    assert.equal(status(tab, "Sneaking"), "Off");
    assert.match(text(tab), /42\.5M jade/, "beside the title");
    assert.equal(row("Name"), undefined, "row 9 is the game's placeholder");
    assert.equal(value(row("Way of Stealth"), "Level"), "40");
    assert.match(text(row("Way of Stealth")), /\+50 Stealth per Sneaking Lv/);
    assert.equal(value(row("Way of Stealth"), "Next level"), "1.09K");
    assert.equal(value(row("Mastery Loot"), "Next level"), "Locked");
    assert.match(text(row("Mastery Loot")), /Unlocks once Centurion Lineage has a level/);
    assert.match(text(row("Centurion Lineage")), /Unlocks with Sneaking mastery/);
    assert.match(text(row("Strange Symbols")), /Unlocks at level 1 of the W7 Coral Reef's Ninja Knowledge upgrade/);
    assert.ok(row("While saving"));
});

test("small amounts show whole, like the game: a cost rounded up, the jade held rounded down", async () => {
    const block = kit.fixture.computed._customBlock_Ninja;
    const cost = block.JadeUpgCost;
    const jade = kit.gga.Ninja[102][1];
    block.JadeUpgCost = () => 120.4;
    kit.gga.Ninja[102][1] = 149.36;
    try {
        await kit.button(tab, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
        assert.equal(value(row("Way of Stealth"), "Next level"), "121");
        assert.match(text(tab), /149 jade/);
        assert.doesNotMatch(text(tab), /149\.36|120\.4/);
    } finally {
        block.JadeUpgCost = cost;
        kit.gga.Ninja[102][1] = jade;
        await kit.button(tab, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
    }
});

test("switching an upgrade on while Sneaking is off switches Sneaking on too, now and at start", async () => {
    await kit.flip(row("Way of Stealth"), true);
    assert.equal(kit.running("automation sneaking"), true);
    assert.deepEqual(kit.fake.startup, ["automation sneaking"]);
    assert.deepEqual(sent("sneaking").at(-1), { id: String(sent("sneaking").at(-1).id), on: true });
    await until(() => status(tab, "Sneaking") !== "Off", "the switch row to show it on");
});

test("Save for it and a stop-at save on the item; the saving % saves to its own key", async () => {
    await kit.flipSave(row("Way of Stealth"), true);
    await kit.type(row("Way of Stealth"), "60");
    const item = sent("sneaking").find(({ on }) => on);
    assert.equal(item.save, true);
    assert.equal(item.stopAt, 60);
    assert.equal(saved("Way of Stealth"), true);
    await kit.type(row("While saving"), "25");
    assert.equal(sent("sneakingSaving"), 25);
    assert.equal(fileSent("sneakingSaving"), 25);
    assert.deepEqual(fileSent("sneaking"), sent("sneaking"));
});

test("a saving % over 100 is refused at its field and nothing is saved", async () => {
    const before = kit.updates.length;
    await kit.type(row("While saving"), "150");
    assert.equal(kit.updates.length, before);
    assert.match(text(row("While saving")), /whole number from 0 to 100/);
});

test("a Save for it the game refuses goes back to what the game holds and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flipSave(row("Way of Stealth"), false);
    assert.equal(saved("Way of Stealth"), true);
    assert.match(text(row("Way of Stealth")), /the game is busy/);
});

test("Enable all switches every upgrade on; Disable all asks in the tray and keeps stop-at and Save for it", async () => {
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.ok(sent("sneaking").length > 20 && sent("sneaking").every(({ on }) => on));
    await kit.askAndConfirm(tab, "Disable all", `Disable ${sent("sneaking").length} Ninja Knowledge upgrades?`);
    assert.ok(sent("sneaking").every(({ on }) => !on));
    const kept = sent("sneaking").find(({ stopAt }) => stopAt === 60);
    assert.equal(kept.save, true, "the stop-at and Save for it stay");
});

test("after Sneaking's own switch turns it on, Enable all knows it is in the startup cheats too", async () => {
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    // Sneaking goes off, now and at start, outside the tab; the tab reads that.
    kit.switchAutomation(kit.getAutomations().find(({ cheat }) => cheat === "automation sneaking").id, false);
    kit.fake.startup = [];
    await kit.button(tab, "Refresh").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.ok(kit.button(tab, "Enable all"), "Enable all has Sneaking to switch on");

    await kit.flip(row("Sneaking"), true);
    assert.deepEqual(kit.fake.startup, ["automation sneaking"]);
    assert.equal(kit.button(tab, "Enable all"), undefined, "nothing is left for Enable all");
});

test("typing the value a field already holds ends at once and saves nothing", async () => {
    await kit.type(row("While saving"), "30");
    assert.equal(sent("sneakingSaving"), 30);
    const since = kit.updates.length;
    const started = Date.now();
    await kit.type(row("While saving"), "30");
    assert.equal(kit.updates.length, since, "nothing was sent");
    assert.ok(Date.now() - started < 1000, "the helper didn't wait for a save that never comes");
});
