// Automation (#92), World 6 › Sneaking: "automation sneaking" buys the switched-on Ninja Knowledge upgrades with jade
// coins every second by the shared rule (High / Low / Balanced, saving %), each up to its stop-at, only once
// unlocked, only while a character is in its map, and only what the jade pays for at the game's own price.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const HIGH = 1;
const LOW = 2;
const ROWS = 32;
// Base cost and parent per row; the rest cost 1e6 and have row 13 as parent. Rows 17+ unlock with the reef level.
const BASE = { 13: 50, 14: 80, 12: 350, 8: 1250, 15: 3650, 16: 25000 };
const PARENT = { 14: 13, 12: 13, 15: 14, 8: 14, 16: 15, 0: 0, 9: 9 };

const setGame = ({ jade = 1000, levels = {}, reef = 0 } = {}) => {
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    Object.assign(gga.CustomLists.h, {
        // [lineX, lineY, lineW, lineH, name, bonus per level, description, base cost, cost scale, parent, nodeX, nodeY]
        NinjaUpg: Array.from({ length: ROWS }, (_, i) => [
            "0",
            "0",
            "0",
            "0",
            i === 9 ? "Name" : `Upgrade_${i}`,
            "2",
            "+{%_stealth_and_}x_damage#",
            String(BASE[i] ?? 1e6),
            "2",
            String(PARENT[i] ?? 13),
            "0",
            "0",
        ]),
        MapName: Object.assign(Array(10).fill("Other"), { 3: "Town" }),
    });
    const ninja = Array.from({ length: 110 }, () => []);
    ninja[102] = [0, jade, 0, 0, 0, 0, 0, 0, 0, ""];
    ninja[103] = Array.from({ length: ROWS }, (_, i) => levels[i] ?? 0);
    Object.assign(gga, {
        CurrentMap: 3,
        Ninja: ninja,
        Spelunk: Object.assign(
            Array.from({ length: 20 }, () => []),
            { 13: [0, 0, 0, reef] }
        ),
        Menagerie: Object.assign(
            Array.from({ length: 10 }, () => []),
            { 7: Array(17).fill(1) }
        ),
        DNSM: { h: { CalcTalentMAP: { h: {} } } },
        QuestComplete: { h: { Lafu_Shi3: 0 } },
        QuestStatus: { h: { Lafu_Shi3: [0, 0] } },
    });
    // The game's price: base * scale^level (the real block adds discounts; the injector's "ninja" cheat hooks it).
    context["scripts.ActorEvents_579"]._customBlock_Ninja = (kind, i) => {
        if (kind === "JadeUpgCost") return Number(gga.CustomLists.h.NinjaUpg[i][7]) * 2 ** gga.Ninja[103][i];
        if (kind === "NLbonuses") return 7 * gga.Ninja[103][i];
        return 0;
    };
    context["scripts.ActorEvents_124"]._customBlock_NotateNumber = (n, kind) =>
        kind === "Big" ? String(Math.round(n)) : n.toFixed(2);
};
const setItems = (items, saving = 10) => state.updateCheatConfig({ automation: { sneaking: { saving, items } } });
const sneaking = () => getAutomations().find(({ id }) => id === "w6.automation.sneaking");
const levels = () => gga.Ninja[103];
const jade = () => gga.Ninja[102][1];
const tick = () => mock.timers.tick(1000);
const turnOn = async () => {
    if (!sneaking().on) assert.equal((await cheat("automation sneaking")).ok, true);
};
const turnOff = async () => {
    if (sneaking().on) await cheat("automation sneaking");
};

test("the Sneaking tab reads jade, every upgrade but the placeholder, its bonus text, lock and goal", () => {
    setGame({ jade: 500, levels: { 13: 3, 14: 0 } });
    setItems([
        { id: "14", on: true, priority: LOW },
        { id: "12", on: true },
    ]);
    const { value } = readComputed("automation", "sneaking");
    assert.equal(value.jade, 500);
    assert.equal(value.upgrades.length, ROWS - 1);
    assert.equal(
        value.upgrades.find(({ id }) => id === 9),
        undefined,
        "row 9 is a placeholder"
    );
    const stealth = value.upgrades.find(({ id }) => id === 13);
    // (3 levels + 1 omni level) * 2 per level = 8: "{" is the bonus, "}" the multiplier, "#" dropped.
    assert.deepEqual(stealth, {
        id: 13,
        name: "Upgrade_13",
        bonus: "+8%_stealth_and_1.08x_damage",
        level: 3,
        cost: 400,
        unlocked: true,
        unlockAt: { parent: null },
    });
    assert.deepEqual(value.upgrades.find(({ id }) => id === 15).unlockAt, { parent: "Upgrade_14" });
    assert.equal(value.upgrades.find(({ id }) => id === 15).unlocked, false, "its parent has no level");
    assert.deepEqual(value.upgrades.find(({ id }) => id === 0).unlockAt, { parent: null }, "unpatched by mastery");
    assert.deepEqual(value.upgrades.find(({ id }) => id === 20).unlockAt, { reef: 4 });
    assert.equal(value.upgrades.find(({ id }) => id === 31).bonus.includes("1.00x"), true, "no omni levels on 17+");
    assert.deepEqual(value.goal, { id: 14, cost: 80 }, "it saves for the cheapest High or Low upgrade");
});

test("it buys the cheapest switched-on upgrade first, re-pricing after each level, until the jade runs out", async () => {
    setGame({ jade: 500, levels: { 13: 1 } });
    setItems([
        { id: "13", on: true },
        { id: "14", on: true },
        { id: "12", on: false },
    ]);
    await turnOn();
    tick();
    // 13 costs 100 (50*2), 14 costs 80: 14 (80), 13 (100), 14 (160), then 13 costs 200 > 160 left.
    assert.equal(levels()[14], 2);
    assert.equal(levels()[13], 2);
    assert.equal(levels()[12], 0, "switched off");
    assert.equal(jade(), 160, "each level paid at the game's price, never below zero");
    assert.equal(gga.DNSM.h.CalcTalentMAP.h[430], 3, "talent 430 counts every level");
    assert.equal(sneaking().status, "Buying cheapest first; 3 levels bought since it started");
    tick();
    assert.equal(jade(), 160, "nothing affordable: nothing bought");
    await turnOff();
});

test("a stop-at caps the level, and a reached one buys nothing", async () => {
    setGame({ jade: 1e6, levels: { 13: 1 } });
    setItems([
        { id: "13", on: true, stopAt: 4 },
        { id: "14", on: true, stopAt: 0 },
    ]);
    await turnOn();
    tick();
    assert.equal(levels()[13], 4);
    assert.equal(levels()[14], 0);
    assert.equal(jade(), 1e6 - 100 - 200 - 400);
    await turnOff();
});

test("locked upgrades wait for their parent, and the later rows for the Coral Reef level", async () => {
    setGame({ jade: 1e7, reef: 1 });
    setItems([
        { id: "13", on: true, stopAt: 1 },
        { id: "15", on: true, stopAt: 1 },
        { id: "14", on: true, stopAt: 1 },
        { id: "17", on: true, stopAt: 1 },
        { id: "18", on: true, stopAt: 1 },
        { id: "9", on: true, stopAt: 1 },
    ]);
    await turnOn();
    tick();
    // Way of Stealth (13) needs no parent and unlocks 14, which unlocks 15, all within one tick; reef 1 opens row 17
    // only; the placeholder never buys.
    assert.deepEqual(
        [13, 14, 15, 17, 18, 9].map((i) => levels()[i]),
        [1, 1, 1, 1, 0, 0]
    );
    assert.deepEqual(gga.QuestStatus.h.Lafu_Shi3, [0, 1], "row 14 marks the quest step the click marks");
    await turnOff();
});

test("Star Sweeping refreshes the daily revives as the click does", async () => {
    setGame({ jade: 1e6, levels: { 13: 1, 14: 1, 15: 1 } });
    setItems([{ id: "16", on: true, stopAt: 2 }]);
    await turnOn();
    tick();
    assert.equal(levels()[16], 2);
    assert.equal(gga.Ninja[102][8], 14);
    await turnOff();
});

test("High goes first when affordable; while saving for a Low goal Balanced buys only up to saving %", async () => {
    // 16 costs 25000 (Low goal), 13 costs 100, 12 costs 350, 15 costs 3650 (High).
    setGame({ jade: 4200, levels: { 13: 1, 14: 1, 15: 0 } });
    setItems(
        [
            { id: "16", on: true, priority: LOW },
            { id: "15", on: true, priority: HIGH, stopAt: 1 },
            { id: "13", on: true, stopAt: 2 },
            { id: "12", on: true, stopAt: 1 },
        ],
        1
    );
    await turnOn();
    tick();
    // High 15 first (3650 of 4200), which unlocks 16; the goal is then the Low 16 at 25000. Balanced may spend 1% of
    // it, 250: 13 (100) buys, and 12 (350) waits although the 450 left would pay for it.
    assert.equal(levels()[15], 1);
    assert.equal(levels()[13], 2);
    assert.equal(levels()[12], 0, "350 is over 1% of the 25000 goal");
    assert.equal(jade(), 4200 - 3650 - 100);
    assert.equal(sneaking().status, "Saving for Upgrade 16 (25000 jade); 2 levels bought since it started");
    gga.Ninja[102][1] = 25000;
    tick();
    assert.equal(levels()[16], 1, "the goal buys once affordable");
    await turnOff();
});

test("it waits while no character is in game, and says when nothing is switched on", async () => {
    setGame({ jade: 1000, levels: { 13: 1 } });
    setItems([{ id: "13", on: true }]);
    context["com.stencyl.Engine"].engine.scene = { name: "Title" };
    await turnOn();
    tick();
    assert.equal(levels()[13], 1);
    assert.equal(jade(), 1000);
    assert.equal(sneaking().status, "Waiting for a character to be in game");
    setItems([{ id: "13", on: false }]);
    assert.equal(sneaking().status, "No Ninja Knowledge upgrade is switched on");
    await turnOff();
});

test("the switch of the automation itself stops buying", async () => {
    setGame({ jade: 1000, levels: { 13: 1 } });
    setItems([{ id: "13", on: true }]);
    await turnOff();
    tick();
    assert.equal(jade(), 1000);
});
