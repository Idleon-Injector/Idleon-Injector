// Cooking automation (#92, decided with Lumi on 2026-11-17): "automation cooking" levels switched-on kitchen upgrades
// with their spice (each spice saving and buying on its own, High / Low / Balanced, saving %) and switched-on meals
// with their own quantity, up to the stop-at (and the meal max); while Food Lust stacks are held the priciest
// affordable meal goes first, because any meal level-up spends them all. It pays what the game charges.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const HIGH = 1;
const LOW = 2;
// Kitchen k's upgrade slot s is id 3k + s and pays with spice 2k + s, so ids 2 (kitchen 1 Luck) and 3 (kitchen 2
// Speed) share spice 2. Each costs its base times (level + 1).
const KITCHEN_BASE = [5, 7, 10, 25, 9, 11, 3, 3, 3];
const MEAL_BASE = [5, 50, 8, 1];
let maxMeal = 30;
const calls = [];

const setGame = () => {
    context["com.stencyl.Engine"].engine.scene = { name: "Kitchen" };
    Object.assign(gga.CustomLists.h, {
        MapName: Object.assign(Array(200).fill("Other"), { 150: "Kitchen" }),
        MealINFO: MEAL_BASE.map((_, i) => [
            `Meal_${i}`,
            "5",
            "2",
            `+{%_Meal_${i}_bonus`,
            "0",
            i === 3 ? "PxLine" : "Dmg",
        ]),
        RANDOlist: Object.assign(Array(70).fill([]), { 63: ["1", "2"] }),
    });
    Object.assign(gga, {
        CurrentMap: 150,
        // Kitchens 1 and 2 are bought (Cooking[k][0] != 0); kitchen 3 isn't.
        Cooking: [
            [1, 0, 0, 0, 0, 0, 0, 0, 0],
            [2, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
        // [0] meal levels (0 = not discovered), [2] meal quantities, [3] spices.
        Meals: [[1, 1, 0, 1], [], [0, 0, 1000, 0], [0, 0, 0, 0, 0, 0, 0]],
        OptionsListAccount: Array(700).fill(0),
        Dream: Array(20).fill(0),
        Ribbon: Array(40).fill(0),
        QuestComplete: { h: { Oinkin1: 0 } },
        QuestStatus: { h: { Oinkin1: [0] } },
        Tasks: [[], [[], [], [], [0, 0]]],
    });
    maxMeal = 30;
    calls.length = 0;
    const stacks = () => Math.min(gga.OptionsListAccount[193], gga.Dream[11]);
    context["scripts.ActorEvents_345"]._customBlock_CookingR = (name, a, b) => {
        if (name === "CookingUpgSpiceCostType") return Math.floor(2 * a + b);
        if (name === "CookingUpgSpiceCostQty") return KITCHEN_BASE[3 * a + b] * (gga.Cooking[a][6 + b] + 1);
        if (name === "CookingMealMaxLVlol") return maxMeal;
        // Food Lust stacks halve every meal cost.
        if (name === "CookingMenuMealCosts") return MEAL_BASE[a] * (gga.Meals[0][a] + 1) * (stacks() > 0 ? 0.5 : 1);
        if (name === "CookingSPEED") return 100 * (a + 1);
        if (name === "CookingFIRE") return 200 * (a + 1);
        if (name === "CookingLUCK") return 1.5;
        if (name === "CookingMealBonusMultioo") return 3;
        return 0;
    };
    context["scripts.ActorEvents_345"]._customBlock_Reg_ach_add_status = (...args) => calls.push(["ach", ...args]);
    context["scripts.ActorEvents_124"]._customBlock_TalentCalc = (...args) => calls.push(["talent", ...args]);
    context["scripts.ActorEvents_266"]._customBlock_TaskProgress = (...args) => calls.push(["task", ...args]);
    context["scripts.ActorEvents_579"]._customBlock_Summoning2 = () => 1;
    context["scripts.ActorEvents_579"]._customBlock_Summoning = () => 1;
};
const setPicks = ({ kitchens = [], meals = [], saving = Array(21).fill(10) }) =>
    state.updateCheatConfig({ automation: { kitchens, meals, kitchenSaving: saving } });
const cooking = () => getAutomations().find(({ id }) => id === "w4.cooking.automation");
const levels = () => gga.Cooking.map((kitchen) => kitchen.slice(6, 9));
const tick = () => mock.timers.tick(1000);

test("a spice levels its switched-on upgrades cheapest first, up to the stop-at, with what it holds", async () => {
    setGame();
    gga.Meals[3][2] = 100;
    setPicks({
        kitchens: [
            { id: "2", on: true },
            { id: "3", on: true },
        ],
    });
    assert.equal((await cheat("automation cooking")).ok, true);
    assert.equal(cooking().on, true);
    tick();
    // 10 (id 2), 20 (id 2), 25 (id 3), 30 (id 2); then 40 and 50 are more than the 15 left.
    assert.deepEqual(levels(), [
        [0, 0, 3],
        [1, 0, 0],
        [0, 0, 0],
    ]);
    assert.equal(gga.Meals[3][2], 15);
    assert.equal(cooking().status, "Levelling 2 kitchen upgrades; 4 levels bought since it started");

    setGame();
    gga.Meals[3][2] = 100;
    setPicks({
        kitchens: [
            { id: "2", on: true, stopAt: 2 },
            { id: "3", on: true },
        ],
    });
    tick();
    assert.deepEqual(levels()[0], [0, 0, 2], "kitchen 1 Luck stops at 2");
    assert.deepEqual(levels()[1], [1, 0, 0], "the 45 left can't reach kitchen 2 Speed's next 50");
    assert.equal(gga.Meals[3][2], 45);
    await cheat("automation cooking", false);
});

test("each spice buys on its own, and an upgrade never takes another spice", async () => {
    setGame();
    gga.Meals[3] = [0, 7, 0, 0, 0, 0, 0];
    setPicks({
        kitchens: [
            { id: "0", on: true },
            { id: "1", on: true },
        ],
    });
    await cheat("automation cooking", true);
    tick();
    assert.deepEqual(levels()[0], [0, 1, 0], "Fire takes its 7 spice 1; Speed's spice 0 is empty");
    assert.deepEqual(gga.Meals[3], [0, 0, 0, 0, 0, 0, 0]);
    await cheat("automation cooking", false);
});

test("High goes first when affordable; Balanced waits for the High or Low goal beyond saving %", async () => {
    setGame();
    gga.Meals[3][2] = 30;
    setPicks({
        kitchens: [
            { id: "2", on: true },
            { id: "3", on: true, priority: HIGH },
        ],
    });
    await cheat("automation cooking", true);
    tick();
    // High kitchen 2 Speed (25) before the cheaper Balanced kitchen 1 Luck (10); the 5 left buys nothing.
    assert.deepEqual([levels()[0][2], levels()[1][0]], [0, 1]);
    assert.equal(gga.Meals[3][2], 5);

    setGame();
    gga.Meals[3][2] = 20;
    setPicks({
        kitchens: [
            { id: "2", on: true },
            { id: "3", on: true, priority: LOW },
        ],
    });
    tick();
    assert.deepEqual(levels()[0][2], 0, "10 is over 10% of the 25 it saves for");
    assert.equal(
        readComputed("automation", "cooking").value.spices.find(({ spice }) => spice === 2).goal.id,
        3,
        "the tab shows what spice 2 saves for"
    );

    const saving = Array(21).fill(10);
    saving[2] = 50;
    setPicks({
        kitchens: [
            { id: "2", on: true },
            { id: "3", on: true, priority: LOW },
        ],
        saving,
    });
    tick();
    assert.deepEqual(levels()[0][2], 1, "at 50% of 25, the 10 buys; the next 20 is over the 10 left");
    assert.equal(gga.Meals[3][2], 10);

    gga.Meals[3][2] = 25;
    tick();
    assert.deepEqual(levels()[1][0], 1, "the goal buys once affordable");
    await cheat("automation cooking", false);
});

test("a kitchen not bought yet waits, switched on ahead, and starts once bought", async () => {
    setGame();
    gga.Meals[3][4] = 1000;
    setPicks({ kitchens: [{ id: "6", on: true, stopAt: 2 }] });
    await cheat("automation cooking", true);
    tick();
    assert.deepEqual(levels()[2], [0, 0, 0]);
    assert.equal(gga.Meals[3][4], 1000);

    gga.Cooking[2][0] = 1;
    tick();
    assert.deepEqual(levels()[2], [2, 0, 0], "bought up to its stop-at");
    assert.equal(gga.Meals[3][4], 1000 - 3 - 6);
    await cheat("automation cooking", false);
});

test("nothing buys outside a character's map", async () => {
    setGame();
    gga.Meals[3][0] = 100;
    gga.Meals[2][0] = 100;
    setPicks({ kitchens: [{ id: "0", on: true }], meals: [{ id: "0", on: true }] });
    await cheat("automation cooking", true);
    context["com.stencyl.Engine"].engine.scene = { name: "CharSelect" };
    tick();
    assert.deepEqual(levels()[0], [0, 0, 0]);
    assert.equal(gga.Meals[0][0], 1);
    assert.equal(cooking().status, "Waiting for a character to be in game");

    context["com.stencyl.Engine"].engine.scene = { name: "Kitchen" };
    tick();
    assert.notDeepEqual(levels()[0], [0, 0, 0]);
    assert.ok(gga.Meals[0][0] > 1);
    await cheat("automation cooking", false);
});

test("it never buys past the stop-at: a fraction or 0 included, and a level reached on its own stays", async () => {
    setGame();
    gga.Meals[3][0] = 1000;
    setPicks({ kitchens: [{ id: "0", on: true, stopAt: 2.5 }] });
    await cheat("automation cooking", true);
    tick();
    assert.equal(levels()[0][0], 2, "half a level is no buy");

    setPicks({ kitchens: [{ id: "0", on: true, stopAt: 0 }] });
    gga.Cooking[0][6] = 5;
    const spice = gga.Meals[3][0];
    tick();
    assert.equal(levels()[0][0], 5);
    assert.equal(gga.Meals[3][0], spice);

    setPicks({ kitchens: [{ id: "0", on: false }] });
    tick();
    assert.equal(gga.Meals[3][0], spice, "switched off");
    await cheat("automation cooking", false);
});

test("a kitchen upgrade reaching 300 earns the achievement, like the click", async () => {
    setGame();
    gga.Cooking[0][6] = 299;
    gga.Meals[3][0] = 5 * 300;
    setPicks({ kitchens: [{ id: "0", on: true }] });
    await cheat("automation cooking", true);
    tick();
    assert.equal(levels()[0][0], 300);
    assert.deepEqual(calls, [["ach", 226, 10]]);
    await cheat("automation cooking", false);
});

test("meals level with their own quantity up to the stop-at and the max; undiscovered ones wait", async () => {
    setGame();
    gga.Meals[2] = [1000, 0, 1000, 0];
    setPicks({
        meals: [
            { id: "0", on: true, stopAt: 4 },
            { id: "1", on: true },
            { id: "2", on: true },
        ],
    });
    await cheat("automation cooking", true);
    tick();
    // Meal 0 levels 1 -> 4 for 10 + 15 + 20; meal 1 has none of itself and meal 2 isn't discovered.
    assert.deepEqual(gga.Meals[0], [4, 1, 0, 1]);
    assert.deepEqual(gga.Meals[2], [955, 0, 1000, 0]);
    // Every level-up rebuilds the meal bonus cache.
    assert.deepEqual(
        calls.filter(([kind]) => kind === "talent"),
        [
            ["talent", -6],
            ["talent", -6],
            ["talent", -6],
        ]
    );
    // The quest counts the first ten meals at level 2 or more.
    assert.equal(gga.QuestStatus.h.Oinkin1[0], 1);

    maxMeal = 5;
    setPicks({ meals: [{ id: "0", on: true }] });
    tick();
    assert.equal(gga.Meals[0][0], 5, "the shared max level caps it");
    tick();
    assert.equal(gga.Meals[0][0], 5);
    await cheat("automation cooking", false);
});

test("Food Lust stacks: the priciest affordable meal buys first, then the rest at full price", async () => {
    setGame();
    gga.OptionsListAccount[193] = 4;
    gga.Dream[11] = 2;
    gga.Meals[2] = [10, 50, 0, 0];
    setPicks({
        meals: [
            { id: "0", on: true, stopAt: 2 },
            { id: "1", on: true, stopAt: 2 },
        ],
    });
    await cheat("automation cooking", true);
    tick();
    // Meal 1 (50 at half price) spends the stacks; meal 0 then pays its full 10.
    assert.deepEqual(gga.Meals[0].slice(0, 2), [2, 2]);
    assert.deepEqual(gga.Meals[2].slice(0, 2), [0, 0]);
    assert.equal(gga.OptionsListAccount[193], 0);
    await cheat("automation cooking", false);
});

test("stacks over the Food Lust level count for nothing: meals go cheapest first", async () => {
    setGame();
    gga.OptionsListAccount[193] = 4; // Dream[11] stays 0: no Food Lust levels, so no discount
    gga.Meals[0] = [10, 1, 0, 21];
    gga.Meals[2] = [1e9, 0, 0, 1e9];
    setPicks({
        meals: [
            { id: "0", on: true, stopAt: 11 },
            { id: "3", on: true, stopAt: 22 },
        ],
    });
    await cheat("automation cooking", true);
    tick();
    // Meal 3 (22) before meal 0 (55): their milestones come in that order.
    assert.deepEqual(
        calls.filter(([kind]) => kind === "ach"),
        [
            ["ach", 233, 2],
            ["ach", 231, 2],
        ]
    );
    await cheat("automation cooking", false);
});

test("the Oinkin quest counts only the first ten meals", async () => {
    setGame();
    gga.Meals[0] = [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 5];
    gga.Meals[2] = [1000, 0, 0, 0];
    setPicks({ meals: [{ id: "0", on: true, stopAt: 2 }] });
    await cheat("automation cooking", true);
    tick();
    assert.equal(gga.QuestStatus.h.Oinkin1[0], 1, "meal 10 at level 5 isn't one of the ten");
    await cheat("automation cooking", false);
});

test("the meal milestones and the daily task advance like a click", async () => {
    setGame();
    gga.Meals[0] = [10, 15, 0, 21];
    gga.Meals[2] = [1e9, 1e9, 0, 1e9];
    gga.Tasks[1][3][1] = 0; // RANDOlist[63][0] = meal 1
    setPicks({
        meals: [
            { id: "0", on: true, stopAt: 11 },
            { id: "1", on: true, stopAt: 16 },
            { id: "3", on: true, stopAt: 22 },
        ],
    });
    await cheat("automation cooking", true);
    tick();
    assert.deepEqual(
        calls.filter(([kind]) => kind !== "talent"),
        [
            // Cheapest first: meal 3 (22), meal 0 (55), then meal 1 (800), today's task meal.
            ["ach", 233, 2],
            ["ach", 231, 2],
            ["ach", 232, 2],
            ["task", 3, 1, "total", 16],
        ]
    );
    await cheat("automation cooking", false);
});

test("the tab's read: each spice with what it holds and saves for, every upgrade, every meal", () => {
    setGame();
    gga.Meals[3] = [1, 2, 3, 4, 5, 6, 7];
    gga.Meals[0][3] = 4;
    setPicks({ kitchens: [{ id: "4", on: true, priority: LOW }] });
    const read = readComputed("automation", "cooking").value;
    assert.deepEqual(
        read.spices.map(({ spice, owned, goal }) => [spice, owned, goal]),
        [
            [0, 1, null],
            [1, 2, null],
            [2, 3, null],
            [3, 4, { id: 4, cost: 9 }],
            [4, 5, null],
            [5, 6, null],
            [6, 7, null],
        ]
    );
    assert.equal(read.upgrades.length, 9);
    assert.deepEqual(read.upgrades[7], {
        id: 7,
        kitchen: 2,
        slot: 1,
        spice: 5,
        level: 0,
        cost: 3,
        owned: false,
        bonus: 600,
    });
    assert.equal(read.maxMeal, 30);
    assert.equal(read.foodLust, 0);
    assert.deepEqual(read.meals[1], {
        id: 1,
        name: "Meal_1",
        description: "+{%_Meal_1_bonus",
        bonus: 3 * 1 * 2,
        level: 1,
        owned: 0,
        cost: 100,
    });
    assert.equal(read.meals[3].bonus, 8, "a PxLine meal is level times its per-level bonus");
});

test("the status says when nothing is switched on", async () => {
    setGame();
    setPicks({ kitchens: [{ id: "0", on: false }] });
    await cheat("automation cooking", true);
    assert.equal(cooking().status, "No kitchen upgrade or meal is switched on");
    await cheat("automation cooking", false);
    assert.equal(cooking().on, false);
});
