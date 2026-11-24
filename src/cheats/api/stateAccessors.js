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
import { getAutomationBubba } from "../helpers/automation/bubba.js";
import { getAutomationBubbles } from "../helpers/automation/bubbles.js";
import { getAutomationClicker } from "../helpers/automation/clickers.js";
import { getAutomationConstruction } from "../helpers/automation/construction.js";
import { getAutomationCooking } from "../helpers/automation/cooking.js";
import { getAutomationArmory } from "../helpers/automation/armory.js";
import { compass } from "../helpers/automation/compass.js";
import { grimoire } from "../helpers/automation/grimoire.js";
import { tesseract } from "../helpers/automation/tesseract.js";
import { getAutomationShops } from "../helpers/automation/shops.js";
import { getAutomationSneaking } from "../helpers/automation/sneaking.js";
import { getAutomationSummoning } from "../helpers/automation/summoning.js";
import {
    captureWardrobe,
    wardrobeFood,
    wardrobePerfect,
    wardrobePerfectFood,
    wardrobePreview,
    wardrobeStatus,
} from "../helpers/wardrobe/index.js";
import { characterInPlay } from "../helpers/wardrobe/perfect.js";
import { writePaths as writeAllPaths } from "../utils/pathResolver.js";
export { readPath, readPaths, readEntries, deletePath, writePath } from "../utils/pathResolver.js";

/**
 * Write many game values (see pathResolver's writePaths). With `character`, the one the writes were planned for:
 * when another character is in play, nothing is written and the error (marked `refused`) says who is. The check and
 * the writes run in this one call, so the player can't switch characters between them.
 */
export function writePaths(writes, character) {
    if (character !== undefined) {
        try {
            characterInPlay(character);
        } catch (error) {
            return { error: error.message, refused: true };
        }
    }
    return writeAllPaths(writes);
}

// The Wardrobe page's reads (#101): readComputed("wardrobe", name, [args]).
const WARDROBE = {
    status: wardrobeStatus,
    preview: wardrobePreview,
    capture: () => {
        characterInPlay();
        return captureWardrobe();
    },
    food: wardrobeFood,
    perfect: wardrobePerfect,
    perfectFood: wardrobePerfectFood,
};

// What each automation tab reads (#92): readComputed("automation", name).
const AUTOMATION_TABS = {
    shops: getAutomationShops,
    orion: () => getAutomationClicker("orion"),
    poppy: () => getAutomationClicker("poppy"),
    tarpit: () => getAutomationClicker("tarpit"),
    bubba: getAutomationBubba,
    grimoire: grimoire.read,
    compass: compass.read,
    tesseract: tesseract.read,
    armory: getAutomationArmory,
    sneaking: getAutomationSneaking,
    summoning: getAutomationSummoning,
    cooking: getAutomationCooking,
    bubbles: getAutomationBubbles,
    construction: getAutomationConstruction,
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
    // A talent's number as the game uses it: readComputed("talent", "1", [281]) is GetTalentNumber(1, 281).
    talent: { eventId: 124, method: "_customBlock_GetTalentNumber" },
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

    // Who is in play, by the same check the game's writes for a character make: the WebUI's readCharacterInPlay.
    if (namespace === "player" && name === "inPlay") {
        try {
            return { value: characterInPlay(...args) };
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

    // Account › Automation: its automations ("automation …" toggles) with their status; and what each system's
    // automation tab shows (the town shops, a system's currency and upgrades).
    if (
        namespace === "automation" &&
        (name === "list" || Object.prototype.hasOwnProperty.call(AUTOMATION_TABS, name))
    ) {
        try {
            if (name !== "list") return { value: AUTOMATION_TABS[name]() };
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
