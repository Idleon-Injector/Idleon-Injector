/**
 * Proxies Module Index
 *
 * Central orchestrator for all game proxies.
 * Contains the unified setupAllProxies() function.
 */

// Imports for setupAllProxies
import { setupBehaviorScriptProxies } from "./behavior.js";
import { setupFirebaseStorageProxy, setupSteamAchievementProxy } from "./firebase.js";
import { setupGameAttributeProxies } from "./gameAttributes.js";
import { setupTrappingProxies } from "./trapping.js";
import { setupCListProxy } from "./clist.js";
import { setupEvents012Proxies } from "./events012.js";
import { setupEvents020Proxies } from "./events020.js";
import { setupItemGetNotificationProxy } from "./events034.js";
import { setupEvents038Proxies } from "./events038.js";
import { setupAutoLootProxy } from "./events044.js";
import { setupEvents124Proxies } from "./events124.js";
import { setupEvents189Proxies } from "./events189.js";
import { setupItemsMenuProxy } from "./events312.js";
import { setupEvents345Proxies } from "./events345.js";
import { setupEvents481Proxies } from "./events481.js";
import { setupEvents579Proxies } from "./events579.js";
import { setupEvents713Proxies } from "./events713.js";
import { setupEvents091Proxies } from "./events091.js";
import { setupActorProxies } from "./actor.js";
import { setupAbilityProxy, setupQuestProxy, setupSmithProxy } from "./misc.js";
import { setupItemProxies } from "./items.js";
import { setupSushiButtonProxy } from "./sushiButton.js";
import { missingHooks } from "../utils/proxy.js";
import { getDefinedHookFailures, installHooks } from "../core/hooks.js";

// Each step installs one group of hooks, in the order they always ran in.
const steps = [
    // Behavior script proxies (RNG, timing, no damage)
    setupBehaviorScriptProxies,

    // Firebase proxy (companions, party, achievements)
    setupFirebaseStorageProxy,
    setupSteamAchievementProxy,

    // Game attribute proxies (gems, HP, currencies, cloud save, alchemy)
    setupGameAttributeProxies,

    // Trapping progress proxies
    setupTrappingProxies,

    // CList proxies (MTX, refinery, vials, prayers)
    setupCListProxy,

    // ActorEvents proxies by event number
    setupEvents012Proxies,
    setupEvents020Proxies,
    setupAutoLootProxy,
    setupItemGetNotificationProxy,
    setupEvents038Proxies,
    setupEvents124Proxies,
    setupEvents189Proxies,
    setupItemsMenuProxy,
    setupEvents345Proxies,
    setupEvents481Proxies,
    setupEvents579Proxies,
    setupEvents713Proxies,
    setupSushiButtonProxy,
    setupEvents091Proxies,
    setupActorProxies,

    // Misc proxies (abilities, quests, smithing)
    setupAbilityProxy,
    setupQuestProxy,
    setupSmithProxy,

    // Item definition proxies (godlike speed, upstones, equipall, candytime)
    setupItemProxies,

    // Every defineHook hook in src/cheats/hooks/ (minigames, storage) and the re-apply on character select
    installHooks,
];

/** Steps that ran to the end; they are never run again, so their hooks are never wrapped twice. */
const finishedSteps = new Set();

/** What went wrong in each step, by step name. */
const failures = new Map();

/**
 * Every hook that failed to install, as "setupX: what went wrong" lines.
 * @returns {string[]}
 */
export function getHookFailures() {
    return [...failures.values()].flat().concat(getDefinedHookFailures());
}

/**
 * Setup all game proxies.
 *
 * Each step runs on its own, so one that throws (for example a game object an update removed) doesn't
 * stop the ones after it. A step that threw runs again on the next call; one that finished doesn't.
 * Call this after the game is ready and common variables are registered.
 *
 * @returns {boolean} True when every step has run to the end (missing methods are reported, not retried).
 */
export function setupAllProxies() {
    for (const step of steps) {
        if (finishedSteps.has(step)) continue;
        missingHooks.length = 0;
        const stepFailures = [];
        try {
            step();
            finishedSteps.add(step);
        } catch (error) {
            stepFailures.push(`${step.name}: ${error.message}`);
        }
        // ponytail: a step that threw partway runs again from the top, so hooks it installed before the throw
        // can be wrapped twice unless the step guards them (_isPatched, as the game-data steps do). Missing
        // methods don't throw, so this needs a step to break outside createMethodProxy. defineHook hooks (the
        // installHooks step) record each hook instead; #15 moves the other steps onto it.
        if (missingHooks.length) stepFailures.unshift(`${step.name}: ${missingHooks.join(", ")} not found`);
        if (stepFailures.length) failures.set(step.name, stepFailures);
        else failures.delete(step.name);
    }
    return finishedSteps.size === steps.length;
}
