/** General pages: tasks, achievements, merit shop, cards, upgrade vault, bubba, event shop, masterclasses. */
import { fakeName, h, level, list, upgradeDefs, upgradeLevels } from "./helpers.mjs";
import { MAPS, MONSTERS } from "./shared.mjs";

const WORLDS = 7;
const TASKS = 8;
const MERITS = 6;
const ACHIEVEMENTS = 70;
const CARD_REGIONS = 13;
const VAULT = 30;
const EVENT_SHOP = 20;
const ARMORY = 70;

const vaultMax = (index) => 10 + (index % 5) * 10;

const built = (map, i) => [i + 1, i, 2, 40 * i, 12, 3, 0, 0, -1, -1, i % 3, 222211111, i % 2];

export default () => ({
    gga: {
        // [0] progress and [1] stages done per world's tasks, [2] merit shop purchases per world.
        Tasks: [
            list(WORLDS, (w) => list(TASKS, (i) => (i + 1) * (w + 2) * 15)),
            list(WORLDS, (w) => list(TASKS, (i) => (i + w) % 4)),
            list(WORLDS, (w) => list(MERITS, (i) => level(i + w, 5))),
        ],
        // -1: complete, otherwise progress.
        AchieveReg: list(WORLDS * ACHIEVEMENTS, (i) => (i % 3 === 0 ? -1 : (i * 7) % 40)),
        Cards: [h(Object.fromEntries(MONSTERS.slice(0, 26).map((id, i) => [id, i % 6 === 5 ? 0 : (i + 1) * 37]))), []],
        UpgVault: upgradeLevels(VAULT, 2),
        // Bubba: [0] run values, [1] upgrades, [2] free upgrade levels, [3] traits, [4] dice, [5] smoked meats.
        Bubba: [
            list(20, (i) => (i < 2 ? 12500 * (i + 1) : i === 6 || i === 15 ? 2 : i % 4)),
            list(28, (i) => i % 6),
            list(28, (i) => (i % 5 === 0 ? 1 : 0)),
            [30, 12, 0, 45, 7, 120],
            [3, 18, 0, 0, 7, 11, 0, 20],
            [100, 40, 0, 6, 2],
        ],
        // Masterclasses: Grimoire, Tesseract (Arcane), Compass, Royal Guard.
        Grimoire: upgradeLevels(30, 1),
        Arcane: upgradeLevels(30, 3),
        Compass: { 0: upgradeLevels(40, 4) },
        // [0] royal statues, [1] resources, [2] armory, [4] node collected, [5] node grades,
        // [6..13] units (types, maps) per world, [23] Lil Orblet shop.
        RoyalG: {
            0: [3, 1, 0, 7, 2, 0, 5],
            1: list(40, (i) => (i * 1777) % 25000),
            2: upgradeLevels(ARMORY, 1),
            4: list(80, (i) => (i % 4 === 0 ? -1 : (i * 97) % 600)),
            5: list(80, (i) => i % 4),
            6: [4, 4, 5],
            7: [1, 1, 2],
            8: [4, 6],
            9: [51, 52],
            10: [4],
            11: [101],
            12: [],
            13: [],
            23: upgradeLevels(20, 2),
        },
        // Per map: a built outpost (13 values), [kills toward one] or nothing.
        RoyalMaps: list(350, (map) =>
            !MAPS.includes(map) ? [] : map % 50 === 1 || map % 50 === 2 ? built(map, map % 50) : [map * 11]
        ),
        MapBon: list(350, (map) => (MAPS.includes(map) ? [map * 1000, map * 500, map % 3 ? 0 : 10000000] : [])),
        CustomMaps: h({ RG_KillReq: h({ 2: 900 }) }),
        DNSM: h({ ArcMultBon: [75] }),
        OptionsListAccount: { 311: "_bcf" },
        CustomLists: {
            h: {
                // Per world: [name, ..., stage targets from [5] on].
                TaskDescriptions: list(WORLDS, (w) =>
                    list(TASKS, (i) => [`${fakeName(i + w)}_Task`, "0", "0", "0", "0", "10", "100", "1000", "5000"])
                ),
                // Per world: [description, more description, ..., [5] max purchases].
                TaskShopDesc: list(WORLDS, (w) =>
                    list(MERITS, (i) => [`+{%_${fakeName(i + w)}`, "for_all_characters", "0", "0", "0", "5"])
                ),
                RegAchieves: list(WORLDS * ACHIEVEMENTS, (i) =>
                    i % ACHIEVEMENTS >= 20 ? ["FILLERZZZ_ACH"] : [`${fakeName(i)}_Hunter`, "Do_the_thing", "1"]
                ),
                AchieveOrderingz: list(WORLDS, () => []),
                // Per region: [monster, ?, base cards needed].
                CardStuff: list(CARD_REGIONS, (r) =>
                    list(2, (i) => [MONSTERS[r * 2 + i] ?? "Blank", "0", String(5 + r * 3)])
                ),
                UpgradeVault: upgradeDefs(VAULT, 2),
                BubbaUpg: upgradeDefs(28, 5),
                GrimoireUpg: upgradeDefs(30, 1),
                ArcaneUpg: upgradeDefs(30, 3),
                CompassUpg: upgradeDefs(40, 4),
                ArmoryUpg: upgradeDefs(ARMORY, 1),
                OrbletMarket: upgradeDefs(20, 2, 3),
                // [x, y, base amount, resource type] per node, 20 per world.
                RoyalResources: list(80, (i) => [
                    String(100 + i * 10),
                    String(200 + (i % 7) * 15),
                    String(50 + i),
                    String(i % 10),
                ]),
                NinjaInfo: {
                    // Event shop: "name@effect", cost, pairs.
                    39: list(EVENT_SHOP, (i) => [
                        `${fakeName(i)}@+${i + 1}%_${fakeName(i + 4)}`,
                        String(25 * (i + 1)),
                    ]).flat(),
                },
                Research: {
                    40: list(7, (i) => `${fakeName(i)}_Statue`),
                    43: list(ARMORY, (i) => i),
                },
                Spelunky: {
                    34: [5, 10, 15, 20, 25],
                    36: list(6, (i) => fakeName(i + 2)),
                    39: list(6, (i) => `${fakeName(i + 8)}_Gift`),
                },
            },
        },
    },
    computed: { _customBlock_Summoning: { VaultUpgMaxLV: vaultMax } },
});
