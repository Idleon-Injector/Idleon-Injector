/**
 * Centralized view/tab configuration.
 * Provides a single source of truth for tab IDs, labels, and icons.
 */

// Lazy import to avoid circular dependencies: components import this file,
// so we can't import components here directly. Instead, App.js will handle the mapping.
export const VIEWS = {
    HOME: {
        id: "home-tab",
        label: "HOME",
        sidebarLabel: "HOME",
    },
    PAGES: {
        id: "pages-tab",
        label: "PAGES",
        sidebarLabel: "PAGES",
    },
    CHEATS: {
        id: "cheats-tab",
        label: "CHEATS",
        sidebarLabel: "CHEATS",
    },
    ACCOUNT_OPTIONS: {
        id: "account-options-tab",
        label: "ACCOUNT OPTIONS",
        sidebarLabel: "ACCOUNT OPTIONS",
    },
    CONFIG: {
        id: "config-tab",
        label: "CONFIGURATION",
        sidebarLabel: "CONFIG",
    },
    SEARCH: {
        id: "search-tab",
        label: "GGA SEARCH",
        sidebarLabel: "SEARCH",
    },
    DEVTOOLS: {
        id: "devtools-tab",
        label: "CHROMEDEBUG",
        sidebarLabel: "CHROMEDEBUG",
    },
    HISTORY: {
        id: "history-tab",
        label: "HISTORY",
        sidebarLabel: "HISTORY",
    },
};

// Order in which tabs appear in the sidebar
export const VIEW_ORDER = [VIEWS.CHEATS, VIEWS.ACCOUNT_OPTIONS, VIEWS.CONFIG, VIEWS.SEARCH, VIEWS.DEVTOOLS];
export const IS_ELECTRON = /electron/i.test(navigator.userAgent);
/**
 * The Cheats area's groups, in order (#23); each cheat row names its group as its `category`. Dangerous comes last and
 * stands apart. Cheats that belong to a system page are on that page instead (menu/pageCheats.js).
 */
export const CATEGORY_ORDER = [
    "Combat",
    "Multipliers",
    "Items & drops",
    "Costs & limits",
    "Unlocks",
    "Minigames",
    "Display",
    "Tools",
    "Dangerous",
];

/**
 * Curated list of favorite GGA keys for quick access in Search view.
 */
export const FAVORITE_KEYS = [
    "OptionsListAccount",
    "OptionsList",
    "PlayerDATABASE",
    "SkillLevels",
    "SkillLevelsMAX",
    "BundlesReceived",
    "ChestQuantity",
    "CurrenciesOwned",
    "CustomLists",
    "Exp0",
    "GemItemsPurchased",
    "ItemQuantity",
    "KillsLeft2Advance",
    "Lv0",
    "Spelunk",
    "Arcane",
    "Bubba",
    "Compass",
    "Grimoire",
];
