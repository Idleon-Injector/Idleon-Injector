/**
 * State Accessors API
 *
 * Functions for accessing and modifying game state:
 * - Unified path-based read/write (readPath, writePath)
 * - Selective object-entry reads for large maps (readEntries)
 * - Small computed-value bridge for internal helper families
 * - cheatState access
 */

import { cheatState } from "../core/state.js";
import { getAutomations, withAutomations } from "../core/automations.js";
import { events } from "../core/globals.js";
import { getPlayerExpRequired } from "../helpers/player.js";
import { getPetTokens } from "../helpers/petTokens.js";
import { attireStatus } from "../helpers/attire/outfits.js";
import { getAutomationShops } from "../helpers/automation/shops.js";
import {
    captureWardrobe,
    wardrobeFood,
    wardrobePerfect,
    wardrobePerfectFood,
    wardrobePreview,
    wardrobeStatus,
} from "../helpers/wardrobe/index.js";
export { readPath, readPaths, readEntries, deletePath, writePath, writePaths } from "../utils/pathResolver.js";

// The Wardrobe page's reads (#101): readComputed("wardrobe", name, [args]).
const WARDROBE = {
    status: wardrobeStatus,
    preview: wardrobePreview,
    capture: () => captureWardrobe(),
    food: wardrobeFood,
    perfect: wardrobePerfect,
    perfectFood: wardrobePerfectFood,
};

const COMPUTED_SOURCES = {
    menagerie: { eventId: 189, method: "_customBlock_MenagerieStuff" },
    workbench: { eventId: 345, method: "_customBlock_WorkbenchStuff" },
    breeding: { eventId: 345, method: "_customBlock_Breeding" },
    alchemy: { eventId: 189, method: "_customBlock_cauldronp2wbonuses" },
    summoning: { eventId: 579, method: "_customBlock_Summoning" },
    cookingMastery: { eventId: 579, method: "_customBlock_Summoning2" },
    atomCollider: { eventId: 579, method: "_customBlock_AtomCollider" },
    runCode: { eventId: 12, method: "_customBlock_RunCodeOfTypeXforThingY" },
    runCodeType: { eventId: 12, method: "_customBlock_RunCodeOfType" },
    dream: { eventId: 579, method: "_customBlock_Dreamstuff" },
    skillStats: { eventId: 12, method: "_customBlock_SkillStats" },
    thingies: { eventId: 579, method: "_customBlock_Thingies" },
    minehead: { eventId: 579, method: "_customBlock_Minehead" },
    farming: { eventId: 579, method: "_customBlock_FarmingStuffs" },
};

/** Which cheats are on, running automations included, for the WebUI's active-cheats list. */
export function getcheatStateList() {
    return withAutomations(cheatState);
}

/**
 * Read a computed value from a game helper family.
 * Uses the same injected ActorEvents access pattern as the minigame cheats:
 * events(345), events(579), etc. The UI never touches ActorEvents directly.
 *
 * @param {string} namespace
 * @param {string} name
 * @param {Array=} args
 * @returns {{ value: any } | { error: string }}
 */
export function readComputed(namespace, name, args = []) {
    if (!namespace || typeof namespace !== "string") return { error: "Missing or invalid namespace" };
    if (!name || typeof name !== "string") return { error: "Missing or invalid name" };
    if (!Array.isArray(args)) return { error: "args must be an array" };

    if (namespace === "player" && name === "expRequired") {
        try {
            return { value: getPlayerExpRequired(...args) };
        } catch (error) {
            return { error: error.message };
        }
    }

    if (namespace === "attire" && name === "status") {
        try {
            return { value: attireStatus() };
        } catch (error) {
            return { error: error.message };
        }
    }

    if (namespace === "wardrobe" && Object.prototype.hasOwnProperty.call(WARDROBE, name)) {
        try {
            return { value: WARDROBE[name](...args) };
        } catch (error) {
            return { error: error.message };
        }
    }

    // Account › Automation: its automations ("automation …" toggles) with their status, and the town shops.
    if (namespace === "automation" && (name === "list" || name === "shops")) {
        try {
            if (name === "shops") return { value: getAutomationShops() };
            return { value: getAutomations().filter(({ cheat }) => cheat.startsWith("automation ")) };
        } catch (error) {
            return { error: error.message };
        }
    }

    if (namespace === "companions" && name === "petTokens") {
        try {
            return { value: getPetTokens() };
        } catch (error) {
            return { error: error.message };
        }
    }

    const source = COMPUTED_SOURCES[namespace];
    if (!source) return { error: `Unsupported computed namespace: ${namespace}` };
    if (typeof events !== "function") return { error: "ActorEvents bridge unavailable" };

    try {
        const actorEvents = events(source.eventId);
        const fn = actorEvents?.[source.method];
        if (typeof fn !== "function") {
            return { error: `Computed helper unavailable: ${namespace}.${name}` };
        }
        return { value: Reflect.apply(fn, actorEvents, [name, ...args]) };
    } catch (e) {
        return { error: `Computed helper threw (${namespace}.${name}): ${e?.message ?? String(e)}` };
    }
}

/**
 * Read many computed values from one game helper family.
 * Resolves ActorEvents and helper once, then preserves per-item failures.
 *
 * @param {string} namespace
 * @param {string} name
 * @param {Array[]=} argSets
 * @returns {{ value: Array<{ ok: boolean, value?: any, error?: string }> } | { error: string }}
 */
export function readComputedMany(namespace, name, argSets = []) {
    if (!namespace || typeof namespace !== "string") return { error: "Missing or invalid namespace" };
    if (!name || typeof name !== "string") return { error: "Missing or invalid name" };
    if (!Array.isArray(argSets)) return { error: "argSets must be an array" };
    if (!argSets.every(Array.isArray)) return { error: "argSets must contain arrays" };

    const source = COMPUTED_SOURCES[namespace];
    if (!source) return { error: `Unsupported computed namespace: ${namespace}` };
    if (typeof events !== "function") return { error: "ActorEvents bridge unavailable" };

    try {
        const actorEvents = events(source.eventId);
        const fn = actorEvents?.[source.method];
        if (typeof fn !== "function") {
            return { error: `Computed helper unavailable: ${namespace}.${name}` };
        }

        const value = argSets.map((args) => {
            try {
                return { ok: true, value: Reflect.apply(fn, actorEvents, [name, ...args]) };
            } catch (e) {
                return { ok: false, error: `Computed helper threw (${namespace}.${name}): ${e?.message ?? String(e)}` };
            }
        });

        return { value };
    } catch (e) {
        return { error: `Computed helper threw (${namespace}.${name}): ${e?.message ?? String(e)}` };
    }
}
