/** World 6: farming, sneaking, summoning, beanstalk, emperor. */
import { fakeName, h, level, list, upgradeDefs, upgradeLevels } from "./helpers.mjs";
import { ITEMS } from "./shared.mjs";

const SEEDS = 6;
const CROPS_PER_SEED = 5;
const PLOTS = 12;
const STICKERS = 10;
const CHARMS = 23;
const JADE = 30;
const SNEAK_UPGRADES = 20;
const ROUNDS = 30;
const BEANSTALK_FOODS = 8;
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
        MarketMaxLV: (mode, i) => 20 + mode * 10 + i,
        LandRank5thColumnMaxLV: 50,
        ExoticBonusQTY: 12,
    },
    _customBlock_MenagerieStuff: { OrganicLabelOwned: 4, OmniJadeDailyLVs: 3 },
    _customBlock_Thingies: { MaxEmperorAttemptStack: 3, DailyEmperorTries: 2 },
    _customBlock_Summoning: {
        UpgCost: (i) => Number(SUMMON_UPG[i][4]) * 1.12 ** SUMMON_LEVELS[i],
        SummUpgBonus: (i) => SUMMON_LEVELS[i] ?? 0,
        SummVictories: 4,
    },
    _customBlock_Spelunk: { DoWeHaveLoreN1: 0 },
    // The game's number and time texts take the number as their first argument.
    _customBlock_CommaNotation: new Proxy({}, { get: (_, n) => String(Math.round(Number(n) * 100) / 100) }),
    _customBlock_timeDisp2: new Proxy({}, { get: (_, n) => `${Math.floor(Number(n) / 3600)}h` }),
};

export default () => ({
    gga: {
        // Crops stored, by crop index.
        FarmCrop: h(Object.fromEntries(list(SEEDS * CROPS_PER_SEED, (i) => [i, i % 4 === 3 ? 0 : (i + 1) * 4321]))),
        // [0] plot levels, [1] plot exp, [2] land rank upgrades.
        FarmRank: [list(PLOTS, (i) => level(i, 30)), list(PLOTS, (i) => i * 120), upgradeLevels(20, 3)],
        // Markets (day [0..7], night [8..15]), exotic from [20].
        FarmUpg: list(80, (i) => level(i, 50)),
        Research: { 9: list(STICKERS, (i) => i * 3) },
        // [50] exotic upgrades given organic labels.
        Spelunk: { 50: [2, 5, 9] },
        // [102][9] Jade upgrades bought (letters), [103] sneaking upgrades, [104] beanstalk, [107] charms unlocked.
        Ninja: {
            102: list(10, (i) => (i === 9 ? "_acdhk" : 0)),
            103: upgradeLevels(SNEAK_UPGRADES, 1),
            104: list(BEANSTALK_FOODS, (i) => i % 3),
            107: list(CHARMS, (i) => (i % 3 === 0 ? 1 : 0)),
        },
        // [0] summoning upgrades, [1] normal rounds won (enemy ids), [2] essence per colour, [3] shop timers,
        // [4] familiars per tier.
        Summon: [
            SUMMON_LEVELS,
            list(12, (i) => `enemy${i}`),
            list(8, (i) => (i < 6 ? Math.round(4.2e6 / (i + 1) ** 2) : 0)),
            [0, 0, 0, 0],
            [6, 3, 1, 0, 0, 0, 0, 0],
        ],
        // The summoning board's behavior; _GenINFO[170] is its total level / 100.
        PixelHelperActor: { 24: { behaviors: { getBehavior: summoningBoard } } },
        TimeAway: { h: { ShopRestock: 43200 } },
        CustomMaps: {
            h: {
                // Pristine charms: [?, ?, name].
                NjEQ: h(
                    Object.fromEntries(list(CHARMS, (i) => [`NjTrP${i}`, ["0", "1", `${fakeName(i + 17)}_Charm`]]))
                ),
            },
        },
        DNSM: { h: { EmperorBon: list(12, (i) => i * 3) } },
        OptionsListAccount: { 319: 40, 369: 37, 370: 0 },
        CustomLists: {
            h: {
                // [name, ?, first crop, last crop]
                SeedInfo: list(SEEDS, (s) => [
                    `${fakeName(s + 1)}_Seed`,
                    "1",
                    String(s * CROPS_PER_SEED),
                    String(s * CROPS_PER_SEED + CROPS_PER_SEED - 1),
                ]),
                MarketInfo: upgradeDefs(16, 2),
                MarketExoticInfo: upgradeDefs(60, 5),
                Research: { 23: list(STICKERS, (i) => `${fakeName(i + 3)}_Sticker`) },
                NinjaInfo: {
                    24: list(JADE, (i) => (i * 7) % JADE),
                    // Beanstalk foods: triples ending in the item id.
                    29: list(BEANSTALK_FOODS, (i) => ["0", "0", Object.keys(ITEMS)[i]]).flat(),
                    34: list(20, (i) => `${fakeName(i + 5)}_Rank_Upgrade`),
                },
                JadeUpg: upgradeDefs(JADE, 7),
                NinjaUpg: upgradeDefs(SNEAK_UPGRADES, 1),
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
                // [0] reward texts, [1] amounts, [2] which reward each showdown gives.
                EmperorBon: [
                    list(12, (i) => `+{%_${fakeName(i + 4)}_bonus`),
                    list(12, (i) => String(5 + i)),
                    list(48, (i) => String(i % 12)),
                ],
            },
        },
    },
    computed,
    cheatStates: { w6: { emperor: false } },
});
