/**
 * Behavior script hooks (com.stencyl.behavior.Script)
 *
 * - randomFloatBetween, randomInt, randomFloat: RNG manipulation, the max VIP book, and better nuggets
 * - runLater: instant divine intervention
 * - runPeriodically: instant bubo poison
 * - createRecycledActor: no damage text; the "+n" popup of a bubble raised by automation bubbles
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { behavior, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { noteBubblePopup } from "../helpers/automation/bubbles.js";

// Around: a forced roll replaces the game's random number, so the game's roll must not run.
defineHook(
    { id: "rng", target: () => behavior, method: "randomFloatBetween", around: true },
    (callOriginal, min, max) => {
        if (cheatState.rng === "high") return max;
        if (cheatState.rng === "low") return min;
        if (cheatState.rng) return cheatState.rng;
        return callOriginal();
    }
);

// w5 betternuggets: a dug nugget is worth bonus / roll^0.64, its roll randomFloatBetween(1E-5, 1), the game's only call
// with those bounds. Raising the roll's place in that range to the configured power leans it low, so nuggets come out
// bigger, still within the game's own range.
defineHook({ id: "w5.betternuggets", target: () => behavior, method: "randomFloatBetween" }, (base, min, max) => {
    if (!cheatState.w5.betternuggets || min !== 1e-5 || max !== 1) return base;
    return min + (max - min) * ((base - min) / (max - min)) ** cheatConfig.w5.betternuggets;
});

// Around: a forced roll replaces the game's random number, so the game's roll must not run.
defineHook(
    { id: "rng, w3.book", target: () => behavior, method: "randomInt", around: true },
    (callOriginal, min, max) => {
        // Handle array of RNG values (for sequential manipulation)
        if (Array.isArray(cheatState.rngInt) && cheatState.rngInt.length > 0) {
            const value = cheatState.rngInt.shift();
            if (cheatState.rngInt.length === 0) cheatState.rngInt = value;

            if (value === "high") return max;
            if (value === "low") return min;
            return value;
        }

        if (cheatState.rngInt === "high") return max;
        if (cheatState.rngInt === "low") return min;
        if (cheatState.rngInt) return cheatState.rngInt;

        // Force VIP book to always be max level
        if (cheatState.w3.book && gga.MenuType2 === 31 && min === 1) {
            return max;
        }

        return callOriginal();
    }
);

// Around: a forced roll replaces the game's random number, so the game's roll must not run.
defineHook({ id: "rng", target: () => behavior, method: "randomFloat", around: true }, (callOriginal) => {
    if (cheatState.rngF === "high") return 1.0;
    if (cheatState.rngF === "low") return 0.0;
    if (cheatState.rngF) return cheatState.rngF;
    return callOriginal();
});

// Around: the timer's delay is an argument, so it must change before the game schedules it.
defineHook(
    { id: "godlike.intervention", target: () => behavior, method: "runLater", around: true },
    (callOriginal, ...args) => {
        // needs optional chaining otherwise the game get bricked
        const behaviorName = args[2]?.behaviors?.behaviors?.[0]?.name;
        if (cheatState.godlike?.intervention && args[0] === 2400 && behaviorName === "ActorEvents_481") {
            args[0] = 0;
        }
        callOriginal(args);
    }
);

// Around: the timer's delay is an argument, so it must change before the game schedules it.
defineHook(
    { id: "godlike.poison", target: () => behavior, method: "runPeriodically", around: true },
    (callOriginal, ...args) => {
        // needs optional chaining otherwise the game get bricked
        const behaviorName = args[2]?.behaviors?.behaviors?.[0]?.name;
        if (cheatState.godlike.poison && args[0] === 2e3 && behaviorName === "ActorEvents_575") {
            args[0] = 5;
        }
        callOriginal(args);
    }
);

// Around: a damage number the game created would show, so it must never be created.
defineHook(
    { id: "wide.nodmg", target: () => behavior, method: "createRecycledActor", around: true },
    (callOriginal, type) => {
        if (cheatState.wide.nodmg && typeof type === "object" && type.ID === 10) {
            return null;
        }
        return callOriginal();
    }
);

// A bubble upgrade spawns its "+n" popup at the menu panel's spot even with the menu closed; the automation takes it away.
defineHook({ id: "automation.bubbles", target: () => behavior, method: "createRecycledActor" }, (base) => {
    noteBubblePopup(base);
    return base;
});
