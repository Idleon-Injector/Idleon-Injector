/**
 * Automation › Clickers: one page for the three clickers, a tab each on one list (TabbedList). What the open
 * clicker holds sits beside the title, and its Enable all and Disable all in the list's tray.
 *
 * Orion and Poppy use useClickerAutomation: which Orion upgrades "automation orion" buys with feathers, and which
 * Poppy and Tar Pit upgrades "automation poppy" and "automation tarpit" buy.
 *
 * Bubba: which Bubba upgrades the Bubba automation buys with meat, by the shared rule ("Save for it", saving %), each
 * up to its stop-at.
 *
 * Reads readComputed("automation", "bubba") (meat, the goal, every upgrade) and saves cheatConfig.automation.bubba,
 * one { id, on, stopAt, save } per upgrade, and cheatConfig.automation.bubbaSaving.
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
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { CLICKER_COLUMNS, useClickerAutomation } from "../../../components/views/account/ClickerAutomationTab.js";

const { div } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation bubba";
const COLUMNS = CLICKER_COLUMNS;

/** Bubba's tab: its switch, the saving %, and every upgrade with what it does, its level and next cost. */
export const useBubbaAutomation = () => {
    const data = van.state(null); // the game's read: { waiting, meat, goal, upgrades }
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the upgrade's read
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);

    const tab = useAutomationTab({
        label: "Bubba automation",
        cheats: [CHEAT],
        switchColumn: COLUMNS.on,
        read: async (automation) => {
            const read = await readComputed("automation", "bubba");
            picks.sync(automation.bubba);
            saving.sync(automation.bubbaSaving);
            reconcile(read.upgrades.map(({ id }) => id).join("|"), () =>
                read.upgrades.map(({ id, name }) => {
                    const upgrade = getOrCreateState(upgrades, id, {});
                    const maxed = () => upgrade.val.max !== null && upgrade.val.level >= upgrade.val.max;
                    return PickRow({
                        picks,
                        id: String(id),
                        name: cleanName(name),
                        bonus: () => upgrade.val.bonus ?? "",
                        save: true,
                        stopAtTitle: "Stop at level",
                        detail: () =>
                            upgrade.val.unlocked === false
                                ? `Unlocks at ${formatNumber(upgrade.val.unlockAt)} meat made`
                                : "",
                        values: [
                            {
                                name: "Level",
                                text: () => upgrade.val.level ?? 0,
                                cap: () => upgrade.val.max || null,
                            },
                            {
                                name: "Next level",
                                quiet: true,
                                text: () => {
                                    if (maxed()) return "Max";
                                    if (upgrade.val.unlocked === false) return "Locked";
                                    return costText(upgrade.val.cost ?? 0);
                                },
                            },
                        ],
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
    // save the tab reads the game again, so its switch row's line follows the picks.
    const picks = createAutomationPicks("bubba", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave });
    const saving = createAutomationSetting("bubbaSaving", { afterSave: tab.afterSave });

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every upgrade on it still has work while the automation is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        words: ["Bubba upgrade", "Bubba upgrades"],
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });

    tab.load();

    return {
        id: "bubba",
        label: "Bubba",
        description: "Buys switched-on upgrades with meat once the run's gift is picked.",
        columns: COLUMNS,
        bulk,
        stats: () => (data.val ? [[heldText(data.val.meat), "meat"]] : []),
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy: () => tab.loading.val || bulk.busy(),
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
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
            COLUMNS.head("Upgrade"),
            listNode,
        ],
    };
};

export const useOrionAutomation = () =>
    useClickerAutomation({
        id: "orion",
        label: "Orion",
        description: "Buys switched-on upgrades with feathers.",
        words: ["Orion upgrade", "Orion upgrades"],
        groups: [
            {
                key: "orion",
                name: "Orion",
                currency: "feathers",
                lockedText: ({ unlockAt }) => `Unlocks at ${formatNumber(unlockAt)} feathers produced`,
            },
        ],
    });

export const usePoppyAutomation = () =>
    useClickerAutomation({
        id: "poppy",
        label: "Poppy",
        description: "Buys switched-on upgrades while Poppy's menu is open.",
        words: ["upgrade", "upgrades"],
        groups: [
            {
                key: "poppy",
                name: "Poppy",
                currency: "fish",
                lockedText: ({ unlockAt }) => `Unlocks at ${formatNumber(unlockAt)} fish caught`,
            },
            {
                key: "tarpit",
                name: "Tar Pit",
                currency: "tartar fish",
                lockedText: () => "Needs more megafish",
            },
        ],
    });

/**
 * The page: one list with a tab per clicker. Every tab stays mounted, so its saves and Undo stay; the title's stats
 * and line follow the open tab. Refresh reads all three, and a read that fails says so for the page.
 */
export const ClickersAutomation = () => {
    const tabs = [useOrionAutomation(), usePoppyAutomation(), useBubbaAutomation()];
    const activeId = van.state(tabs[0].id);
    const open = () => tabs.find(({ id }) => id === activeId.val) ?? tabs[0];
    return AutomationPage({
        title: "Clickers",
        page: "automation.clickers",
        description: () => open().description,
        total: AutomationStats(() => open().stats()),
        tabs,
        activeId,
        state: {
            loading: () => tabs.some(({ state }) => state.loading.val),
            error: () => tabs.map(({ state }) => state.error.val).find(Boolean) ?? null,
        },
        load: () => tabs.forEach(({ load }) => load()),
        busy: () => tabs.some(({ busy }) => busy()),
        notices: div(...tabs.map(({ id, notices }) => div({ hidden: () => activeId.val !== id }, notices))),
        what: "the clickers",
    });
};

export default definePage({
    id: "automation.clickers",
    world: "automation",
    system: "Clickers",
    description:
        "What the Orion, Poppy and Bubba automations buy, each upgrade up to its stop-at, and what they save for.",
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
        "Save for it",
        "Priority",
    ],
    component: ClickersAutomation,
});
