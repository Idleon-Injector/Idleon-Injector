/** World 1: stamps, anvil, forge, statues, star signs, pets, bribes, owl. */
import { fakeName, list } from "./helpers.mjs";
import { MONSTERS } from "./shared.mjs";

const PETS = 24;

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
        // Pet bonus tokens picked, as "id,id".
        OptionsListAccount: { 606: "2,5" },
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
                // [set ranges "first,last|...", special groups, extra groups]
                CompanionSetsInfo: [["0,7|8,15"], ["16,17,18", "19,20"], ["21,22,23"]],
            },
        },
    },
    computed: { _customBlock_Stuff2: { PetBonusTokensOwned: 2 } },
    companions: ["0,0,0,0,1", "1,0,0,0,0", "4,0,0,0,1", "9,0,0,0,0"],
});
