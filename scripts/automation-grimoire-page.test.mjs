// Classes › Grimoire › Automation (#92) on the fake game. One line per bone type (what it owns, and what it is doing
// while the automation runs), the saving %, and every upgrade with High / Low / Balanced, a stop-at and a switch. A
// change saves cheatConfig.automation.grimoire (a plain list) or grimoireSaving; switching an upgrade on switches the
// Grimoire automation on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, fileSent, selected, status, until } = kit;
const { readComputed } = await importRepo("src/ui/services/api.js");
const game = await readComputed("automation", "grimoire");
const page = (await importRepo("src/ui/pages/classes/grimoire/2-automation.js")).default.component();
const row = (name) => kit.row(page, name);
const pick = (id) =>
    row(
        game.upgrades
            .find((upgrade) => upgrade.id === id)
            .name.replace(/_/g, " ")
            .replace(/[{}]/g, "")
    );
const boneLine = (name) => text(byClass(row(name), "account-row__sub-label")[0]);
const detail = (node) => text(byClass(node, "automation-pick__detail")[0]);
await until(() => row("Femur") && byClass(page, "automation-pick").length, "the Grimoire automation tab to load");
const femurUpgrade = game.upgrades.find(
    ({ unlocked, level, max, bone }) => bone === "femur" && unlocked && level < max
);

test("the tab shows the switch, one line per bone type, the saving %, and every upgrade with its level", () => {
    assert.equal(status(page, "Grimoire"), "Off");
    assert.deepEqual(
        ["Femur", "Ribcage", "Cranium", "Bovinae"].map((name) => text(row(name))),
        ["Femur48.2K owned", "Ribcage9.1K owned", "Cranium650 owned", "Bovinae0 owned"],
        "switched off, a bone line says only what it owns"
    );
    assert.equal(byClass(page, "automation-pick").length, game.upgrades.length);
    assert.ok(row("Saving"));
    const open = pick(femurUpgrade.id);
    assert.match(detail(open), /^Next level [\d.,KMB]+ femur$/);
    const locked = game.upgrades.find(({ unlocked }) => !unlocked);
    assert.match(detail(pick(locked.id)), /^Unlocks at [\d.,K]+ total levels$/);
    const maxed = game.upgrades.find(({ level, max }) => max !== null && level >= max);
    assert.equal(detail(pick(maxed.id)), "Max level");
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
        assert.match(detail(pick(femurUpgrade.id)), /^Next level 100 femur$/);
        assert.equal(text(row("Femur")), "Femur149 owned");
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

test("a High choice saves, and the bone line reads what it now saves for from the game", async () => {
    await kit.choose(pick(femurUpgrade.id), "priority", 0);
    assert.equal(sent("grimoire")[0].priority, 1);
    assert.equal(selected(pick(femurUpgrade.id)), "High");
    await until(
        () => /^Saving for /.test(boneLine("Femur")),
        () => `the femur goal: ${boneLine("Femur")}`
    );
});

test("the saving % saves on Enter to its own key, and a value over 100 is refused at its field", async () => {
    await kit.type(row("Saving"), "40");
    assert.equal(sent("grimoireSaving"), 40);
    const before = kit.updates.length;
    await kit.type(row("Saving"), "101");
    assert.equal(kit.updates.length, before);
    assert.match(text(row("Saving")), /0 to 100/);
});

test("a refused save puts the game's choice back and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.choose(pick(femurUpgrade.id), "priority", 1);
    assert.equal(selected(pick(femurUpgrade.id)), "High");
    assert.match(text(pick(femurUpgrade.id)), /the game is busy/);
});

test("Enable all switches every upgrade on; Disable all asks Click again and keeps the priorities", async () => {
    await kit.button(page, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("grimoire").filter(({ on }) => on).length, game.upgrades.length);
    await kit.clickTwice(page, "Disable all");
    assert.ok(sent("grimoire").every(({ on }) => !on));
    assert.equal(sent("grimoire").find(({ id }) => id === String(femurUpgrade.id)).priority, 1);
});
