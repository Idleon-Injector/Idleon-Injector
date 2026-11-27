/**
 * Core State Module
 *
 * Contains the cheatState object that tracks which cheats are enabled.
 * The structure mirrors the cheat registration hierarchy.
 */

/**
 * Central state object for tracking cheat activation.
 * Properties are populated by defineCheat() as cheats are registered.
 *
 * Structure mirrors the cheat command hierarchy:
 * - cheatState.unlock.portals (boolean)
 * - cheatState.w3.mobdeath (boolean)
 * - cheatState.multiply.damage (boolean)
 * etc.
 */
export const cheatState = {};

/**
 * The cheat configuration object (injected at runtime).
 * @type {object|null}
 */
export let cheatConfig = null;
export let startupCheats = [];
export let webPort = null;

/**
 * Set the cheat config.
 * @param {object} config - The config object
 */
export function setCheatConfig(config) {
    cheatConfig = config;
}

/**
 * Whether a nomore rule blocks this item. `search` ignores a rule's `g`/`y` state, so a hand-written `/^Copper$/g`
 * answers the same on every check (`test` would alternate).
 * @param {string} item - Item code
 * @returns {boolean}
 */
export const nomoreBlocks = (item) => cheatConfig?.nomore?.items.some((regex) => item.search(regex) !== -1) ?? false;
/**
 * Update cheat configuration from external source.
 *
 * @param {object} newConfig - New configuration to merge
 */
export function updateCheatConfig(newConfig) {
    mergeCheatConfig(cheatConfig, newConfig);
}

/**
 * The live config as JSON, for the injector to keep what cheats changed in the game. A RegExp (a nomore
 * pattern) is written as "/source/flags". Left out: functions (the injector has them), Maps and Sets
 * (multiplestacks keeps its list only in the game) and fix_save's copy of a game value, which isn't a setting.
 * @returns {string} JSON text
 */
export function readCheatConfig() {
    return JSON.stringify(cheatConfig, (key, value) => {
        if (key === "fixobj") return undefined;
        const type = Object.prototype.toString.call(value);
        if (type === "[object RegExp]") return String(value);
        if (type === "[object Map]" || type === "[object Set]") return undefined;
        return value;
    });
}

const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Merge a (possibly partial) config into the live one.
 *
 * Callers send only the branch they changed, so assigning top-level keys would drop
 * every sibling - a post of just `w1.companion` used to wipe w1.anvil/forge/owl in the
 * running game. Arrays are replaced whole so a list can be shortened or emptied.
 */
function mergeCheatConfig(target, source) {
    for (const key in source) {
        if (!Object.hasOwnProperty.call(source, key)) continue;
        const value = source[key];
        if (isPlainObject(value) && isPlainObject(target[key])) mergeCheatConfig(target[key], value);
        else target[key] = value;
    }
}
/**
 * Set the startup cheats.
 * @param {string[]} cheats - Array of cheat commands
 */
export function setStartupCheats(cheats) {
    startupCheats = cheats || [];
}

/**
 * Set the web port.
 * @param {number} port - The web port
 */
export function setWebPort(port) {
    webPort = port;
}

/**
 * Flag indicating whether setup has completed.
 */
export let setupDone = false;

/**
 * Mark setup as complete.
 */
export function markSetupDone() {
    setupDone = true;
}

/**
 * Reset setup state (used for re-initialization).
 */
export function resetSetupState() {
    setupDone = false;
}
