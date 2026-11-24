/**
 * Configuration Management Module
 *
 * Handles loading, merging, and accessing configuration data for the Idleon Cheat Injector.
 * Manages the hierarchy of base config and custom user overrides, providing a centralized
 * interface for all configuration-related operations throughout the application.
 */

const { deepClone, union, deepMerge } = require("../utils/objectUtils");
const {
    validateConfig,
    parseConfigFromJson,
    reviveRegExps,
    filterByTemplate,
    getDeepDiff,
    objToString,
} = require("../utils/helpers");
const { existsSync, promises: fs } = require("fs");
const { getRuntimePath } = require("../utils/runtimePaths");
const os = require("os");
const { createLogger } = require("../utils/logger");

const SHIPPED = require("./shippedConfigs");

// A config by name, from the object's own keys only: "constructor" is a name, not what every object has.
const own = (configs, name) => (Object.hasOwn(configs, name) ? configs[name] : undefined);

const log = createLogger("Config");

// The config in use when config.custom.js names none: a fresh install's, or one saved before configs (#198).
const FIRST_CONFIG = "My config";

let config = null;
// The config in use: its settings are the live startupCheats and cheatConfig, saved at the top of config.custom.js.
let activeConfig = FIRST_CONFIG;
// The other configs by name, each { startupCheats, cheatConfig } as config.custom.js keeps them (what differs from
// config.js). A shipped config is here only once the player changed it.
let otherConfigs = {};
let defaultConfig = null;
let injectorConfig = null;
let startupCheats = null;
let cheatConfig = null;
// config.custom.js exists but couldn't be loaded; the next save keeps it under another name.
let customConfigBroken = false;
// A switched config the running game hasn't taken yet: reading the game would bring the old config's settings back.
let gameBehind = false;

const CDP_PORT = 32123;
const WEB_PORT = 8080;

/**
 * Automation items used to carry a priority (1 High, 2 Low, none Balanced); they now carry one "Save for it" switch
 * (#205). High and Low were both saved for, so they become `save: true`; Balanced becomes off, which is left out. The
 * file keeps the old words until the next save writes the new ones.
 */
function migrateAutomationPriority(cheats) {
    for (const items of Object.values(cheats?.automation ?? {})) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
            if (!item || typeof item !== "object" || !("priority" in item)) continue;
            if ((item.priority === 1 || item.priority === 2) && item.save === undefined) item.save = true;
            delete item.priority;
        }
    }
}

/**
 * The draft builds before #104 kept each automation list as { saving, target, items }; it is now the list itself, with
 * the saving % beside it as `<key>Saving` (`kitchenSaving` for kitchens) and the bubbles target as `bubblesTarget`.
 */
function migrateAutomationShape(automation) {
    for (const [key, value] of Object.entries(automation ?? {})) {
        if (!value || Array.isArray(value) || !Array.isArray(value.items)) continue;
        automation[key] = value.items;
        if (value.saving !== undefined)
            automation[key === "kitchens" ? "kitchenSaving" : `${key}Saving`] = value.saving;
        if (value.target !== undefined) automation[`${key}Target`] = value.target;
    }
}

/**
 * Load and merge configuration from base config and custom config files
 * @returns {Object} The loaded configuration object
 */
function loadConfiguration() {
    try {
        const configPath = getRuntimePath("config.js");
        const customConfigPath = getRuntimePath("config.custom.js");

        config = require(configPath);

        defaultConfig = deepClone(config);

        let customConfig = null;
        customConfigBroken = false;
        if (!existsSync(customConfigPath)) {
            log.info("No config.custom.js found - using defaults");
        } else {
            try {
                customConfig = require(customConfigPath);
            } catch (error) {
                customConfigBroken = true;
                const line = error.stack?.match(/config\.custom\.js:(\d+)/)?.[1];
                log.error(
                    `config.custom.js has an error${line ? ` on line ${line}` : ""}: ${error.message}. ` +
                        "Your settings in it are not loaded, so the injector is using the default settings. " +
                        "Fix the file and restart the injector. If you save settings in the WebUI first, your file " +
                        "is kept as config.custom.broken-<date and time>.js and a new config.custom.js is started."
                );
            }
        }

        if (customConfig) {
            if (customConfig.injectorConfig) {
                validateConfig(config.injectorConfig, customConfig.injectorConfig, "injectorConfig");
                config.injectorConfig = deepMerge(config.injectorConfig, customConfig.injectorConfig);
            }

            if (customConfig.startupCheats) {
                if (Array.isArray(customConfig.startupCheats)) {
                    config.startupCheats = union(config.startupCheats, customConfig.startupCheats);
                } else {
                    log.error("startupCheats must be an array, received '" + typeof customConfig.startupCheats + "'");
                }
            }

            if (customConfig.cheatConfig) {
                validateConfig(config.cheatConfig, customConfig.cheatConfig, "");
                config.cheatConfig = deepMerge(config.cheatConfig, customConfig.cheatConfig);
            }

            log.debug("Loaded custom config overrides");
        }

        injectorConfig = config.injectorConfig;
        startupCheats = config.startupCheats;
        cheatConfig = config.cheatConfig;
        migrateAutomationShape(cheatConfig.automation);
        migrateAutomationPriority(cheatConfig);
        readConfigs(customConfig || {});

        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
}

const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Take `activeConfig` and `configs` from config.custom.js. A file from before configs has neither, so its settings
 * become "My config". A broken entry is left out with an error, like a wrong setting is.
 */
function readConfigs(customConfig) {
    const { activeConfig: name, configs = {} } = customConfig;
    activeConfig = FIRST_CONFIG;
    otherConfigs = {};
    if (typeof name === "string" && name.trim()) activeConfig = name.trim();
    else if (name !== undefined) log.error("activeConfig must be a name, so the config in use is called My config");

    if (!isPlainObject(configs)) return log.error("configs must be an object, so the other configs are not loaded");
    for (const [key, entry] of Object.entries(configs)) {
        const cheats = entry?.startupCheats ?? [];
        const settings = entry?.cheatConfig ?? {};
        if (key === activeConfig) {
            log.error(`configs has "${key}", the config in use; its settings at the top of the file are used`);
        } else if (!isPlainObject(entry) || !Array.isArray(cheats) || !cheats.every((c) => typeof c === "string")) {
            log.error(`configs["${key}"] needs startupCheats as a list of cheats, so it is not loaded`);
        } else if (!isPlainObject(settings)) {
            log.error(`configs["${key}"].cheatConfig must be an object, so it is not loaded`);
        } else {
            validateConfig(defaultConfig.cheatConfig, settings, `configs["${key}"]`);
            migrateAutomationShape(settings.automation);
            migrateAutomationPriority(settings);
            otherConfigs[key] = { startupCheats: cheats, cheatConfig: settings };
        }
    }
}

/**
 * The config in use as config.custom.js keeps it: its cheats and what its settings change from config.js. Empty before
 * loadConfiguration, which only the fake game (page shots) skips.
 */
const activeEntry = () => ({
    startupCheats: [...(startupCheats ?? [])],
    cheatConfig: getDeepDiff(cheatConfig, defaultConfig?.cheatConfig) || {},
});

// ponytail: compares written source, so the same settings in another key order count as changed.
const sameConfig = (a, b) =>
    JSON.stringify([...a.startupCheats].sort()) === JSON.stringify([...b.startupCheats].sort()) &&
    objToString(a.cheatConfig) === objToString(b.cheatConfig);

/**
 * The configs Settings lists: the shipped ones first, then the player's own by name. `changed` is a shipped config
 * the player edited (Reset puts it back); `cheats` is how many cheats it starts.
 */
function listConfigs() {
    const entry = (name) => (name === activeConfig ? activeEntry() : own(otherConfigs, name) || own(SHIPPED, name));
    const ownNames = [activeConfig, ...Object.keys(otherConfigs)]
        .filter((name) => !own(SHIPPED, name))
        .sort((a, b) => a.localeCompare(b));
    return {
        active: activeConfig,
        list: [
            ...Object.keys(SHIPPED).map((name) => ({
                name,
                shipped: true,
                about: SHIPPED[name].about,
                changed: !sameConfig(entry(name), SHIPPED[name]),
                cheats: entry(name).startupCheats.length,
            })),
            ...ownNames.map((name) => ({ name, shipped: false, cheats: entry(name).startupCheats.length })),
        ],
    };
}

/** A config name as typed, or the reason it can't be one. */
function checkNewName(name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) throw new ConfigError("Type a name.");
    if (trimmed.length > 40) throw new ConfigError("Use 40 letters or fewer.");
    // An object key that would set the prototype instead of naming a config.
    if (trimmed === "__proto__") throw new ConfigError("Pick another name.");
    const taken = [activeConfig, ...Object.keys(otherConfigs), ...Object.keys(SHIPPED)];
    if (taken.some((n) => n.toLowerCase() === trimmed.toLowerCase())) throw new ConfigError("That name is taken.");
    return trimmed;
}

/** A refusal the player can act on; the routes answer it as a 400 with its words. */
class ConfigError extends Error {}

/**
 * Change configs (#198), one step at a time with the saves:
 * - `use`: switch to the config `name`. The one in use is kept as it is now, its game-made changes included.
 * - `saveAs`: keep the settings in use as a new config `name`, and use it.
 * - `reset`: put a changed shipped config back as shipped (and into the game, when it is in use).
 * - `remove`: delete one of the player's configs that isn't in use.
 * The file is written first; only then do the live settings and the game change.
 * @returns {Promise<{ configs: Object, game?: Object }>} The configs after it, and how the game took a switch
 */
function changeConfigs(action, name, gameBridge) {
    const change = () => applyConfigChange(action, name, gameBridge);
    return (saving = saving.then(change, change));
}

async function applyConfigChange(action, name, gameBridge) {
    if (gameBridge) await readGameConfig(gameBridge, cheatConfig);
    const nextOthers = { ...otherConfigs };
    let nextActive = activeConfig;
    let next = null; // the settings to use now, when they change

    if (action === "use") {
        if (name === activeConfig) return { configs: listConfigs() };
        next = own(otherConfigs, name) || own(SHIPPED, name);
        if (!next) throw new ConfigError("That config is gone. Refresh.");
        const current = activeEntry();
        delete nextOthers[name];
        if (!(own(SHIPPED, activeConfig) && sameConfig(current, SHIPPED[activeConfig])))
            nextOthers[activeConfig] = current;
        nextActive = name;
    } else if (action === "saveAs") {
        nextActive = checkNewName(name);
        const current = activeEntry();
        if (!(own(SHIPPED, activeConfig) && sameConfig(current, SHIPPED[activeConfig])))
            nextOthers[activeConfig] = current;
    } else if (action === "reset") {
        if (!own(SHIPPED, name)) throw new ConfigError("Only shipped configs reset.");
        delete nextOthers[name];
        if (name === activeConfig) next = SHIPPED[name];
    } else if (action === "remove") {
        if (own(SHIPPED, name)) throw new ConfigError("Shipped configs stay. Reset it instead.");
        if (name === activeConfig) throw new ConfigError("Switch to another config first.");
        if (!own(otherConfigs, name)) throw new ConfigError("That config is gone. Refresh.");
        delete nextOthers[name];
    } else {
        throw new ConfigError(`Unknown config action: ${action}`);
    }

    const nextCheats = next ? [...next.startupCheats] : [...startupCheats];
    const nextSettings = next
        ? deepMerge(deepClone(defaultConfig.cheatConfig), deepClone(next.cheatConfig))
        : deepClone(cheatConfig);
    await writeCustomFile({
        activeConfig: nextActive,
        configs: nextOthers,
        startupCheats: nextCheats,
        cheatConfig: nextSettings,
        injectorConfig,
    });

    const before = [...startupCheats];
    activeConfig = nextActive;
    otherConfigs = nextOthers;
    if (!next) return { configs: listConfigs() };

    startupCheats.splice(0, startupCheats.length, ...nextCheats);
    for (const key of Object.keys(cheatConfig)) delete cheatConfig[key];
    Object.assign(cheatConfig, nextSettings);
    const game = gameBridge ? await switchGame(gameBridge, before) : undefined;
    return { configs: listConfigs(), game };
}

/**
 * Put the config just switched to into the running game: its settings in place of the old ones (a map key the old
 * config had would stay with a merge), then the old config's cheats off and the new one's on. Cheats the player
 * turned on by hand stay as they are. A game that isn't there gets it all when it's injected again.
 */
async function switchGame(gameBridge, before) {
    try {
        if (!(await gameBridge.isAttached())) return { gameApplied: false, contextLost: true };
        const result = await gameBridge.updateConfig(cheatConfig, true);
        gameBehind = !!result.error;
        if (result.error) return { gameApplied: false, details: result.error.text };
        const failed = [];
        const run = async (command, on) => {
            const response = await gameBridge.executeCheat(command, on);
            if (response.error || !response.value?.ok)
                failed.push({ cheat: command, reason: response.error?.text ?? response.value?.message ?? "" });
        };
        for (const command of before.filter((c) => !startupCheats.includes(c))) await run(command, false);
        for (const command of startupCheats) await run(command, true);
        return { gameApplied: true, failed };
    } catch (error) {
        log.debug(`The game didn't take the switched config: ${error.message}`);
        return { gameApplied: false, contextLost: true };
    }
}

/**
 * Merge Session updates in place, then attempt game synchronization without writing to disk. It waits its turn with
 * the saves and the game reads (see pullGameConfig), so a read can't merge the game's old value over it.
 */
function updateSessionConfiguration(receivedFullConfig, live, gameBridge) {
    const update = () => applySessionConfiguration(receivedFullConfig, live, gameBridge);
    return (saving = saving.then(update, update));
}

async function applySessionConfiguration(
    receivedFullConfig,
    { cheatConfig, startupCheats, injectorConfig },
    gameBridge
) {
    if (receivedFullConfig.cheatConfig) {
        const parsedCheatConfig = reviveRegExps(parseConfigFromJson(receivedFullConfig.cheatConfig));
        deepMerge(cheatConfig, parsedCheatConfig);
    }

    if (Array.isArray(receivedFullConfig.startupCheats)) {
        startupCheats.length = 0;
        startupCheats.push(...receivedFullConfig.startupCheats);
        log.debug("Updated server-side startupCheats");
    }

    if (receivedFullConfig.injectorConfig) {
        deepMerge(injectorConfig, receivedFullConfig.injectorConfig);
        log.debug("Updated server-side injectorConfig");
    }

    // Keep the submitted cheat values separate from shared live state during synchronization.
    const gameCheatConfig = receivedFullConfig.cheatConfig
        ? reviveRegExps(parseConfigFromJson(receivedFullConfig.cheatConfig))
        : cheatConfig;
    return applyToGame(gameBridge, gameCheatConfig);
}

/** Merge cheat settings into the running game's config. */
async function applyToGame(gameBridge, gameCheatConfig) {
    if (!(await gameBridge.isAttached())) {
        log.error("Cheat context not found in iframe. Cannot update config in game");
        return { gameApplied: false, contextLost: true };
    }

    const updateResult = await gameBridge.updateConfig(gameCheatConfig);
    if (updateResult.error) {
        log.error("Error updating config in game:", updateResult.error.text);
        return { gameApplied: false, details: `Failed to apply in game: ${updateResult.error.text}` };
    }

    const details = updateResult.value;
    log.debug(`In-game config update result: ${details}`);
    return { gameApplied: !details.startsWith("Error:"), details };
}

/**
 * Remove objects that are empty, in place. The game leaves out what has no JSON form, so an object can come
 * back empty (multiplestacks without its Map). Taken, it would be injected on the next reload, and the
 * cheat would find an empty object instead of creating its Map.
 */
const dropEmptyObjects = (value) => {
    for (const key of Object.keys(value)) {
        const item = value[key];
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        dropEmptyObjects(item);
        if (!Object.keys(item).length) delete value[key];
    }
    return value;
};

/**
 * Take the settings the game changed itself (nomore lists, `<cheat> <value>`) into the injector's config,
 * so the WebUI shows them, a save keeps them and a game reload gets them. Does nothing while the game
 * isn't reachable. It waits its turn with the saves: read while a save updates the game, it would merge the
 * game's old value over the one just saved.
 * @param {Object} gameBridge - The game bridge
 * @param {Object} cheatConfig - The injector's live cheat config, merged into in place
 * @returns {Promise<boolean>} Whether the game's config was read
 */
function pullGameConfig(gameBridge, cheatConfig) {
    const pull = () => readGameConfig(gameBridge, cheatConfig);
    return (saving = saving.then(pull, pull));
}

async function readGameConfig(gameBridge, cheatConfig) {
    try {
        // The game still has the config switched away from: give it this one first, or read nothing.
        if (gameBehind) {
            if ((await gameBridge.updateConfig(cheatConfig, true)).error) return false;
            gameBehind = false;
        }
        const result = await gameBridge.callHelper("readCheatConfig");
        if (result.error || typeof result.value !== "string") return false;
        deepMerge(cheatConfig, reviveRegExps(dropEmptyObjects(JSON.parse(result.value))));
        return true;
    } catch (error) {
        log.debug(`Could not read the game's config: ${error.message}`);
        return false;
    }
}

/**
 * Persist UI overrides, then update the loaded configuration only after the write succeeds.
 * What it's sent is merged into the current settings, so a partial save keeps the rest.
 * Saves run one at a time: they share one temporary file, and two at once could leave a config.custom.js
 * that doesn't load.
 * Given the game bridge, the saved cheat settings go to the game too; left with its old ones, the next
 * pullGameConfig would bring them back and the save after it would write them to the file.
 * @returns {Promise<{ brokenFileKeptAs?: string, game?: Object }>} Where a config.custom.js that failed to load
 *   was kept, and how the game took the settings (as updateSessionConfiguration answers)
 */
function saveConfiguration(receivedFullConfig, gameBridge) {
    const save = () => writeConfiguration(receivedFullConfig, gameBridge);
    return (saving = saving.then(save, save));
}
let saving = Promise.resolve();

async function writeConfiguration(receivedFullConfig, gameBridge) {
    const cheatConfig = getCheatConfig();
    const startupCheats = getStartupCheats();
    const injectorConfig = getInjectorConfig();
    const defaultConfig = getDefaultConfig();

    const uiStartupCheats = receivedFullConfig.startupCheats || startupCheats;
    const uiInjectorConfig = receivedFullConfig.injectorConfig || injectorConfig;

    // Only settings the injector has are taken, and any key of a map a page fills (a setting whose default is {}).
    const parsedUiCheatConfig =
        filterByTemplate(
            reviveRegExps(parseConfigFromJson(receivedFullConfig.cheatConfig || {})),
            cheatConfig,
            defaultConfig?.cheatConfig
        ) || {};
    const mergedCheatConfig = deepMerge(deepClone(cheatConfig), parsedUiCheatConfig);

    // Keep loaded custom-only fields when a UI save omits them.
    const injectorTemplate = { ...defaultConfig?.injectorConfig, gameExePath: "", devtoolsBrowserPath: "" };
    const filteredInjectorConfig = deepMerge(
        deepClone(injectorConfig),
        filterByTemplate(uiInjectorConfig, injectorTemplate) || {}
    );

    const brokenFileKeptAs = await writeCustomFile({
        activeConfig,
        configs: otherConfigs,
        startupCheats: uiStartupCheats,
        cheatConfig: mergedCheatConfig,
        injectorConfig: filteredInjectorConfig,
    });

    // Only a list the save sent replaces it: without one, uiStartupCheats is this same array, which clearing would empty.
    if (receivedFullConfig.startupCheats) {
        startupCheats.length = 0;
        startupCheats.push(...receivedFullConfig.startupCheats);
    }
    deepMerge(cheatConfig, parsedUiCheatConfig);
    if (filteredInjectorConfig) deepMerge(injectorConfig, filteredInjectorConfig);
    if (!gameBridge || !receivedFullConfig.cheatConfig) return { brokenFileKeptAs };
    // The file is written, so a game that can't be reached doesn't fail the save. A closed or reloading game
    // throws instead of answering; like one that isn't attached, it gets the saved settings when injected again.
    const game = await applyToGame(gameBridge, parsedUiCheatConfig).catch((error) => {
        log.debug(`The game didn't take the saved settings: ${error.message}`);
        return { gameApplied: false, contextLost: true };
    });
    return { brokenFileKeptAs, game };
}

/**
 * Write config.custom.js: the config in use (only what differs from config.js), the injector's own settings, and the
 * player's other configs. A temporary file is renamed over the old one, so a crash can't leave a half-written file; a
 * file that failed to load is kept under another name first.
 * @returns {Promise<string|undefined>} Where a config.custom.js that failed to load was kept
 */
async function writeCustomFile({ activeConfig, configs, startupCheats, cheatConfig, injectorConfig }) {
    const cheatConfigDiff = getDeepDiff(cheatConfig, defaultConfig.cheatConfig) || {};
    const injectorConfigDiff = getDeepDiff(injectorConfig, defaultConfig.injectorConfig) || {};

    const fileContentString = `
/****************************************************************************************************
 * This file is generated by the Idleon Cheat Injector UI.
 * Only user overrides are saved here - defaults are inherited from config.js.
 * Manual edits might be overwritten when saving from the UI.
 ****************************************************************************************************/

// The config in use (switch it in Settings). Its cheats and settings are the next two.
exports.activeConfig = ${JSON.stringify(activeConfig)};

exports.startupCheats = ${JSON.stringify(startupCheats, null, "	")};

exports.cheatConfig = ${objToString(cheatConfigDiff)};

exports.injectorConfig = ${objToString(injectorConfigDiff)};

// Your other configs, each kept as it was when you switched away from it.
exports.configs = ${objToString(configs)};
`;
    const savePath = getRuntimePath("config.custom.js");
    const tempPath = `${savePath}.tmp`;
    await fs.writeFile(tempPath, fileContentString.trim());
    let brokenFileKeptAs;
    if (customConfigBroken && existsSync(savePath)) {
        brokenFileKeptAs = `config.custom.broken-${new Date().toISOString().replace(/[:.]/g, "-")}.js`;
        await fs.copyFile(savePath, getRuntimePath(brokenFileKeptAs));
        log.warn(`config.custom.js couldn't be loaded, so it was kept as ${brokenFileKeptAs}`);
    }
    await fs.rename(tempPath, savePath);
    customConfigBroken = false;
    log.info(`Configuration saved to ${savePath}`);
    return brokenFileKeptAs;
}

/**
 * Get the injector configuration
 * @returns {Object} The injector configuration object
 */
function getInjectorConfig() {
    if (!injectorConfig) {
        throw new Error("Configuration not loaded. Call loadConfiguration() first");
    }
    return injectorConfig;
}

/**
 * Get the startup cheats array
 * @returns {Array} The startup cheats array
 */
function getStartupCheats() {
    if (!startupCheats) {
        throw new Error("Configuration not loaded. Call loadConfiguration() first");
    }
    return startupCheats;
}

/**
 * Get the cheat configuration object
 * @returns {Object} The cheat configuration object
 */
function getCheatConfig() {
    if (!cheatConfig) {
        throw new Error("Configuration not loaded. Call loadConfiguration() first");
    }
    return cheatConfig;
}

/**
 * Get the default configuration object (as defined in config.js)
 * @returns {Object} The default configuration object
 */
function getDefaultConfig() {
    if (!defaultConfig) {
        throw new Error("Configuration not loaded. Call loadConfiguration() first");
    }
    return defaultConfig;
}

/**
 * Get the Chrome DevTools Protocol port
 * @returns {number} The CDP port number
 */
function getCdpPort() {
    return CDP_PORT;
}

/**
 * Get the web server port
 * @returns {number} The web server port number
 */
function getWebPort() {
    if (injectorConfig && injectorConfig.webPort) {
        return injectorConfig.webPort;
    }
    log.debug("Using fallback port: " + WEB_PORT);
    return WEB_PORT;
}

/**
 * Check if running on Linux platform
 * @returns {boolean} True if running on Linux
 */
function isLinux() {
    return os.platform() === "linux";
}

/**
 * Get the Linux timeout value from configuration
 * @returns {number} The Linux timeout in milliseconds
 */
function getLinuxTimeout() {
    if (!injectorConfig) {
        throw new Error("Configuration not loaded. Call loadConfiguration() first");
    }
    return injectorConfig.onLinuxTimeout;
}

module.exports = {
    loadConfiguration,
    updateSessionConfiguration,
    pullGameConfig,
    saveConfiguration,
    changeConfigs,
    listConfigs,
    ConfigError,
    getInjectorConfig,
    getStartupCheats,
    getCheatConfig,
    getDefaultConfig,
    getCdpPort,
    getWebPort,
    isLinux,
    getLinuxTimeout,
};
