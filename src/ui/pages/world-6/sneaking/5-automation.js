/**
 * World 6 › Sneaking › Automation: which Ninja Knowledge upgrades the sneaking automation buys with jade coins, by
 * the shared rule ("Save for it", saving %), each up to its stop-at.
 *
 * Reads readComputed("automation", "sneaking") (jade, every upgrade with its bonus, level, next cost and lock) and
 * saves cheatConfig.automation.sneaking, one { id: "row", on, stopAt, save } per upgrade, and sneakingSaving.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../../components/inPlace.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationPage,
    AutomationStats,
    PickRow,
    SAVING_DETAIL,
    SettingRow,
    automationColumns,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";

const { div } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation sneaking";
const COLUMNS = automationColumns({ values: ["Level", "Next level"], save: true, stopAt: "Stop at level" });

// The row's first render runs before its data lands, so unlockAt may be missing.
const lockedText = ({ unlockAt: { parent, reef } = {} }) => {
    if (reef) return `Unlocks at level ${reef} of the W7 Coral Reef's Ninja Knowledge upgrade`;
    return parent ? `Unlocks once ${cleanName(parent)} has a level` : "Unlocks with Sneaking mastery";
};

const SneakingAutomationTab = () => {
    const ids = van.state([]);
    const jade = van.state(null);
    const upgrades = new Map(); // id -> state of the game's row
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);

    const tab = useAutomationTab({
        label: "Sneaking automation",
        cheats: [CHEAT],
        switchColumn: COLUMNS.on,
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
                        save: true,
                        stopAtTitle: "Stop at level",
                        bonus: () => cleanName(upgrade.val.bonus ?? ""),
                        detail: () => (upgrade.val.unlocked === false ? lockedText(upgrade.val) : ""),
                        values: [
                            { name: "Level", text: () => formatNumber(upgrade.val.level ?? 0) },
                            {
                                name: "Next level",
                                quiet: true,
                                text: () =>
                                    upgrade.val.unlocked === false ? "Locked" : costText(upgrade.val.cost ?? 0),
                            },
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
        words: ["Ninja Knowledge upgrade", "Ninja Knowledge upgrades"],
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return AutomationPage({
        description: "Buys switched-on Ninja Knowledge with jade. They have no max, so set a stop-at.",
        total: AutomationStats(() => (jade.val === null ? [] : [[heldText(jade.val), "jade"]])),
        columns: COLUMNS,
        bulk,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        what: "Ninja Knowledge",
        body: [
            AccountSection({
                title: "Settings",
                body: [
                    tab.switches,
                    SettingRow({
                        setting: saving,
                        name: "While saving",
                        title: "% of goal",
                        detail: SAVING_DETAIL,
                        column: COLUMNS.stopAt,
                    }),
                ],
            }),
            COLUMNS.head("Ninja Knowledge"),
            listNode,
        ],
    });
};

export default definePage({
    id: "w6.sneaking.automation",
    world: 6,
    system: "Sneaking",
    tab: "Automation",
    description: "Ninja Knowledge upgrades bought with jade coins, each up to its stop-at.",
    keywords: ["Autobuy", "Auto buy", "Ninja Knowledge", "Jade", "Stop at", "Save for it", "Priority"],
    component: SneakingAutomationTab,
});
