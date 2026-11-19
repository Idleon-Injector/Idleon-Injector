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

// Shared by every fakeGameData() call, so two calls compare equal.
const computed = {
    _customBlock_FarmingStuffs: {
        MarketMaxLV: (mode, i) => 20 + mode * 10 + i,
        LandRank5thColumnMaxLV: 50,
        ExoticBonusQTY: 12,
    },
    _customBlock_MenagerieStuff: { OrganicLabelOwned: 4, OmniJadeDailyLVs: 3 },
    _customBlock_Thingies: { MaxEmperorAttemptStack: 3, DailyEmperorTries: 2 },
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
        // [0] summoning upgrades, [1] normal rounds won (enemy ids), [2] essence per colour.
        Summon: [upgradeLevels(30, 2), list(12, (i) => `enemy${i}`), list(8, (i) => i * 12345)],
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
                SummonUPG: upgradeDefs(30, 2),
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
