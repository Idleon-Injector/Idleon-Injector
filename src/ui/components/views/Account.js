/**
 * Account View ("Older pages" in the menu)
 * Top-level container for Account tabs. Pages move out of here into src/ui/pages/ one by one.
 * Account Options moved to Advanced (views/AccountOptions.js); the rest moved to src/ui/pages/.
 *
 * Follows the same sub-tab pattern as Config.js.
 * Each tab lives in src/ui/components/views/account/ for easy scalability.
 */

import van from "../../vendor/van-1.6.0.js";
import { renderLazyPanes, renderTabNav } from "./account/tabShared.js";

const { div, span } = van.tags;

/**
 * Tab definitions.
 * To add a new tab: push an entry here and create its component in ./account/.
 */
const ACCOUNT_TABS = [];

/** The open tab, shared so the new menu can send players to a world that hasn't moved yet. */
export const olderPagesTab = van.state(ACCOUNT_TABS[0].id);

export const Account = () => {
    const activeTab = olderPagesTab;

    return div(
        { id: "options-account-tab", class: "tab-pane account-tab-layout" },

        // Sub-navigation
        renderTabNav({
            tabs: ACCOUNT_TABS,
            activeId: activeTab,
            navClass: "account-sub-nav",
            buttonClass: (tab) => {
                if (tab.isWorld) return `account-top-tab-btn world-tab-btn w${tab.worldNum}-world-tab`;
                const compactClass = ["player", "tasks", "cards", "bundles"].includes(tab.id)
                    ? "account-compact-tab-btn"
                    : "";
                return `account-top-tab-btn account-options-btn ${compactClass}`;
            },
            renderLabel: (tab) => (tab.isWorld ? span({ class: "world-tab-btn-num" }, `W${tab.worldNum}`) : tab.label),
            getButtonProps: (tab) => ({ title: tab.label }),
        }),

        // Tab panes — lazy-mount: component is created (and its data fetched)
        // only when the user first activates that tab. The div stays in the DOM
        // so CSS visibility toggling keeps state alive after mount.
        div(
            { class: "account-sub-tab-content" },
            ...renderLazyPanes({
                tabs: ACCOUNT_TABS,
                activeId: activeTab,
                paneClass: "account-sub-tab-pane",
                dataAttr: "data-tab",
                renderContent: (tab) => tab.component(),
            })
        )
    );
};
