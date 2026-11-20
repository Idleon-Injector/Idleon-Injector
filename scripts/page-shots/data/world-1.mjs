/** World 1: stamps, anvil, forge, statues, star signs, pets, bribes, owl. */
import { fakeName, list } from "./helpers.mjs";
import { MONSTERS } from "./shared.mjs";

const PETS = 24;
const OWL_LEVELS = [14, 3, 9, 6, 2, 0, 1, 0, 0];
// One function for every read, so the data is the same each time it's built.
const owlCost = (i) => 25 * 6 ** i * 1.4 ** OWL_LEVELS[i];
const OWL_UPGRADES = [
    "Feather_Generation",
    "Bonuses_of_Orion",
    "Feather_Multiplier",
    "Feather_Cheapener",
    "Feather_Restart",
    "Super_Feather_Production",
    "Shiny_Feathers",
    "Super_Feather_Cheapener",
    "The_Great_Mega_Reset",
];
const POPPY_UPGRADES = [
    "Tasty_Fishbait",
    "Quick_Reeling",
    "Shiny_Lure",
    "Bonuses_of_Poppy",
    "Fishy_Discount",
    "Juicy_Worm",
    "Fisheroo_Reset",
    "Fishing_Buddy",
    "Lightning_Quickness",
    "Fisheroo_Investing",
    "Multihook_Fishing",
    "Greatest_Catch",
];
const TAR_PIT_UPGRADES = [
    "Tar_Bait",
    "Sticky_Reel",
    "Deep_Lure",
    "Tar_Discount",
    "Oily_Worm",
    "Pit_Buddy",
    "Black_Magnet",
    "Slick_Hook",
];

export default () => ({
    gga: {
        StampLevel: list(3, (tab) => list(30, (i) => (i * 7 + tab * 3) % 60)),
        StampLevelMAX: list(3, () => list(30, () => 60)),
        StatueLevels: list(8, (i) => [i * 12 + 1, i * 345]),
        StatueG: list(8, (i) => i % 3),
        BribeStatus: [1, 1, 0, 0],
        // [4]: exalted stamp codes; [22]: statue flair levels; [2][78]: flair unlocked.
        Compass: { 4: ["_1", "a0", "b4"] },
        RoyalG: { 2: list(79, (k) => (k === 78 ? 1 : 0)), 22: list(8, (j) => j % 5) },
        AnvilPAstats: [12, 40, 30, 20, 5, 3],
        FurnaceLevels: [5, 10, 15, 20, 25, 30],
        // Star signs: [players who finished it, as letters; claimed].
        StarSignProg: list(12, (i) => [["_ab", "_", "", "_abc"][i % 4], i % 3 === 0 ? 1 : 0]),
        // Pet bonus tokens picked, as "id,id". 253: feathers, 254-262: Orion's upgrade levels, 263: feathers produced
        // this run.
        OptionsListAccount: {
            606: "2,5",
            253: 4.2e9,
            ...Object.fromEntries(OWL_LEVELS.map((level, i) => [254 + i, level])),
            263: 6.5e10,
        },
        CustomLists: {
            h: {
                // The game's own statue names: bare capitals, some with underscores.
                StatueInfo: ["POWER", "SPEED", "MINING", "FEASTY", "HEALTH", "KACHOW", "LUMBERBOB", "THICC_SKIN"].map(
                    (name) => [name, "1", "desc"]
                ),
                BribeDescriptions: [
                    "Insider_Trading",
                    "Tracking_Chips",
                    "Mandatory_Fire_Sale",
                    "Sleeping_On_the_Job",
                ].map((name, i) => [name, "Lowers the cost of things", String(100 * (i + 1)), "1"]),
                // [map, x, y, req, req, players needed, star points, description, type]
                StarQuests: list(12, (i) => [
                    String(i * 23),
                    "0",
                    "0",
                    "0",
                    "0",
                    String(1 + (i % 3)),
                    String(1 + (i % 2)),
                    `Defeat_${10 * (i + 1)}_${fakeName(i)}s_@_Progress`,
                    "0",
                ]),
                // [monster, buff, ..., Pets+ buff]
                CompanionDB: list(PETS, (i) => [
                    MONSTERS[i],
                    `+${5 * (i + 1)}%_${fakeName(i + 3)}_gain`,
                    "1",
                    "0",
                    "0",
                    "0",
                    "1000",
                    "100",
                    "2000",
                    "180",
                    `+${10 * (i + 1)}%_${fakeName(i + 3)}_gain`,
                    "1",
                ]),
                // Rows 0-8 are Orion's upgrades (World 1), 9-20 Poppy's and 21-28 the Tar Pit's (World 2);
                // [name, ..., feathers or fish produced that unlock it].
                Owlz: [
                    ...OWL_UPGRADES.map((name, i) => [name, "0", "0", String(i === 0 ? 0 : 1e3 * 10 ** i)]),
                    ...POPPY_UPGRADES.map((name, i) => [name, "0", "0", String(i === 0 ? 0 : 500 * 4 ** i)]),
                    ...TAR_PIT_UPGRADES.map((name) => [name, "0", "0", "0"]),
                ],
                // [set ranges "first,last|...", special groups, extra groups]
                CompanionSetsInfo: [["0,7|8,15"], ["16,17,18", "19,20"], ["21,22,23"]],
            },
        },
    },
    computed: {
        _customBlock_Stuff2: { PetBonusTokensOwned: 2 },
        // Orion's next level: a price that grows with the row and its level; feathers made per second.
        _customBlock_Summoning: {
            OwlCost: owlCost,
            OwlFeatherRate: 3.1e6,
        },
    },
    companions: ["0,0,0,0,1", "1,0,0,0,0", "4,0,0,0,1", "9,0,0,0,0"],
});
