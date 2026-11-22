/** World 5: sailing, divinity, gaming, the hole, slab, greenstack. */
import { fakeName, h, level, list } from "./helpers.mjs";
import { ITEMS } from "./shared.mjs";
import {
    ARTIFACTS,
    CAPTAIN_BONUSES,
    COSMO_UPGRADES,
    FOUNTAIN_UPGRADES,
    GAMING_UPGRADES,
    GODS,
    HOLES_BUILDINGS,
    HOLES_INFO,
    ISLANDS,
    LAMP_WISHES,
    PALETTE,
    RANDO_LISTO_2,
    SUPERBITS,
} from "./world-5-game.mjs";

const BOATS = 13;
const CAPTAIN_SLOTS = 34;
const HIRED = 12;
const TREASURES = 1 + ISLANDS.length * 2;
// The game's letters for its superbits run past the alphabet; the base data stops at "z".
const LETTERS = "_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^`{|}~";

// The client's code doesn't name the sailing treasures or cove shapes (the game fills them in later): stand-ins.
const itemNames = {
    ...Object.fromEntries(
        list(TREASURES, (n) => [`SailTr${n}`, h({ displayName: n === 0 ? "Gold_Bar" : `${fakeName(n)}_Treasure` })])
    ),
    ...Object.fromEntries(
        list(12, (s) => [`HoleGshape${s}`, h({ displayName: `${s < 6 ? "Blue" : "Purple"}_${fakeName(s + 3)}` })])
    ),
};

const holes = () => {
    const parts = list(40, () => []);
    parts[1] = [12, 9, 7, 5, 3, 1, 0, 0];
    parts[2] = parts[1].map((lv) => lv * 1234.5);
    parts[3] = parts[1].map((lv) => Math.floor(lv / 2));
    parts[4] = list(9, (i) => level(i, 5));
    parts[5] = list(12, (i) => level(i + 1, 10));
    parts[6] = list(12, (i) => level(i + 2, 3));
    parts[7] = list(20, (i) => (i < 18 ? (i * 7) % 13 : 0));
    parts[8] = list(10, (i) => (i * 3) % 8);
    parts[9] = list(40, (i) => (i < 10 ? 25000 * (10 - i) ** 2 : 40 * i + 0.5));
    parts[11] = list(90, (i) => (i * 37) % 500);
    parts[11][24] = 7;
    parts[11][80] = 1;
    parts[11][84] = 9;
    parts[13] = list(HOLES_BUILDINGS.length, (i) => (i % 3 === 0 ? 1 : 0));
    parts[14] = [140, 0, 96, 0, 30, 0];
    parts[15] = list(30, (i) => level(i, 20));
    parts[16] = list(6, (i) => level(i, 30));
    parts[17] = list(7, (i) => level(i + 3, 15));
    parts[19] = list(12, (i) => (i % 2 ? 120.5 * i : level(i, 40)));
    parts[21] = list(LAMP_WISHES.length, (i) => i % 4);
    parts[22] = list(17, (i) => level(i, 25));
    parts[24] = list(40, (i) => (i % 5 === 4 ? 0 : 1 + (i % 6)));
    parts[26] = list(20, (i) => (i < 12 ? level(i, 8) : 0));
    parts[30] = list(9, (c) => (c < 5 ? c * 2 : -1));
    parts[31] = list(3, (w) => list(FOUNTAIN_UPGRADES[w].length, (n) => level(n + w, 12)));
    parts[32] = list(3, (w) => list(FOUNTAIN_UPGRADES[w].length, (n) => (n + w) % 4));
    parts[33] = [0.62, 0.18, 0];
    return parts;
};

export default () => ({
    gga: {
        // [0] islands' cloud progress (-1 once unlocked), [1] treasures, [3] artifact tiers.
        Sailing: [
            list(ISLANDS.length, (i) => (i < 9 ? -1 : i === 9 ? 1200 : 0)),
            list(TREASURES, (n) => (n === 0 ? 48213 : n < 20 ? 1500 * (20 - n) + 0.4 : 0)),
            [],
            list(ARTIFACTS.length, (i) => (i < 30 ? [1, 2, 3, 4, 5, 2, 1][i % 7] : 0)),
        ],
        // [0] captain, [1] island, [3] Loot Value level, [5] Speed level.
        Boats: list(BOATS, (b) => [b % HIRED, b % 9, 0, 40 + b * 13, 0, 25 + b * 9, 0, 0]),
        // Slots 0-29 are hired (rarity -1: empty), 30 and up the Recruitment pool.
        Captains: list(CAPTAIN_SLOTS, (c) =>
            c < HIRED || c >= 30
                ? [c % 7, c % 5, (c + 2) % 5, 20 + ((c * 9) % 60), 1800.5 * (c + 1), 3 + (c % 4), 2 + (c % 3)]
                : [-1, 0, 0, 0, 0, 0, 0]
        ),
        GemItemsPurchased: { 8: 3 },
        // [25] gods unlocked, [28..37] blessing levels.
        // [39] particles (Alchemy automation reads it).
        Divinity: list(40, (i) => (i === 25 ? 8 : i >= 28 && i < 38 ? level(i, 60) : (i * 3) % 12)),
        // [11] Log Book (a letter per plant), [12] superbits unlocked (as letters), the rest numbers.
        Gaming: list(15, (i) =>
            i === 11 ? "jjjhhe" : i === 12 ? "_abcfgkmnqABCH" : i === 4 ? 6 : 1000 * (i + 1) + i * 37.5
        ),
        // [25 + n] import n, [33] the King Rat's upgrades.
        GamingSprout: list(34, (i) =>
            i === 33 ? [0, 12, 7, 3] : i >= 25 ? [level(i, 30), 0, 0, 0] : [i % 5, i * 10, i % 3, 0]
        ),
        Number2Letter: LETTERS.split(""),
        // [11] reclaimed Rat King crowns.
        Research: { 11: ["0_", "0a", "0b", "1_", "1a", "2_", "3_", "3a", "3b", "3c"] },
        // [9] palette levels, [49] Black Stars.
        Spelunk: { 9: list(PALETTE.length, (i) => level(i, 25)), 49: list(PALETTE.length, (i) => i % 3) },
        Holes: holes(),
        GreenStacks: Object.keys(ITEMS).slice(0, 12),
        OptionsListAccount: {
            192: 77,
            355: 2,
            601: 14,
            604: 3,
            ...Object.fromEntries(list(24, (n) => [630 + n, level(n, 10)])),
            ...Object.fromEntries(list(12, (s) => [654 + s, 1200 * (s + 1) + 0.5])),
            666: 2,
            667: 0,
            668: 18400,
        },
        ItemDefinitionsGET: { h: itemNames },
        CustomLists: {
            h: {
                IslandInfo: ISLANDS,
                ArtifactInfo: ARTIFACTS,
                CaptainBonuses: CAPTAIN_BONUSES,
                GodsInfo: GODS,
                GamingUpgrades: GAMING_UPGRADES,
                RandoListo2: { 1: RANDO_LISTO_2[1], 11: RANDO_LISTO_2[11], 12: RANDO_LISTO_2[12] },
                GamingPalette: PALETTE,
                GamingUpg: SUPERBITS,
                HolesInfo: HOLES_INFO,
                HolesBuildings: HOLES_BUILDINGS,
                CosmoUpgrades: COSMO_UPGRADES,
                HoleFountUPG: FOUNTAIN_UPGRADES,
                LampWishes: LAMP_WISHES,
                SlabItemSort: Object.keys(ITEMS),
            },
        },
    },
});
