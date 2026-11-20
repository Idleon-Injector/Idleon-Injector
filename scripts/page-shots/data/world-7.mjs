/**
 * World 7: spelunking, research (grid, observations, minehead, jelly operator), menagerie, gallery (trophies,
 * nametags), legend talents, coral reef, zenith market, clam work, big fish, glimbo, sushi.
 */
import { fakeName, h, level, list, upgradeLevels } from "./helpers.mjs";
import { ITEMS } from "./shared.mjs";

const CAVES = 14;
const GRID_WIDTH = 20;
const LEGEND_TALENTS = 40;
const SUSHI = 20;
const TROPHIES = list(10, (i) => `Trophy${i + 1}`);
// As in the game: nametag 6 is "EquipmentNametag6b".
const NAMETAGS = list(10, (i) => `EquipmentNametag${i + 1}${i === 5 ? "b" : ""}`);
const ITEM_IDS = Object.keys(ITEMS).filter((id) => id.startsWith("item"));

/** A diamond of research tiles in the middle of the 20 x 12 grid; the rest of the grid is unused. */
const gridTile = (index) => {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);
    if (Math.abs(x - 9.5) + Math.abs(y - 5.5) > 6) return ["Name", "-1", "0"];
    return [`${fakeName(index)}_Study`, String(1 + (index % 5)), `+{%_${fakeName(index + 2)}`, "0", "0", ""];
};

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
    _customBlock_Thingies: { LegendTalent_MaxLV: () => 10 },
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
            6: ["Rock_0_1", "Rock_1_0", "Rock_2_2"],
            5: upgradeLevels(30, 4),
            8: list(8, (i) => (i < 5 ? 1 : 0)),
            11: list(12, (i) => level(i, 20)),
            13: list(10, (i) => level(i, 30)),
            16: TROPHIES.slice(0, 4),
            17: list(30, (i) => (i === 28 ? 12 : i % 5)),
            18: list(LEGEND_TALENTS, (i) => level(i, 10)),
            45: list(30, (i) => level(i, 10)),
            51: [1, 4],
            52: [0, 2],
            53: [3],
        },
        Research: {
            // [0] grid levels, [2..4] observations, [7] minehead stats, [8] minehead upgrades, [12] glimbo levels,
            // [16] cell levels, [17] jelly upgrades.
            0: list(GRID_WIDTH * 12, (i) => i % 4),
            2: list(20, (i) => i % 6),
            3: list(20, (i) => i * 50),
            4: list(20, (i) => i % 2),
            7: list(14, (i) => (i === 10 ? 3 : i === 11 ? 45000 : i * 10)),
            8: upgradeLevels(20, 1),
            12: list(10, (i) => level(i, 25)),
            16: list(8, (i) => i % 5),
            17: upgradeLevels(30, 2),
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
            list(12, (i) => (i % 4 === 3 ? -1 : i % SUSHI)),
            list(12, (i) => i % 3),
            upgradeLevels(30, 3),
            list(6, (i) => i % 4),
            list(6, (i) => i * 1500),
            list(SUSHI, (i) => i % 2),
            4321,
            17,
        ],
        Lv0: { 20: 85 },
        ItemDefinitionsGET: {
            h: Object.fromEntries([
                ...TROPHIES.map((id, i) => [
                    id,
                    h({ displayName: `${fakeName(i + 50)}_Trophy`, Type: "TROPHY", ID: i }),
                ]),
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
                ResGridSquares: list(GRID_WIDTH * 12, gridTile),
                Occurrences: list(20, (i) => [
                    `${fakeName(i + 9)}_Sighting`,
                    String(10 * (i + 1)),
                    `+{%_${fakeName(i)}`,
                    "0",
                ]),
                MineheadUPG: list(20, (i) => [
                    `${fakeName(i + 2)}_Drill`,
                    String([5, 10, 25, 50, 100][i % 5]),
                    `+{%_${fakeName(i)}`,
                ]),
                JellyUPG: list(30, (i) => [
                    `${fakeName(i + 12)}_Jelly`,
                    String([5, 10, 25, 50, 100][i % 5]),
                    "1.2",
                    "0",
                    "1",
                    `+{%_${fakeName(i)}`,
                ]),
                LegendTalents: list(LEGEND_TALENTS, (i) => [`${fakeName(i + 33)}_Legend`, "10", `+{%_${fakeName(i)}`]),
                CoralReef: list(10, (i) => [`${fakeName(i + 44)}_Coral`, String(30), `+{%_${fakeName(i)}`]),
                ZenithMarket: list(30, (i) => [`${fakeName(i + 47)}_Zenith`, "1", "1.1", "10", `+{%_${fakeName(i)}`]),
                SpelunkUpg: list(30, (i) => [
                    `${fakeName(i + 4)}_Pickaxe`,
                    "1",
                    "1.1",
                    String([5, 10, 25, 50, 100][(i + 4) % 5]),
                    `+{%_${fakeName(i)}`,
                ]),
                SpelunkChapters: list(8, (i) => list(4, (j) => `${fakeName(i + j)}_Chapter`)),
                // Per cave: objects as [id, ...], the last row is not an object.
                SpelunkRocks: list(CAVES, (c) => [...list(3, (o) => [`Rock_${c}_${o}`, "1", "10"]), ["end"]]),
                SushiUPG: list(30, (i) => [
                    `${fakeName(i + 3)}_Roll`,
                    String([5, 10, 25, 50, 100][(i + 3) % 5]),
                    `+{%_${fakeName(i)}`,
                ]),
                Spelunky: {
                    6: list(CAVES, (i) => `${fakeName(i + 2)}_Cave`),
                    14: list(CAVES, (i) => (i < 10 ? `A_cave_of_${fakeName(i)}` : "0")),
                    18: list(12, (i) => `${fakeName(i + 24)}_Fish,10,+{%_${fakeName(i)}`),
                    26: list(LEGEND_TALENTS, (i) => i),
                    27: list(18, (i) => `Scurge_thing_${i}_@_{%`),
                },
                Research: {
                    27: ITEM_IDS.slice(0, 10),
                    30: list(SUSHI, (i) => `${fakeName(i + 37)}_Nigiri`),
                    32: list(30, (i) => i),
                    44: list(30, (i) => i),
                    52: list(33, (i) => `Find_${i + 2}_${fakeName(i)}s`),
                    56: list(25, (i) => `Unlocks_${fakeName(i + 1)}`),
                    57: list(25, (i) => `+{%_${fakeName(i + 2)}`),
                    59: [0, 1, 4, 6],
                    60: [0, 2, 5],
                    61: [1, 3, 7],
                },
            },
        },
    },
    computed,
});
