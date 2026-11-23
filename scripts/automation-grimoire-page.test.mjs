// Classes › Grimoire › Automation (#92) on the fake game. What each bone type owns beside the title, a line per bone
// type while the automation runs (what it is doing), the saving %, and every upgrade with its level, next cost, a
// stop-at, "Save for it" and a switch. A
// change saves cheatConfig.automation.grimoire (a plain list) or grimoireSaving; switching an upgrade on switches the
// Grimoire automation on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, fileSent, status, until } = kit;
const { readComputed } = await importRepo("src/ui/services/api.js");
const game = await readComputed("automation", "grimoire");
const page = (await importRepo("src/ui/pages/automation/grimoire/grimoire.js")).default.component();
const row = (name) => kit.row(page, name);
const pick = (id) =>
    row(
        game.upgrades
            .find((upgrade) => upgrade.id === id)
            .name.replace(/_/g, " ")
            .replace(/[{}]/g, "")
    );
const boneLine = (name) => text(byClass(row(name), "automation-row__status")[0]);
const detail = (node) => text(byClass(node, "automation-pick__detail")[0]);
// A read-only value of a row, by its column ("Level", "Next level").
const value = (node, column) =>
    text(
        byClass(node, "value-cell")
            .find((cell) => text(byClass(cell, "value-cell__label")[0]) === column)
            ?.childNodes.at(-1)
    );
const saved = (node) => kit.saveSwitch(node).attributes.checked;
await until(() => row("Femur") && byClass(page, "automation-pick").length, "the Grimoire automation tab to load");
const femurUpgrade = game.upgrades.find(
    ({ unlocked, level, max, bone }) => bone === "femur" && unlocked && level < max
);

test("the tab shows the switch, the bones beside the title, the saving %, and every upgrade with its level", () => {
    assert.equal(status(page, "Grimoire"), "Off");
    assert.match(text(page), /48\.2K femur · 9\.1K ribcage · 650 cranium · 0 bovinae/);
    assert.deepEqual(
        ["Femur", "Ribcage", "Cranium", "Bovinae"].map(boneLine),
        ["", "", "", ""],
        "switched off, the bone lines say nothing (and hide)"
    );
    assert.equal(byClass(page, "automation-pick").length, game.upgrades.length);
    assert.ok(row("While saving"));
    assert.match(value(pick(femurUpgrade.id), "Next level"), /^[\d.,KMB]+ femur$/);
    const locked = game.upgrades.find(({ unlocked }) => !unlocked);
    assert.match(detail(pick(locked.id)), /^Unlocks at [\d.,K]+ total levels$/);
    assert.equal(value(pick(locked.id), "Next level"), "Locked");
    const maxed = game.upgrades.find(({ level, max }) => max !== null && level >= max);
    assert.equal(value(pick(maxed.id), "Next level"), "Max");
});

test("small amounts show whole, like the game: a cost rounded up, the bones held rounded down", async () => {
    const block = kit.fixture.computed._customBlock_Summoning;
    const cost = block.GrimoireUpgCost;
    const femur = kit.gga.OptionsListAccount[330];
    block.GrimoireUpgCost = (i, ...rest) => (i === femurUpgrade.id ? 99.2 : cost(i, ...rest));
    kit.gga.OptionsListAccount[330] = 149.36;
    try {
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
        assert.equal(value(pick(femurUpgrade.id), "Next level"), "100 femur");
        assert.match(text(page), /149 femur/);
    } finally {
        block.GrimoireUpgCost = cost;
        kit.gga.OptionsListAccount[330] = femur;
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
    }
});

test("switching an upgrade on saves the list and turns the Grimoire automation on, now and at start", async () => {
    await kit.flip(pick(femurUpgrade.id), true);
    assert.deepEqual(sent("grimoire"), [{ id: String(femurUpgrade.id), on: true }]);
    assert.deepEqual(fileSent("grimoire"), sent("grimoire"));
    assert.equal(kit.running("automation grimoire"), true);
    assert.deepEqual(kit.fake.startup, ["automation grimoire"]);
    await until(
        () => boneLine("Femur") === "Buying cheapest first",
        () => `the femur line: ${boneLine("Femur")}`
    );
});

test("Save for it saves, and the bone line reads what it now saves for from the game", async () => {
    await kit.flipSave(pick(femurUpgrade.id), true);
    assert.equal(sent("grimoire")[0].save, true);
    assert.equal(saved(pick(femurUpgrade.id)), true);
    await until(
        () => /^Saving for /.test(boneLine("Femur")),
        () => `the femur goal: ${boneLine("Femur")}`
    );
});

test("the saving % saves on Enter to its own key, and a value over 100 is refused at its field", async () => {
    await kit.type(row("While saving"), "40");
    assert.equal(sent("grimoireSaving"), 40);
    const before = kit.updates.length;
    await kit.type(row("While saving"), "101");
    assert.equal(kit.updates.length, before);
    assert.match(text(row("While saving")), /0 to 100/);
});

test("a refused save puts the game's choice back and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flipSave(pick(femurUpgrade.id), false);
    assert.equal(saved(pick(femurUpgrade.id)), true);
    assert.match(text(pick(femurUpgrade.id)), /the game is busy/);
});

test("Enable all switches every upgrade on; Disable all asks in the tray and keeps Save for it", async () => {
    await kit.button(page, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("grimoire").filter(({ on }) => on).length, game.upgrades.length);
    await kit.askAndConfirm(page, "Disable all", `Disable ${game.upgrades.length} Grimoire upgrades?`);
    assert.ok(sent("grimoire").every(({ on }) => !on));
    assert.equal(sent("grimoire").find(({ id }) => id === String(femurUpgrade.id)).save, true);
});
