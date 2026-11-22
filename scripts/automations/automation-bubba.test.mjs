// Automation (#92): "automation bubba" buys switched-on Bubba upgrades (W7) with meat through Bubba's own buy event,
// by the shared rule (High / Low / Balanced, saving %), each up to its stop-at and the upgrade's max level. It waits
// while Bubba is locked, while the run's gift isn't picked, and outside a character's map (decided with Lumi,
// 2026-11-11; ported to 3.0 on 2026-11-20).
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const HIGH = 1;
const LOW = 2;
// Five upgrades: [name, ..., max level (999 is none)].
const UPGRADES = [
    ["Meat_Slicer", 0, 0, 0, 999],
    ["Big_Grill", 0, 0, 0, 999],
    ["Spice_Rack", 0, 0, 0, 3],
    ["Smoker", 0, 0, 0, 999],
    ["Megaflesh", 0, 0, 0, 999],
];
const game = { costs: [], needs: [], unlocked: 1, gift: 0, totals: 0 };
const removed = [];

const setBubbaGame = () => {
    context["com.stencyl.Engine"].engine.scene = { name: "Spire" };
    Object.assign(gga.CustomLists.h, {
        BubbaUpg: UPGRADES,
        MapName: Object.assign(Array(400).fill("Other"), { 300: "Spire" }),
    });
    gga.CurrentMap = 300;
    gga.MenuType2 = 0;
    // [0][0] meat, [0][4] meat made this run; [1] levels.
    gga.Bubba = [
        [1000, 0, 0, 0, 5000],
        [0, 0, 0, 0, 0],
    ];
    // Each level costs 10 × (upgrade + 1) × (level + 1); Megaflesh unlocks at 1e6 meat made.
    game.costs = (i) => 10 * (i + 1) * (gga.Bubba[1][i] + 1);
    game.needs = [0, 0, 0, 0, 1e6];
    game.unlocked = 1;
    game.gift = 0;
    game.totals = 0;
    context["scripts.ActorEvents_579"]._customBlock_Bubbastuff = (name, i) => {
        if (name === "UpgCost") return game.costs(i);
        if (name === "MeatProdREQ") return game.needs[i];
        if (name === "BubbaUnlocked") return game.unlocked;
        if (name === "DoWeNeedToSelectGift") return game.gift;
        if (name === "TotalQTYofLVs") return ++game.totals;
        return 0;
    };
    // Bubba's menu behavior. Like the game, its "Z<i>" event pays and levels without checking the meat (the menu does),
    // and draws dice and smoked-meat art.
    const ui = {
        _TRIGGEREDtext: "",
        _UIinventory16: Array.from({ length: 96 }, (_, slot) => (slot === 86 ? ["die0", "die1"] : `art${slot}`)),
        _UIinventory16On: Array(96).fill(0),
        _customEvent_Bubbathings() {
            const i = Number(this._TRIGGEREDtext.slice(1));
            gga.Bubba[0][0] -= game.costs(i);
            gga.Bubba[1][i] += 1;
            this._UIinventory16On[86] = [1, 0];
            this._UIinventory16On[95] = 1;
        },
    };
    gga.PixelHelperActor[26] = { behaviors: { getBehavior: (name) => (name === "ActorEvents_713" ? ui : null) } };
    context["com.stencyl.behavior.Script"].removeImage = (image) => removed.push(image);
    removed.length = 0;
    return ui;
};
const setBubba = (items, saving = 10) => state.updateCheatConfig({ automation: { bubba: items, bubbaSaving: saving } });
const bubba = () => getAutomations().find(({ id }) => id === "w7.automation.bubba");
const levels = () => [...gga.Bubba[1]];

test("the Bubba tab reads meat, the goal and every upgrade with its level, max, cost and unlock", () => {
    setBubbaGame();
    setBubba([{ id: "3", on: true, priority: LOW }]);
    const read = readComputed("automation", "bubba").value;
    assert.equal(read.meat, 1000);
    assert.equal(read.waiting, null);
    assert.deepEqual(read.goal, { id: 3, cost: 40 });
    assert.deepEqual(read.upgrades[2], {
        id: 2,
        name: "Spice_Rack",
        level: 0,
        max: 3,
        cost: 30,
        unlockAt: 0,
        unlocked: true,
    });
    assert.equal(read.upgrades[0].max, null, "999 is no max");
    assert.equal(read.upgrades[4].unlocked, false, "Megaflesh needs 1e6 meat made");
});

test("a stop-at with a fraction (typed into the config file) stops below it", async () => {
    setBubbaGame();
    gga.Bubba[0][0] = 1e6;
    setBubba([{ id: "0", on: true, stopAt: 2.5 }]);
    await cheat("automation bubba");
    mock.timers.tick(1000);
    assert.equal(levels()[0], 2, "level 3 would pass 2.5");
    await cheat("automation bubba", false);
});

test("it buys switched-on upgrades cheapest first, each up to its stop-at and max, never past the meat", async () => {
    const ui = setBubbaGame();
    gga.Bubba[0][0] = 200;
    setBubba([
        { id: "0", on: true, stopAt: 3 },
        { id: "1", on: true },
        { id: "2", on: true },
        { id: "3", on: false },
        { id: "4", on: true },
    ]);
    assert.equal((await cheat("automation bubba")).ok, true);
    assert.equal(bubba().on, true);

    mock.timers.tick(1000);
    // Costs: 0 → 10, 20, 30 (stop-at 3); 1 → 20, 40, ...; 2 → 30, 60 (max 3). Cheapest first: 10, 20, 20, 30, 30 =
    // 110, then 40 (1's second) = 150, then 60 and 60 are over the 50 left; Megaflesh is locked, 3 is off.
    assert.deepEqual(levels(), [3, 2, 1, 0, 0]);
    assert.equal(gga.Bubba[0][0], 200 - 10 - 20 - 20 - 30 - 30 - 40);
    assert.ok(gga.Bubba[0][0] >= 0, "never spends meat it doesn't have");
    assert.equal(game.totals, 6, "the cached level total is refreshed after every buy");
    assert.equal(ui._TRIGGEREDtext, "Z1");
    assert.equal(bubba().status, "Buying cheapest first; 6 levels bought since it started");

    // A max level stops it even with meat to spare.
    gga.Bubba[0][0] = 1e6;
    setBubba([{ id: "2", on: true }]);
    mock.timers.tick(1000);
    assert.equal(levels()[2], 3);
    await cheat("automation bubba", false);
    assert.equal(bubba().on, false);
});

test("a buy Bubba's event refuses isn't counted as bought", async () => {
    const ui = setBubbaGame();
    gga.Bubba[0][0] = 15;
    // The event takes nothing and levels nothing (as when the meat moved since the price was read).
    ui._customEvent_Bubbathings = () => {};
    setBubba([{ id: "0", on: true }]);
    await cheat("automation bubba", true);
    mock.timers.tick(1000);
    assert.deepEqual(levels(), [0, 0, 0, 0, 0]);
    assert.equal(bubba().status, "Buying cheapest first");
    await cheat("automation bubba", false);
});

test("an affordable High upgrade goes first; while saving for a Low one, Balanced spends only up to saving %", async () => {
    setBubbaGame();
    gga.Bubba[0][0] = 45;
    // High: Smoker (40) beats the cheaper Balanced Meat Slicer (10).
    setBubba([
        { id: "0", on: true },
        { id: "3", on: true, priority: HIGH },
    ]);
    await cheat("automation bubba", true);
    mock.timers.tick(1000);
    assert.deepEqual(levels(), [0, 0, 0, 1, 0], "High first; the 5 left can't reach the 10");

    // Smoker is now Low at 80; with 70 meat and 10% saving, Balanced may spend only up to 8, so Meat Slicer (10) waits.
    gga.Bubba[0][0] = 70;
    const items = [
        { id: "0", on: true },
        { id: "3", on: true, priority: LOW },
    ];
    setBubba(items, 10);
    mock.timers.tick(1000);
    assert.deepEqual(levels(), [0, 0, 0, 1, 0], "70 saves for the 80 goal");
    assert.equal(bubba().status, "Saving for Smoker; 1 level bought since it started");

    // At 50% Balanced may spend up to 40 a level: Meat Slicer's 10, 20 and 30 buy, its 40 is over the 10 left.
    setBubba(items, 50);
    mock.timers.tick(1000);
    assert.deepEqual(levels(), [3, 0, 0, 1, 0]);
    assert.equal(gga.Bubba[0][0], 10);

    // The goal buys once affordable.
    gga.Bubba[0][0] = 80;
    mock.timers.tick(1000);
    assert.equal(levels()[3], 2);
    await cheat("automation bubba", false);
});

test("it waits while Bubba is locked, while the run's gift isn't picked, and outside a character's map", async () => {
    setBubbaGame();
    setBubba([{ id: "0", on: true }]);
    await cheat("automation bubba", true);

    game.gift = 1;
    mock.timers.tick(1000);
    assert.deepEqual(levels(), [0, 0, 0, 0, 0]);
    assert.equal(bubba().status, "Waiting for you to pick a gift");
    assert.equal(readComputed("automation", "bubba").value.waiting, "Waiting for you to pick a gift");
    assert.equal(readComputed("automation", "bubba").value.goal, null);

    game.gift = 0;
    game.unlocked = 0;
    mock.timers.tick(1000);
    assert.deepEqual(levels(), [0, 0, 0, 0, 0]);
    assert.equal(bubba().status, "Bubba isn't unlocked yet");

    game.unlocked = 1;
    context["com.stencyl.Engine"].engine.scene = { name: "" }; // character select
    mock.timers.tick(1000);
    assert.deepEqual(levels(), [0, 0, 0, 0, 0]);
    assert.equal(bubba().status, "Waiting for a character to be in game");

    context["com.stencyl.Engine"].engine.scene = { name: "Spire" };
    mock.timers.tick(1000);
    assert.ok(levels()[0] > 0, "buys again once it may");

    setBubba([{ id: "0", on: false, stopAt: 9 }]);
    assert.equal(bubba().status, "No upgrade is switched on");
    await cheat("automation bubba", false);
});

test("the art the buy event draws is removed with the menu closed and kept with it open", async () => {
    const ui = setBubbaGame();
    gga.Bubba[0][0] = 10;
    setBubba([{ id: "0", on: true }]);
    await cheat("automation bubba", true);
    mock.timers.tick(1000);
    assert.equal(levels()[0], 1);
    assert.deepEqual(removed, ["die0", "art95"]);
    assert.deepEqual(ui._UIinventory16On[86], [0, 0]);
    assert.equal(ui._UIinventory16On[95], 0);

    gga.MenuType2 = 94; // Bubba's menu is open: its art stays
    gga.Bubba[0][0] = 20;
    removed.length = 0;
    mock.timers.tick(1000);
    assert.equal(levels()[0], 2);
    assert.deepEqual(removed, []);
    assert.equal(ui._UIinventory16On[95], 1);
    await cheat("automation bubba", false);
});
