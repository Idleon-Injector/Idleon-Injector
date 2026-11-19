/**
 * ActorEvents_345 hooks (its ActionBlock hooks are in storagecap.js)
 *
 * - WorkbenchStuff (flags, buildings, books, shrines, printer)
 * - 2inputs (worship mob death)
 * - TowerStats (tower damage)
 * - Refinery (refinery speed)
 * - Breeding (eggs, fence yard, battle slots, genetics, pets)
 * - Labb (lab connections, sigil speed)
 * - PetStuff (foraging, super pets)
 * - CookingR (meal speed, recipe speed, lucky chef, kitchens, plates)
 * - MainframeBonus (mainframe cheats)
 * - DungeonCalc (arcade cheats)
 * - keychainn (keychain stats)
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { events } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { getMultiplyValue } from "../helpers/values.js";

// Around: the max book level is read by asking the game for another key, and printing asks it twice.
defineHook(
    {
        id: "w3.book, w3.flagreq, w3.freebuildings, w3.instabuild, w3.booktime, w3.totalflags, w3.buildspd, multiply.printer",
        target: () => events(345),
        method: "_customBlock_WorkbenchStuff",
        around: true,
    },
    (callOriginal, ...args) => {
        const key = args[0];

        // For minBookLv, ask the game for maxBookLv instead
        if (cheatState.w3.book && key === "minBookLv") {
            args[0] = "maxBookLv";
        }

        const base = callOriginal(args);

        if (cheatState.w3.flagreq && key === "FlagReq") return 0;
        if (cheatState.w3.freebuildings && (key === "TowerSaltCost" || key === "TowerMatCost")) return 0;
        if (cheatState.w3.instabuild && key === "TowerBuildReq") return 0;
        if (cheatState.w3.booktime && key === "BookReqTime") return 1;
        if (cheatState.w3.totalflags && key === "TotalFlags") return 10;
        if (cheatState.w3.buildspd && key === "PlayerBuildSpd") return cheatConfig.w3.buildspd(base);
        if (cheatState.multiply.printer && key === "ExtraPrinting") {
            args[0] = "AdditionExtraPrinting";
            const additionBase = callOriginal(args);
            return additionBase * getMultiplyValue("printer");
        }

        return base;
    }
);

// Worship mob death
defineHook({ id: "w3.mobdeath", target: () => events(345), method: "_customBlock_2inputs" }, (base) =>
    cheatState.w3.mobdeath ? 0 : base
);

// Tower stats (tower damage)
defineHook({ id: "w3.towerdamage", target: () => events(345), method: "_customBlock_TowerStats" }, (base, key) => {
    if (cheatState.w3.towerdamage && key === "damage") {
        return cheatConfig.w3.towerdamage(base);
    }
    return base;
});

// Refinery speed
defineHook({ id: "w3.refineryspeed", target: () => events(345), method: "_customBlock_Refinery" }, (base, key) => {
    if (cheatState.w3.refineryspeed && key === "CycleInitialTime") {
        return cheatConfig.w3.refineryspeed(base);
    }
    return base;
});

// Around: pet breeding rolls low with a fixed argument while the game rolls, then gets a bonus.
defineHook(
    {
        id: "w4.petrng, w4.eggcap, w4.fenceyard, w4.battleslots, w4.petchance, w4.genes, w4.fasteggs, w4.petupgrades",
        target: () => events(345),
        method: "_customBlock_Breeding",
        around: true,
    },
    (callOriginal, ...args) => {
        const key = args[0];

        if (cheatState.w4.petrng && key === "PetQTYonBreed") {
            cheatState.rng = "low";
            args[2] = 8;
            const base = callOriginal(args);
            cheatState.rng = false;
            return Math.round(base * (1 + Math.random() * 0.2));
        }

        const base = callOriginal();

        if (cheatState.w4.eggcap && key === "TotalEggCapacity") return 13;
        if (cheatState.w4.fenceyard && key === "FenceYardSlots") return 27;
        if (cheatState.w4.battleslots && key === "PetBattleSlots") return 6;
        if (cheatState.w4.petchance && key === "TotalBreedChance") return cheatConfig.w4.petchance(base);
        if (cheatState.w4.genes && key === "GeneticCost") return 0;
        if (cheatState.w4.fasteggs && key === "TotalTimeForEgg") return cheatConfig.w4.fasteggs(base);
        if (cheatState.w4.petupgrades && key === "PetUpgCostREAL") return cheatConfig.w4.petupgrades(base);

        return base;
    }
);

// Lab (lab connections, sigil speed)
defineHook({ id: "w4.labpx, w2.sigilspeed", target: () => events(345), method: "_customBlock_Labb" }, (base, key) => {
    if (cheatState.w4.labpx && (key === "Dist" || key === "BonusLineWidth")) return 1000;
    if (cheatState.w2.sigilspeed && key === "SigilBonusSpeed") {
        return cheatConfig.w2.alchemy.sigilspeed(base);
    }
    return base;
});

// Pet stuff (foraging, super pets)
defineHook(
    { id: "w4.fastforaging, w4.superpets", target: () => events(345), method: "_customBlock_PetStuff" },
    (base, key) => {
        if (cheatState.w4.fastforaging && key === "TotalTrekkingHR") {
            return cheatConfig.w4.fastforaging(base);
        }
        if (cheatState.w4.superpets && cheatConfig.w4.superpets[key]) {
            return cheatConfig.w4.superpets[key](base);
        }
        return base;
    }
);

// Cooking (meal speed, recipe speed, lucky chef, kitchens, plates)
defineHook(
    {
        id: "w4.mealspeed, w4.recipespeed, w4.luckychef, w4.kitchensdiscount, w4.platesdiscount",
        target: () => events(345),
        method: "_customBlock_CookingR",
    },
    (base, key) => {
        if (cheatState.w4.mealspeed && key === "CookingReqToCook") return cheatConfig.w4.mealspeed(base);
        if (cheatState.w4.recipespeed && key === "CookingFireREQ") return cheatConfig.w4.recipespeed(base);
        if (cheatState.w4.luckychef && key === "CookingLUCK") return cheatConfig.w4.luckychef(base);
        if (
            cheatState.w4.kitchensdiscount &&
            (key === "CookingNewKitchenCoinCost" || key === "CookingUpgSpiceCostQty")
        ) {
            return cheatConfig.w4.kitchensdiscount(base);
        }
        if (cheatState.w4.platesdiscount && key === "CookingMenuMealCosts") {
            return cheatConfig.w4.platesdiscount(base);
        }
        return base;
    }
);

// Mainframe bonus
defineHook({ id: "w4.mainframe", target: () => events(345), method: "_customBlock_MainframeBonus" }, (base, key) => {
    if (cheatState.w4.mainframe && key in cheatConfig.w4.mainframe) {
        return cheatConfig.w4.mainframe[key](base);
    }
    return base;
});

// Dungeon calc (arcade cheats)
defineHook({ id: "wide.arcade", target: () => events(345), method: "_customBlock_DungeonCalc" }, (base, key) => {
    if (cheatState.wide.arcade && key in cheatConfig.wide.arcade) {
        return cheatConfig.wide.arcade[key](base);
    }
    return base;
});

// Keychain stats override (Flurbo store)
defineHook({ id: "misc.keychain", target: () => events(345), method: "_customBlock_keychainn" }, (base) => {
    if (typeof cheatConfig.misc?.keychain === "function") {
        return cheatConfig.misc.keychain(base);
    }
    return base;
});
