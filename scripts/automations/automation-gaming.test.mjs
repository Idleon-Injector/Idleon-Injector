// Automation (#92), World 5 › Gaming: "automation gaming" buys the switched-on Gaming upgrades with bits every second by
// the shared rule ("Save for it", saving %), each up to its stop-at, menu open or not; while the Gaming menu is open it
// harvests a full garden, leaving the plant types the player locked, and digs once the shovel is ready and unlocked.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const triggered = [];
let station;
const setGame = ({
    bits = 1000,
    open = true,
    plants = Array(5).fill(1),
    locked = [],
    shovel = 0,
    imports = "_ab",
} = {}) => {
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    Object.assign(gga.CustomLists.h, {
        GamingUpgrades: [["Sprout_Value"], ["Sprout_Speed"], ["Sprout_Capacity"]],
        RandoListo2: [
            [],
            [
                "Little_Sprinkler",
                "Dirty_Shovel",
                "Autumn_Squirrel",
                "Elegant_Seashell",
                "Kitsune_Roxie",
                "Bog_Log",
                "POiNG_Controller",
                "Immortal_Snail",
                "King_Rat_of_Olde",
                "idk",
            ],
        ],
        MapName: Object.assign(Array(10).fill("Other"), { 3: "Town" }),
    });
    const ola = Array(700).fill(0);
    for (const type of locked) ola[583 + Math.max(0, type - 2)] = 1;
    triggered.length = 0;
    station = {
        _UIinventory13On: Object.assign([], { 37: 1 }),
        _GenINFO: Object.assign([], { 43: [0, 0] }),
        _TRIGGEREDtext: "",
        // The game's handlers, reduced to what the automation relies on: a harvest empties its plot, a dig locks the
        // shovel and spends its time.
        _customEvent_GardenETC() {
            triggered.push(this._TRIGGEREDtext);
            gga.GamingSprout[Number(this._TRIGGEREDtext.slice(1))][1] = 0;
        },
        _customEvent_W5stuffzz() {
            triggered.push(this._TRIGGEREDtext);
            this._GenINFO[43][1] = 1;
            gga.GamingSprout[26][1] = 0;
        },
    };
    Object.assign(gga, {
        CurrentMap: 3,
        MenuType2: open ? 45 : 0,
        Lv0: Object.assign([], { 15: 50 }),
        OptionsListAccount: ola,
        Number2Letter: "_abcdefghijk".split(""),
        // bits, fertilizer levels 1-3, mutants, ..., imports owned (letters), mutation level
        Gaming: [bits, 1, 1, 0, 0, 0, imports, 1],
        GamingSprout: Array.from({ length: 36 }, (_, i) => (i < plants.length ? [1, plants[i], 0, 0] : [0, 0, 0, 0])),
        PixelHelperActor: Object.assign([], { 23: { behaviors: { getBehavior: () => station } } }),
    });
    gga.GamingSprout[26] = [0, shovel, 0, 0];
    // Prices 10 * 2^level (fertilizer) and 25 * 2^level (mutation, imports); capacity is 5 + its level here, at most 24.
    context["scripts.ActorEvents_579"]._customBlock_GamingStatType = (kind, i) => {
        if (kind === "FertilizerUpgCosts") return 10 * 2 ** gga.Gaming[i + 1];
        if (kind === "MutateUpgCosts") return 25 * 2 ** gga.Gaming[7];
        if (kind === "ImportItemCOST") return 25 * 2 ** gga.GamingSprout[25 + i][0];
        if (kind === "SproutCapacity") return Math.min(24, 5 + gga.Gaming[3]);
        if (kind === "LVreq") return [-1, 10, 20][i];
        return 0;
    };
};
const setItems = (items, saving = 10) =>
    state.updateCheatConfig({ automation: { gaming: items, gamingSaving: saving } });
const gaming = () => getAutomations().find(({ id }) => id === "w5.automation.gaming");
const tick = () => mock.timers.tick(1000);
const turnOn = async () => {
    if (!gaming().on) assert.equal((await cheat("automation gaming")).ok, true);
};
const turnOff = async () => {
    if (gaming().on) await cheat("automation gaming");
};

test("the Gaming page reads bits and every upgrade but POiNG, with its level, price and lock", () => {
    setGame({ bits: 500, imports: "_a" });
    gga.Gaming[3] = 20;
    const { value } = readComputed("automation", "gaming");
    assert.equal(value.bits, 500);
    assert.deepEqual(
        value.upgrades.map(({ id }) => id),
        ["fertilizer0", "fertilizer1", "fertilizer2", "mutation", ...[0, 1, 2, 3, 4, 5, 7, 8].map((i) => `import${i}`)]
    );
    assert.deepEqual(value.upgrades[0], {
        id: "fertilizer0",
        name: "Sprout Value",
        level: 1,
        cost: 20,
        unlocked: true,
        maxed: false,
    });
    assert.equal(value.upgrades[2].maxed, true, "capacity at 24 plots");
    assert.equal(value.upgrades.find(({ id }) => id === "import1").name, "Dirty Shovel");
    assert.equal(value.upgrades.find(({ id }) => id === "import1").unlocked, true);
    assert.equal(value.upgrades.find(({ id }) => id === "import2").unlocked, false, "its letter isn't in Gaming[6]");
});

test("nothing switched on buys nothing", async () => {
    setGame({ bits: 1e9, open: false });
    setItems([]);
    await turnOn();
    tick();
    assert.equal(gga.Gaming[0], 1e9);
    assert.equal(gaming().status, "No upgrade is switched on; open Gaming to harvest and dig");
    await turnOff();
});

test("it buys the cheapest switched-on upgrade first, menu closed too, until the bits run out", async () => {
    setGame({ bits: 100, open: false });
    setItems([
        { id: "fertilizer0", on: true },
        { id: "mutation", on: true },
        { id: "fertilizer1", on: false },
    ]);
    await turnOn();
    tick();
    // fertilizer0 costs 20, then 40; mutation 50: 20 + 40 = 60, then 50 > 40 left.
    assert.deepEqual([gga.Gaming[1], gga.Gaming[7], gga.Gaming[2]], [3, 1, 1]);
    assert.equal(gga.Gaming[0], 40, "each level paid at the game's price, never below zero");
    assert.equal(gaming().status, "Buying cheapest first; open Gaming to harvest and dig; 2 levels bought");
    await turnOff();
});

test("a stop-at caps the level, and Save for it keeps bits for its goal", async () => {
    setGame({ bits: 1e6 });
    setItems([{ id: "fertilizer0", on: true, stopAt: 4 }]);
    await turnOn();
    tick();
    assert.equal(gga.Gaming[1], 4);
    await turnOff();

    // Saving for mutation (25 * 2^1 = 50 at level 1) with 45 bits: at least 90% of 50 stays, so only 0 can buy others.
    setGame({ bits: 45 });
    setItems([
        { id: "mutation", on: true, save: true },
        { id: "fertilizer0", on: true },
    ]);
    await turnOn();
    tick();
    assert.equal(gga.Gaming[0], 45, "nothing spent below the goal's floor");
    assert.match(gaming().status, /^Saving for Mutation chance \(50 bits\)/);
    gga.Gaming[0] = 60;
    tick();
    assert.equal(gga.Gaming[7], 2, "the goal bought once affordable");
    await turnOff();
});

test("capacity stops at the game's 24 plots; mutation and imports wait for their Gaming level and unlock", async () => {
    setGame({ bits: 1e12, imports: "_a" });
    gga.Gaming[3] = 17; // 22 plots
    gga.Lv0[15] = 15; // mutation opens at 10, imports at 20
    setItems([
        { id: "fertilizer2", on: true },
        ...["mutation", "import0", "import1", "import2"].map((id) => ({ id, on: true, stopAt: 3 })),
    ]);
    await turnOn();
    tick();
    assert.equal(gga.Gaming[3], 19, "two levels to 24 plots");
    assert.equal(gga.Gaming[7], 3);
    assert.deepEqual(
        [25, 26, 27].map((i) => gga.GamingSprout[i][0]),
        [0, 0, 0],
        "imports need Gaming level 20"
    );
    gga.Lv0[15] = 20;
    tick();
    assert.deepEqual(
        [25, 26, 27].map((i) => gga.GamingSprout[i][0]),
        [3, 3, 0],
        "import 2 isn't unlocked"
    );
    await turnOff();
});

test("a full garden is harvested while Gaming is open, leaving the locked plant types", async () => {
    setGame({ plants: [1, 9, 3, 9, 2], locked: [9] });
    setItems([]);
    await turnOn();
    tick();
    assert.deepEqual(triggered, ["z0", "z2", "z4"]);
    assert.deepEqual(
        gga.GamingSprout.slice(0, 5).map((plot) => plot[1]),
        [0, 9, 0, 9, 0]
    );
    triggered.length = 0;
    tick();
    assert.deepEqual(triggered, [], "no longer full: it waits");
    await turnOff();
});

test("a garden with an empty plot, or Gaming closed, isn't harvested", async () => {
    setGame({ plants: [1, 1, 0, 1, 1] });
    setItems([]);
    await turnOn();
    tick();
    assert.deepEqual(triggered, []);
    setGame({ open: false });
    tick();
    assert.deepEqual(triggered, []);
    await turnOff();
});

test("the shovel digs once it holds an hour, unlocked, and waits for the game's lock after a dig", async () => {
    setGame({ plants: [1, 0], shovel: 3599 });
    setItems([]);
    await turnOn();
    tick();
    assert.deepEqual(triggered, [], "under an hour");
    gga.GamingSprout[26][1] = 3600;
    tick();
    assert.deepEqual(triggered, ["j1"]);
    gga.GamingSprout[26][1] = 7200;
    tick();
    assert.deepEqual(triggered, ["j1"], "the 6 s lock after a dig");
    station._GenINFO[43][1] = 0;
    tick();
    assert.deepEqual(triggered, ["j1", "j1"]);
    assert.equal(station._TRIGGEREDtext, "", "the station's trigger text is put back");
    setGame({ plants: [1, 0], shovel: 7200, imports: "_" });
    tick();
    assert.deepEqual(triggered, [], "no shovel without its import");
    await turnOff();
});

test("harvest and dig each have their own switch", async () => {
    setGame({ shovel: 7200 });
    setItems([]);
    state.updateCheatConfig({ automation: { gamingAutoHarvest: false, gamingAutoDig: false } });
    await turnOn();
    tick();
    assert.deepEqual(triggered, []);
    state.updateCheatConfig({ automation: { gamingAutoHarvest: true, gamingAutoDig: true } });
    tick();
    assert.deepEqual(triggered, ["z0", "z1", "z2", "z3", "z4", "j1"]);
    await turnOff();
});
