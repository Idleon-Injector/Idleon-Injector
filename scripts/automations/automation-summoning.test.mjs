// Automation (#92): "automation summoning" buys the switched-on W6 summoning board upgrades with essence, the way a
// click on the board does, each essence colour saving and buying on its own (High / Low / Balanced and saving %,
// decided with Lumi on 2026-11-10 and 2026-11-17), up to the stop-at and the max level, paused while the board is open.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadCommonJs, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const HIGH = 1;
const LOW = 2;
const WHITE = 0;
const GREEN = 1;

// SummonUPG rows as the game splits them: [x, y, colour, name, base cost, cost multi, bonus, 0, max, parent, doubler, text].
const row = (colour, name, base, max, parent, text = "+{%_bonus") => [
    0,
    0,
    colour,
    name,
    base,
    2,
    1,
    0,
    max,
    parent,
    0,
    text,
];
const filler = (i) => row(WHITE, `Filler_${i}`, 1, 9999, 70); // behind an upgrade that stays at 0
const rolls = []; // the next randomFloat() results; 0.99 once they run out (no luck)
let board;
const setBoard = () => {
    context["com.stencyl.Engine"].engine.scene = { name: "Spirit_Town" };
    const list = Array.from({ length: 82 }, (_, i) => filler(i));
    list[0] = row(WHITE, "Rooted_Soul", 10, 9999, -1, "+{%_damage_per_win@}_total");
    list[1] = row(WHITE, "Cheap_Seed", 1, 9999, 0);
    list[2] = row(WHITE, "Familiar", 100, 25, 0, "Summon_a_familiar,_resets_in_|");
    list[3] = row(WHITE, "Short_Road", 5, 2, 0);
    list[4] = row(WHITE, "Green_Summoning", 50, 1, 0);
    list[9] = row(GREEN, "Green_Thumb", 4, 9999, 4);
    list[10] = row(GREEN, "Green_Leaf", 3, 9999, 4);
    list[71] = row(7, "Muddah_Call", 1, 9999, 71);
    Object.assign(gga.CustomLists.h, {
        SummonUPG: list,
        MapName: Object.assign(Array(400).fill("Other"), { 330: "Spirit_Town" }),
    });
    Object.assign(gga, {
        CurrentMap: 330,
        MenuType2: 0,
        // levels, (unused), essence by colour, (shop timers), familiars by tier
        Summon: [Array(82).fill(0), [], [1000, 1000, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0], Array(8).fill(0)],
        QuestComplete: { h: { Lafu_Shi6: 0, Sussy_Gene3: 0 } },
        QuestStatus: { h: { Lafu_Shi6: [0], Sussy_Gene3: [0] } },
        DNSM: { h: { CalcTalentMAP: { h: {} } } },
        Lv0: Object.assign(Array(20).fill(0), { 18: 50 }),
        OptionsListAccount: Array(400).fill(0),
        TimeAway: { h: { ShopRestock: 100 } },
    });
    gga.Summon[0][0] = 1; // the root has a level, so its children show
    board = { _GenINFO: Array(200).fill(0) };
    gga.PixelHelperActor[24] = { behaviors: { getBehavior: (name) => (name === "ActorEvents_623" ? board : null) } };
    const bonus = { 39: 0, 6: 0 };
    const summon = context["scripts.ActorEvents_579"];
    summon._customBlock_Summoning = (kind, i) => {
        if (kind === "UpgCost") return gga.CustomLists.h.SummonUPG[i][4] * 2 ** gga.Summon[0][i];
        if (kind === "SummUpgBonus") return bonus[i] ?? gga.Summon[0][i];
        if (kind === "SummVictories") return 3;
        return 0;
    };
    summon._customBlock_Spelunk = () => 0;
    summon._customBlock_Thingies = () => 0; // no free familiars
    context["scripts.ActorEvents_345"]._customBlock_getbonus2 = () => 0; // no double familiars
    context["scripts.ActorEvents_189"]._customBlock_CommaNotation = (x) => String(x);
    context["scripts.ActorEvents_266"]._customBlock_timeDisp2 = (s) => `${s}s`;
    context["com.stencyl.behavior.Script"].randomFloat = () => rolls.shift() ?? 0.99;
    rolls.length = 0;
    return { bonus, summon };
};
const setPicks = (entries, saving = {}) =>
    state.updateCheatConfig({
        automation: {
            summoning: entries,
            summoningSaving: ["white", "green", "yellow", "blue", "purple", "red", "cyan", "teal"].map(
                (colour) => saving[colour] ?? 10
            ),
        },
    });
const automation = () => getAutomations().find(({ id }) => id === "w6.automation.summoning");
const levels = () => gga.Summon[0].slice(0, 11);
const second = () => mock.timers.tick(1000);

test("the tab reads each colour's essence and every upgrade, with its lock, bonus and max", () => {
    setBoard();
    gga.Summon[4][0] = 4;
    gga.Summon[4][2] = 1;
    setPicks([{ id: "1", on: true, priority: LOW }]);
    const { waiting, essences, upgrades } = readComputed("automation", "summoning").value;
    assert.equal(waiting, null);
    assert.equal(essences.length, 8);
    assert.deepEqual(essences[0], { name: "white", owned: 1000, goal: { id: 1, cost: 1 } });
    assert.deepEqual(essences[1], { name: "green", owned: 1000, goal: null });
    assert.deepEqual(upgrades[0], {
        id: 0,
        name: "Rooted_Soul",
        colour: 0,
        bonus: "+1%_damage_per_win3_total",
        note: null,
        level: 1,
        max: null,
        cost: 20,
        unlocked: true,
        lockedBy: { parent: null },
    });
    assert.equal(upgrades[2].note, "Familiars: 4 Slime, 1 Bloomy");
    assert.equal(upgrades[2].bonus, "Summon_a_familiar,_resets_in_100s");
    assert.equal(upgrades[2].max, 25);
    assert.deepEqual([upgrades[9].unlocked, upgrades[9].lockedBy], [false, { parent: "Green_Summoning" }]);
    assert.deepEqual([upgrades[71].unlocked, upgrades[71].lockedBy], [false, { lore: true }]);
});

test("each colour buys its switched-on upgrades cheapest first with its own essence, up to the stop-at", async () => {
    setBoard();
    gga.Summon[0][4] = 1; // green is open
    gga.Summon[2][GREEN] = 20;
    setPicks([
        { id: "1", on: true, stopAt: 3 },
        { id: "3", on: true },
        { id: "9", on: true },
        { id: "10", on: true },
    ]);
    assert.equal((await cheat("automation summoning")).ok, true);
    assert.equal(automation().on, true);
    second();
    // White: Cheap_Seed 1, 2, 4 (stop-at 3), Short_Road 5, 10 (max 2). Green: Leaf 3, Thumb 4, Leaf 6, then 7 left.
    assert.deepEqual(levels(), [1, 3, 0, 2, 1, 0, 0, 0, 0, 1, 2]);
    assert.equal(gga.Summon[2][WHITE], 1000 - 7 - 15);
    assert.equal(gga.Summon[2][GREEN], 20 - 3 - 4 - 6);
    assert.equal(automation().status, "Buying 4 upgrades; 8 levels bought since it started");

    // Nothing qualifies any more until essence arrives; no level passes its stop-at or max.
    second();
    assert.deepEqual(levels(), [1, 3, 0, 2, 1, 0, 0, 0, 0, 1, 2]);
    gga.Summon[2][GREEN] = 8;
    second();
    assert.deepEqual(levels().slice(9), [2, 2], "Thumb 8 buys, Leaf 12 waits");
    assert.equal(gga.Summon[2][GREEN], 0);
    await cheat("automation summoning", false);
});

test("the buy keeps the board's books: quest steps and the cached total level", async () => {
    setBoard();
    setPicks([{ id: "1", on: true, stopAt: 2 }]);
    gga.Summon[0][5] = 299;
    await cheat("automation summoning", true);
    second();
    assert.equal(gga.Summon[0][1], 2);
    assert.equal(gga.QuestStatus.h.Lafu_Shi6[0], 2, "one quest step per level");
    assert.equal(gga.DNSM.h.CalcTalentMAP.h[595], 302);
    assert.equal(board._GenINFO[170], 3);

    gga.QuestComplete.h.Lafu_Shi6 = 1;
    setPicks([{ id: "1", on: true, stopAt: 3 }]);
    second();
    assert.equal(gga.QuestStatus.h.Lafu_Shi6[0], 2, "a finished quest counts no more");
    await cheat("automation summoning", false);
});

test("an affordable High upgrade goes first; a Low goal makes Balanced ones save, per colour's saving %", async () => {
    setBoard();
    gga.Summon[2][WHITE] = 60;
    // Familiar (100) is the Low goal; at 10%, Balanced may only buy up to 10 meanwhile.
    setPicks([
        { id: "2", on: true, priority: LOW },
        { id: "1", on: true, stopAt: 4 },
        { id: "3", on: true },
    ]);
    await cheat("automation summoning", true);
    second();
    // Cheap_Seed 1, 2, 4, 8 (stop-at 4) and Short_Road 5; Short_Road's 10 is still within 10%.
    assert.deepEqual(levels().slice(0, 4), [1, 4, 0, 2]);
    assert.equal(gga.Summon[2][WHITE], 60 - 15 - 15);
    assert.deepEqual(readComputed("automation", "summoning").value.essences[0].goal, { id: 2, cost: 100 });

    // At 0% saving Balanced waits for the goal entirely.
    setBoard();
    gga.Summon[2][WHITE] = 60;
    setPicks(
        [
            { id: "2", on: true, priority: LOW },
            { id: "1", on: true },
        ],
        { white: 0 }
    );
    second();
    assert.equal(gga.Summon[0][1], 0);
    assert.equal(gga.Summon[2][WHITE], 60);

    // Another colour's saving % is its own: green at 100% spends while white saves.
    gga.Summon[0][4] = 1;
    gga.Summon[2][GREEN] = 3;
    setPicks(
        [
            { id: "9", on: true, priority: LOW },
            { id: "10", on: true },
            { id: "2", on: true, priority: LOW },
            { id: "1", on: true },
        ],
        { white: 0, green: 100 }
    );
    second();
    assert.deepEqual([gga.Summon[0][1], gga.Summon[0][10]], [0, 1]);

    // A High upgrade buys before a cheaper Balanced one once affordable.
    setBoard();
    gga.Summon[2][WHITE] = 6;
    setPicks(
        [
            { id: "3", on: true, priority: HIGH },
            { id: "1", on: true },
        ],
        { white: 0 }
    );
    second();
    assert.deepEqual([gga.Summon[0][3], gga.Summon[0][1]], [1, 0]);
    assert.equal(gga.Summon[2][WHITE], 1);
    await cheat("automation summoning", false);
});

test("it never buys what it can't afford, locked upgrades, or past the max", async () => {
    setBoard();
    gga.Summon[2][WHITE] = 4;
    gga.Summon[2][7] = 100;
    gga.Summon[0][3] = 2; // at its max of 2
    setPicks([
        { id: "4", on: true }, // 50, more than the 4 owned
        { id: "9", on: true }, // green: locked until Green_Summoning has a level
        { id: "71", on: true }, // teal: locked until Spelunking's lore flag
        { id: "3", on: true },
    ]);
    await cheat("automation summoning", true);
    second();
    assert.deepEqual(levels(), [1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(gga.Summon[0][71], 0);
    assert.equal(gga.Summon[2][WHITE], 4);

    // The lore flag opens Muddah's row.
    context["scripts.ActorEvents_579"]._customBlock_Spelunk = (kind, n) =>
        kind === "DoWeHaveLoreN1" && n === 4 ? 1 : 0;
    second();
    // 1 + 2 + 4 + 8 + 16 + 32 of the 100 teal essence; the next level's 64 waits.
    assert.equal(gga.Summon[0][71], 6);
    assert.equal(gga.Summon[2][7], 37);

    // A maxed upgrade, though cheapest (Short_Road's 20), doesn't hold up the 50 one; nothing passes a max of 1.
    gga.Summon[2][WHITE] = 160;
    second();
    assert.deepEqual([gga.Summon[0][3], gga.Summon[0][4]], [2, 1]);
    assert.equal(gga.Summon[2][WHITE], 110);
    await cheat("automation summoning", false);
});

test("it pauses while the board is open and outside a character's map", async () => {
    setBoard();
    setPicks([{ id: "1", on: true }]);
    await cheat("automation summoning", true);

    gga.MenuType2 = 60;
    second();
    assert.equal(gga.Summon[0][1], 0);
    assert.equal(automation().status, "Paused while the summoning board is open");
    assert.equal(readComputed("automation", "summoning").value.waiting, "Paused while the summoning board is open");
    assert.equal(readComputed("automation", "summoning").value.essences[0].goal, null);

    gga.MenuType2 = 0;
    context["com.stencyl.Engine"].engine.scene = { name: "CharSelect" };
    second();
    assert.equal(gga.Summon[0][1], 0);
    assert.equal(automation().status, "Waiting for a character to be in game");

    context["com.stencyl.Engine"].engine.scene = { name: "Spirit_Town" };
    second();
    assert.equal(gga.Summon[0][1] > 0, true);

    setPicks([]);
    assert.equal(automation().status, "No summoning upgrade is switched on");
    await cheat("automation summoning", false);
});

test("without the board actor nothing is spent", async () => {
    setBoard();
    gga.PixelHelperActor[24] = 0; // the game's "not created yet"
    setPicks([{ id: "1", on: true }]);
    await cheat("automation summoning", true);
    second();
    assert.equal(gga.Summon[0][1], 0);
    assert.equal(gga.Summon[2][WHITE], 1000);
    assert.match(automation().error, /getBehavior/);
    await cheat("automation summoning", false);
});

test("the Familiar rolls its tier, double and merge exactly as the board does", async () => {
    const { bonus, summon } = setBoard();
    gga.Summon[2][WHITE] = 100;
    setPicks([{ id: "2", on: true, stopAt: 1 }]);
    await cheat("automation summoning", true);
    second();
    assert.equal(gga.Summon[0][2], 1);
    assert.deepEqual(gga.Summon[4].slice(0, 3), [1, 0, 0], "no skipping bonus: always a tier 0 familiar");
    assert.equal(gga.Summon[2][WHITE], 0);

    // Skipping (bonus 39) above 0.5: the first roll under 12.5% x (1 + b/100) makes it tier 1.
    bonus[39] = 100;
    gga.Summon[2][WHITE] = 200;
    setPicks([{ id: "2", on: true, stopAt: 2 }]);
    rolls.push(0.99, 0.2); // no free familiar, then 0.2 < 0.25: tier 1
    second();
    assert.deepEqual(gga.Summon[4].slice(0, 3), [1, 1, 0]);

    // The second tier roll (2% x 2) gives tier 2; the double roll adds another of that tier.
    context["scripts.ActorEvents_345"]._customBlock_getbonus2 = (a, b, c) =>
        a === 2 && b === 596 && c === -1 ? 50 : 0;
    gga.Summon[2][WHITE] = 400;
    setPicks([{ id: "2", on: true, stopAt: 3 }]);
    rolls.push(0.99, 0.9, 0.03, 0.4); // no free, not tier 1, tier 2, double (0.4 < 50%)
    second();
    assert.deepEqual(gga.Summon[4].slice(0, 3), [1, 1, 2]);

    // Merging (bonus 6): 3 + t of tier t become one of tier t + 1, in one pass up the tiers.
    bonus[6] = 1;
    context["scripts.ActorEvents_345"]._customBlock_getbonus2 = () => 0;
    gga.Summon[4] = [2, 3, 4, 5, 0, 0, 0, 0];
    gga.Summon[2][WHITE] = 800;
    setPicks([{ id: "2", on: true, stopAt: 4 }]);
    second();
    // Tier 0 reaches 3 and merges into tier 1 (now 4), which merges into tier 2 (5), into tier 3 (6), into tier 4.
    assert.deepEqual(gga.Summon[4], [0, 0, 0, 0, 1, 0, 0, 0]);
    assert.equal(gga.QuestStatus.h.Sussy_Gene3[0], 1, "a tier-4 familiar flags the Regalis quest step");

    // A free familiar refunds the level but keeps the essence spent.
    summon._customBlock_Thingies = (kind, n) => (kind === "LegendPTS_bonus" && n === 4 ? 50 : 0);
    gga.Summon[2][WHITE] = 3200;
    setPicks([{ id: "2", on: true, stopAt: 5 }]);
    rolls.push(0.1); // free familiar; then 0.99s: the next buy isn't free
    second();
    // Two buys of 1600 for one level: the free one gave its level back, and level 4 was bought again.
    assert.equal(gga.Summon[0][2], 5);
    assert.equal(gga.Summon[2][WHITE], 0);
    await cheat("automation summoning", false);
});

test("a config file's picks, a plain list like Shops', load through the injector's merge and buy", async () => {
    setBoard();
    const { deepMerge } = loadCommonJs("src/modules/utils/objectUtils.js");
    const { validateConfig } = loadCommonJs("src/modules/utils/helpers.js");
    const defaults = loadCommonJs("config.js").cheatConfig;
    const custom = { automation: { summoning: [{ id: 1, on: true, stopAt: 2 }] } };
    validateConfig(defaults, custom, "");
    state.updateCheatConfig({ automation: deepMerge(defaults, custom).automation });
    await cheat("automation summoning", true);
    second();
    assert.equal(gga.Summon[0][1], 2, "Cheap_Seed buys up to its stop-at");
    assert.equal(automation().status, "Buying 1 upgrade; 2 levels bought since it started");
    await cheat("automation summoning", false);
});
