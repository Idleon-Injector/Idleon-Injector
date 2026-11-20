/**
 * World 3: construction (buildings, cogs), printer, refinery, salt lick, atom collider, hat rack, armor smithy,
 * worship, prayers, death note, library, equinox. Traps live on the characters (shared.mjs).
 */
import { fakeName, h, level, list, upgradeDefs, upgradeLevels } from "./helpers.mjs";
import { ITEMS, MONSTERS } from "./shared.mjs";

const BUILDINGS = 27;
const COG_SLOTS = 252;
const PRAYERS = 20;
const TALENTS = 640;
const DREAM_UPGRADES = 12;
const CLOUDS = 10;
const ITEM_IDS = Object.keys(ITEMS).filter((id) => id.startsWith("item"));
const HATS = Object.keys(ITEMS).filter((id) => id.startsWith("EquipmentHatsPrem"));
const SETS = ["COPPER_SET", "IRON_SET", "GOLD_SET", "MOSSY_SET"];

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
    _customBlock_WorkbenchStuff: { maxBookLv: 150, ExtraMaxLvAtom: (baseMax, i) => (i % 4 === 0 ? 10 : 0) },
    _customBlock_SkillStats: { WorshipChargeMax: 520 },
    _customBlock_AtomCollider: { AtomMaxLv: (i) => 20 + (i % 3) * 10 },
    _customBlock_Dreamstuff: {
        BarFillReq: 10000,
        BarFillRate: 35,
        UpgUnlocked: DREAM_UPGRADES - 2,
        UpgMaxLV: (i) => [5, 10, 25, 50, 100][(i + 3) % 5],
    },
};

export default () => ({
    gga: {
        // [i] building level, [i + 27] the level it builds toward.
        TowerInfo: [
            ...list(BUILDINGS, (i) => (i === 0 ? 3 : level(i, 50))),
            ...list(BUILDINGS, (i) => (i === 0 ? 3 : level(i, 50))),
        ],
        // 0 locked, positive charging, -11 or lower unlocked.
        FlagUnlock: list(120, (i) => (i < 60 ? -11 : i < 70 ? 1000 * (i - 59) : 0)),
        FlagsPlaced: [61, 64, -1, -1],
        CogOrder: list(COG_SLOTS, cog),
        CogMap: list(COG_SLOTS, cogStats),
        // Per character: samples from [5 + 14c] and prints from [15 + 14c], as item, amount pairs.
        Printer: list(5 + 14 * 3, (i) => (i < 5 ? 0 : i % 2 ? ITEM_IDS[i % ITEM_IDS.length] : 1000 * i)),
        PrinterXtra: list(30, (i) => (i % 2 ? 500 * i : ITEM_IDS[(i + 3) % ITEM_IDS.length])),
        GemItemsPurchased: list(200, (i) => (i === 114 ? 2 : i % 4)),
        // [3..11]: refineries as [salt stored, level].
        Refinery: list(12, (i) => (i < 3 ? [0, 0] : [i * 1500, level(i, 60)])),
        SaltLick: upgradeLevels(10, 1),
        Atoms: upgradeLevels(14, 2),
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
        PrayersUnlocked: list(PRAYERS, (i) => (i % 6 === 5 ? 0 : 1 + (i % 15))),
        Ninja: { 105: list(6, (i) => i * 12) },
        SkillLevels: list(TALENTS, talentLevel),
        SkillLevelsMAX: list(TALENTS, (id) => (id % 13 === 0 ? -1 : 100 + (id % 3) * 50)),
        // [0] bar fill, [2..] upgrade levels (the first also sets how many clouds show).
        Dream: [4200, 0, ...upgradeLevels(DREAM_UPGRADES, 1)],
        WeeklyBoss: { h: Object.fromEntries(list(CLOUDS, (i) => [`d_${i}`, i < 6 ? i * 40 : -1])) },
        OptionsListAccount: { 379: "0,COPPER_SET,GOLD_SET" },
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
                            [list(3, (p) => `SetPiece${i * 3 + p}`), [`SetPiece${(i + 4) % 12}`], [], [i % 2, 0]],
                        ])
                    )
                ),
            },
        },
        DNSM: { h: { TalentDL2: [12, 40, 7, 0], PrayNonEq: 0 } },
        CustomLists: {
            h: {
                // [0] name, ..., [8] base max level.
                TowerInfo: list(BUILDINGS, (i) => [
                    `${fakeName(i)}_Tower`,
                    "0",
                    "0",
                    "0",
                    "0",
                    "0",
                    "0",
                    "0",
                    String(50),
                ]),
                FlagReqs: list(96, (i) => String(100 + i * 20)),
                NonAFKmonsters: [MONSTERS[29]],
                // [?, name, ?, ?, max level]
                SaltLicks: list(10, (i) => [
                    "Salt",
                    `+{%_${fakeName(i + 2)}`,
                    "1",
                    "1",
                    String([5, 10, 25, 50, 100][(i + 1) % 5]),
                ]),
                AtomInfo: upgradeDefs(14, 2),
                // [name, bonus text, curse text, bonus per level, curse per level, ?, ?, wave, trial, max level]
                PrayerInfo: list(PRAYERS, (i) =>
                    i === PRAYERS - 1
                        ? ["Some_Prayer_Name0", "", "", "0", "0", "0", "0", "0", "0", "0"]
                        : [
                              `${fakeName(i)}_Prayer`,
                              `+{%_${fakeName(i + 1)}`,
                              `-{%_${fakeName(i + 2)}`,
                              String(5 + i),
                              String(2 + i),
                              "0",
                              "0",
                              String(10 + i * 5),
                              String(i % 8),
                              String(15),
                          ]
                ),
                // [x, y, trial monster]
                WorshipBASEinfos: list(8, (i) => ["0", "0", MONSTERS[i * 3]]),
                NinjaInfo: { 30: MONSTERS.slice(10, 16) },
                RANDOlist: {
                    9: ["1", "20", "40", "60", "80", "100", "125", "150"],
                    16: ["615", "617"],
                    113: [...SETS],
                },
                // 15 talent slots per class page, then the special talents.
                TalentOrder: list(TALENTS - 5, (i) => i),
                TalentIconNames: list(TALENTS, (i) => `${fakeName(i)}_Talent`),
                TalentDescriptions: list(TALENTS, (i) => [i % 11 === 0 ? "_hidden" : `Does_a_thing_${i}`, "0"]),
                DreamUpg: upgradeDefs(DREAM_UPGRADES, 3),
                // [name, progress needed]
                DreamChallenge: list(CLOUDS, (i) => [`${fakeName(i + 5)}_Cloud`, String(100 * (i + 1))]),
            },
        },
    },
    computed,
});
