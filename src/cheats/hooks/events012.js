/**
 * ActorEvents_12 hooks: combat and stats
 *
 * - CritChance (100% crit)
 * - PlayerReach (extended attack reach)
 * - ForgeStats (forge capacity and speed)
 * - DamageDealed (damage multiplier)
 * - SkillStats (skill EXP, efficiency, worship speed)
 * - ArbitraryCode (coins, crystals, giant mobs, food, hit chance)
 * - GetBuffBonuses (plunderous mob spawn rate)
 * - RunCodeOfTypeXforThingY (shop stock multiplier)
 * - TotalStats (Attire Rack outfit bonuses, drop rarity multiplier)
 * - GenerateMonsterDrops (filter drops)
 * - ExpMulti (class EXP multiplier)
 * - MaxCapacity (carry capacity multiplier)
 */

import { cheatConfig, cheatState, nomoreBlocks } from "../core/state.js";
import { events } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { getMultiplyValue } from "../helpers/values.js";
import { carryCapKeys } from "../constants.js";
import { totalStatsWithRack } from "../helpers/attire/rack.js";

defineHook({ id: "godlike.crit", target: () => events(12), method: "_customBlock_CritChance" }, (base) =>
    cheatState.godlike.crit ? 100 : base
);

defineHook({ id: "godlike.reach", target: () => events(12), method: "_customBlock_PlayerReach" }, (base) =>
    cheatState.godlike.reach ? 666 : base
);

defineHook({ id: "w1.forge", target: () => events(12), method: "_customBlock_ForgeStats" }, (base, key) => {
    if (cheatState.w1.forge) {
        if (key === 1) return cheatConfig.w1.forge.capacity(base);
        if (key === 2) return cheatConfig.w1.forge.speed(base);
    }
    return base;
});

defineHook({ id: "multiply.damage", target: () => events(12), method: "_customBlock_DamageDealed" }, (base, key) => {
    if (cheatState.multiply.damage && key === "Max") {
        return base * getMultiplyValue("damage");
    }
    return base;
});

defineHook(
    {
        id: "multiply.skillexp, w3.worshipspeed, multiply.efficiency",
        target: () => events(12),
        method: "_customBlock_SkillStats",
    },
    (base, key) => {
        if (cheatState.multiply.skillexp && key === "AllSkillxpMULTI") {
            return base * getMultiplyValue("skillexp");
        }
        if (cheatState.w3.worshipspeed && key in cheatConfig.w3) {
            return cheatConfig.w3[key](base);
        }
        if (cheatState.multiply.efficiency && key.includes("Efficiency")) {
            return base * getMultiplyValue("efficiency");
        }
        return base;
    }
);

defineHook(
    {
        id: "multiply.money, multiply.crystal, wide.giant, godlike.food, godlike.hitchance",
        target: () => events(12),
        method: "_customBlock_ArbitraryCode",
    },
    (base, key) => {
        if (cheatState.multiply.money && key === "MonsterCash") {
            return base * getMultiplyValue("money");
        }
        if (cheatState.multiply.crystal && key === "CrystalSpawn") {
            return base * getMultiplyValue("crystal");
        }
        if (cheatState.wide.giant && key === "GiantMob") return 1;
        if (cheatState.godlike.food && key === "FoodNOTconsume") return 100;
        if (cheatState.godlike.hitchance && key === "HitChancePCT") return 100;
        return base;
    }
);

defineHook({ id: "wide.plunderous", target: () => events(12), method: "_customBlock_GetBuffBonuses" }, (base, key) => {
    if (cheatState.wide.plunderous && key === 318) {
        if (cheatConfig.wide.plunderous.allcharacters || base > 0) return 1;
    }
    return base;
});

defineHook(
    { id: "multiply.shopstock", target: () => events(12), method: "_customBlock_RunCodeOfTypeXforThingY" },
    (base, key) => {
        if (cheatState.multiply.shopstock && key === "ShopQtyBonus") {
            return base * getMultiplyValue("shopstock");
        }
        return base;
    }
);

// Around: the Attire Rack runs the game's method again, with the rack's outfits in the attire slot, to refill a
// cached stat. Declared before multiply.drop, so it is the inner hook and its refill runs the game's own method.
defineHook(
    { id: "wide.attire", target: () => events(12), method: "_customBlock_TotalStats", around: true },
    totalStatsWithRack
);

defineHook({ id: "multiply.drop", target: () => events(12), method: "_customBlock_TotalStats" }, (base, key) => {
    if (cheatState.multiply.drop && key === "Drop_Rarity") {
        return base * getMultiplyValue("drop");
    }
    return base;
});

defineHook({ id: "nomore", target: () => events(12), method: "_customBlock_GenerateMonsterDrops" }, (drops) => {
    return drops.filter((drop) => !nomoreBlocks(drop[0]));
});

defineHook({ id: "multiply.classexp", target: () => events(12), method: "_customBlock_ExpMulti" }, (base, key) => {
    if (cheatState.multiply.classexp && key === 0) {
        return base * getMultiplyValue("classexp");
    }
    return base;
});

defineHook({ id: "multiply.carrycap", target: () => events(12), method: "_customBlock_MaxCapacity" }, (base, key) => {
    if (cheatState.multiply.carrycap && carryCapKeys.has(key)) {
        return base * getMultiplyValue("carrycap");
    }
    return base;
});
