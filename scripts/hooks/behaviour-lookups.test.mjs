// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// What the game-value hooks return with their cheat on and off, written down from the hooks before they moved to
// defineHook (#15): the combat, skill and world lookups on ActorEvents_12, 124, 189, 345 and 579.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, events, set, setup, state, gga, context } = await loadHookGame();
const { cheatConfig } = state;
const BASE = 7;
cheatConfig.multiply = {
    damage: 3,
    skillexp: 4,
    efficiency: 5,
    money: 6,
    crystal: 7,
    shopstock: 8,
    drop: 9,
    classexp: 10,
    carrycap: 11,
    afk: 12,
    printer: 13,
};
const config = (path) => path.split(".").reduce((node, key) => node[key], cheatConfig);
// A config lookup: the cheat's config function for the first argument, given the game's result and all arguments.
const lookup = (path) => (base, args) => config(path)[args[0]](base, args);
const times = (key) => (base) => base * cheatConfig.multiply[key];

// [cheat, ActorEvents class, method, arguments, the result with the cheat on]; with it off the game's result stands.
const lookups = [
    ["godlike.crit", 12, "_customBlock_CritChance", [], 100],
    ["godlike.reach", 12, "_customBlock_PlayerReach", [], 666],
    ["w1.forge", 12, "_customBlock_ForgeStats", [1], (base) => cheatConfig.w1.forge.capacity(base)],
    ["w1.forge", 12, "_customBlock_ForgeStats", [2], (base) => cheatConfig.w1.forge.speed(base)],
    ["w1.forge", 12, "_customBlock_ForgeStats", [3], BASE],
    ["multiply.damage", 12, "_customBlock_DamageDealed", ["Max"], times("damage")],
    ["multiply.damage", 12, "_customBlock_DamageDealed", ["Min"], BASE],
    ["multiply.skillexp", 12, "_customBlock_SkillStats", ["AllSkillxpMULTI"], times("skillexp")],
    ["w3.worshipspeed", 12, "_customBlock_SkillStats", ["WorshipSpeed"], (base) => cheatConfig.w3.WorshipSpeed(base)],
    ["multiply.efficiency", 12, "_customBlock_SkillStats", ["MiningEfficiency"], times("efficiency")],
    ["multiply.money", 12, "_customBlock_ArbitraryCode", ["MonsterCash"], times("money")],
    ["multiply.crystal", 12, "_customBlock_ArbitraryCode", ["CrystalSpawn"], times("crystal")],
    ["wide.giant", 12, "_customBlock_ArbitraryCode", ["GiantMob"], 1],
    ["godlike.food", 12, "_customBlock_ArbitraryCode", ["FoodNOTconsume"], 100],
    ["godlike.hitchance", 12, "_customBlock_ArbitraryCode", ["HitChancePCT"], 100],
    ["wide.plunderous", 12, "_customBlock_GetBuffBonuses", [318], 1],
    ["wide.plunderous", 12, "_customBlock_GetBuffBonuses", [317], BASE],
    ["multiply.shopstock", 12, "_customBlock_RunCodeOfTypeXforThingY", ["ShopQtyBonus"], times("shopstock")],
    ["multiply.drop", 12, "_customBlock_TotalStats", ["Drop_Rarity"], times("drop")],
    ["multiply.classexp", 12, "_customBlock_ExpMulti", [0], times("classexp")],
    ["multiply.carrycap", 12, "_customBlock_MaxCapacity", ["HardCappy"], times("carrycap")],
    ["multiply.carrycap", 12, "_customBlock_MaxCapacity", ["NotACap"], BASE],
    ["multiply.afk", 124, "_customBlock_AFKgainrates", [], times("afk")],
    ["wide.perfectobols", 124, "_customBlock_LoadPlayerInfo", [], BASE],
    ["w1.anvil", 189, "_customBlock_AnvilProduceStats", ["Costs1"], 0],
    ["w1.anvil", 189, "_customBlock_AnvilProduceStats", ["Costs2"], 0],
    [
        "w1.anvil",
        189,
        "_customBlock_AnvilProduceStats",
        ["ProductionSpeed"],
        (b) => cheatConfig.w1.anvil.productionspeed(b),
    ],
    ["w2.alchemy", 189, "_customBlock_CauldronStats", ["CauldronCosts", 1, 2], lookup("w2.alchemy")],
    ["w2.alchemy", 189, "_customBlock_CauldronStats", ["NotConfigured"], BASE],
    ["w4.chipbonuses", 189, "_customBlock_chipBonuses", ["resp"], lookup("w4.chipbonuses")],
    ["w4.meals", 189, "_customBlock_MealBonus", ["TotDmg"], lookup("w4.meals")],
    ["w7.menagerie", 189, "_customBlock_MenagerieStuff", ["LumiGainRate"], lookup("w7.menagerie")],
    ["w7.jelly", 189, "_customBlock_JellyOperation", ["UpgCost"], lookup("w7.jelly")],
    ["w3.mobdeath", 345, "_customBlock_2inputs", [], 0],
    ["w3.towerdamage", 345, "_customBlock_TowerStats", ["damage"], (b) => cheatConfig.w3.towerdamage(b)],
    ["w3.refineryspeed", 345, "_customBlock_Refinery", ["CycleInitialTime"], (b) => cheatConfig.w3.refineryspeed(b)],
    ["w4.labpx", 345, "_customBlock_Labb", ["Dist"], 1000],
    ["w4.labpx", 345, "_customBlock_Labb", ["BonusLineWidth"], 1000],
    ["w2.sigilspeed", 345, "_customBlock_Labb", ["SigilBonusSpeed"], (b) => cheatConfig.w2.alchemy.sigilspeed(b)],
    ["w4.fastforaging", 345, "_customBlock_PetStuff", ["TotalTrekkingHR"], (b) => cheatConfig.w4.fastforaging(b)],
    ["w4.superpets", 345, "_customBlock_PetStuff", ["BlockChance"], lookup("w4.superpets")],
    ["w4.mealspeed", 345, "_customBlock_CookingR", ["CookingReqToCook"], (b) => cheatConfig.w4.mealspeed(b)],
    ["w4.recipespeed", 345, "_customBlock_CookingR", ["CookingFireREQ"], (b) => cheatConfig.w4.recipespeed(b)],
    ["w4.luckychef", 345, "_customBlock_CookingR", ["CookingLUCK"], (b) => cheatConfig.w4.luckychef(b)],
    ["w4.kitchensdiscount", 345, "_customBlock_CookingR", ["CookingUpgSpiceCostQty"], (b) => b / 4],
    ["w4.platesdiscount", 345, "_customBlock_CookingR", ["CookingMenuMealCosts"], (b) => b / 2],
    ["w4.mainframe", 345, "_customBlock_MainframeBonus", [0], (b) => cheatConfig.w4.mainframe[0](b)],
    ["wide.arcade", 345, "_customBlock_DungeonCalc", ["ArcadeCost"], lookup("wide.arcade")],
    ["w1.owl", 579, "_customBlock_Summoning", ["OwlCost"], lookup("w1.owl")],
    ["w2.roo", 579, "_customBlock_Summoning", ["RooCost"], lookup("w2.roo")],
    ["w6.endless", 579, "_customBlock_Summoning", ["EndlessModifierID"], 1],
    ["w6.summoning", 579, "_customBlock_Summoning", ["ManaStart"], lookup("w6.summoning")],
    ["w6.grimoire", 579, "_customBlock_Summoning", ["GrimoireUpgCost"], lookup("w6.grimoire")],
    ["wide.giant", 579, "_customBlock_Thingies", ["GuaranteedCrystalMobs"], 0],
    ["wide.hoopshop", 579, "_customBlock_Thingies", ["HoopsUpgCost"], lookup("wide.hoopshop")],
    ["wide.dartshop", 579, "_customBlock_Thingies", ["DartsUpgCost"], lookup("wide.dartshop")],
    ["w7.zenith", 579, "_customBlock_Thingies", ["ZenithMarketCost"], lookup("w7.zenith")],
    ["w7.clam", 579, "_customBlock_Thingies", ["Clam_Cost"], lookup("w7.clam")],
    ["w7.reef", 579, "_customBlock_Thingies", ["ReefCost"], lookup("w7.reef")],
    ["w7.coralkid", 579, "_customBlock_Thingies", ["CoralKidUpgCost"], lookup("w7.coralkid")],
    ["w6.sneaksymbol", 579, "_customBlock_Thingies", ["SneakSymbolChanceBase"], lookup("w6.sneaksymbol")],
    ["w3.globalshrines", 579, "_customBlock_Thingies", ["LegendPTS_bonus", 38, 0], BASE],
    ["w5.holes", 579, "_customBlock_Holes", ["BuildCost", 1], lookup("w5.holes")],
    ["w5.holes", 579, "_customBlock_Holes", ["Cost_FountainUPG"], BASE],
    ["w5.holes", 579, "_customBlock_Holes2", ["Cost_FountainUPG", 2], lookup("w5.holes")],
    ["w5.holes", 579, "_customBlock_Holes2", ["BuildCost"], BASE],
    ["w5.sailing", 579, "_customBlock_Sailing", ["IslandDistance"], (b) => cheatConfig.w5.sailing.IslandDistance(b)],
    ["w3.globalshrines", 579, "_customBlock_Sailing", ["ArtifactBonus", 0, 0], BASE],
    ["w5.gaming", 579, "_customBlock_GamingStatType", ["SproutCapacity"], lookup("w5.gaming")],
    ["w5.divinity", 579, "_customBlock_Divinity", ["StyleLvReq"], lookup("w5.divinity")],
    ["w5.collider", 579, "_customBlock_AtomCollider", ["AtomCost"], lookup("w5.collider")],
    ["w3.instantdreams", 579, "_customBlock_Dreamstuff", ["BarFillReq"], 0],
    ["wide.plunderous", 579, "_customBlock_TalentEnh", [318], 100],
    ["w6.farming", 579, "_customBlock_FarmingStuffs", ["GrowthReq"], lookup("w6.farming")],
    ["w6.ninja", 579, "_customBlock_Ninja", ["KOtime"], lookup("w6.ninja")],
    ["w6.windwalker", 579, "_customBlock_Windwalker", ["Compass_HP"], lookup("w6.windwalker")],
    ["w6.arcane", 579, "_customBlock_ArcaneType", ["Arcane_HP"], lookup("w6.arcane")],
    ["w6.royal", 579, "_customBlock_RoyalG", ["RatDMG"], lookup("w6.royal")],
    ["w7.bubba", 579, "_customBlock_Bubbastuff", ["UpgCost"], lookup("w7.bubba")],
    ["w7.minehead", 579, "_customBlock_Minehead", ["BaseDMG"], lookup("w7.minehead")],
    ["w7.glimbo", 579, "_customBlock_Minehead", ["Glimbo_Cost"], lookup("w7.glimbo")],
    ["w7.research", 579, "_customBlock_ResearchStuff", ["MaxRoll"], lookup("w7.research")],
    ["w7.spelunk", 579, "_customBlock_Spelunk", ["POW"], lookup("w7.spelunk")],
    ["w7.bigfish", 579, "_customBlock_Spelunk", ["BigFishCost"], lookup("w7.bigfish")],
    ["w7.spelunkmana", 579, "_customBlock_Spelunk", ["StaminaCostMulti"], lookup("w7.spelunkmana")],
    ["w7.gallery", 579, "_customBlock_Gallery", ["GalleryBonusMulti"], lookup("w7.gallery")],
    ["w7.sushi", 579, "_customBlock_SushiStuff", ["FuelCost"], lookup("w7.sushi")],
];

// Real game data the hooks read.
cheatConfig.misc = undefined;
context["com.stencyl.behavior.Script"].getCurrentSceneName = () => game.scene;
game.scene = "w1";
gga.Lv0 = Array(14).fill(0);
gga.DNSM = { h: { SailzDN4: 0 } };
gga.PlacedTraps = [];
gga.PlayerDATABASE = { h: {} };
const ninjaInfo = Array(42).fill([]);
ninjaInfo[38] = ["", "11"];
ninjaInfo[41] = ["", "", "", "", "40"];
gga.CustomLists = { h: { NinjaInfo: ninjaInfo, ItemToCraftEXP: {} } };
const { hookFailures, error } = await setup();

test("every hook these tests use installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

const call = (number, method, args) => events(number)[method](...args);

for (const [cheat, number, method, args, on] of lookups) {
    test(`${cheat}: ${method}(${args.join(", ")})`, () => {
        game.base = BASE;
        set(cheat, false);
        assert.deepEqual(call(number, method, args), BASE, "off: the game's result");
        set(cheat, true);
        const expected = typeof on === "function" ? on(BASE, args) : on;
        assert.deepEqual(call(number, method, args), expected, "on");
        set(cheat, false);
    });
}

test("each lookup runs the game's method once, before deciding", () => {
    set("w1.owl");
    game.calls.length = 0;
    call(579, "_customBlock_Summoning", ["OwlCost"]);
    assert.deepEqual(game.calls, ["_customBlock_Summoning"]);
    set("w1.owl", false);
});

test("wide.plunderous: a mob only counts when it already has the buff, or for every character when configured", () => {
    set("wide.plunderous");
    game.base = 0;
    assert.equal(call(12, "_customBlock_GetBuffBonuses", [318]), 0);
    cheatConfig.wide.plunderous.allcharacters = true;
    assert.equal(call(12, "_customBlock_GetBuffBonuses", [318]), 1);
    cheatConfig.wide.plunderous.allcharacters = false;
    set("wide.plunderous", false);
});

test("nomore: drops matching a configured item are filtered out", () => {
    game.base = () => [
        ["Junk1", 1],
        ["Gem", 2],
    ];
    assert.deepEqual(call(12, "_customBlock_GenerateMonsterDrops", []), [
        ["Junk1", 1],
        ["Gem", 2],
    ]);
    cheatConfig.nomore = { items: [/^Junk/] };
    assert.deepEqual(call(12, "_customBlock_GenerateMonsterDrops", []), [["Gem", 2]]);
    delete cheatConfig.nomore;
});

test("stamp cost: the cost part of the game's [currency, cost] is reduced", () => {
    game.base = () => ["Money", 100];
    assert.deepEqual(call(124, "_customBlock_StampCostss", []), ["Money", 100]);
    set("w1.stampcost");
    assert.deepEqual(call(124, "_customBlock_StampCostss", []), ["Money", cheatConfig.w1.stampcost(100)]);
    set("w1.stampcost", false);
});

test("keychain: a configured keychain function rewrites the game's stats", () => {
    game.base = BASE;
    assert.equal(call(345, "_customBlock_keychainn", []), BASE);
    cheatConfig.misc = { keychain: (base) => base * 2 };
    assert.equal(call(345, "_customBlock_keychainn", []), BASE * 2);
    cheatConfig.misc = undefined;
});

test("global shrines: a zero shrine bonus becomes 1, a set one stays", () => {
    set("w3.globalshrines");
    game.base = 0;
    assert.equal(call(579, "_customBlock_Thingies", ["LegendPTS_bonus", 38, 0]), 1);
    assert.equal(call(579, "_customBlock_Thingies", ["LegendPTS_bonus", 37, 0]), 0);
    assert.equal(call(579, "_customBlock_Sailing", ["ArtifactBonus", 0, 0]), 1);
    assert.equal(call(579, "_customBlock_Sailing", ["ArtifactBonus", 1, 0]), 0);
    set("w5.sailing");
    assert.equal(call(579, "_customBlock_Sailing", ["ArtifactBonus", 0, 0]), Math.max(1, 0));
    set("w5.sailing", false);
    set("w3.globalshrines", false);
});

test("ender captains: a pedestal rolls 6 once the emporium bonus is bought and sailing is level 50", () => {
    set("w5.endercaptains");
    game.base = 2;
    game.returns._customBlock_Ninja = (key) => (key === "EmporiumBonus" ? 1 : 0);
    gga.Lv0[13] = 49;
    assert.equal(call(579, "_customBlock_Sailing", ["CaptainPedastalTypeGen"]), 2);
    gga.Lv0[13] = 50;
    assert.equal(call(579, "_customBlock_Sailing", ["CaptainPedastalTypeGen"]), 6);
    assert.equal(gga.DNSM.h.SailzDN4, 6);
    delete game.returns._customBlock_Ninja;
    set("w5.endercaptains", false);
});

test("vote bonus: ballot and meritocracy bonuses are the list value times the current multiplier", () => {
    game.base = 3;
    game.returns._customBlock_Summoning = (key) =>
        key === "MeritocBonuszMulti" ? 2 : key === "VotingBonuszMulti" ? 5 : 0;
    set("wide.votebonus");
    assert.equal(call(579, "_customBlock_Summoning2", ["MeritocBonusz", 1]), 2 * 40);
    assert.equal(call(579, "_customBlock_Summoning2", ["VotingBonusz", 0]), 5 * 11);
    assert.equal(call(579, "_customBlock_Summoning2", ["Other", 0]), 3);
    game.scene = "PlayerSelect";
    assert.equal(call(579, "_customBlock_Summoning2", ["MeritocBonusz", 1]), 3, "not on the character select screen");
    game.scene = "w1";
    set("wide.votebonus", false);
    assert.equal(call(579, "_customBlock_Summoning2", ["MeritocBonusz", 1]), 3);
    delete game.returns._customBlock_Summoning;
});

test("trapping: online seconds and away time add the multiplied progress to every placed trap", () => {
    const traps = () => [
        [0, 0, 5],
        [0, 0, -1],
    ];
    gga.PlacedTraps = traps();
    gga.PlayerDATABASE = { h: { Alice: { h: { PldTraps: traps() } } } };
    call(189, "_customBlock_1second", []);
    assert.equal(gga.PlacedTraps[0][2], 5, "off: untouched");
    set("w3.trapping");
    call(189, "_customBlock_1second", []);
    assert.deepEqual(gga.PlacedTraps, [
        [0, 0, 5 + cheatConfig.w3.trapping(1) - 1],
        [0, 0, -1],
    ]);
    call(266, "_customBlock_AwayTimers", [100]);
    call(266, "_customBlock_AwayTimers", [0]);
    call(266, "_customBlock_AwayTimers", [1e9]);
    assert.equal(
        gga.PlayerDATABASE.h.Alice.h.PldTraps[0][2],
        5 + cheatConfig.w3.trapping(1) - 1 + cheatConfig.w3.trapping(100) - 100
    );
    set("w3.trapping", false);
});
