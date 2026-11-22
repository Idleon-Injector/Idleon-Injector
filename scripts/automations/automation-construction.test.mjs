// Automation (#92): "automation construction" does what W3 construction's build button does, every second. A finished
// build is completed at once and paid as soon as its salt is reachable (saved-for first, then cheapest first on a
// shared salt); empty slots take switched-on buildings, saved-for first, the one closest to done first, up to
// the stop-at (decided with Lumi on 2026-11-17). Buildings queued by hand are completed and paid, never removed, and
// the 8th slot stays free once it feeds the Menagerie jelly.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const CHEAT = "automation construction";
const QUEUE = 54;
const SALTS = ["Refinery1", "Refinery2", "Refinery3"];

let world; // what the fake game holds, rebuilt by setGame()
const level = (b) => gga.TowerInfo[b];
const builtTo = (b) => gga.TowerInfo[b + 27];
const progressOf = (b) => gga.TowerInfo[66 + b];
const slots = () => gga.TowerInfo.slice(QUEUE, QUEUE + 8);
const salt = (item) => gga.ChestQuantity[gga.ChestOrder.indexOf(item)];

/**
 * 27 buildings, each row's salt the row index's Refinery (1-3), level 1 (so every one is unlocked), nothing queued.
 * Building b needs 100 * (b + 1) progress and costs 10 * (b + 1) salt; `slotCount` slots, slot 0 gilded (x3).
 */
function setGame({ slotCount = 3, jelly = false } = {}) {
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    world = { slotCount, jelly, redraws: [], removed: [], refreshes: 0 };
    Object.assign(gga.CustomLists.h, {
        MapName: ["Town"],
        TowerInfo: Array.from({ length: 27 }, (_, b) => [
            `Building_${b}`,
            "+{%_Speed_@Current_Bonuses:_+{%_speed@_+$_total",
            "2",
            "0",
            SALTS[Math.floor(b / 9)],
            "Blank",
            "1",
            "0",
            "10",
            "1.2",
        ]),
        Spelunky: Array(30).fill([]),
    });
    Object.assign(gga.ItemDefinitionsGET.h, {
        Refinery1: { h: { displayName: "Redox_Salts" } },
        Refinery2: { h: { displayName: "Explosive_Salts" } },
        Refinery3: { h: { displayName: "Spontaneity_Salts" } },
    });
    Object.assign(gga, {
        CurrentMap: 0,
        MenuType2: 0,
        TowerInfo: [...Array(27).fill(1), ...Array(27).fill(1), ...Array(8).fill(-1), 0, 0, 0, 0, ...Array(27).fill(0)],
        OptionsListAccount: Array(500).fill(0),
        InventorySlotsOwned: 2,
        InventoryOrder: ["Refinery1", "Blank", "Refinery2"],
        ItemQuantity: [5, 0, 1000],
        Refinery: [[], ["Refinery2", "Blank"], [0, 0]],
        ChestSlotsOwned: 3,
        ChestOrder: ["Refinery1", "Refinery2", "Refinery3", "Refinery3"],
        ChestQuantity: [1000, 1000, 1000, 1000],
        ShrineInfo: Array.from({ length: 9 }, () => [0, 0, 0, 0]),
        Spelunk: Array.from({ length: 5 }, () => []),
    });
    // The construction menu (_GenINFO: [3] its tab, [12][0] build rate per hour, [17] the selected building).
    const menu = { _GenINFO: Object.assign([], { 3: 0, 12: [60], 17: -1 }) };
    for (const event of ["_customEvent_WorkbenchStuff", "_customEvent_WorkbenchStuff2"])
        menu[event] = () => world.redraws.push([event, menu._TRIGGEREDtext]);
    world.menu = menu;
    // The owned-items map the pay click checks: inventory, chest and refinery storage, rebuilt by "z".
    const owned = { _ItemsAndStorageOWNED: { h: {} } };
    owned._customEvent_PostOfficeIMG = () => {
        world.refreshes++;
        const map = {};
        const add = (item, amount) => (map[item] = (map[item] ?? 0) + amount);
        gga.InventoryOrder.slice(0, gga.InventorySlotsOwned).forEach((item, i) => add(item, gga.ItemQuantity[i]));
        gga.ChestOrder.forEach((item, i) => add(item, gga.ChestQuantity[i]));
        gga.Refinery[1].forEach((item, i) => add(item, gga.Refinery[2][i]));
        owned._ItemsAndStorageOWNED.h = world.ownedOverride ?? map;
    };
    gga.PixelHelperActor[8] = { behaviors: { getBehavior: (name) => name === "ActorEvents_481" && menu } };
    gga.PixelHelperActor[5] = {
        behaviors: { getBehavior: (name) => name === "ActorEvents_232" && owned },
        shout: (event) => owned[event](),
    };
    context["scripts.ActorEvents_345"]._customBlock_WorkbenchStuff = (key, b) => {
        if (key === "TowerBuildReq") return 100 * (b + 1);
        if (key === "TowerSaltCost") return world.costs?.[b] ?? 10 * (b + 1);
        if (key === "ExtraMaxLvAtom") return 0;
        if (key === "TowerBuildSlots") return world.slotCount;
        if (key === "TotalGildedSlots") return 1;
        if (key === "TotalGildedBoostio") return 3;
        throw new Error(`unexpected WorkbenchStuff ${key}`);
    };
    context["scripts.ActorEvents_189"]._customBlock_MenagerieStuff = (key) =>
        key === "SideJellyUnlocked" && world.jelly ? 1 : 0;
    // The game's removeitems with "InventoryStorage": the active character's inventory, the first refinery storage
    // slot holding the item, then the chest. A pay never asks for more than those hold.
    context["scripts.ActorEvents_189"]._customBlock_removeitems = (item, amount, where) => {
        world.removed.push([item, amount, where]);
        let left = amount;
        const take = (list, i) => {
            const taken = Math.min(list[i], left);
            list[i] -= taken;
            left -= taken;
        };
        for (let i = 0; i < gga.InventorySlotsOwned; i++) if (gga.InventoryOrder[i] === item) take(gga.ItemQuantity, i);
        const stored = gga.Refinery[1].indexOf(item);
        if (stored >= 0 && stored < 8) take(gga.Refinery[2], stored);
        for (let i = 0; i < gga.ChestSlotsOwned; i++) if (gga.ChestOrder[i] === item) take(gga.ChestQuantity, i);
        assert.equal(left, 0, `asked for ${amount} ${item}, more than the inventory, refinery and chest hold`);
    };
}
const setConstruction = (entries) => state.updateCheatConfig({ automation: { construction: entries } });
const automation = () => getAutomations().find(({ id }) => id === "w3.automation.construction");
const on = (ids, extra = {}) => ids.map((id) => ({ id, on: true, ...extra }));
const tick = () => mock.timers.tick(1000);

test("World 3 › Construction › Automation reads each building's row and the queue", () => {
    setGame();
    gga.TowerInfo[3] = 4; // level 4, built to 5: waiting for salt
    gga.TowerInfo[3 + 27] = 5;
    gga.TowerInfo[QUEUE] = 1; // slot 1 (gilded): 50 of 200 done at 60/h x3
    gga.TowerInfo[66 + 1] = 50;
    gga.TowerInfo[QUEUE + 1] = 2; // slot 2: 150 of 300 done at 60/h
    gga.TowerInfo[66 + 2] = 150;
    gga.TowerInfo[7] = 10; // at max
    gga.TowerInfo[10] = 0; // tower 1 is locked until tower 0 has a level...
    gga.TowerInfo[9] = 0; // ...and tower 0, first of its row, is not

    const data = readComputed("automation", "construction").value;
    assert.deepEqual(
        { slots: data.slots, building: data.building, jelly: data.jelly, rate: data.rate, busy: data.busy },
        { slots: 3, building: 2, jelly: false, rate: 60, busy: false }
    );
    const row = (b) => data.buildings[b];
    assert.deepEqual(row(1), {
        id: 1,
        name: "Building_1",
        bonus: "+0% speed · +2 total",
        level: 1,
        max: 10,
        maxed: false,
        unlocked: true,
        previous: "Building_0",
        cost: 20,
        currency: "Redox_Salts",
        awaiting: false,
        slot: 0,
        percent: 25,
        hoursLeft: 150 / 180,
    });
    assert.equal(row(2).hoursLeft, 150 / 60, "slot 2 isn't gilded");
    assert.equal(row(3).awaiting, true);
    assert.equal(row(5).hoursLeft, null, "not in a slot");
    assert.equal(row(7).maxed, true);
    assert.equal(row(9).unlocked, true);
    assert.equal(row(9).previous, null);
    assert.equal(row(9).bonus, "", "no bonus before the first level, like the panel");
    assert.equal(row(10).unlocked, false);
    assert.equal(row(10).currency, "Explosive_Salts");
});

test("a finished build is completed at once and paid with its salt, one level per build", async () => {
    setGame();
    setConstruction(on([4]));
    gga.TowerInfo[QUEUE] = 4;
    gga.TowerInfo[66 + 4] = 520; // over its 500: the overflow is lost, as in the game
    assert.equal((await cheat(CHEAT, true)).ok, true);
    tick();

    assert.equal(builtTo(4), 2, "completed");
    assert.equal(level(4), 2, "and paid");
    assert.equal(progressOf(4), 0);
    assert.deepEqual(world.removed, [["Refinery1", 50, "InventoryStorage"]]);
    assert.equal(gga.ItemQuantity[0], 0, "the inventory's 5 go first");
    assert.equal(salt("Refinery1"), 955, "then 45 from the chest");
    assert.equal(automation().status, "Building; 1 level paid since it started");
    // Back into a free slot for its next level; nothing is paid twice.
    assert.deepEqual(slots().slice(0, 3), [4, -1, -1]);
    tick();
    assert.equal(level(4), 2);
    assert.equal(world.removed.length, 1);
    await cheat(CHEAT, false);
});

test("a completed build waits for its salt: inventory, refinery storage and chest must reach it, then the game's own count", async () => {
    setGame();
    setConstruction(on([0]));
    gga.TowerInfo[27] = 2; // built to 2, level 1
    gga.ChestQuantity[0] = 4; // 4 in the chest + 5 in the inventory = 9 of 10
    await cheat(CHEAT, true);
    tick();
    assert.equal(level(0), 1, "short by one");
    assert.deepEqual(world.removed, []);
    assert.equal(world.refreshes, 0, "the owned-items map isn't rebuilt while the salt isn't there");
    assert.deepEqual(slots(), Array(8).fill(-1), "a building waiting for salt isn't queued again");

    gga.ChestQuantity[0] = 5;
    world.ownedOverride = { Refinery1: 9 }; // the game's map disagrees: the pay click would refuse
    tick();
    assert.equal(level(0), 1, "the pay click's own check decides");

    world.ownedOverride = null;
    tick();
    assert.equal(level(0), 2);
    assert.deepEqual(world.removed, [["Refinery1", 10, "InventoryStorage"]]);
    await cheat(CHEAT, false);
});

test("refinery storage counts toward a salt", async () => {
    setGame();
    setConstruction(on([9]));
    gga.TowerInfo[9 + 27] = 2;
    gga.ChestQuantity[1] = 60; // + 40 in the refinery's storage = the 100 tower 0 costs
    gga.ItemQuantity[2] = 0;
    gga.Refinery[2][0] = 40;
    world.ownedOverride = { Refinery2: 100 };
    await cheat(CHEAT, true);
    tick();
    assert.equal(level(9), 2);
    assert.equal(gga.Refinery[2][0], 0, "the refinery's 40 go first");
    assert.equal(salt("Refinery2"), 0, "then the chest's 60");
    await cheat(CHEAT, false);
});

test("on a shared salt saved-for builds pay first, then the rest, cheapest first; switched-off builds pay too", async () => {
    setGame();
    for (const b of [1, 2, 3, 5]) gga.TowerInfo[b + 27] = 2;
    world.costs = { 3: 15 }; // the switched-off build costs less than building 1's 20
    setConstruction([
        { id: 1, on: true },
        { id: 2, on: true, save: true },
        { id: 5, on: true, save: true },
        { id: 3, on: false },
    ]);
    // 115 salt: the saved-for 30 and 60 leave 25, enough for the 15 or the 20 build, not both.
    gga.ChestQuantity[0] = 110;
    gga.ItemQuantity[0] = 5;
    await cheat(CHEAT, true);
    tick();
    assert.deepEqual(
        world.removed.map(([, amount]) => amount),
        [30, 60, 15],
        "the saved-for 30 then 60, then the cheapest of the rest (15), the switched-off one included"
    );
    assert.equal(gga.ItemQuantity[0] + salt("Refinery1"), 115 - 105, "what was paid left the inventory and chest");
    gga.ChestQuantity[0] += 100;
    tick();
    assert.deepEqual(
        world.removed.map(([, amount]) => amount),
        [30, 60, 15, 20]
    );
    assert.deepEqual([1, 2, 3, 5].map(level), [2, 2, 2, 2]);
    await cheat(CHEAT, false);
});

test("a switched-off building queued by hand pays with the rest, even with Save for it on", async () => {
    setGame();
    for (const b of [3, 5]) gga.TowerInfo[b + 27] = 2;
    setConstruction([
        { id: 5, on: true, save: true },
        { id: 3, on: false, save: true }, // cheaper (40), but switched off
    ]);
    gga.ChestQuantity[0] = 60; // + 5 in the inventory: enough for one of the two
    await cheat(CHEAT, true);
    tick();
    assert.deepEqual(
        world.removed,
        [["Refinery1", 60, "InventoryStorage"]],
        "the switched-on saved-for build pays first"
    );
    assert.deepEqual([level(3), level(5)], [1, 2]);
    await cheat(CHEAT, false);
});

test("free slots take saved-for buildings first, then the rest, the one closest to done first", async () => {
    setGame({ slotCount: 4 });
    gga.TowerInfo[66 + 8] = 850; // 50 left of 900
    gga.TowerInfo[66 + 6] = 600; // 100 left of 700
    gga.TowerInfo[66 + 0] = 0; // 100 left of 100
    setConstruction([
        { id: 0, on: true },
        { id: 6, on: true, save: true },
        { id: 8, on: true },
        { id: 20, on: true, save: true }, // 2100 left
        { id: 21, on: true, save: true }, // 2200 left
    ]);
    await cheat(CHEAT, true);
    tick();
    assert.deepEqual(slots().slice(0, 4), [6, 20, 21, 8], "saved-for fastest first, then the rest");
    assert.equal(automation().status, "Filling free slots, completing and paying");
    assert.equal(gga.OptionsListAccount[406], 1, "the queue's tutorial step, as the button sets it");
    await cheat(CHEAT, false);
});

test("queueing stops at the stop-at and the max, and skips locked, switched-off and unpaid buildings", async () => {
    setGame({ slotCount: 8 });
    gga.TowerInfo[1] = gga.TowerInfo[1 + 27] = 5; // stop-at 5: reached
    gga.TowerInfo[2] = gga.TowerInfo[2 + 27] = 10; // max 10: reached
    // Tower 2 is locked: tower 1 has no level (both built to 0, so neither waits for salt).
    for (const b of [10, 11]) gga.TowerInfo[b] = gga.TowerInfo[b + 27] = 0;
    gga.TowerInfo[4 + 27] = 2; // unpaid, no salt for it
    gga.ChestQuantity[0] = 0;
    gga.ItemQuantity[0] = 0;
    setConstruction([
        { id: 1, on: true, stopAt: 5 },
        { id: 2, on: true },
        { id: 11, on: true },
        { id: 4, on: true },
        { id: 5, on: false },
        { id: 6, on: true, stopAt: 6 },
    ]);
    await cheat(CHEAT, true);
    tick();
    assert.deepEqual(slots(), [6, -1, -1, -1, -1, -1, -1, -1]);
    await cheat(CHEAT, false);
});

test("a stop-at with a fraction (typed into the config file) counts as the level below it", async () => {
    setGame({ slotCount: 8 });
    gga.TowerInfo[1] = gga.TowerInfo[1 + 27] = 5; // stop-at 5.5: level 6 would pass it
    setConstruction([
        { id: 1, on: true, stopAt: 5.5 },
        { id: 6, on: true, stopAt: 6 },
    ]);
    await cheat(CHEAT, true);
    tick();
    assert.deepEqual(slots(), [6, -1, -1, -1, -1, -1, -1, -1]);
    await cheat(CHEAT, false);
});

test("buildings queued by hand stay in their slot and are completed and paid", async () => {
    setGame({ slotCount: 2 });
    gga.TowerInfo[QUEUE + 1] = 3; // switched off, queued by hand
    setConstruction([
        { id: 0, on: true, save: true },
        { id: 3, on: false },
    ]);
    await cheat(CHEAT, true);
    tick();
    assert.deepEqual(slots().slice(0, 2), [0, 3], "the hand-queued build keeps its slot");

    gga.TowerInfo[66 + 3] = 400;
    tick();
    assert.equal(level(3), 2, "completed and paid");
    assert.equal(slots()[1], -1, "and not queued again, since it is off");
    await cheat(CHEAT, false);
});

test("the 8th slot stays free once it feeds the Menagerie jelly, and slots never pass 8", async () => {
    setGame({ slotCount: 10, jelly: true });
    setConstruction(on(Array.from({ length: 12 }, (_, b) => b)));
    await cheat(CHEAT, true);
    tick();
    assert.equal(slots()[7], -1, "kept for the jelly");
    assert.equal(slots().filter((b) => b !== -1).length, 7);
    assert.equal(gga.TowerInfo[62], 0, "cog data after the queue is untouched");
    await cheat(CHEAT, false);

    setGame({ slotCount: 10, jelly: false });
    setConstruction(on(Array.from({ length: 12 }, (_, b) => b)));
    await cheat(CHEAT, true);
    tick();
    assert.equal(slots().filter((b) => b !== -1).length, 8, "without the jelly the 8th slot builds");
    assert.equal(readComputed("automation", "construction").value.slots, 8);
    await cheat(CHEAT, false);
});

test("while the game is busy, completing and paying wait; queueing goes on", async () => {
    setGame();
    gga.OptionsListAccount[34] = 1;
    gga.TowerInfo[QUEUE] = 0;
    gga.TowerInfo[66] = 100;
    gga.TowerInfo[1 + 27] = 2;
    setConstruction(on([0, 1, 2]));
    await cheat(CHEAT, true);
    tick();
    assert.equal(builtTo(0), 1, "not completed");
    assert.equal(level(1), 1, "not paid");
    assert.deepEqual(slots().slice(0, 3), [0, 2, -1]);
    assert.equal(automation().status, "Completing and paying wait while the game is busy");

    gga.OptionsListAccount[34] = 0;
    tick();
    assert.equal(builtTo(0), 2);
    assert.equal(level(1), 2);
    await cheat(CHEAT, false);
});

test("nothing happens outside a character's map, or with no building switched on", async () => {
    setGame();
    gga.TowerInfo[QUEUE] = 0;
    gga.TowerInfo[66] = 100;
    setConstruction([{ id: 1, on: false }]);
    await cheat(CHEAT, true);
    tick();
    assert.equal(builtTo(0), 1);
    assert.equal(automation().status, "No building is switched on");

    setConstruction(on([1]));
    context["com.stencyl.Engine"].engine.scene = { name: "CharSelect" };
    tick();
    assert.equal(builtTo(0), 1);
    assert.deepEqual(slots().slice(0, 3), [0, -1, -1]);
    assert.equal(automation().status, "Waiting for a character to be in game");

    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    tick();
    assert.equal(builtTo(0), 2);
    assert.equal(automation().status, "Building; 1 level paid since it started");
    await cheat(CHEAT, false);
});

test("a shrine's first level makes it placeable", async () => {
    setGame();
    gga.TowerInfo[20] = 0;
    gga.TowerInfo[20 + 27] = 1;
    setConstruction(on([20]));
    gga.ChestQuantity[2] = 210;
    await cheat(CHEAT, true);
    tick();
    assert.equal(level(20), 1);
    assert.equal(gga.ShrineInfo[2][3], 1);
    assert.equal(gga.ShrineInfo[1][3], 0);
    await cheat(CHEAT, false);
});

test("the menu's redraws run only while it shows the buildings", async () => {
    setGame();
    setConstruction(on([0]));
    gga.TowerInfo[27] = 2;
    await cheat(CHEAT, true);
    tick();
    assert.equal(level(0), 2);
    assert.deepEqual(world.redraws, [], "a closed menu draws nothing");

    gga.MenuType2 = 28;
    world.menu._GenINFO[17] = 0;
    gga.TowerInfo[27] = 3;
    tick();
    assert.deepEqual(world.redraws, [
        ["_customEvent_WorkbenchStuff", "be"],
        ["_customEvent_WorkbenchStuff2", "nop"],
    ]);

    world.redraws.length = 0;
    world.menu._GenINFO[17] = -1;
    world.menu._GenINFO[3] = 1; // the cog tab
    gga.TowerInfo[27] = 4;
    tick();
    assert.deepEqual(world.redraws, [], "another tab of the menu draws nothing");

    // With no building selected, a complete, a pay and a queue redraw only the slots.
    world.menu._GenINFO[3] = 0;
    gga.TowerInfo[66] = 100;
    tick();
    assert.deepEqual(builtTo(0), 5, "completed");
    assert.deepEqual(world.redraws, [
        ["_customEvent_WorkbenchStuff2", "p"],
        ["_customEvent_WorkbenchStuff", "be"],
        ["_customEvent_WorkbenchStuff2", "p"],
        ["_customEvent_WorkbenchStuff2", "p"],
    ]);
    await cheat(CHEAT, false);
});
