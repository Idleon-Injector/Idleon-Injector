/**
 * World 6 › Sneaking › Automation: which Ninja Knowledge upgrades the sneaking automation buys with jade coins, by
 * the shared rule (High / Low / Balanced, saving %), each up to its stop-at.
 *
 * Reads readComputed("automation", "sneaking") (jade, every upgrade with its bonus, level, next cost and lock) and
 * saves cheatConfig.automation.sneaking, one { id: "row", on, stopAt, priority } per upgrade, and sneakingSaving.
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
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation sneaking";

// The row's first render runs before its data lands, so unlockAt may be missing.
const lockedText = ({ unlockAt: { parent, reef } = {} }) => {
    if (reef) return `Unlocks at level ${reef} of the W7 Coral Reef's Ninja Knowledge upgrade`;
    return parent ? `Unlocks once ${cleanName(parent)} has a level` : "Unlocks with Sneaking mastery";
};

const SneakingAutomationTab = () => {
    const ids = van.state([]);
    const jade = van.state(null);
    const upgrades = new Map(); // id -> state of the game's row
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const tab = useAutomationTab({
        label: "Sneaking automation",
        cheats: [CHEAT],
        read: async (automation) => {
            const data = await readComputed("automation", "sneaking");
            picks.sync(automation.sneaking);
            saving.sync(automation.sneakingSaving);
            jade.val = data.jade;
            reconcile(data.upgrades.map(({ id }) => id).join("|"), () =>
                data.upgrades.map(({ id, name }) => {
                    const upgrade = getOrCreateState(upgrades, String(id), {});
                    return PickRow({
                        picks,
                        id: String(id),
                        name: cleanName(name),
                        badge: () => `LV ${formatNumber(upgrade.val.level ?? 0)}`,
                        selects: [PRIORITY],
                        stopAtTitle: "Stop at level",
                        detail: [
                            span(() => cleanName(upgrade.val.bonus ?? "")),
                            span(() =>
                                upgrade.val.unlocked
                                    ? `Next level ${costText(upgrade.val.cost)} jade`
                                    : lockedText(upgrade.val)
                            ),
                        ],
                    });
                })
            );
            for (const upgrade of data.upgrades) getOrCreateState(upgrades, String(upgrade.id), {}).val = upgrade;
            ids.val = data.upgrades.map(({ id }) => String(id));
        },
    });
    const [automation] = tab.entries;
    // Switching an upgrade on switches Sneaking on too (now and at start), in the same save; after every save the tab
    // reads the game again.
    const picks = createAutomationPicks("sneaking", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave });
    const saving = createAutomationSetting("sneakingSaving", { afterSave: tab.afterSave });

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every upgrade on it still has work while Sneaking is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        noun: (n) => `${n === 1 ? "1 upgrade" : `all ${n} upgrades`}; their stop-at and priority stay`,
        waiting: tab.waiting,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Switched-on Ninja Knowledge upgrades are bought with jade coins once the sneaking tutorial opens Ninja Knowledge, and switching one on turns Sneaking on. It saves for the cheapest High or Low upgrade (High first when one is affordable) and buys Balanced ones cheapest first. They have no max level, so give each a stop-at unless it should take all your jade.",
        actions: BulkActionBar({ actions: bulk.actions(busy), refresh: { onClick: tab.load, disabled: busy } }),
        topNotices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: "READING NINJA KNOWLEDGE",
        errorTitle: "NINJA KNOWLEDGE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({
                title: "AUTOMATION",
                note: () => (jade.val === null ? "" : `${heldText(jade.val)} JADE`),
                body: [
                    tab.switches,
                    SettingRow({
                        setting: saving,
                        name: "Saving",
                        title: "% of the goal",
                        detail: "While it saves for a High or Low upgrade, Balanced ones may cost up to this much of it.",
                    }),
                ],
            }),
            AccountSection({ title: "NINJA KNOWLEDGE", body: listNode })
        ),
    });
};

export default definePage({
    id: "w6.sneaking.automation",
    world: 6,
    system: "Sneaking",
    tab: "Automation",
    description: "Ninja Knowledge upgrades bought with jade coins, each up to its stop-at, by priority.",
    keywords: ["Autobuy", "Auto buy", "Ninja Knowledge", "Jade", "Stop at"],
    component: SneakingAutomationTab,
});
