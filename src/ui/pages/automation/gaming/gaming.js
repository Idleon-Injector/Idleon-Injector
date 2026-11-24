/**
 * Automation › Gaming: which Gaming upgrades the gaming automation buys with bits, by the shared rule ("Save for it",
 * saving %), each up to its stop-at, and whether it harvests a full garden and digs while Gaming is open.
 *
 * Reads readComputed("automation", "gaming") (bits, every upgrade with its level, next cost and lock) and saves
 * cheatConfig.automation.gaming, one { id, on, stopAt, save } per upgrade, gamingSaving, gamingAutoHarvest and
 * gamingAutoDig.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../../components/inPlace.js";
import { createStaticRowReconciler, getOrCreateState } from "../../../components/views/account/accountShared.js";
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
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation gaming";
const COLUMNS = automationColumns({ values: ["Level", "Next level"], save: true, stopAt: "Stop at level" });

const SWITCHES = [
    ["gamingAutoHarvest", "Harvest a full garden", "Skips plant types you locked"],
    ["gamingAutoDig", "Dig when the shovel is ready", null],
];

const GamingAutomationTab = () => {
    const ids = van.state([]);
    const bits = van.state(null);
    const upgrades = new Map(); // id -> state of the game's row
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);

    const tab = useAutomationTab({
        label: "Gaming automation",
        cheats: [CHEAT],
        switchColumn: COLUMNS.on,
        read: async (automation) => {
            const data = await readComputed("automation", "gaming");
            picks.sync(automation.gaming);
            saving.sync(automation.gamingSaving);
            for (const [key, setting] of switches) setting.sync(automation[key]);
            bits.val = data.bits;
            reconcile(data.upgrades.map(({ id }) => id).join("|"), () =>
                data.upgrades.map(({ id, name }) => {
                    const upgrade = getOrCreateState(upgrades, id, {});
                    return PickRow({
                        picks,
                        id,
                        name,
                        save: true,
                        stopAtTitle: "Stop at level",
                        detail: () => (upgrade.val.unlocked === false ? "Locked" : ""),
                        values: [
                            { name: "Level", text: () => formatNumber(upgrade.val.level ?? 0) },
                            {
                                name: "Next level",
                                quiet: true,
                                text: () =>
                                    upgrade.val.maxed
                                        ? "Max"
                                        : upgrade.val.unlocked === false
                                          ? "Locked"
                                          : costText(upgrade.val.cost ?? 0),
                            },
                        ],
                    });
                })
            );
            for (const upgrade of data.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            ids.val = data.upgrades.map(({ id }) => id);
        },
    });
    const [automation] = tab.entries;
    // Switching an upgrade on switches Gaming on too (now and at start), in the same save; after every save the tab
    // reads the game again.
    const picks = createAutomationPicks("gaming", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave });
    const saving = createAutomationSetting("gamingSaving", { afterSave: tab.afterSave });
    const switches = new Map(
        SWITCHES.map(([key]) => [key, createAutomationSetting(key, { afterSave: tab.afterSave })])
    );

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every upgrade on it still has work while Gaming is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        words: ["Gaming upgrade", "Gaming upgrades"],
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return AutomationPage({
        title: "Gaming",
        page: "automation.gaming",
        description: "Buys switched-on upgrades with bits. While Gaming is open, it also harvests and digs.",
        total: AutomationStats(() => (bits.val === null ? [] : [[heldText(bits.val), "bits"]])),
        columns: COLUMNS,
        bulk,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        what: "Gaming upgrades",
        body: [
            AccountSection({
                title: "Settings",
                body: [
                    tab.switches,
                    ...SWITCHES.map(([key, name, detail]) => {
                        const setting = switches.get(key);
                        const field = setting.get();
                        return AccountToggleRow({
                            words: ["On", "Off"],
                            info: div(
                                { class: "account-row__name-group" },
                                span({ class: "account-row__name" }, name),
                                detail ? div({ class: "automation-pick__detail" }, detail) : null
                            ),
                            name,
                            checked: () => Boolean(field.value.val),
                            write: (next) => setting.set(null, next, tab.waiting.onLate),
                        });
                    }),
                    SettingRow({
                        setting: saving,
                        name: "While saving",
                        title: "% of goal",
                        detail: SAVING_DETAIL,
                        column: COLUMNS.stopAt,
                    }),
                ],
            }),
            COLUMNS.head("Upgrades"),
            listNode,
        ],
    });
};

export default definePage({
    id: "automation.gaming",
    world: "automation",
    system: "Gaming",
    description: "Gaming upgrades bought with bits, each up to its stop-at; harvesting and digging.",
    keywords: [
        "Autobuy",
        "Auto buy",
        "Bits",
        "Fertilizer",
        "Mutation",
        "Imports",
        "Harvest",
        "Dig",
        "Nuggets",
        "Stop at",
        "Save for it",
    ],
    component: GamingAutomationTab,
});
