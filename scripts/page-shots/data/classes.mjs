/**
 * The Classes pages: the masterclasses' upgrades with the game's own lists (classes-game.mjs), their levels, and the
 * bones, dust, tachyons and royal resources they spend.
 */
import { list } from "./helpers.mjs";
import {
    ARCANE_UPG,
    ARMORY_ORDER,
    ARMORY_UPG,
    COMPASS_UPG,
    GRIMOIRE_UPG,
    ORBLET_MARKET,
    ROYAL_RESOURCES,
    ROYAL_STATUES,
} from "./classes-game.mjs";

// A level that looks played: an upgrade with a max is often maxed, one without is somewhere along the way.
const levels = (defs, maxAt) =>
    defs.map((row, i) => {
        const max = Number(row[maxAt]);
        if (i % 6 === 4) return 0;
        if (max < 999999) return i % 3 === 0 ? max : Math.min(max, 1 + ((i * 7) % max));
        return 5 + ((i * 37) % 240);
    });

// What each path's first upgrade's level shows in the Compass, in order (the game's RANDOlist[105] to [108]).
const COMPASS_PATHS = [
    "3 2 4 5 106 8 12 6 7 107 118 10 110 116 9 113 11 114 109 108 117 115 112 111",
    "14 17 119 18 120 16 15 21 122 124 19 123 20 121 22 129 125 130 134 128 127 133 24 25 132 131 23 135 26 136 126",
    "28 29 139 35 137 30 142 34 140 141 32 145 31 37 138 38 146 33 144 36 148 147 150 149 39 143",
    "42 41 43 44 45 154 151 47 152 49 48 155 46 52 50 157 53 158 153 56 51 156 164 55 163 57 162 159 167 54 161 58 166 160 165 168 169 59",
].map((path) => path.split(" "));

// The levels the prices, bonuses and odds below are worked out from: fixed, so every fixture answers alike (the page
// reads the fixture's own copy of them).
const GRIMOIRE_LV = levels(GRIMOIRE_UPG, 4);
const ARCANE_LV = levels(ARCANE_UPG, 4);
const COMPASS_LV = levels(COMPASS_UPG, 4);
const ARMORY_LV = levels(ARMORY_UPG, 4);
const STATUES = [3, 1, 0, 7, 0, 0, 0, 0];
// The masterclass automations' prices: a base that grows by the row's own rate per level.
const price = (row, level) => Number(row[1]) * Number(row[2]) ** level;
const COMPUTED = {
    _customBlock_Summoning: { GrimoireUpgBonus: (i) => GRIMOIRE_LV[i] * Number(GRIMOIRE_UPG[i][5]) },
    _customBlock_Windwalker: {
        CompassBonus: (i) => COMPASS_LV[i] * Number(COMPASS_UPG[i][5]),
        CompassUpgCost: (i) => price(COMPASS_UPG[i], COMPASS_LV[i]),
    },
    _customBlock_ArcaneType: {
        ArcaneUpgUNLOCKED: 40,
        ArcaneUpgCost: (i) => price(ARCANE_UPG[i], ARCANE_LV[i]),
        ArcaneUpgBonus: (i) => ARCANE_LV[i] * Number(ARCANE_UPG[i][5]),
    },
    // The Armory's price takes the shelf position; the statue odds are the game's formula.
    _customBlock_RoyalG: {
        ArmoryUpgUNLOCKED: 60,
        ArmoryUpgCost: (p) => 25 * 1.24 ** p * (3 + 5 * p),
        ArmoryUpgBonus: (id) => ARMORY_LV[id] * Number(ARMORY_UPG[id][5]),
        StatueUpgOdds: (s) => 1 / (10 * Math.ceil(((25 + 15 * s ** 2) * Math.max(1, 1 + (STATUES[s] - 1) / 4)) / 10)),
    },
};

export default () => ({
    gga: data(levels(GRIMOIRE_UPG, 4), levels(ARCANE_UPG, 4), levels(COMPASS_UPG, 4), levels(ARMORY_UPG, 4), [
        ...STATUES,
    ]),
    computed: COMPUTED,
});

const data = (grimoire, arcane, compass, armory, statues) => ({
    Grimoire: grimoire,
    Arcane: arcane,
    // [0] levels, [1] titans slain (1), [2] portals opened.
    Compass: { 0: compass, 1: [1, 1, 0, 1, 0], 2: [] },
    // [0] royal statues, [1] royal resources, [2] armory, [4] node collected, [5] node grades, [23] Lil' Orblet Shop.
    RoyalG: {
        0: statues,
        1: list(40, (i) => (i % 10 > 7 ? 0 : (i * 1777) % 25000)),
        2: armory,
        4: list(80, (i) => (i % 4 === 0 ? -1 : (i * 97) % 600)),
        5: list(80, (i) => i % 4),
        23: levels(ORBLET_MARKET, 3),
    },
    // 329-333: bones (total, femur, ribcage, cranium, bovinae), 367: AFK Bones; 357-362: dust; 388-394: tachyons.
    OptionsListAccount: {
        329: 61950,
        330: 48200,
        331: 9100,
        332: 650,
        333: 0,
        357: 182000,
        358: 41500,
        359: 7300,
        360: 980,
        361: 12,
        362: 231792,
        367: 1,
        388: 820000,
        389: 155000,
        390: 31000,
        391: 4200,
        392: 640,
        393: 9,
        394: 1010849,
    },
    CustomLists: {
        h: {
            GrimoireUpg: GRIMOIRE_UPG,
            ArcaneUpg: ARCANE_UPG,
            CompassUpg: COMPASS_UPG,
            ArmoryUpg: ARMORY_UPG,
            OrbletMarket: ORBLET_MARKET,
            RoyalResources: ROYAL_RESOURCES,
            Research: { 40: ROYAL_STATUES[0], 41: ROYAL_STATUES[1], 42: ROYAL_STATUES[2], 43: ARMORY_ORDER },
            RANDOlist: { 105: COMPASS_PATHS[0], 106: COMPASS_PATHS[1], 107: COMPASS_PATHS[2], 108: COMPASS_PATHS[3] },
            Titans: list(5, (t) => [`Titan_${t + 1}`]),
        },
    },
});
