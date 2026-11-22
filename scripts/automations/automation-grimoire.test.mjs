// Automation (#92): "automation grimoire" buys the switched-on Grimoire upgrades (the Death Bringer masterclass) with
// bones every second, the way the Grimoire menu's click does: each bone type saves and buys on its own, cheapest
// first with High / Low / Balanced and the saving % (decided with Lumi on 2026-11-10), up to each stop-at and max
// level, only unlocked upgrades, only what the bones pay for, and only while a character is in its map.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const HIGH = 1;
const LOW = 2;
const FEMUR = 330;
const RIBCAGE = 331;

// [name, base cost, growth, bone, max level, _, total levels that unlock it]; the cost grows with the row's level.
const ROWS = [
    ["Wraith_Damage_製_(Tap_for_more_info)", 10, 1, 0, 999999, 1, 0],
    ["Ribbon_Shelf", 15, 1, 0, 2, 1, 0],
    ["Wraith_Accuracy", 20, 1, 1, 999999, 1, 0],
    ["Pure_Opals", 30, 1, 0, 999999, 1, 5],
    ["Ripped_Page", 1, 1, 0, 1, 1, 0],
].map((row) => row.map(String));
let unlocked = 3; // GrimoireUpgUNLOCKED: rows below it are open (the last two need more total levels)
const calls = [];

const setGrimoireGame = () => {
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    Object.assign(gga.CustomLists.h, {
        GrimoireUpg: ROWS,
        MapName: Object.assign(Array(10).fill("Other"), { 3: "Town" }),
    });
    gga.CurrentMap = 3;
    gga.Grimoire = [0, 0, 0, 0, 0];
    gga.OptionsListAccount = Object.assign(Array(500).fill(0), { [FEMUR]: 100, [RIBCAGE]: 100, 480: 7 });
    gga.DNSM = { h: { GrimoireTotLV: 7 } };
    unlocked = 3;
    calls.length = 0;
    context["scripts.ActorEvents_579"]._customBlock_Summoning = (kind, i) => {
        calls.push(kind);
        if (kind === "GrimoireUpgUNLOCKED") return unlocked;
        if (kind === "GrimoireUpgCost") return Number(ROWS[i][1]) * (gga.Grimoire[i] + 1);
        return 0;
    };
};
const setGrimoire = (items, saving = 10) =>
    state.updateCheatConfig({ automation: { grimoire: items, grimoireSaving: saving } });
const grimoire = () => getAutomations().find(({ id }) => id === "classes.automation.grimoire");
const run = async (items, saving) => {
    setGrimoire(items, saving);
    await cheat("automation grimoire", true);
    mock.timers.tick(1000);
    await cheat("automation grimoire", false);
};

test("the Grimoire tab reads the bones, what each saves for, and every upgrade but the placeholders", () => {
    setGrimoireGame();
    setGrimoire([
        { id: 1, on: true, priority: LOW },
        { id: 2, on: true },
    ]);
    const { bones, upgrades } = readComputed("automation", "grimoire").value;
    assert.deepEqual(bones, [
        { name: "femur", owned: 100, goal: { id: 1, cost: 15 } },
        { name: "ribcage", owned: 100, goal: null },
        { name: "cranium", owned: 0, goal: null },
        { name: "bovinae", owned: 0, goal: null },
    ]);
    assert.deepEqual(
        upgrades.map(({ id, bone, max, cost, unlockAt, unlocked }) => [id, bone, max, cost, unlockAt, unlocked]),
        [
            [0, "femur", null, 10, 0, true],
            [1, "femur", 2, 15, 0, true],
            [2, "ribcage", null, 20, 0, true],
            [3, "femur", null, 30, 5, false],
        ],
        "no Ripped_Page; 999999 is no max"
    );
});

test("it buys switched-on upgrades cheapest first with their own bone, as the menu click does", async () => {
    setGrimoireGame();
    setGrimoire([
        { id: 0, on: true },
        { id: 1, on: true },
        { id: 2, on: true },
    ]);
    await cheat("automation grimoire", true);
    assert.equal(grimoire().on, true);
    assert.equal(grimoire().label, "Grimoire");
    mock.timers.tick(1000);
    // Femur 100: 10 (row 0), 15 (row 1), 20 (row 0), 30 (row 0; a tie goes to the first row) = 75, then 40 and 30 are
    // more than the 25 left. Ribcage 100: row 2 at 20 and 40 = 60, then its 60 is more than the 40 left.
    assert.deepEqual(gga.Grimoire, [3, 1, 2, 0, 0]);
    assert.equal(gga.OptionsListAccount[FEMUR], 25);
    assert.equal(gga.OptionsListAccount[RIBCAGE], 40);
    assert.equal(gga.OptionsListAccount[480], 7 + 6, "the masterclass level counter counts each level");
    assert.equal("GrimoireTotLV" in gga.DNSM.h, false, "the cached total level is dropped");
    assert.equal(grimoire().status, "Buying 3 upgrades; 6 levels bought since it started");

    // Nothing more is affordable: the next tick buys nothing.
    mock.timers.tick(1000);
    assert.deepEqual(gga.Grimoire, [3, 1, 2, 0, 0]);
    await cheat("automation grimoire", false);
});

test("a stop-at with a fraction (typed into the config file) stops below it", async () => {
    setGrimoireGame();
    gga.OptionsListAccount[FEMUR] = 1e9;
    gga.OptionsListAccount[RIBCAGE] = 1e9;
    await run([{ id: 0, on: true, stopAt: 2.5 }]);
    assert.equal(gga.Grimoire[0], 2, "level 3 would pass 2.5");
});

test("it stops at the stop-at and the max level, and never buys locked, switched-off or placeholder rows", async () => {
    setGrimoireGame();
    gga.OptionsListAccount[FEMUR] = 1e9;
    gga.OptionsListAccount[RIBCAGE] = 1e9;
    await run([
        { id: 0, on: true, stopAt: 3 },
        { id: 1, on: true, priority: LOW },
        { id: 2, on: false, stopAt: 9 },
        { id: 3, on: true, priority: LOW },
        { id: 4, on: true },
    ]);
    assert.deepEqual(gga.Grimoire, [3, 2, 0, 0, 0]);
    // A maxed or locked upgrade is nothing to save for.
    assert.equal(readComputed("automation", "grimoire").value.bones[0].goal, null);

    // A stop-at already reached buys nothing more, an unlock opens the row, and a placeholder never buys.
    unlocked = 5;
    await run([
        { id: 0, on: true, stopAt: 3 },
        { id: 3, on: true, stopAt: 1 },
        { id: 4, on: true },
    ]);
    assert.deepEqual(gga.Grimoire, [3, 2, 0, 1, 0]);
});

test("it pays exactly what the game charges and leaves at least 0.1 bones, like the menu", async () => {
    setGrimoireGame();
    gga.OptionsListAccount[FEMUR] = 10;
    await run([{ id: 0, on: true }]);
    assert.deepEqual(gga.Grimoire, [1, 0, 0, 0, 0]);
    assert.equal(gga.OptionsListAccount[FEMUR], 0.1);

    // 9.99 bones don't reach a 10-bone level.
    setGrimoireGame();
    gga.OptionsListAccount[FEMUR] = 9.99;
    await run([{ id: 0, on: true }]);
    assert.deepEqual(gga.Grimoire, [0, 0, 0, 0, 0]);
    assert.equal(gga.OptionsListAccount[FEMUR], 9.99);
});

test("a bone type saves for its cheapest High or Low upgrade; Balanced ones may spend up to saving % of it", async () => {
    setGrimoireGame();
    gga.OptionsListAccount[FEMUR] = 25;
    // Row 3 (30, Low) is the goal; Balanced row 0 (10) is over 10% of 30, so it waits.
    unlocked = 4;
    await run([
        { id: 0, on: true },
        { id: 3, on: true, priority: LOW },
    ]);
    assert.deepEqual(gga.Grimoire, [0, 0, 0, 0, 0]);
    assert.equal(gga.OptionsListAccount[FEMUR], 25);

    // At 50% Balanced may spend up to 15: row 0 buys once (10), then its 20 waits.
    await run(
        [
            { id: 0, on: true },
            { id: 3, on: true, priority: LOW },
        ],
        50
    );
    assert.deepEqual(gga.Grimoire, [1, 0, 0, 0, 0]);
    assert.equal(gga.OptionsListAccount[FEMUR], 15);

    // An affordable High upgrade goes before a cheaper Balanced one; ribcage's goal doesn't hold femur back.
    setGrimoireGame();
    gga.OptionsListAccount[FEMUR] = 15;
    gga.OptionsListAccount[RIBCAGE] = 0;
    await run([
        { id: 0, on: true },
        { id: 1, on: true, priority: HIGH },
        { id: 2, on: true, priority: LOW },
    ]);
    assert.deepEqual(gga.Grimoire, [0, 1, 0, 0, 0]);
});

test("it waits outside a character's map and says why, and says when nothing is switched on", async () => {
    setGrimoireGame();
    setGrimoire([{ id: 0, on: false, stopAt: 4 }]);
    await cheat("automation grimoire", true);
    assert.equal(grimoire().status, "No upgrade is switched on");

    context["com.stencyl.Engine"].engine.scene = { name: "CharSelect" };
    setGrimoire([{ id: 0, on: true }]);
    mock.timers.tick(1000);
    assert.deepEqual(gga.Grimoire, [0, 0, 0, 0, 0]);
    assert.equal(grimoire().status, "Waiting for a character to be in game");

    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    mock.timers.tick(1000);
    assert.equal(gga.Grimoire[0] > 0, true);
    assert.match(grimoire().status, /^Buying 1 upgrade; \d+ levels bought since it started$/);
    await cheat("automation grimoire", false);
});
