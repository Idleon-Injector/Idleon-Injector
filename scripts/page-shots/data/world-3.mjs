/**
 * World 3: construction (buildings, cogs), printer, refinery, salt lick, atom collider, hat rack, armor smithy,
 * worship, prayers, death note, library, equinox. Traps live on the characters (shared.mjs).
 */
import { h, level, list } from "./helpers.mjs";
import { ITEMS, MONSTERS, PLAYERS } from "./shared.mjs";
import {
    ATOMS,
    DREAM_CHALLENGES,
    DREAM_UPGRADES,
    NOT_LIBRARY_BOOKS,
    PREMIUM_HATS,
    PRAYERS,
    SALT_LICKS,
    SET_BONUSES,
    SET_KEYS,
    TALENT_TEXTS,
    TOWERS,
    TALENT_NAMES,
    TALENT_ORDER,
} from "./world-3-game.mjs";

const BUILDINGS = TOWERS.length;
const COG_SLOTS = 252;
const TALENTS = TALENT_NAMES.length;
const CLOUDS = 10;
const atomMax = (i) => 20 + (i % 3) * 10;
const ITEM_IDS = Object.keys(ITEMS).filter((id) => id.startsWith("item"));
const HATS = PREMIUM_HATS.map(([id]) => id);
const SETS = SET_KEYS;
const towerMax = (i) => Number(TOWERS[i][8]);

/** A cog name: tiny cogs are "CogSm<type><tier>", the rest "Cog<tier><type>". */
const cog = (slot) => {
    if (slot >= 228) return slot % 3 === 0 ? "Blank" : `CogSm${"abc"[slot % 3]}${slot % 6}`;
    if (slot >= 96 && slot < 108) return slot % 4 === 0 ? `Player_Lumi_${["Main", "Alt", "Third"][slot % 3]}` : "Blank";
    return slot % 5 === 0 ? "Blank" : `Cog${1 + (slot % 4)}${"ABCD"[slot % 4]}${String(slot % 10).padStart(2, "0")}`;
};
const cogStats = (slot) =>
    cog(slot) === "Blank" ? h({}) : h({ a: 10 + (slot % 30), b: slot % 7, ...(slot % 3 ? {} : { d: 25, g: 5 }) });

const talentLevel = (id) => (id % 9 === 4 ? 0 : (id * 7) % 100);

// Shared by every fakeGameData() call, so two calls compare equal.
const computed = {
    _customBlock_WorkbenchStuff: {
        maxBookLv: 150,
        ExtraMaxLvAtom: (baseMax, i) => (i % 4 === 0 ? 10 : 0),
        // Construction › Automation: what a level needs and costs, and the build slots (the first two gilded, x3).
        TowerBuildReq: (b) => 1000 + 250 * b,
        TowerSaltCost: (b) => 40 * (b + 1),
        TowerBuildSlots: 8,
        TotalGildedSlots: 2,
        TotalGildedBoostio: 3,
    },
    // The 8th build slot feeds the Menagerie jelly.
    _customBlock_MenagerieStuff: { SideJellyUnlocked: 1 },
    _customBlock_SkillStats: { WorshipChargeMax: 520 },
    _customBlock_AtomCollider: { AtomMaxLv: atomMax },
    _customBlock_Dreamstuff: {
        BarFillReq: 10000,
        BarFillRate: 35,
        UpgUnlocked: DREAM_UPGRADES.length - 2,
        UpgMaxLV: (i) => [5, 10, 25, 50, 100][(i + 3) % 5],
    },
};

// The construction menu's behavior: [3] its tab, [12][0] build rate per hour, [17] no building selected.
const constructionMenu = () => ({ _GenINFO: { 3: 0, 12: [420], 17: -1 } });

export default () => ({
    gga: {
        // [i] building level, [i + 27] the level it builds toward (one ahead: built, waiting for salt), [54..61] the
        // build slots, [62..65] cog crafting, [66 + i] build progress.
        TowerInfo: [
            ...list(BUILDINGS, (i) => (i === 0 ? 3 : level(i, towerMax(i)))),
            ...list(BUILDINGS, (i) => (i === 0 ? 3 : level(i, towerMax(i))) + (i === 6 || i === 12 ? 1 : 0)),
            ...[1, 8, 20, 11, 16, -1, -1, -1],
            0,
            0,
            0,
            0,
            ...list(BUILDINGS, (i) => (i * 370) % 1600),
        ],
        // 0 locked, positive charging, -11 or lower unlocked.
        // The first 60 board slots and a few side slots (96, 100, ...: tiny cogs) unlocked, then some charging.
        FlagUnlock: list(120, (i) => (i < 60 || (i >= 96 && i % 4 === 0) ? -11 : i < 70 ? 1000 * (i - 59) : 0)),
        FlagsPlaced: [61, 64, -1, -1],
        CogOrder: list(COG_SLOTS, cog),
        CogMap: list(COG_SLOTS, cogStats),
        // Per character: samples from [5 + 14c] and prints from [15 + 14c], as item, amount pairs.
        Printer: list(5 + 14 * PLAYERS.length, (i) => (i < 5 ? 0 : i % 2 ? ITEM_IDS[i % ITEM_IDS.length] : 1000 * i)),
        PrinterXtra: list(10 * PLAYERS.length, (i) => (i % 2 ? 500 * i : ITEM_IDS[(i + 3) % ITEM_IDS.length])),
        GemItemsPurchased: list(200, (i) => (i === 114 ? 2 : i % 4)),
        // [3..11]: refineries as [salt stored, level].
        Refinery: list(12, (i) => (i < 3 ? [0, 0] : [i * 1500, level(i, 60)])),
        SaltLick: SALT_LICKS.map((lick, i) => level(i, Number(lick[4]))),
        Atoms: ATOMS.map((_, i) => level(i, atomMax(i))),
        Spelunk: { 46: HATS.slice(0, 5) },
        Cards: { 1: HATS.slice(5, 8) },
        // Slot 15 is the attire slot (account.mjs, Attire Rack).
        EquipmentOrder: [
            ["SetPiece0", "SetPiece1", "SetPiece2", "SetPiece3", "item1", ...list(10, () => "Blank"), "EquipmentGown3"],
            ["SetPiece4", ...list(7, () => "Blank")],
            // Food (the Wardrobe page).
            ["FoodG2", "FoodHealth1", ...list(14, () => "Blank")],
        ],
        TotemInfo: [[42, 30, 18, 0, 55, 12, 0, 8]],
        PrayersUnlocked: PRAYERS.map((prayer, i) => (i % 6 === 5 ? 0 : Math.min(Number(prayer[9]), 1 + (i % 15)))),
        Ninja: { 105: list(6, (i) => i * 12) },
        SkillLevels: list(TALENTS, talentLevel),
        SkillLevelsMAX: list(TALENTS, (id) => (id % 13 === 0 ? -1 : 100 + (id % 3) * 50)),
        // [0] bar fill, [2..] upgrade levels (the first also sets how many clouds show: three).
        Dream: [4200, 0, 3, ...DREAM_UPGRADES.slice(1).map((_, i) => level(i + 1, 5))],
        // Cloud progress, part of the way to what each needs; -1 is a cloud not active.
        WeeklyBoss: {
            h: Object.fromEntries(
                list(CLOUDS, (i) => [`d_${i}`, i < 6 ? Math.floor((Number(DREAM_CHALLENGES[i][1]) * i) / 5) : -1])
            ),
        },
        // [34] the game's busy flag, clear.
        OptionsListAccount: { 34: 0, 379: "0,COPPER_SET,GOLD_SET" },
        PixelHelperActor: { 8: { behaviors: { getBehavior: constructionMenu } } },
        CustomMaps: {
            h: {
                FishPools: h({}),
                MonsterDrops: h(
                    Object.fromEntries(
                        MONSTERS.map((id, i) => [
                            id,
                            [
                                ["COIN", 1, 1, "N/A"],
                                [ITEM_IDS[i % ITEM_IDS.length], 1, 1, "N/A"],
                            ],
                        ])
                    )
                ),
                // [main parts, extra parts, optional parts, [extra parts needed, needs one optional]]
                EquipmentSets: h(
                    Object.fromEntries(
                        SETS.map((key, i) => [
                            key,
                            [
                                list(3, (p) => `SetPiece${i * 3 + p}`),
                                [`SetPiece${(i + 4) % 12}`],
                                [],
                                [String(i % 2), "0", ...SET_BONUSES[key].slice(2)],
                            ],
                        ])
                    )
                ),
            },
        },
        DNSM: { h: { TalentDL2: [12, 40, 7, 0], PrayNonEq: 0 } },
        CustomLists: {
            h: {
                // [0] name, [1] description, [2] bonus per level, [4] salt, [5] second material, ..., [8] base max level.
                TowerInfo: TOWERS,
                FlagReqs: list(96, (i) => String(100 + i * 20)),
                NonAFKmonsters: [MONSTERS[29]],
                // [salt, bonus, ?, ?, max level]
                SaltLicks: SALT_LICKS,
                AtomInfo: ATOMS,
                // [name, bonus text, curse text, bonus per level, curse per level, ?, ?, wave, trial, max level]
                PrayerInfo: PRAYERS,
                // [x, y, trial monster]
                WorshipBASEinfos: list(8, (i) => ["0", "0", MONSTERS[i * 3]]),
                NinjaInfo: { 30: MONSTERS.slice(10, 16) },
                RANDOlist: {
                    9: ["1", "20", "40", "60", "80", "100", "125", "150"],
                    16: NOT_LIBRARY_BOOKS,
                    113: [...SETS],
                },
                // 15 talent slots per class page, then the special talents.
                TalentOrder: TALENT_ORDER,
                TalentIconNames: TALENT_NAMES,
                TalentDescriptions: TALENT_TEXTS.map((first) => [[first], ["0"]]),
                DreamUpg: DREAM_UPGRADES,
                // [challenge, progress needed, reward]
                DreamChallenge: DREAM_CHALLENGES,
            },
        },
    },
    computed,
});
