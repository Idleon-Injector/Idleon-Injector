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

const log = createLogger("Config");

let config = null;
let defaultConfig = null;
let injectorConfig = null;
let startupCheats = null;
let cheatConfig = null;
// config.custom.js exists but couldn't be loaded; the next save keeps it under another name.
let customConfigBroken = false;

const CDP_PORT = 32123;
const WEB_PORT = 8080;

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

        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
}

/** Merge Session updates in place, then attempt game synchronization without writing to disk. */
async function updateSessionConfiguration(
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
 * isn't reachable.
 * @param {Object} gameBridge - The game bridge
 * @param {Object} cheatConfig - The injector's live cheat config, merged into in place
 */
async function pullGameConfig(gameBridge, cheatConfig) {
    try {
        const result = await gameBridge.callHelper("readCheatConfig");
        if (result.error || typeof result.value !== "string") return;
        deepMerge(cheatConfig, reviveRegExps(dropEmptyObjects(JSON.parse(result.value))));
    } catch (error) {
        log.debug(`Could not read the game's config: ${error.message}`);
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

    // Only settings the injector has are taken.
    const parsedUiCheatConfig =
        filterByTemplate(reviveRegExps(parseConfigFromJson(receivedFullConfig.cheatConfig || {})), cheatConfig) || {};
    const mergedCheatConfig = deepMerge(deepClone(cheatConfig), parsedUiCheatConfig);

    // Keep loaded custom-only fields when a UI save omits them.
    const injectorTemplate = { ...defaultConfig?.injectorConfig, gameExePath: "", devtoolsBrowserPath: "" };
    const filteredInjectorConfig = deepMerge(
        deepClone(injectorConfig),
        filterByTemplate(uiInjectorConfig, injectorTemplate) || {}
    );

    const cheatConfigDiff = getDeepDiff(mergedCheatConfig, defaultConfig?.cheatConfig) || {};
    const injectorConfigDiff = getDeepDiff(filteredInjectorConfig, defaultConfig?.injectorConfig) || {};
    const startupCheatsDiff =
        JSON.stringify(uiStartupCheats) !== JSON.stringify(defaultConfig?.startupCheats) ? uiStartupCheats : [];

    const fileContentString = `
/****************************************************************************************************
 * This file is generated by the Idleon Cheat Injector UI.
 * Only user overrides are saved here - defaults are inherited from config.js.
 * Manual edits might be overwritten when saving from the UI.
 ****************************************************************************************************/

exports.startupCheats = ${JSON.stringify(startupCheatsDiff, null, "\t")};

exports.cheatConfig = ${objToString(cheatConfigDiff)};

exports.injectorConfig = ${objToString(injectorConfigDiff)};
`;
    const savePath = getRuntimePath("config.custom.js");

    // Write a temporary file and rename it over the old one, so a crash can't leave a half-written file.
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

    if (uiStartupCheats) {
        startupCheats.length = 0;
        startupCheats.push(...uiStartupCheats);
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
    getInjectorConfig,
    getStartupCheats,
    getCheatConfig,
    getDefaultConfig,
    getCdpPort,
    getWebPort,
    isLinux,
    getLinuxTimeout,
};
