/**
 * World 7 › Bubba › Automation: which Bubba upgrades the Bubba automation buys with meat, by the shared rule
 * (High / Low / Balanced, saving %), each up to its stop-at.
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

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation bubba";

const BubbaAutomationTab = () => {
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
        title: "Automation",
        description:
            "Switched-on upgrades are bought with meat once the run's gift is picked, and switching one on turns the Bubba automation on. It saves for the cheapest High or Low upgrade (an affordable High one goes first) and buys Balanced ones cheapest first. Buying stops at the stop-at level; leave it empty for no limit. Pats and charisma stay manual.",
        actions: BulkActionBar({ actions: bulk.actions(busy), refresh: { onClick: tab.load, disabled: busy } }),
        topNotices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: "Reading Bubba",
        errorTitle: "Bubba read failed",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({ title: "Automation", body: tab.switches }),
            AccountSection({
                title: "Meat",
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
            AccountSection({ title: "Upgrades", body: listNode })
        ),
    });
};

export default definePage({
    id: "w7.bubba.automation",
    world: 7,
    system: "Bubba",
    tab: "Automation",
    description: "Bubba upgrades bought with meat by the automation, each up to its stop-at, High, Low or Balanced.",
    keywords: ["Autobuy", "Auto buy", "Clicker", "Stop at", "Priority"],
    component: BubbaAutomationTab,
});
