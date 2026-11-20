// World 6 › Summoning › Automation (#92) on the fake game: one section per essence colour with what it owns, what it is
// doing while the automation runs, its saving % and its upgrades (High / Low / Balanced, a stop-at, a switch). A
// change saves cheatConfig.automation.summoning (a plain list) or that colour's place in summoningSaving; switching an
// upgrade on switches Summoning on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, selected, status, until } = kit;
const tab = (await importRepo("src/ui/pages/world-6/summoning/4-automation.js")).default.component();
const sections = () => byClass(tab, "account-section");
const section = (colour) =>
    sections().find((node) => text(byClass(node, "account-section__title")[0]) === `${colour} ESSENCE`);
const pick = (name) => kit.row(tab, name);
const statusOf = (colour) => text(byClass(section(colour), "automation-colour-status")[0]);
const savingRow = (colour) => byClass(section(colour), "automation-setting")[0];
await until(() => pick("Familiar"), "the tab to load");

test("one section per essence colour, each with what it owns, its saving % and its upgrades", () => {
    assert.deepEqual(
        sections()
            .map((node) => text(byClass(node, "account-section__title")[0]))
            .slice(1),
        ["WHITE", "GREEN", "YELLOW", "BLUE", "PURPLE", "RED", "CYAN", "TEAL"].map((colour) => `${colour} ESSENCE`)
    );
    assert.equal(status(tab, "Summoning"), "Off");
    assert.match(text(section("WHITE")), /4\.2M owned/);
    assert.equal(statusOf("WHITE"), "", "switched off, a colour says what it owns only");
    assert.equal(String(kit.field(savingRow("WHITE")).attributes.value), "10");
    const familiar = text(pick("Familiar"));
    assert.match(familiar, /\+15% Royal Pebble bonus/);
    assert.match(familiar, /Familiars: 6 Slime, 3 Vrumbi, 1 Bloomy/);
    assert.match(familiar, /LV 15 \/ 50/);
    assert.match(familiar, /Next level 165 white essence/, "a cost under 1000 rounds up, as the board shows it");
    assert.ok(byClass(tab, "automation-pick").some((node) => /Unlocks once .+ has a level/.test(text(node))));
});

test("switching an upgrade on saves it, and turns Summoning on now and at start", async () => {
    await kit.flip(pick("Familiar"), true);
    assert.deepEqual(sent("summoning"), [{ id: "2", on: true }]);
    assert.equal(kit.running("automation summoning"), true);
    assert.deepEqual(kit.fake.startup, ["automation summoning"]);
    await until(
        () => statusOf("WHITE") === "Buying cheapest first",
        () => statusOf("WHITE")
    );
});

test("a priority saves with the upgrade, and the colour's line reads the game's new goal", async () => {
    await kit.choose(pick("Familiar"), "priority", 1); // Low
    assert.deepEqual(sent("summoning"), [{ id: "2", on: true, priority: 2 }]);
    assert.equal(selected(pick("Familiar")), "Low");
    await until(
        () => /^Saving for Familiar \(/.test(statusOf("WHITE")),
        () => statusOf("WHITE")
    );
    assert.equal(statusOf("GREEN"), "Nothing switched on", "another colour's goal is its own");
    await kit.choose(pick("Familiar"), "priority", 2); // Balanced
    assert.deepEqual(sent("summoning"), [{ id: "2", on: true }]);
    await until(
        () => statusOf("WHITE") === "Buying cheapest first",
        () => statusOf("WHITE")
    );
});

test("a colour's saving % saves its own place in the list and refuses what isn't 0 to 100", async () => {
    await kit.type(savingRow("GREEN"), "30");
    assert.deepEqual(sent("summoningSaving"), [10, 30, 10, 10, 10, 10, 10, 10]);
    const before = kit.updates.length;
    await kit.type(savingRow("WHITE"), "101");
    assert.equal(kit.updates.length, before);
    assert.match(text(savingRow("WHITE")), /0 to 100/);
});

test("a priority the game refuses goes back to what the game holds, and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.choose(pick("Familiar"), "priority", 0);
    assert.equal(selected(pick("Familiar")), "Balanced");
    assert.match(text(pick("Familiar")), /the game is busy/);
});

test("Enable all switches every upgrade on in one save; Disable all asks Click again first", async () => {
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("summoning").filter(({ on }) => on).length, byClass(tab, "automation-pick").length);
    await kit.clickTwice(tab, "Disable all");
    assert.ok(sent("summoning").every(({ on }) => !on));
});
