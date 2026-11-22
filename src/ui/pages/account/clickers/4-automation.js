/**
 * Account › Clickers › Automation: one page for the three clickers, with an inner tab each.
 *
 * Orion and Poppy use ClickerAutomationTab: which Orion upgrades "automation orion" buys with feathers, and which
 * Poppy and Tar Pit upgrades "automation poppy" and "automation tarpit" buy.
 *
 * Bubba: which Bubba upgrades the Bubba automation buys with meat, by the shared rule (High / Low / Balanced,
 * saving %), each up to its stop-at.
 *
 * Reads readComputed("automation", "bubba") (meat, the goal, every upgrade) and saves cheatConfig.automation.bubba,
 * one { id, on, stopAt, priority } per upgrade, and cheatConfig.automation.bubbaSaving.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
} from "../../../components/views/account/accountShared.js";
import {
    PRIORITY,
    PickRow,
    SettingRow,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ClickerAutomationTab } from "../../../components/views/account/ClickerAutomationTab.js";
import { renderPersistentPagePanes, renderTabNav } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation bubba";

export const BubbaAutomationTab = () => {
    const data = van.state(null); // the game's read: { waiting, meat, goal, upgrades }
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the upgrade's read
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const tab = useAutomationTab({
        label: "Bubba automation",
        cheats: [CHEAT],
        read: async (automation) => {
            const read = await readComputed("automation", "bubba");
            picks.sync(automation.bubba);
            saving.sync(automation.bubbaSaving);
            reconcile(read.upgrades.map(({ id }) => id).join("|"), () =>
                read.upgrades.map(({ id, name }) => {
                    const upgrade = getOrCreateState(upgrades, id, {});
                    return PickRow({
                        picks,
                        id: String(id),
                        name: cleanName(name),
                        selects: [PRIORITY],
                        stopAtTitle: "Stop at level",
                        badge: () => `LV ${upgrade.val.level ?? 0}${upgrade.val.max ? ` / ${upgrade.val.max}` : ""}`,
                        detail: () => {
                            const { level, max, cost, unlockAt, unlocked } = upgrade.val;
                            if (max !== null && level >= max) return "Max level";
                            if (!unlocked) return `Unlocks at ${formatNumber(unlockAt)} meat made`;
                            return `Next level ${costText(cost)} meat`;
                        },
                    });
                })
            );
            for (const upgrade of read.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            ids.val = read.upgrades.map(({ id }) => String(id));
            data.val = read;
        },
    });
    const [automation] = tab.entries;
    // Switching an upgrade on switches the Bubba automation on too (now and at start), in the same save; after every
    // save the tab reads the game again, so the status line follows the picks.
    const picks = createAutomationPicks("bubba", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave });
    const saving = createAutomationSetting("bubbaSaving", { afterSave: tab.afterSave });

    // What it is doing, while it runs; switched off, its switch row says Off and this says nothing.
    const status = () => {
        const read = data.val;
        if (!read || !automation.val?.on) return "";
        if (read.waiting) return read.waiting;
        if (!ids.val.some((id) => picks.get(id).on.val)) return "Nothing switched on";
        if (!read.goal) return "Buying cheapest first";
        const goal = read.upgrades.find(({ id }) => id === read.goal.id);
        return `Saving for ${cleanName(goal.name)} (${costText(read.goal.cost)} meat)`;
    };

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every upgrade on it still has work while the automation is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        noun: (n) => (n === 1 ? "1 Bubba upgrade" : `all ${n} Bubba upgrades`),
        waiting: tab.waiting,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Switched-on upgrades are bought with meat once the run's gift is picked, and switching one on turns the Bubba automation on. It saves for the cheapest High or Low upgrade (an affordable High one goes first) and buys Balanced ones cheapest first. Buying stops at the stop-at level; leave it empty for no limit. Pats and charisma stay manual.",
        actions: BulkActionBar({ actions: bulk.actions(busy), refresh: { onClick: tab.load, disabled: busy } }),
        topNotices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: "READING BUBBA",
        errorTitle: "BUBBA READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({ title: "AUTOMATION", body: tab.switches }),
            AccountSection({
                title: "MEAT",
                meta: span({ class: "account-row__sub-label" }, () =>
                    data.val ? `${heldText(data.val.meat)} owned` : ""
                ),
                body: [
                    () =>
                        status()
                            ? AccountRow({
                                  rowClass: "automation-goal",
                                  info: span({ class: "account-row__name", role: "status" }, status),
                              })
                            : span(),
                    SettingRow({
                        setting: saving,
                        name: "Saving",
                        title: "% of the goal",
                        detail: "While it saves for a High or Low upgrade, Balanced ones may cost up to this much of it.",
                    }),
                ],
            }),
            AccountSection({ title: "UPGRADES", body: listNode })
        ),
    });
};

export const OrionAutomationTab = () =>
    ClickerAutomationTab({
        title: "AUTOMATION",
        description:
            "Switched-on upgrades are bought with feathers, and switching one on turns Orion's automation on. It saves for the cheapest High or Low upgrade (an affordable High one goes first) while Balanced ones are bought cheapest first. Buying stops at the stop-at level; leave it empty for no limit.",
        groups: [
            {
                key: "orion",
                currency: "feathers",
                upgradesTitle: "UPGRADES",
                lockedText: ({ unlockAt }) => `Unlocks at ${formatNumber(unlockAt)} feathers produced`,
            },
        ],
    });

export const PoppyAutomationTab = () =>
    ClickerAutomationTab({
        title: "AUTOMATION",
        description:
            "Switched-on upgrades are bought while Poppy's menu is open, because her fish only land then; switching one on turns its automation on. Each saves for its cheapest High or Low upgrade (an affordable High one goes first) while Balanced ones are bought cheapest first, up to the stop-at level. The reset spiral and shiny catching stay manual.",
        groups: [
            {
                key: "poppy",
                currency: "fish",
                upgradesTitle: "UPGRADES",
                lockedText: ({ unlockAt }) => `Unlocks at ${formatNumber(unlockAt)} fish caught`,
            },
            {
                key: "tarpit",
                currency: "tartar fish",
                upgradesTitle: "TAR PIT",
                lockedText: () => "Needs more megafish",
            },
        ],
    });

// Automation › Shops' pattern: small inner tabs above the title, each opening one clicker's whole panel. Every
// panel stays mounted, so its saves and Undo stay.
const CLICKERS = [
    { id: "orion", label: "Orion", panel: OrionAutomationTab },
    { id: "poppy", label: "Poppy", panel: PoppyAutomationTab },
    { id: "bubba", label: "Bubba", panel: BubbaAutomationTab },
];

const ClickersAutomation = () => {
    const activeClicker = van.state(CLICKERS[0].id);
    return div(
        { class: "clickers-automation" },
        renderTabNav({
            tabs: CLICKERS,
            activeId: activeClicker,
            navClass: "account-page-nav",
            buttonClass: "account-page-btn",
        }),
        ...renderPersistentPagePanes({ tabs: CLICKERS, activeId: activeClicker, renderContent: (tab) => tab.panel() })
    );
};

export default definePage({
    id: "account.clickers.automation",
    world: "account",
    system: "Clickers",
    tab: "Automation",
    description:
        "What the Orion, Poppy and Bubba automations buy, each upgrade up to its stop-at, High, Low or Balanced.",
    keywords: [
        "Autoclicker",
        "Auto clicker",
        "Clicker",
        "Owl",
        "Orion",
        "Kangaroo",
        "Poppy",
        "Tar Pit",
        "Bubba",
        "Autobuy",
        "Auto buy",
        "Feather Restart",
        "Mega Reset",
        "Stop at",
        "Priority",
    ],
    component: ClickersAutomation,
});
