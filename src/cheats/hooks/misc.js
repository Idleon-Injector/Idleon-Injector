/**
 * Hooks that don't fit elsewhere
 *
 * - Ability (no cooldown, no cast time, no mana)
 * - Quest (free quest requirements)
 * - Smith (free crafting)
 */

import { cheatState } from "../core/state.js";
import { cList, customMaps, dialogueDefs, gameContext } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { deepCopy } from "../utils/deepCopy.js";

/** A copy of game data, changed by `change`, made once per game object the first time a cheat needs it. */
function changedCopy(change) {
    const copies = new WeakMap();
    return (obj) => {
        if (!copies.has(obj)) copies.set(obj, change(deepCopy(obj)));
        return copies.get(obj);
    };
}

const freeMoves = changedCopy((moves) => {
    for (const value of Object.values(moves)) {
        value.h.cooldown = 0;
        value.h.castTime = 0.1;
        value.h.manaCost = 0;
    }
    return moves;
});

// Ability: no cooldown, no cast time, no mana cost
defineHook(
    { id: "godlike.ability", target: () => customMaps.atkMoveMap, property: "h", proxy: true },
    {
        get(obj, prop) {
            if (cheatState.godlike.ability) return freeMoves(obj)[prop];
            return Reflect.get(obj, prop);
        },
    }
);

const freeQuests = changedCopy((defs) => {
    // Go over all the quest-giving NPCs
    for (const value of Object.values(defs)) {
        for (let i = 0; i < value[1].length; i++) {
            if (value[1][i].length === 9) {
                if (value[1][i][2] === value[1][i][8]) {
                    for (let j = 0; j < value[1][i][3].length; j++) {
                        value[1][i][3][j][1] = 0;
                        value[1][i][3][j][3] = 0;
                    }
                } else {
                    for (let j = 0; j < value[1][i][3].length; j++) {
                        value[1][i][3][j] = 0;
                    }
                }
            }
        }
    }
    return defs;
});

// Quest: free quest requirements
defineHook(
    { id: "wide.quest", target: () => dialogueDefs.dialogueDefs, property: "h", proxy: true },
    {
        get(obj, prop) {
            if (cheatState.wide.quest) return freeQuests(obj)[prop];
            return Reflect.get(obj, prop);
        },
    }
);

let freeRecipes = null;

// Around: free crafting replaces the game's recipe costs, so the game's lookup must not run.
defineHook(
    { id: "w1.smith", target: () => gameContext["scripts.CustomLists"], method: "ItemToCraftCostTYPE", around: true },
    (callOriginal) => {
        if (!cheatState.w1.smith) return callOriginal();
        freeRecipes ??= Object.values(cList.ItemToCraftEXP).map((element) =>
            new Array(element.length).fill([["Copper", "0"]])
        );
        return freeRecipes;
    }
);
