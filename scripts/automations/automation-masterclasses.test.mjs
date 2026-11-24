// Automation: the Compass, Tesseract and Royal Armory masterclasses, bought like the Grimoire (its test covers the
// shared rule: cheapest first, "Save for it", saving %, stop-at). Lumi's picks (2026-11-24): the Compass buys only the
// upgrades it shows and pauses while open, with no dust kept for portals; Silver tachyons are spent like any other;
// the Armory buys through the game's own buy event after our checks; statues roll with parchments, lowest level first.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const automation = (cheatName) => getAutomations().find(({ cheat: name }) => name === cheatName);
const events579 = () => context["scripts.ActorEvents_579"];
const run = async (cheatName, config) => {
    state.updateCheatConfig({ automation: config });
    await cheat(cheatName, true);
    mock.timers.tick(1000);
    await cheat(cheatName, false);
};
const inTown = () => {
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    gga.CustomLists.h.MapName = Object.assign(Array(10).fill("Other"), { 3: "Town" });
    gga.CurrentMap = 3;
    gga.MenuType2 = 0;
};

// ---- Compass -----------------------------------------------------------------------------------------------------

const STARDUST = 357;
const MOONDUST = 358;
// [name, _, _, dust, max level, ...]; [11] its line. 0 Pathfinder, 1 a path's first upgrade, 2-3 that path's upgrades.
const COMPASS = [
    ["Pathfinder", 0, 0, 0, 1],
    ["Elemental_Path", 0, 0, 0, 24],
    ["Elemental_Vision", 0, 0, 1, 1],
    ["Weapon_Drop", 0, 0, 0, 999999],
    ["Moon_Thing", 0, 0, 1, 999999],
].map((row) => [...row.map(String), "", "", "", "", "", "", "+{%_Dust"]);

function setCompass() {
    inTown();
    Object.assign(gga.CustomLists.h, {
        CompassUpg: COMPASS,
        // The Elemental path shows its upgrades in this order, one more per level of upgrade 1.
        RANDOlist: Object.assign([], { 105: ["2", "3"], 106: [], 107: [], 108: [] }),
        Titans: [["Mushgloom"], ["Bean"]],
    });
    // Titan 1 slain: its Abomination Slayer (60 + 1) shows; none such row exists here.
    gga.Compass = [[0, 0, 0, 0, 0], [0, 1], []];
    gga.OptionsListAccount = Object.assign(Array(500).fill(0), { [STARDUST]: 1000, [MOONDUST]: 1000, 480: 0 });
    gga.DNSM = { h: { CompassTotLV: 3 } };
    events579()._customBlock_Windwalker = (kind, i) => {
        if (kind === "CompassBonus") return gga.Compass[0][i];
        if (kind === "CompassUpgCost") return 10 * (gga.Compass[0][i] + 1);
        return 0;
    };
}
const compassOn = (ids, extra = {}) => ({ compass: ids.map((id) => ({ id, on: true, ...extra })), compassSaving: 10 });

test("the Compass buys only what it shows; a hidden upgrade switched on starts once a path level shows it", async () => {
    setCompass();
    // Only Pathfinder shows at first: upgrades 1 to 4 wait though switched on.
    const before = readComputed("automation", "compass").value.upgrades.map(({ id, open }) => [id, open]);
    assert.deepEqual(before, [
        [0, true],
        [1, false],
        [2, false],
        [3, false],
        [4, false],
    ]);
    await run("automation compass", compassOn([0, 1, 2, 3, 4], { stopAt: 1 }));
    // Pathfinder (10) shows the paths, Elemental Path (10) then shows upgrade 2 (10 moondust); upgrade 3 needs a
    // second Elemental Path level, which the stop-at of 1 holds back.
    assert.deepEqual(gga.Compass[0], [1, 1, 1, 0, 0]);
    assert.equal(gga.OptionsListAccount[STARDUST], 980);
    assert.equal(gga.OptionsListAccount[MOONDUST], 990);
    assert.equal(gga.OptionsListAccount[480], 3, "the masterclass level counter counts each level");
    assert.equal("CompassTotLV" in gga.DNSM.h, false, "the cached total level is dropped");

    // A second Elemental Path level shows upgrade 3.
    await run("automation compass", {
        compass: [
            { id: 1, on: true, stopAt: 2 },
            { id: 3, on: true, stopAt: 1 },
        ],
        compassSaving: 10,
    });
    assert.deepEqual(gga.Compass[0], [1, 2, 1, 1, 0]);
});

test("the Compass pays its dust to the last bit, unlike the Grimoire's 0.1", async () => {
    setCompass();
    gga.OptionsListAccount[STARDUST] = 10;
    await run("automation compass", compassOn([0]));
    assert.equal(gga.Compass[0][0], 1);
    assert.equal(gga.OptionsListAccount[STARDUST], 0);
});

test("the Compass waits while its menu is open and says so; nothing else does", async () => {
    setCompass();
    state.updateCheatConfig({ automation: compassOn([0]) });
    await cheat("automation compass", true);
    gga.MenuType2 = 76;
    mock.timers.tick(1000);
    assert.equal(gga.Compass[0][0], 0);
    assert.equal(automation("automation compass").status, "Paused while the Compass is open");
    gga.MenuType2 = 0;
    mock.timers.tick(1000);
    assert.equal(gga.Compass[0][0], 1);
    assert.equal(automation("automation compass").status, "Buying 1 upgrade; 1 level bought since it started");
    await cheat("automation compass", false);
});

// ---- Tesseract ---------------------------------------------------------------------------------------------------

const PURPLE = 388;
const SILVER = 392;
// [name, _, _, tachyon, max level, _, total levels that unlock it, _, _, its line]
const ARCANE = [
    ["Arcanist_Damage", 0, 0, 0, 999999, 1, 0, 0, 0, "+{_Base_Damage"],
    ["Silver_Thing", 0, 0, 4, 2, 1, 0, 0, 0, "+{%_Silver"],
    ["Locked_Thing", 0, 0, 0, 999999, 1, 50, 0, 0, "+{%_Later"],
    ["Boundless_Energy", 0, 0, 0, 1, 1, 0, 0, 0, "Soon"],
].map((row) => row.map(String));

function setTesseract() {
    inTown();
    gga.CustomLists.h.ArcaneUpg = ARCANE;
    gga.Arcane = [0, 0, 0, 0];
    gga.OptionsListAccount = Object.assign(Array(500).fill(0), { [PURPLE]: 25, [SILVER]: 25, 480: 0 });
    gga.DNSM = { h: { ArcaneTotLV: 0 } };
    events579()._customBlock_ArcaneType = (kind, i) => {
        if (kind === "ArcaneUpgUNLOCKED") return 2;
        if (kind === "ArcaneUpgCost") return 10 * (gga.Arcane[i] + 1);
        if (kind === "ArcaneUpgBonus") return gga.Arcane[i] * 2;
        return 0;
    };
}

test("the Tesseract buys with each tachyon on its own, Silver like any other, and leaves at least 0.1", async () => {
    setTesseract();
    await run("automation tesseract", {
        tesseract: [0, 1, 2, 3].map((id) => ({ id, on: true })),
        tesseractSaving: 10,
    });
    // Purple 25: row 0 at 10, then 20 is more than the 15 left. Silver 25: row 1 at 10, then 20 > 15.
    assert.deepEqual(gga.Arcane, [1, 1, 0, 0], "row 2 is locked and Boundless Energy is a placeholder");
    assert.equal(gga.OptionsListAccount[PURPLE], 15);
    assert.equal(gga.OptionsListAccount[SILVER], 15);
    assert.equal(gga.OptionsListAccount[480], 2);
    assert.equal("ArcaneTotLV" in gga.DNSM.h, false);

    setTesseract();
    gga.OptionsListAccount[SILVER] = 10;
    await run("automation tesseract", { tesseract: [{ id: 1, on: true }], tesseractSaving: 10 });
    assert.equal(gga.OptionsListAccount[SILVER], 0.1);
});

test("the Tesseract tab reads the tachyons in use, each upgrade's bonus and what unlocks it", () => {
    setTesseract();
    gga.Arcane = [3, 0, 0, 0];
    state.updateCheatConfig({ automation: { tesseract: [{ id: 2, on: true, save: true }] } });
    const { currencies, upgrades } = readComputed("automation", "tesseract").value;
    assert.deepEqual(
        currencies.map(({ name, goal }) => [name, goal]),
        [
            ["purple", null],
            ["silver", null],
        ],
        "a locked upgrade is nothing to save for"
    );
    assert.deepEqual(
        upgrades.map(({ id, currency, max, open, unlockAt, bonus }) => [id, currency, max, open, unlockAt, bonus]),
        [
            [0, "purple", null, true, 0, "+6 Base Damage"],
            [1, "silver", 2, true, 0, "+0% Silver"],
            [2, "purple", null, false, 50, "+0% Later"],
        ]
    );
});

// ---- Royal Armory ------------------------------------------------------------------------------------------------

// Upgrade ids by shelf position: position p holds id SHELF[p]. The game reads the resource paid and the unlock total
// by position, the max by id.
const SHELF = ["2", "0", "1"];
// [name, _, _, resource, max level, _, total levels that unlock it, _, _, its line]
const ARMORY = [
    ["Zero", 0, 0, 5, 3, 1, 0, 0, 0, "+{%_Zero"],
    ["One", 0, 0, 6, 999999, 1, 0, 0, 0, "+{%_One"],
    ["Two", 0, 0, 7, 1, 1, 9, 0, 0, "+{%_Two"],
].map((row) => row.map(String));
const PARCHMENT = "RGenh";

function setArmory({ parchments = 0, unlocked = 2, random = [] } = {}) {
    inTown();
    Object.assign(gga.CustomLists.h, {
        ArmoryUpg: ARMORY,
        Research: Object.assign([], {
            43: SHELF,
            // Statue lines: two statues, then one still to come.
            40: ["Power_Statue千+{%_Power", "Speed_Statue千+{%_Speed", "4"],
        }),
    });
    gga.RoyalG = [[2, 1, 0], Array(10).fill(100), [0, 0, 0]];
    gga.OptionsListAccount = Object.assign(Array(500).fill(0), { 480: 0 });
    gga.InventorySlotsOwned = 0;
    gga.InventoryOrder = [];
    gga.ItemQuantity = [];
    gga.Refinery = [[], [], []];
    gga.ChestSlotsOwned = 1;
    gga.ChestOrder = [PARCHMENT];
    gga.ChestQuantity = [parchments];
    const world = { calls: [], removed: [] };
    // The Royal Guardian's menu and its buy event "b": the shelf at _GenINFO[204] is paid for and levelled.
    const guardian = { _GenINFO: Object.assign([], { 204: -1 }) };
    guardian._customEvent_RG_Stuff = () => {
        const p = guardian._GenINFO[204];
        world.calls.push([guardian._TRIGGEREDtext, p]);
        gga.RoyalG[1][Number(ARMORY[p][3])] -= 10 * (p + 1);
        gga.RoyalG[2][Number(SHELF[p])] += 1;
    };
    gga.PixelHelperActor = Object.assign([], {
        27: { behaviors: { getBehavior: (name) => name === "ActorEvents_741" && guardian } },
    });
    const owned = { _ItemsAndStorageOWNED: { h: {} } };
    owned._customEvent_PostOfficeIMG = () => {
        owned._ItemsAndStorageOWNED.h = { [PARCHMENT]: gga.ChestQuantity[0] };
    };
    gga.PixelHelperActor[5] = {
        behaviors: { getBehavior: (name) => name === "ActorEvents_232" && owned },
        shout: (event) => owned[event](),
    };
    events579()._customBlock_RoyalG = (kind, i) => {
        if (kind === "ArmoryUpgUNLOCKED") return unlocked;
        if (kind === "ArmoryUpgCost") return 10 * (i + 1);
        if (kind === "ArmoryUpgBonus") return 0;
        if (kind === "Statue_Cost") return 1;
        if (kind === "Statue_CanAfford") return 1; // as w6.royal forces it
        if (kind === "ParchmentRecycle") return 0.25;
        if (kind === "StatueUpgOdds") return 0.5;
        throw new Error(`unexpected RoyalG ${kind}`);
    };
    context["scripts.ActorEvents_189"]._customBlock_removeitems = (item, amount, where) => {
        world.removed.push([item, amount, where]);
        gga.ChestQuantity[0] -= amount;
    };
    // Each roll draws twice: the recycle chance, then the level-up odds.
    let draw = 0;
    mock.method(Math, "random", () => random[draw++] ?? 0.99);
    return world;
}

test("the Armory checks the shelf itself, then buys through the game's own buy event", async () => {
    const world = setArmory();
    gga.RoyalG[1][5] = 25;
    await run("automation armory", {
        armory: [0, 1, 2].map((id) => ({ id, on: true })),
        armorySaving: 10,
        statues: [],
    });
    // Position 0 (id 2, max 1) pays resource 5 (ARMORY[0][3], read by position) at 10, once. Position 1 (id 0, max 3)
    // pays resource 6 at 20, three times. Position 2 is locked.
    assert.deepEqual(world.calls[0], ["b", 0], "the game's buy event, on the shelf position");
    assert.equal(gga.RoyalG[2][2], 1, "id 2 reached its max of 1");
    assert.equal(gga.RoyalG[2][0], 3, "id 0 reached its max of 3");
    assert.equal(gga.RoyalG[2][1], 0, "position 2 is locked");
    assert.equal(gga.RoyalG[1][5], 15);
    assert.equal(gga.RoyalG[1][6], 40);
    const guardian = gga.PixelHelperActor[27].behaviors.getBehavior("ActorEvents_741");
    assert.equal(guardian._GenINFO[204], -1, "the menu's picked shelf is put back");
    mock.restoreAll();
});

test("the Armory skips what it can't afford and stops at the stop-at", async () => {
    const world = setArmory();
    gga.RoyalG[1][5] = 9;
    await run("automation armory", {
        armory: [
            { id: 2, on: true },
            { id: 0, on: true, stopAt: 1 },
        ],
        armorySaving: 10,
        statues: [],
    });
    assert.deepEqual(world.calls, [["b", 1]], "9 doesn't reach 10; id 0 stops at level 1");
    mock.restoreAll();
});

test("statues roll with parchments, lowest level first, up to the stop-at; a recycled parchment stays", async () => {
    // Rolls: statue 1 (level 1) keeps its parchment (0.1 < 0.25) and levels (0.1 < 0.5); now both are level 2 and
    // statue 0 goes first: it pays (0.9) and misses (0.9); then statue 0 again pays (0.9) and levels (0.1). Statue 1
    // pays (0.9) and misses (0.9): no parchments are left.
    const world = setArmory({ parchments: 3, random: [0.1, 0.1, 0.9, 0.9, 0.9, 0.1, 0.9, 0.9] });
    await run("automation armory", {
        armory: [],
        statues: [
            { id: 0, on: true, stopAt: 5 },
            { id: 1, on: true },
            { id: 2, on: true },
        ],
    });
    assert.deepEqual(gga.RoyalG[0], [3, 2, 0], "statue 2 is locked: unlocking stays manual");
    assert.equal(gga.ChestQuantity[0], 0);
    assert.deepEqual(world.removed, [
        [PARCHMENT, 1, "InventoryStorage"],
        [PARCHMENT, 1, "InventoryStorage"],
        [PARCHMENT, 1, "InventoryStorage"],
    ]);
    mock.restoreAll();
});

test("statues never roll without a parchment, though the game's own check is forced to yes", async () => {
    const world = setArmory({ parchments: 0, random: [0, 0] });
    await run("automation armory", { armory: [], statues: [{ id: 0, on: true }] });
    assert.deepEqual(gga.RoyalG[0], [2, 1, 0]);
    assert.deepEqual(world.removed, []);
    mock.restoreAll();
});

test("a statue at its stop-at rolls no more, and the status counts rolls", async () => {
    setArmory({ parchments: 10, random: [0.9, 0.1] });
    state.updateCheatConfig({
        automation: {
            armory: [],
            statues: [
                { id: 0, on: true, stopAt: 2 },
                { id: 1, on: true, stopAt: 2 },
            ],
        },
    });
    await cheat("automation armory", true);
    mock.timers.tick(1000);
    assert.deepEqual(gga.RoyalG[0], [2, 2, 0], "statue 1 rolled once and levelled; statue 0 was already at 2");
    assert.equal(gga.ChestQuantity[0], 9);
    assert.equal(automation("automation armory").status, "Rolling 2 statues; 1 roll, 1 level since it started");
    await cheat("automation armory", false);
    mock.restoreAll();
});

test("the Armory names wheat, berries, sticks and spider webs, and the rest by world and place", () => {
    setArmory();
    // Positions 0 and 1 pay resources 0 and 3; position 2 keeps resource 7.
    gga.CustomLists.h.ArmoryUpg = ARMORY.map((row, p) => (p < 2 ? Object.assign([...row], { 3: ["0", "3"][p] }) : row));
    state.updateCheatConfig({ automation: { armory: [], statues: [] } });
    const { currencies } = readComputed("automation", "armory").value;
    assert.deepEqual(currencies.map(({ name }) => name).sort(), ["Spider webs", "W1 resource 8", "Wheat"]);
    mock.restoreAll();
});

test("the Armory tab reads the resources in use, the statues and the parchments held", () => {
    setArmory({ parchments: 7 });
    state.updateCheatConfig({ automation: { armory: [], statues: [] } });
    const { currencies, upgrades, statues, parchments } = readComputed("automation", "armory").value;
    assert.deepEqual(
        currencies.map(({ name }) => name),
        ["W1 resource 6", "W1 resource 7", "W1 resource 8"]
    );
    assert.deepEqual(
        upgrades.map(({ id, currency, max, open, unlockAt }) => [id, currency, max, open, unlockAt]),
        [
            [2, "W1 resource 6", 1, true, 0],
            [0, "W1 resource 7", 3, true, 0],
            [1, "W1 resource 8", null, false, 9],
        ],
        "in shelf order, the resource and unlock read by position"
    );
    assert.equal(parchments, 7);
    assert.deepEqual(
        statues.map(({ id, level, odds }) => [id, level, odds]),
        [
            [0, 2, 0.5],
            [1, 1, 0.5],
        ]
    );
    mock.restoreAll();
});
