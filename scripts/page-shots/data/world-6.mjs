/** World 6: farming, sneaking, summoning, beanstalk, emperor. */
import { fakeName, h, level, list, upgradeLevels } from "./helpers.mjs";
import {
    CHARMS,
    EMPEROR,
    EXOTIC,
    GOLD_FOODS,
    JADE,
    JADE_ORDER,
    KNOWLEDGE as KNOWLEDGE_ROWS,
    LAND_RANK_BONUSES,
    LAND_RANK_NAMES,
    MARKET,
    SEEDS,
    STICKERS,
} from "./world-6-game.mjs";

// Crops: the last seed's last crop is the depot's last index.
const CROPS = Number(SEEDS[SEEDS.length - 1][3]) + 1;
const PLOTS = 36;
// Ninja Knowledge rows (cList.NinjaUpg): [name, bonus per level, base cost, cost scale, parent]; row 9 is the
// game's placeholder. Rows 17+ unlock with the Coral Reef level Spelunk[13][3] instead of a parent. The costs are the
// automation's test numbers; the names and bonus texts are the game's (world-6-game.mjs).
const KNOWLEDGE = [
    ["Centurion_Lineage", 5, 2, 1.31, 0],
    ["Way_of_Bargain", 1, 1e8, 1.13, 0],
    ["Respectful_Minded", 3, 8500, 1.12, 8],
    ["Mastery_Loot", 1, 1e7, 1.8, 0],
    ["Way_of_Haste", 1, 48000, 1.35, 2],
    ["Mahjong_Boosters", 4, 17500, 1.25, 15],
    ["Gemstone_Pilfer", 1, 4e7, 1.35, 0],
    ["Kunai_Knowledge", 1, 10000, 1.45, 12],
    ["Currency_Conduit", 1, 1250, 1.1, 14],
    ["Name", 0, 10000, 1.1, 9],
    ["Glove_Ingenuity", 1, 1e7, 1.55, 11],
    ["Charm_Collector", 1, 250000, 1.43, 7],
    ["Nunchaku_Grip", 1, 350, 1.43, 13],
    ["Way_of_Stealth", 1, 50, 1.08, 13],
    ["Looting_Ambition", 1, 80, 1.3, 13],
    ["Thick_Skin", 2, 3650, 1.5, 14],
    ["Star_Sweeping", 1, 25000, 25, 15],
    ["Strange_Symbols", 2, 1e13, 3.1, 0],
    ["Cheaper_Stealth", 1, 1e14, 2.3, 0],
    ["Admiring_the_Art", 5, 1e15, 1.7, 0],
    ["Charming_Symbols", 2, 1e16, 3.5, 0],
    ["Funeral_Flowers", 1, 1e17, 5571.5, 0],
    ["Double_Gemstones", 1, 1e18, 9, 0],
    ["Shhhhhhhhhhh", 5, 1e18, 1.15, 0],
    ["Cheaper_Mastery", 50, 1e18, 1.15, 0],
    ["Cheaper_Haste", 15, 1e18, 1.15, 0],
    ["Cheaper_Bargain", 1, 1e18, 2.3, 0],
    ["True_Battering", 2, 1e18, 1.3, 0],
    ["Jadevalanche", 3, 1e18, 1.25, 0],
    ["Successful_Symbols", 5, 1e24, 6.3, 0],
    ["Grievance_Garlands", 25, 1e28, 323.5, 0],
    ["Omnijade_Usable", 1, 1e20, 1e15, 0],
];
const KNOWLEDGE_LEVELS = { 13: 40, 14: 35, 12: 30, 15: 25, 8: 20, 16: 3, 7: 12, 2: 10, 11: 4 };
const knowledgeLevel = (i) => KNOWLEDGE_LEVELS[i] ?? 0;
const ROUNDS = 30;
const GOLD_FOOD_IDS = GOLD_FOODS.filter((_, i) => i % 3 === 2);
// The gold foods' names: stand-ins (the item names aren't in the game's code), close to what the game calls them.
const GOLD_FOOD_NAMES = [
    "Golden_Peanut",
    "Butter_Bar",
    "Golden_Jam",
    "Golden_Kebabs",
    "Golden_Meat_Pie",
    "Golden_Nomwich",
    "Golden_Ham",
    "Golden_Bread",
    "Golden_Ribs",
    "Golden_Cheese",
    "Golden_Grilled_Cheese_Nomwich",
    "Golden_Hampter_Gummy_Candy",
    "Golden_Nigiri",
    "Golden_Dumpling",
    "Golden_Cake",
    "Golden_Sushi",
    "Golden_Pancake",
];
const SUMMON_UPGRADES = 32; // four per essence colour

// Summoning board rows as the game splits them: [x, y, colour, name, base cost, cost growth, bonus per level, 0,
// max level (9999 = none), parent upgrade, doubler, text]. Each colour's first row hangs off the colour before.
const SUMMON_UPG = list(SUMMON_UPGRADES, (i) => [
    "0",
    "0",
    String(Math.floor(i / 4)),
    i === 2 ? "Familiar" : `${fakeName(i + 40)}_Summoning`,
    String(10 * (i + 1)),
    "1.12",
    "1",
    "0",
    String([9999, 25, 50, 9999][i % 4]),
    String(i === 0 ? -1 : i % 4 === 0 ? i - 4 : i - 1),
    "0",
    `+{%_${fakeName(i + 41)}_bonus`,
]);
const summoningBoard = () => ({ _GenINFO: { 170: 2 } });
const SUMMON_LEVELS = list(SUMMON_UPGRADES, (i) => (i % 5 === 3 || i >= 24 ? 0 : 1 + ((i * 7) % 20)));

// Shared by every fakeGameData() call, so two calls compare equal.
const computed = {
    _customBlock_FarmingStuffs: {
        // The Day Market's caps, then the Night Market's.
        MarketMaxLV: (mode, i) => [20, 50, 60, 40, 25, 50, 30, 20][i] * (mode + 1),
        LandRank5thColumnMaxLV: 50,
        ExoticBonusQTY: 12,
    },
    _customBlock_MenagerieStuff: { OrganicLabelOwned: 4, OmniJadeDailyLVs: 3 },
    _customBlock_Thingies: { MaxEmperorAttemptStack: 3, DailyEmperorTries: 2 },
    // Priced from the start levels: each fixture's Summon[0] is its own copy.
    _customBlock_Summoning: {
        UpgCost: (i) => Number(SUMMON_UPG[i][4]) * 1.12 ** SUMMON_LEVELS[i],
        SummUpgBonus: (i) => SUMMON_LEVELS[i] ?? 0,
        SummVictories: 4,
    },
    _customBlock_Spelunk: { DoWeHaveLoreN1: 0 },
    // The game's number and time texts take the number as their first argument.
    _customBlock_CommaNotation: new Proxy({}, { get: (_, n) => String(Math.round(Number(n) * 100) / 100) }),
    _customBlock_timeDisp2: new Proxy({}, { get: (_, n) => `${Math.floor(Number(n) / 3600)}h` }),
    // The Knowledge price, without the game's discounts.
    _customBlock_Ninja: { JadeUpgCost: (i) => KNOWLEDGE[i][2] * KNOWLEDGE[i][3] ** knowledgeLevel(i) },
    // The game's number text, keyed by the number: whole for "Big", two decimals for a multiplier.
    _customBlock_NotateNumber: new Proxy(
        {},
        { get: (_, n) => (kind) => (kind === "Big" ? String(Math.round(Number(n))) : Number(n).toFixed(2)) }
    ),
};

export default () => ({
    gga: {
        // Crops stored, by crop index: the early seeds' crops found, the last ones not yet.
        FarmCrop: h(
            Object.fromEntries(list(CROPS, (i) => [i, i > 240 || i % 9 === 4 ? 0 : Math.round(9.5e7 / (i + 3))]))
        ),
        // [0] plot ranks, [1] plot rank EXP, [2] Land Rank Database levels.
        FarmRank: [
            list(PLOTS, (i) => (i < 24 ? level(i, 30) : 0)),
            list(PLOTS, (i) => (i < 24 ? i * 1250.5 : 0)),
            upgradeLevels(20, 3),
        ],
        // Day Market [2..9], Night Market [10..17], Exotic Market from [20].
        FarmUpg: list(100, (i) => (i < 20 ? level(i, 20) : i < 80 ? (i * 17) % 60 : 0)),
        Research: { 9: list(STICKERS.length, (i) => (i < 7 ? (i * 3) % 8 : 0)) },
        // [50] exotic upgrades given organic labels. ([13][3], the Coral Reef level that opens Knowledge rows 17+,
        // comes from world-7.mjs.)
        Spelunk: { 50: [2, 5, 9] },
        // [102][1] jade, [102][9] Jade upgrades bought (letters), [103] Ninja Knowledge levels, [104] beanstalk,
        // [107] charms unlocked.
        Ninja: {
            102: list(10, (i) => (i === 9 ? "_acdhkmqx" : i === 1 ? 42500000 : 0)),
            103: list(KNOWLEDGE.length, knowledgeLevel),
            104: list(GOLD_FOOD_IDS.length, (i) => (i < 9 ? 1 + (i % 3) : 0)),
            107: list(CHARMS.length, (i) => (i % 3 === 0 ? 1 : 0)),
        },
        // [0] summoning upgrades, [1] normal rounds won (enemy ids), [2] essence per colour, [3] shop timers,
        // [4] familiars per tier.
        Summon: [
            [...SUMMON_LEVELS], // its own copy: a test that levels an upgrade leaves the next fixture's start alone
            list(12, (i) => `enemy${i}`),
            list(9, (i) => (i < 6 ? Math.round(4.2e6 / (i + 1) ** 2) : 0)),
            [0, 0, 0, 0],
            [6, 3, 1, 0, 0, 0, 0, 0],
        ],
        // The summoning board's behavior; _GenINFO[170] is its total level / 100.
        PixelHelperActor: { 24: { behaviors: { getBehavior: summoningBoard } } },
        TimeAway: { h: { ShopRestock: 43200 } },
        CustomMaps: {
            // Pristine charms: [?, index, name, ?, how to add it, bonus].
            h: { NjEQ: h(Object.fromEntries(CHARMS.map((charm, i) => [`NjTrP${i}`, charm]))) },
        },
        DNSM: { h: { EmperorBon: list(12, (i) => i * 3) } },
        OptionsListAccount: { 319: 40, 369: 37, 370: 0 },
        ItemDefinitionsGET: {
            h: Object.fromEntries(GOLD_FOOD_IDS.map((id, i) => [id, h({ displayName: GOLD_FOOD_NAMES[i] ?? id })])),
        },
        CustomLists: {
            h: {
                SeedInfo: SEEDS,
                MarketInfo: MARKET,
                MarketExoticInfo: EXOTIC,
                Research: { 23: STICKERS },
                NinjaInfo: { 24: JADE_ORDER, 29: GOLD_FOODS, 34: LAND_RANK_NAMES, 35: LAND_RANK_BONUSES },
                JadeUpg: JADE,
                // [lineX, lineY, lineW, lineH, name, bonus per level, description, base cost, scale, parent, x, y]
                NinjaUpg: KNOWLEDGE.map(([name, bonus, cost, scale, parent], i) => [
                    "0",
                    "0",
                    "0",
                    "0",
                    name,
                    String(bonus),
                    KNOWLEDGE_ROWS[i][6],
                    String(cost),
                    String(scale),
                    String(parent),
                    "0",
                    "0",
                ]),
                SummonUPG: SUMMON_UPG,
                // Columns: [0] enemy ids, [4] names, [8] round order.
                SummonEnemies: list(9, (column) =>
                    list(ROUNDS, (i) =>
                        column === 0
                            ? `enemy${i}`
                            : column === 4
                              ? `${fakeName(i + 2)}_Summon`
                              : column === 8
                                ? String(i + 1)
                                : "0"
                    )
                ),
                EmperorBon: EMPEROR,
            },
        },
    },
    computed,
    cheatStates: { w6: { emperor: false } },
});
