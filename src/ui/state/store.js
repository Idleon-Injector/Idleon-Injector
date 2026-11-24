import vanX from "../vendor/van-x-0.6.3.js";
import * as API from "../services/api.js";
import { VIEWS } from "./constants.js";
import { getCheatConfigPath, configPathExists } from "../utils/index.js";
import { formatDisplayValue } from "../components/views/search/valueUtils.js";
import { createLiveMonitor } from "./liveMonitor.js";
import { findWorld, MOVED_PAGES } from "../menu/menuModel.js";
import { tabRequest } from "../menu/pageRegistry.js";
import {
    initWebSocket,
    onStateUpdate,
    onMonitorUpdate,
    getConnectionStatus,
    sendMonitorSubscribe,
    sendMonitorUnsubscribe,
} from "../services/ws.js";

/**
 * Safely parse JSON from localStorage with fallback
 * @param {string} key - localStorage key
 * @param {*} fallback - Default value if parse fails
 * @returns {*} Parsed value or fallback
 */
const safeParseJSON = (key, fallback = []) => {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
        return fallback;
    }
};

// The menu opens where the player left it; the very first start shows Home.
const MENU_LAST_KEY = "menuLast";
const savedMenu = safeParseJSON(MENU_LAST_KEY, null) || {};
// A page that moved into the Automation section (#249) opens where it is now.
if (MOVED_PAGES[savedMenu.page]) Object.assign(savedMenu, { world: "automation", page: MOVED_PAGES[savedMenu.page] });
const isKnownView = (id) =>
    Object.values(VIEWS).some((view) => view.id === id) && (id !== VIEWS.PAGES.id || findWorld(savedMenu.world));

const appState = vanX.reactive({
    activeTab: isKnownView(savedMenu.tab) ? savedMenu.tab : VIEWS.HOME.id,
    // Pages view: the world shown (1-7, "account", "classes") and the page id open in it ("" = its first page).
    menuWorld: savedMenu.world ?? null,
    menuPage: typeof savedMenu.page === "string" ? savedMenu.page : "",
    configDrawerOpen: false,
    isLoading: false,
    heartbeat: false,
    appInfo: null,
    updateInfo: null,
    updateModalOpen: false,
    updateApplying: false,
    // What the update modal's Accept said: null or { ok, text }.
    updateResult: null,
    config: null,
    configError: "",
    cheatsError: "",
    // System problems the sidebar's status line shows until they're fixed (#77).
    gameClosed: false,
    hookFailures: [],
    sidebarCollapsed: localStorage.getItem("sidebarCollapsed") === "true",
    configForcedPath: null,
    // The cheat the menu search sent the player to: the Cheats page shows that row (and `setting` in the drawer).
    cheatFocus: { cheat: "", setting: "", focus: false, fill: "", n: 0 },
    // Counts every openMenu, so the sidebar shows the opened place's list even when the place didn't change.
    menuOpens: 0,
    cheatsViewMode: localStorage.getItem("cheatsViewMode") || "tabs",
});

const dataState = vanX.reactive({
    cheats: [],
    accountOptions: [],
    accountSchema: {},
    activeCheatStates: {},
    favoriteCheats: safeParseJSON("favoriteCheats", []),
    recentCheats: safeParseJSON("recentCheats", []),
});

const rawMonitorState = vanX.reactive({ values: {} });

let appInfoRequest = null;
// The version button's check in flight: a second click waits for it, so an older answer can't land last.
let updateCheck = null;

const Actions = {
    withLoading: async (fn) => {
        try {
            appState.isLoading = true;
            await fn();
        } finally {
            appState.isLoading = false;
        }
    },
};

const SystemService = {
    initHeartbeat: () => {
        initWebSocket();

        onStateUpdate((states, hookFailures, gameOpen) => {
            dataState.activeCheatStates = states || {};
            // The injector doesn't re-attach to a closed game, so only a restart clears this.
            if (gameOpen === false) {
                appState.gameClosed = true;
                appState.heartbeat = false;
            }
            // Every state update repeats the list; the status line changes only when it does.
            if (hookFailures && hookFailures.join("\n") !== appState.hookFailures.join("\n"))
                appState.hookFailures = hookFailures;
        });

        onMonitorUpdate((data) => {
            rawMonitorState.values = data || {};
        });

        // Use WebSocket connection status for heartbeat, with HTTP fallback
        const check = async () => {
            // Check WebSocket connection first
            if (getConnectionStatus()) {
                appState.heartbeat = !appState.gameClosed;
                return;
            }

            // Fall back to HTTP heartbeat check
            const alive = await API.checkHeartbeat();
            appState.heartbeat = alive?.status === "online";
        };
        check();
        setInterval(check, 10000);
    },

    loadAppInfo: async () => {
        if (appState.appInfo?.version) return appState.appInfo;
        if (appInfoRequest) return appInfoRequest;

        appInfoRequest = API.fetchAppInfo()
            .then((appInfo) => {
                appState.appInfo = appInfo;
                return appInfo;
            })
            .catch((error) => {
                console.error("Error loading app info:", error);
                return null;
            })
            .finally(() => {
                appInfoRequest = null;
            });

        return appInfoRequest;
    },

    checkForUpdate: async (force = false) => {
        try {
            appState.updateInfo = await API.checkForUpdate(force);
            return appState.updateInfo;
        } catch (error) {
            console.error("Error checking for updates:", error);
            appState.updateInfo = null;
            return { updateAvailable: false, error: error.message || "the injector didn't answer" };
        }
    },

    /**
     * Check for an update and open the modal when there is one; resolves whether it opened, and throws why
     * when the check failed, so a failed check never reads as being on the latest.
     */
    openUpdateModal: () =>
        (updateCheck ??= (async () => {
            const updateInfo = await SystemService.checkForUpdate(true);
            appState.updateResult = null;
            appState.updateModalOpen = Boolean(updateInfo?.updateAvailable);
            if (updateInfo?.error) throw new Error(updateInfo.error);
            return appState.updateModalOpen;
        })().finally(() => {
            updateCheck = null;
        })),

    closeUpdateModal: () => {
        appState.updateModalOpen = false;
    },

    applyUpdate: async () => {
        try {
            appState.updateApplying = true;
            const result = await API.applyUpdate();
            appState.updateResult = { ok: true, text: result.message || "Update prepared" };
        } catch (error) {
            appState.updateResult = { ok: false, text: error.message };
            appState.updateApplying = false;
        }
    },
};

// The cheat list's own load in flight, so a second caller waits for it instead of starting another (and an
// unrelated load, like Settings, never stops a cheat list retry).
let cheatsLoad = null;

const CheatService = {
    loadCheats: () =>
        (cheatsLoad ??= CheatService.fetchCheats().finally(() => {
            cheatsLoad = null;
        })),

    fetchCheats: async () => {
        appState.cheatsError = "";
        await Actions.withLoading(async () => {
            const hasConfig = appState.config !== null;

            const [cheats, config] = await Promise.all([
                API.fetchCheatsData(),
                hasConfig ? Promise.resolve(null) : API.fetchConfig(),
            ]);

            dataState.cheats = cheats || [];

            if (config) {
                appState.config = config;
            }
        }).catch((e) => (appState.cheatsError = e.message || "The cheat list didn't load"));
    },

    /**
     * Check if a cheat has an associated config entry.
     * @param {string} cheatValue
     * @returns {boolean}
     */
    hasConfigEntry: (cheatValue) => {
        if (!appState.config?.cheatConfig) return false;
        const pathParts = getCheatConfigPath(cheatValue);
        if (!pathParts) return false;
        return configPathExists(pathParts, appState.config.cheatConfig);
    },

    /**
     * Navigate to the Config tab with forced path display.
     * @param {string} cheatValue
     */
    navigateToCheatConfig: (cheatValue) => {
        const pathParts = getCheatConfigPath(cheatValue);
        if (!pathParts || !configPathExists(pathParts, appState.config?.cheatConfig)) return;

        appState.configForcedPath = pathParts;

        if (appState.activeTab === VIEWS.CHEATS.id) {
            appState.configDrawerOpen = true;
            return;
        }

        appState.configDrawerOpen = false;
        appState.activeTab = VIEWS.CONFIG.id;
    },

    /**
     * Clear the forced config path (called when user interacts with Config filters).
     */
    clearForcedConfigPath: () => {
        appState.configForcedPath = null;
    },

    openConfigDrawer: () => {
        appState.configDrawerOpen = true;
    },

    closeConfigDrawer: () => {
        appState.configDrawerOpen = false;
    },

    /**
     * Run a cheat. A toggle cheat is set to the opposite of the state the player saw, so a double click or a
     * second tab can't flip it back. The caller says the result where the player ran it (#77); cheat states
     * come back over the WebSocket.
     * @returns {Promise<{ok: boolean, message: string}>}
     */
    executeCheat: async (action, on = clickedState(action)) => {
        try {
            const result = await API.executeCheatAction(action, on);
            FavoritesService.addToRecent(action);
            return { ok: true, message: result.message || "done" };
        } catch (e) {
            return { ok: false, message: e.message || "it didn't run" };
        }
    },
};

/**
 * The state a click on a toggle cheat asks for: the opposite of what the player sees. Undefined when the
 * action isn't a toggle (or the states aren't loaded), so it runs as before. A cheat with subcheats
 * keeps its own on/off flag beside them as `<name>s`.
 */
const clickedState = (action) => {
    const words = action.split(" ");
    const name = words.pop();
    const parent = words.reduce((obj, key) => obj?.[key], dataState.activeCheatStates);
    const value = parent?.[typeof parent?.[name] === "object" ? name + "s" : name];
    return typeof value === "boolean" ? !value : undefined;
};

/** Every cheat that is on, by its full command, at any depth (a parent's `<name>s` flag is the parent). */
const getActiveCheats = (states, prefix = "") => {
    const activeCheats = [];

    for (const key in states) {
        const value = states[key];

        if (typeof value === "object" && value !== null) {
            activeCheats.push(...getActiveCheats(value, `${prefix}${key} `));
        } else if (value === true) {
            const parent = key.slice(0, -1);
            activeCheats.push(prefix + (key.endsWith("s") && typeof states[parent] === "object" ? parent : key));
        }
    }

    return activeCheats;
};

const CheatStateService = {
    loadCheatStates: async () => {
        try {
            const result = await API.fetchCheatStates();
            dataState.activeCheatStates = result.data || {};
        } catch (e) {
            console.error("Error loading cheat states:", e);
            dataState.activeCheatStates = {};
        }
    },
};

const FavoritesService = {
    toggleFavorite: (cheatValue) => {
        const index = dataState.favoriteCheats.indexOf(cheatValue);
        if (index > -1) {
            dataState.favoriteCheats.splice(index, 1);
        } else {
            dataState.favoriteCheats.push(cheatValue);
        }
        localStorage.setItem("favoriteCheats", JSON.stringify([...dataState.favoriteCheats]));
    },

    isFavorite: (cheatValue) => {
        return dataState.favoriteCheats.includes(cheatValue);
    },

    addToRecent: (cheatValue) => {
        const filtered = dataState.recentCheats.filter((c) => c !== cheatValue);
        filtered.unshift(cheatValue);
        const newRecent = filtered.slice(0, 10);
        dataState.recentCheats.length = 0;
        newRecent.forEach((c) => dataState.recentCheats.push(c));
        localStorage.setItem("recentCheats", JSON.stringify(newRecent));
    },
};

const ConfigService = {
    loadConfig: async () => {
        // Custom error message requirement prevents using generic withLoading wrapper
        try {
            appState.isLoading = true;
            appState.configError = "";
            const data = await API.fetchConfig();
            appState.config = data;
        } catch (e) {
            appState.configError = e.message;
        } finally {
            appState.isLoading = false;
        }
    },

    /** Save or apply the settings; resolves with the server's words, rejects with why it failed. */
    saveConfig: async (newConfig, isPersistent) => {
        // Strip Proxies via JSON cycle to prevent reactive leaks
        const cleanConfig = JSON.parse(JSON.stringify(newConfig));
        const result = isPersistent
            ? await API.saveConfigFile(cleanConfig)
            : await API.updateSessionConfig(cleanConfig);
        return result?.message || "";
    },
};

const AccountService = {
    loadAccountOptions: async () => {
        await Actions.withLoading(async () => {
            const hasSchema = Object.keys(dataState.accountSchema).length > 0;

            const [schemaRes, dataRes] = await Promise.all([
                hasSchema
                    ? Promise.resolve(null)
                    : fetch("/config/optionsAccountSchema.json").catch(() => ({ ok: false })),
                API.gga("OptionsListAccount"),
            ]);

            if (schemaRes?.ok) {
                dataState.accountSchema = await schemaRes.json();
            }

            const newData = Array.isArray(dataRes) ? dataRes : [];
            dataState.accountOptions = [];
            dataState.accountOptions = newData;
        });
    },
};

const SearchService = {
    setGgaValue: async (path, value) => {
        const ok = await API.gga(path, value);
        if (!ok) {
            throw new Error(`Write to ${path} failed verification`);
        }
        return {
            success: true,
            path,
            type: value === null ? "object" : typeof value,
            value,
            formattedValue: formatDisplayValue(value),
        };
    },
};

const monitors = createLiveMonitor({
    getRawMonitors: () => rawMonitorState.values,
    subscribe: sendMonitorSubscribe,
    unsubscribe: sendMonitorUnsubscribe,
});

const store = {
    app: appState,
    data: dataState,

    initHeartbeat: SystemService.initHeartbeat,
    loadAppInfo: SystemService.loadAppInfo,
    checkForUpdate: SystemService.checkForUpdate,
    openUpdateModal: SystemService.openUpdateModal,
    closeUpdateModal: SystemService.closeUpdateModal,
    applyUpdate: SystemService.applyUpdate,

    loadCheats: CheatService.loadCheats,
    executeCheat: CheatService.executeCheat,
    hasConfigEntry: CheatService.hasConfigEntry,
    navigateToCheatConfig: CheatService.navigateToCheatConfig,
    clearForcedConfigPath: CheatService.clearForcedConfigPath,
    openConfigDrawer: CheatService.openConfigDrawer,
    closeConfigDrawer: CheatService.closeConfigDrawer,
    loadCheatStates: CheatStateService.loadCheatStates,
    getActiveCheats: () => getActiveCheats(dataState.activeCheatStates),

    loadConfig: ConfigService.loadConfig,
    saveConfig: ConfigService.saveConfig,

    loadAccountOptions: AccountService.loadAccountOptions,

    fetchGgaKeys: API.fetchGgaKeys,
    searchGga: API.searchGga,
    setGgaValue: SearchService.setGgaValue,

    monitors,

    toggleSidebar: () => {
        appState.sidebarCollapsed = !appState.sidebarCollapsed;
        localStorage.setItem("sidebarCollapsed", appState.sidebarCollapsed);
    },

    /**
     * Go somewhere in the menu: `{ view }` (a VIEWS key) or `{ world, page }` (page "" or null = the world's first page;
     * with `cheat`, its cheats panel shows that cheat's row). `fill` puts a value in a value command's field.
     * `{ view: "CHEATS", cheat, setting, focus }` shows that cheat's row, and with `setting` opens its settings drawer;
     * `focus` (picked by keyboard) also focuses the row or the setting's field. It never runs the cheat.
     */
    openMenu: (target) => {
        appState.menuOpens++;
        if (target.view) {
            appState.activeTab = VIEWS[target.view].id;
            if (target.cheat) {
                const setting = target.setting || "";
                const focus = Boolean(target.focus);
                appState.cheatFocus = {
                    cheat: target.cheat,
                    setting,
                    focus,
                    fill: target.fill || "",
                    n: appState.cheatFocus.n + 1,
                };
                if (setting) CheatService.navigateToCheatConfig(target.cheat);
            }
            return;
        }
        appState.menuWorld = target.world;
        appState.menuPage = target.page || "";
        // A cheat found on a page: its cheats panel shows the row (SystemCheats).
        if (target.cheat)
            appState.cheatFocus = {
                cheat: target.cheat,
                setting: "",
                focus: Boolean(target.focus),
                fill: target.fill || "",
                n: appState.cheatFocus.n + 1,
            };
        // A search hit on a page's own tab opens the page there; any other way in leaves the page as it was.
        tabRequest.val = target.tab ? { page: target.page, tab: target.tab } : null;
        appState.activeTab = VIEWS.PAGES.id;
    },

    /** Remember where the menu is, so it opens there next time. */
    saveMenuPlace: () => {
        try {
            localStorage.setItem(
                MENU_LAST_KEY,
                JSON.stringify({ tab: appState.activeTab, world: appState.menuWorld, page: appState.menuPage })
            );
        } catch {
            // ponytail: storage blocked (private window); the menu just opens on Home next time.
        }
    },

    toggleCheatsViewMode: () => {
        appState.cheatsViewMode = appState.cheatsViewMode === "list" ? "tabs" : "list";
        localStorage.setItem("cheatsViewMode", appState.cheatsViewMode);
    },

    /** Open a link in the player's browser; resolves with why it failed, or "" when it opened. */
    openExternalUrl: async (url) => {
        try {
            await API.openExternalUrl(url);
            return "";
        } catch (e) {
            return e.message || "it didn't open";
        }
    },

    toggleFavorite: FavoritesService.toggleFavorite,
    isFavorite: FavoritesService.isFavorite,
    addToRecent: FavoritesService.addToRecent,
};

export default store;
