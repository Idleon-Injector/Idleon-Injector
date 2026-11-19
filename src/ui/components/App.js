import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS } from "../state/constants.js";
import { AREAS } from "../menu/menuModel.js";
import { loadPages, menuError } from "../menu/pageRegistry.js";

// Components
import { Sidebar } from "./Sidebar.js";
import { MenuSearch } from "./MenuSearch.js";
import { Toast } from "./Toast.js";
import { TooltipContainer } from "./Tooltip.js";
import { UpdateModal } from "./UpdateModal.js";
import { Home } from "./views/Home.js";
import { Pages } from "./views/Pages.js";
import { Cheats } from "./views/Cheats.js";
import { Config } from "./views/Config.js";
import { Account } from "./views/Account.js";
import { AccountOptions } from "./views/AccountOptions.js";
import { DevTools } from "./views/DevTools.js";
import { Search } from "./views/Search.js";

const { div, main, button } = van.tags;

const viewFactories = {
    [VIEWS.HOME.id]: Home,
    [VIEWS.PAGES.id]: Pages,
    [VIEWS.CHEATS.id]: Cheats,
    [VIEWS.CONFIG.id]: Config,
    [VIEWS.ACCOUNT.id]: Account,
    [VIEWS.ACCOUNT_OPTIONS.id]: AccountOptions,
    [VIEWS.DEVTOOLS.id]: DevTools,
    [VIEWS.SEARCH.id]: Search,
};

const ADVANCED_TABS = AREAS.find((area) => area.id === "advanced").tabs;

/** Account Options, Value search and DevTools share the Advanced area: one tab row above them. */
const AdvancedTabs = () =>
    div(
        {
            class: "account-sub-nav menu-tabs menu-area-tabs",
            role: "tablist",
            "aria-label": "Advanced",
            hidden: () => !ADVANCED_TABS.some((tab) => store.app.activeTab === VIEWS[tab.view].id),
        },
        ...ADVANCED_TABS.map((tab) => {
            const active = () => store.app.activeTab === VIEWS[tab.view].id;
            return button(
                {
                    type: "button",
                    role: "tab",
                    class: () => `account-sub-tab-btn account-world-sub-tab-btn ${active() ? "active" : ""}`,
                    "aria-selected": () => String(active()),
                    onclick: () => store.openMenu({ view: tab.view }),
                },
                tab.label
            );
        })
    );

export const App = () => {
    store.initHeartbeat();
    store.loadAppInfo();
    store.checkForUpdate();
    loadPages().then(() => {
        if (menuError.val) store.notify(menuError.val, "error");
    });

    // Global Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && (e.key === "k" || e.key === "K")) {
            e.preventDefault();
            document.querySelector(".menu-search-input")?.focus();
            return;
        }

        const isInputFocused = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

        if (isInputFocused) return;

        if (e.key === "1") store.app.activeTab = VIEWS.CHEATS.id;
        if (e.key === "2") store.app.activeTab = VIEWS.ACCOUNT.id;
        if (e.key === "3") store.app.activeTab = VIEWS.CONFIG.id;
        if (e.key === "4") store.app.activeTab = VIEWS.SEARCH.id;
        if (e.key === "5") store.app.activeTab = VIEWS.DEVTOOLS.id;

        if (e.key === "/") {
            e.preventDefault();
            const searchInput =
                document.querySelector(".tab-pane.active .global-search-input") ||
                document.querySelector(".menu-search-input");
            searchInput?.focus();
        }

        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();
            const isConfigActive =
                store.app.activeTab === VIEWS.CONFIG.id ||
                (store.app.activeTab === VIEWS.CHEATS.id && store.app.configDrawerOpen);

            if (isConfigActive) {
                document.getElementById("save-config-button")?.click();
            }
        }
    });

    van.derive(store.saveMenuPlace);

    const viewInstances = {};
    const tabContent = div({ id: "tab-content" });

    van.derive(() => {
        const activeId = store.app.activeTab;
        const isCheatsTab = activeId === VIEWS.CHEATS.id;

        if (!isCheatsTab && store.app.configDrawerOpen) {
            store.closeConfigDrawer();
        }

        const isDrawerVisible = isCheatsTab && store.app.configDrawerOpen;
        const visibleViewIds = new Set([activeId]);
        if (isDrawerVisible) visibleViewIds.add(VIEWS.CONFIG.id);

        visibleViewIds.forEach((viewId) => {
            if (!viewInstances[viewId] && viewFactories[viewId]) {
                const instance = viewFactories[viewId]();
                viewInstances[viewId] = instance;
                van.add(tabContent, instance);
            }
        });

        Object.entries(viewInstances).forEach(([id, domNode]) => {
            const isConfigDrawerNode = id === VIEWS.CONFIG.id && isDrawerVisible;
            const isActiveNode = visibleViewIds.has(id);

            domNode.classList.toggle("active", isActiveNode);
            domNode.classList.toggle("drawer-open", isConfigDrawerNode);

            domNode.classList.toggle("drawer-host-open", id === VIEWS.CHEATS.id && isDrawerVisible);
        });
    });

    return div(
        { class: "app-layout" },
        Sidebar(),
        main({ class: "viewport" }, div({ class: "menu-top" }, MenuSearch(), AdvancedTabs()), tabContent),
        UpdateModal(),
        Toast(),
        TooltipContainer()
    );
};
