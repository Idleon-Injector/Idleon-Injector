/**
 * World 7: spelunking, research (grid, observations, minehead, jelly operator), menagerie, gallery (trophies,
 * nametags), legend talents, coral reef, zenith market, clam work, big fish, glimbo, sushi.
 */
import { fakeName, h, level, list } from "./helpers.mjs";
import * as GAME from "./world-7-game.mjs";

const CAVES = GAME.CAVE_OBJECTS.length;
const GRID_SQUARES = 240;
const SUSHI = GAME.SUSHI.length;
const TROPHIES = list(10, (i) => `Trophy${i + 1}`);
// As in the game: nametag 6 is "EquipmentNametag6b".
const NAMETAGS = list(10, (i) => `EquipmentNametag${i + 1}${i === 5 ? "b" : ""}`);
// A level up to each row's own max (its column `at`), some zero and some maxed; a row without a real max stays low.
const levelsOf = (rows, at) => list(rows.length, (i) => level(i, Math.min(60, Number(rows[i][at]))));
const jellyLevels = levelsOf(GAME.JELLY, 1);

// Shared by every fakeGameData() call, so two calls compare equal.
const computed = {
    _customBlock_MenagerieStuff: {
        UnlockOwned: 1,
        LumiGainRate: 340,
        MissionProg: (i) => i * 3,
        Cost: (_, i) => 10 * (i + 1),
        JellyOpDoublersOwned: 2,
        MineheadDoublersOwned: 3,
        SushiDoublersOwned: 2,
    },
    _customBlock_Thingies: { LegendTalent_MaxLV: (i) => Number(GAME.LEGENDS[i][1]) },
};

export default () => ({
    gga: {
        Spelunk: {
            // Caves: [1] deepest layer, [2] biggest haul, [44] grand discoveries, [47] manic deepest layer.
            1: list(CAVES, (i) => (i < 10 ? 5 + i * 2 : 0)),
            2: list(CAVES, (i) => i * 12345.5),
            44: list(CAVES, (i) => i % 3),
            47: list(CAVES, (i) => (i < 6 ? i * 3 : 0)),
            // [6] objects found, [5] shop levels, [8] lore chapters read.
            6: GAME.CAVE_OBJECTS.slice(0, 3).flatMap((cave, i) => cave.slice(0, 4 - i).map((object) => object[0])),
            5: levelsOf(GAME.SPELUNK_SHOP, 3),
            8: list(28, (i) => (i < 9 ? 3 + i : 0)),
            11: list(7, (i) => level(i, 20)),
            13: levelsOf(GAME.CORAL, 1),
            // The gallery holds trophy numbers (Trophy1 is 1), -1 for an empty slot.
            16: [1, 2, -1, 4, -1, -1],
            17: list(30, (i) => (i === 28 ? 12 : i % 5)),
            18: levelsOf(GAME.LEGENDS, 1),
            45: levelsOf(GAME.ZENITH, 3),
            51: GAME.MINEHEAD_DOUBLERS.slice(0, 2).map(Number),
            52: GAME.SUSHI_DOUBLERS.slice(0, 2).map(Number),
            53: GAME.JELLY_DOUBLERS.slice(0, 1).map(Number),
        },
        Research: {
            // [0] grid levels, [2..4] observations, [7] minehead stats, [8] minehead upgrades, [12] glimbo levels,
            // [16] cell levels, [17] jelly upgrades.
            0: list(GRID_SQUARES, (i) => level(i, Number(GAME.GRID[i]?.[1] ?? 1))),
            2: list(80, (i) => (i < 22 ? 1 : 0)),
            3: list(80, (i) => (i < 22 ? i * 50 : 0)),
            4: list(80, (i) => (i < 22 ? 2 + (i % 4) : 0)),
            7: list(14, (i) => (i === 10 ? 3 : i === 11 ? 45000 : i * 10)),
            8: levelsOf(GAME.MINEHEAD, 1),
            12: list(GAME.GLIMBO.length, (i) => level(i, 25)),
            15: list(9, (i) => i * 40),
            16: list(9, (i) => i % 5),
            17: jellyLevels,
        },
        // [0] core values, [1] missions, [2] unlocks, [3] upgrades, [4] cave materials, [5] scurge, [6], [7] omni jade.
        Menagerie: {
            0: list(16, (i) => (i === 0 ? 125000 : i * 7)),
            1: list(33, (i) => i % 4),
            2: list(25, (i) => (i < 12 ? 1 : 0)),
            3: list(25, (i) => level(i, 20)),
            4: list(14, (i) => i * 300),
            5: list(9, (i) => i % 3),
            6: list(17, (i) => i % 3),
            7: list(17, (i) => level(i, 20)),
        },
        // [0] slots, [1] plates, [2] shop levels, [3] fireplaces, [4] resources, [5] perfects, [6] exp, [7] level.
        Sushi: [
            // The station's 120 slots: the last rows aren't unlocked yet (plate -1).
            list(120, (i) => (i >= 60 || i % 4 === 3 ? -1 : (i * 5) % 24)),
            list(120, (i) => (i >= 75 ? -1 : i % 11 === 5 ? 3 : i % 7 === 2 ? 2 : i % 5 === 1 ? 1 : 0)),
            levelsOf(GAME.SUSHI_SHOP, 1),
            list(15, (i) => (i < 6 ? i % 4 : -1)),
            list(12, (i) => i * 1500),
            list(SUSHI, (i) => (i < 8 ? 1 : i < 24 ? 0 : -1)),
            list(SUSHI, (i) => (i < 24 ? 4321 - i * 170 : 0)),
            list(SUSHI, (i) => (i < 24 ? 17 - Math.floor(i / 2) : 0)),
        ],
        Lv0: { 20: 85 },
        ItemDefinitionsGET: {
            h: Object.fromEntries([
                ...TROPHIES.map((id, i) => [
                    id,
                    h({ displayName: `${fakeName(i + 50)}_Trophy`, Type: "TROPHY", ID: i }),
                ]),
                ...GAME.GLIMBO.map((id, i) => [id, h({ displayName: fakeName(i + 20), ID: i })]),
                ...NAMETAGS.map((id, i) => [
                    id,
                    h({ displayName: `${fakeName(i + 55)}_Nametag`, Type: "NAMETAG", ID: i }),
                ]),
            ]),
        },
        OptionsListAccount: {
            454: 1500000,
            455: 12,
            456: 4,
            457: 7,
            458: 2,
            459: 9,
            460: 0,
            461: 3,
            462: 5,
            463: 1,
            464: 6,
            486: 11,
        },
        CustomLists: {
            h: {
                ResGridSquares: list(GRID_SQUARES, (i) => GAME.GRID[i] ?? ["Name", "-1", "0"]),
                Occurrences: GAME.OBSERVATIONS,
                MineheadUPG: GAME.MINEHEAD,
                JellyUPG: GAME.JELLY,
                LegendTalents: GAME.LEGENDS,
                CoralReef: GAME.CORAL,
                ZenithMarket: GAME.ZENITH,
                SpelunkUpg: GAME.SPELUNK_SHOP,
                SpelunkChapters: GAME.LORE,
                SpelunkRocks: GAME.CAVE_OBJECTS,
                SushiUPG: GAME.SUSHI_SHOP,
                Spelunky: {
                    6: GAME.CAVE_NAMES,
                    14: GAME.CAVE_TEXTS,
                    18: GAME.BIG_FISH,
                    25: GAME.CORAL_KID,
                    26: GAME.LEGEND_ORDER,
                    27: GAME.CLAMWORKS,
                },
                Research: {
                    27: GAME.GLIMBO,
                    30: GAME.SUSHI,
                    32: GAME.SUSHI_ORDER,
                    44: GAME.JELLY_ORDER,
                    52: GAME.MISSIONS,
                    56: GAME.MENAGERIE_UNLOCKS,
                    57: GAME.MENAGERIE_BOOSTS,
                    59: GAME.MINEHEAD_DOUBLERS,
                    60: GAME.SUSHI_DOUBLERS,
                    61: GAME.JELLY_DOUBLERS,
                },
            },
        },
    },
    computed,
});
