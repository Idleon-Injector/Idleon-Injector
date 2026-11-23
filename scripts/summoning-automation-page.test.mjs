// World 6 › Summoning › Automation (#92) on the fake game: one group per essence colour with what it owns and what it is
// doing while the automation runs (beside its name), its saving % and its upgrades (level, next cost, a stop-at, "Save
// for it", a switch). A
// change saves cheatConfig.automation.summoning (a plain list) or that colour's place in summoningSaving; switching an
// upgrade on switches Summoning on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, status, until } = kit;
const tab = (await importRepo("src/ui/pages/automation/summoning/summoning.js")).default.component();
const sections = () => byClass(tab, "account-section");
const section = (colour) =>
    sections().find((node) => text(byClass(node, "account-section__title")[0]) === `${colour} essence`);
const pick = (name) => kit.row(tab, name);
// The group's line beside its name: "4.2M owned", then what it is doing while the automation runs.
const statusOf = (colour) =>
    text(byClass(section(colour), "automation-group__meta")[0])
        .split(" · ")
        .slice(1)
        .join(" · ");
// A read-only value of a row, by its column ("Level", "Next level").
const value = (node, column) =>
    text(
        byClass(node, "value-cell")
            .find((cell) => text(byClass(cell, "value-cell__label")[0]) === column)
            ?.childNodes.at(-1)
    );
const saved = (name) => kit.saveSwitch(pick(name)).attributes.checked;
const savingRow = (colour) => byClass(section(colour), "automation-setting")[0];
await until(() => pick("Familiar"), "the tab to load");

test("one section per essence colour, each with what it owns, its saving % and its upgrades", () => {
    assert.deepEqual(
        sections()
            .map((node) => text(byClass(node, "account-section__title")[0]))
            .slice(1),
        ["White", "Green", "Yellow", "Blue", "Purple", "Red", "Cyan", "Teal"].map((colour) => `${colour} essence`)
    );
    assert.equal(status(tab, "Summoning"), "Off");
    assert.match(text(section("White")), /4\.2M owned/);
    assert.equal(statusOf("White"), "", "switched off, a colour says what it owns only");
    assert.equal(String(kit.field(savingRow("White")).attributes.value), "10");
    const familiar = text(pick("Familiar"));
    assert.match(familiar, /\+15% Royal Pebble bonus/);
    assert.match(familiar, /Familiars: 6 Slime, 3 Vrumbi, 1 Bloomy/);
    assert.equal(value(pick("Familiar"), "Level"), "15 / 50");
    assert.equal(value(pick("Familiar"), "Next level"), "165", "a cost under 1000 rounds up, as the board shows it");
    assert.ok(byClass(tab, "automation-pick").some((node) => /Unlocks once .+ has a level/.test(text(node))));
});

test("switching an upgrade on saves it, and turns Summoning on now and at start", async () => {
    await kit.flip(pick("Familiar"), true);
    assert.deepEqual(sent("summoning"), [{ id: "2", on: true }]);
    assert.equal(kit.running("automation summoning"), true);
    assert.deepEqual(kit.fake.startup, ["automation summoning"]);
    await until(
        () => statusOf("White") === "Buying cheapest first",
        () => statusOf("White")
    );
});

test("Save for it saves with the upgrade, and the colour's line reads the game's new goal", async () => {
    await kit.flipSave(pick("Familiar"), true);
    assert.deepEqual(sent("summoning"), [{ id: "2", on: true, save: true }]);
    assert.equal(saved("Familiar"), true);
    await until(
        () => /^Saving for Familiar \(/.test(statusOf("White")),
        () => statusOf("White")
    );
    assert.equal(statusOf("Green"), "Nothing switched on", "another colour's goal is its own");
    await kit.flipSave(pick("Familiar"), false);
    assert.deepEqual(sent("summoning"), [{ id: "2", on: true }]);
    await until(
        () => statusOf("White") === "Buying cheapest first",
        () => statusOf("White")
    );
});

test("a colour's saving % saves its own place in the list and refuses what isn't 0 to 100", async () => {
    await kit.type(savingRow("Green"), "30");
    assert.deepEqual(sent("summoningSaving"), [10, 30, 10, 10, 10, 10, 10, 10]);
    const before = kit.updates.length;
    await kit.type(savingRow("White"), "101");
    assert.equal(kit.updates.length, before);
    assert.match(text(savingRow("White")), /0 to 100/);
});

test("a Save for it the game refuses goes back to what the game holds, and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flipSave(pick("Familiar"), true);
    assert.equal(saved("Familiar"), false);
    assert.match(text(pick("Familiar")), /the game is busy/);
});

test("Enable all switches every upgrade on in one save; Disable all asks in the tray first", async () => {
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("summoning").filter(({ on }) => on).length, byClass(tab, "automation-pick").length);
    await kit.askAndConfirm(tab, "Disable all", `Disable ${sent("summoning").length} summoning upgrades?`);
    assert.ok(sent("summoning").every(({ on }) => !on));
});
