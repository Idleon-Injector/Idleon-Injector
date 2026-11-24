/**
 * Core Registration Module
 *
 * Contains cheat registration functions and the main cheat dispatcher.
 */

import { cheatState, setupDone, cheatConfig } from "./state.js";
import { followToggles } from "./automations.js";
// Note: setup.js is imported dynamically below to avoid circular dependency

/**
 * Registry of all cheat commands.
 * Keys are command strings (e.g., "godlike crit"). Suggestions are evaluated after game readiness.
 * @type {Object<string, {fn: Function, message: string, category: string, needsParam: boolean, suggestions?: Function, dangerous?: boolean}>}
 */
export const cheats = {};

/**
 * Main cheat dispatcher - executes cheat commands once setup has the game's data.
 *
 * A cheat that arrives while the game is still loading waits for setup instead of running against
 * empty game references. After that, setup that hasn't finished (a hook failed) is retried alongside.
 *
 * @param {string} action - The cheat command to execute
 * @param {object} context - The game context (this)
 * @param {boolean} [on] - Turn a toggle cheat on or off instead of flipping it
 * @returns {Promise<{ok: boolean, message: string}>} Result
 */
export async function cheat(action, context, on) {
    if (!setupDone) {
        // Dynamic import to avoid circular dependency
        const { setup, started } = await import("./setup.js");
        const running = setup.call(context);
        if (!started) {
            const { error } = await running;
            if (error) return { ok: false, message: `Cheat setup failed: ${error}` };
        }
    }
    return runCheat(action, context, on);
}

// The switches that turned on a whole family of cheats are gone (#23); typed, they say where the cheats are now.
const GONE = {
    godlike: "in Cheats › Combat",
    upstones: "in Cheats › Items & drops",
    unlock: "in the Cheats area and on their pages",
    wide: "in the Cheats area and on their pages",
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`w${n}`, `on the World ${n} pages`])),
};

/**
 * Run a cheat command now. Parses the action string to find matching cheat commands,
 * passing remaining parts as parameters.
 *
 * @param {string} action - The cheat command to execute
 * @param {object} context - The game context (this)
 * @param {boolean} [on] - Turn a toggle cheat on or off instead of flipping it
 * @returns {{ok: boolean, message: string}} Result
 */
export function runCheat(action, context, on) {
    try {
        const gone = GONE[action.trim()];
        if (gone) return { ok: false, message: `${action.trim()} is gone. Its cheats are ${gone}.` };
        // Renamed commands keep their old names working: a startup list or a habit still types them.
        const command = action.replace(/^w5 collider(?= |$)/, "w3 collider").split(" ");
        const params = [];
        let foundCheat = cheats[command.join(" ")];

        // Progressively pop words from command to params until we find a match
        while (!foundCheat && command.length > 0) {
            params.unshift(command.pop());
            foundCheat = cheats[command.join(" ")];
        }

        if (!foundCheat) return { ok: false, message: `${action.split(" ")[0]} is not a valid option.` };

        const result = foundCheat.fn.call(context, params, on);
        // An automation whose toggle this changed starts or stops now; one that refuses to start fails the cheat.
        const refused = followToggles();
        if (refused) return refused;
        return result?.ok === undefined ? { ok: true, message: String(result ?? "Done") } : result;
    } catch (error) {
        // The stack stays in the game's console; the result carries only the reason.
        console.error(`Cheat '${action}' failed:`, error);
        return { ok: false, message: error?.message || String(error) };
    }
}

/**
 * Every defineCheat row, in the order the cheat files ran. scripts/config-file.mjs writes config.js and the
 * setting descriptions from their `config`; the tests walk them.
 */
export const cheatRows = [];

/**
 * Declare a cheat: one row per command, or one row per group with its subcheats. Copy cheats/_example.js.
 *
 * A row with `fn` and no `subcheats` is a command: `fn(params, on)` gets the words after its name.
 * Any other row is a toggle (cheatState[name]), or a group whose subcheats toggle cheatState[name][sub]; a
 * subcheat with its own `fn` gets [subName, ...params]. Whatever `fn` returns or throws, the player gets
 * `{ ok, message }` (see runCheat).
 *
 * @param {object} row
 * @param {string} row.name - The command ("drop"), or the group's first word ("w1")
 * @param {string} row.message - What it does, shown in the CLI and the WebUI
 * @param {Function} [row.fn] - Runs the command (otherwise it's a toggle)
 * @param {boolean} [row.needsParam] - The command takes words after its name (true for `configurable`)
 * @param {boolean} [row.configurable] - A toggle that also takes a number or boolean, stored in cheatConfig
 * @param {boolean} [row.dangerous] - Can damage the account; subcheats inherit it
 * @param {object[]} [row.subcheats] - Rows for "name sub" (a subcheat has no `config` of its own)
 * @param {boolean} [row.allowToggleChildren] - The bare group command turns every subcheat on or off
 * @param {boolean} [row.registerParent=true] - false: only the subcheats are commands
 * @param {string} [row.category] - The WebUI tab; a group's own name by default, else "general"
 * @param {Function} [row.suggestions] - Returns CLI/WebUI choices using current game data
 * @param {object} [row.config] - This cheat's settings, cheatConfig[name]: each setting is
 *   `{ default, description }`, or `{ example, description }` for one config.js only shows commented out, or
 *   `{ description }` alone for one the cheat sets at runtime. Nest plain objects for groups of settings. An on/off
 *   setting adds `on`, the value the game checks for (`on: 1` for `1 == MainframeBonus(5)`): the WebUI then shows a
 *   switch that writes `(t) => on` or the game's own value. A true/false setting is a switch without it. A setting
 *   whose description would wrap in a page's cheats panel adds `short`, the name the panel shows instead.
 */
export function defineCheat(row) {
    cheatRows.push(row);
    if ("fn" in row && !("subcheats" in row)) registerCheat(row);
    else registerCheats(row);
}

/**
 * Register a simple cheat command.
 *
 * @param {object} cheatDef - Cheat definition object
 * @param {string} cheatDef.name - The command string (e.g., "drop" or "godlike crit")
 * @param {Function} cheatDef.fn - The function to execute when command is called
 * @param {string} cheatDef.message - Help message describing the cheat
 * @param {string} [cheatDef.category="general"] - Category for grouping in UI
 * @param {boolean} [cheatDef.needsParam=false] - Whether this cheat needs/accepts a parameter input
 * @param {Function} [cheatDef.suggestions] - Returns CLI/WebUI choices using current game data
 * @param {boolean} [cheatDef.dangerous] - Can damage the account
 * @param {boolean} [cheatDef.toggle] - An on/off cheat (a row with no `fn`), not a command that runs once
 */
function registerCheat({
    name,
    fn,
    message,
    category = "general",
    needsParam = false,
    suggestions,
    dangerous,
    toggle,
}) {
    cheats[name] = { fn, message, category, needsParam };
    if (suggestions) cheats[name].suggestions = suggestions;
    if (dangerous) cheats[name].dangerous = true;
    if (toggle) cheats[name].toggle = true;
}

/**
 * Register a cheat with optional subcheats.
 *
 * This function handles:
 * - Simple toggle cheats
 * - Configurable cheats (with value input)
 * - Nested subcheats (hierarchical commands)
 * - Mass toggle of all subcheats
 * - Namespace-only parents (children without callable parent)
 *
 * @param {object} cheatMap - Cheat definition object
 * @param {string} cheatMap.name - Command name
 * @param {string} cheatMap.message - Help message
 * @param {string} [cheatMap.category] - Category for grouping (overrides inherited)
 * @param {Function} [cheatMap.fn] - Custom function (overrides default toggle behavior)
 * @param {Function} [cheatMap.suggestions] - Returns CLI/WebUI choices using current game data
 * @param {object[]} [cheatMap.subcheats] - Array of subcheat definitions
 * @param {boolean} [cheatMap.configurable] - Configuration options (implies needsParam: true)
 * @param {boolean} [cheatMap.allowToggleChildren] - Allow mass toggle of all subcheats when parent is called with no args
 * @param {boolean} [cheatMap.registerParent=true] - Register this node as a callable command (set false for namespace-only parents)
 * @param {boolean} [cheatMap.needsParam] - Whether this cheat needs/accepts a parameter input (auto-inferred from configurable if not set)
 * @param {string[]} [higherKeys] - Parent command keys (for recursion)
 * @param {string} [parentCategory] - Category inherited from parent
 * @param {boolean} [parentDangerous] - Danger inherited from parent
 */
function registerCheats(cheatMap, higherKeys = [], parentCategory = null, parentDangerous = false) {
    const cmd = higherKeys.concat(cheatMap.name).join(" ");
    const dangerous = cheatMap.dangerous ?? parentDangerous;

    // Category priority: explicit > inherited > top-level name (if has subcheats) > "general"
    const category =
        cheatMap.category ||
        parentCategory ||
        (higherKeys.length === 0 && cheatMap.subcheats ? cheatMap.name : null) ||
        "general";

    // Navigate to the correct state object level
    const stateObject = higherKeys.reduce((obj, key) => obj[key], cheatState);
    stateObject[cheatMap.name] = "subcheats" in cheatMap ? {} : false;

    if ("subcheats" in cheatMap) {
        stateObject[cheatMap.name + "s"] = false;
    }

    // Create the cheat handler function
    const fn = function (params, on) {
        if ("fn" in cheatMap) {
            return cheatMap.fn.call(this, higherKeys.concat(cheatMap.name).concat(params).splice(1));
        }

        // Handle configurable cheats with value input
        if (params.length > 0) {
            if (!("configurable" in cheatMap)) {
                if (cheatMap.subcheats && cheatMap.subcheats.length > 0) {
                    return {
                        ok: false,
                        message:
                            `Wrong subcommand, use one of these:\n` +
                            cheatMap.subcheats.map((p) => `${cmd} ${p.name} (${p.message})`).join("\n"),
                    };
                }
                return { ok: false, message: "This cheat doesn't accept values" };
            }

            const config = higherKeys.reduce((obj, key) => (obj[key] ??= {}), cheatConfig);
            const invalid = { ok: false, message: "Invalid value. Must be a number or boolean." };
            let val = params.join(" ");

            if (val === "") {
                return invalid;
            }

            try {
                val = JSON.parse(val);
                if (typeof val !== "number" && typeof val !== "boolean") {
                    return invalid;
                }
            } catch {
                return invalid;
            }

            stateObject[cheatMap.name] = true;
            config[cheatMap.name] = val;
            return `Set ${cmd} to ${val}`;
        }

        // Handle mass toggle of subcheats (only if allowToggleChildren is set)
        if (!params[0] && cheatMap.subcheats && cheatMap.allowToggleChildren) {
            const next = on ?? !stateObject[cheatMap.name + "s"];
            for (const i in stateObject[cheatMap.name]) {
                stateObject[cheatMap.name][i] = next;
            }
            stateObject[cheatMap.name + "s"] = next;
            return `${stateObject[cheatMap.name + "s"] ? "Activated" : "Deactivated"} ${cheatMap.message}`;
        }

        if ("subcheats" in cheatMap) {
            stateObject[cheatMap.name + "s"] = on ?? !stateObject[cheatMap.name + "s"];
            return `${stateObject[cheatMap.name + "s"] ? "Activated" : "Deactivated"} ${cheatMap.message}.`;
        }
        stateObject[cheatMap.name] = on ?? !stateObject[cheatMap.name];
        return `${stateObject[cheatMap.name] ? "Activated" : "Deactivated"} ${cheatMap.message}.`;
    };

    // Infer needsParam from configurable if not explicitly set
    const needsParam = cheatMap.needsParam ?? cheatMap.configurable ?? false;
    const registerParent = cheatMap.registerParent ?? true;

    if (registerParent) {
        registerCheat({
            name: cmd,
            fn,
            message: cheatMap.message,
            category,
            needsParam,
            suggestions: cheatMap.suggestions,
            dangerous,
            toggle: !("fn" in cheatMap),
        });
    }

    // Recursively register subcheats, passing category and danger
    if ("subcheats" in cheatMap) {
        cheatMap.subcheats.forEach((map) => registerCheats(map, higherKeys.concat(cheatMap.name), category, dangerous));
    }
}

/**
 * Get all registered cheats.
 * @returns {Object<string, {fn: Function, message: string, category: string, needsParam: boolean, suggestions?: Function, dangerous?: boolean}>}
 */
export function getCheats() {
    return cheats;
}
