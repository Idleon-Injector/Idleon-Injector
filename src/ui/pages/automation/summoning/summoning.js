/**
 * Automation › Summoning: which summoning board upgrades the summoning automation buys. Each essence colour
 * has its own group in the list: what it owns and what it is doing while the automation runs, its saving %, and its
 * upgrades, each with a stop-at level, "Save for it" and a switch.
 *
 * Reads readComputed("automation", "summoning") ({ waiting, essences, upgrades }) and saves
 * cheatConfig.automation.summoning (one { id, on, stopAt, save } per upgrade) and
 * cheatConfig.automation.summoningSaving (one % per colour, in the order below).
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

const { div, span } = van.tags;

const CHEAT = "automation summoning";
// The game's essence colours in Summon[2] order, which is also the order of summoningSaving.
const ESSENCES = ["white", "green", "yellow", "blue", "purple", "red", "cyan", "teal"];
const title = (colour) => `${colour[0].toUpperCase()}${colour.slice(1)}`;
const COLUMNS = automationColumns({ values: ["Level", "Next level"], save: true, stopAt: "Stop at level" });

const lockedText = ({ lockedBy: { parent, lore } = {} }) =>
    lore ? "Unlocks once Spelunking's Lore Boss 5 is beaten" : `Unlocks once ${cleanName(parent ?? "")} has a level`;

// Under the board's bonus text (the row's main line): the Familiar row's note, then the lock.
const upgradeDetail = (upgrade) => [
    span({ hidden: () => !upgrade.val.note }, () => upgrade.val.note ?? ""),
    span({ hidden: () => upgrade.val.unlocked !== false }, () => lockedText(upgrade.val)),
];

// The next level's cost, or why there is none. The board rounds a cost under 1000 up, as here; it pays the exact cost.
const nextLevel = ({ level, max, unlocked, cost = 0 }) => {
    if (max !== null && max !== undefined && level >= max) return "Max";
    if (unlocked === false) return "Locked";
    return formatNumber(cost < 1000 ? Math.ceil(cost) : cost);
};

const SummoningAutomationTab = () => {
    const waiting = van.state(null);
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the game's upgrade entry
    const essences = ESSENCES.map(() => van.state({ owned: 0, goal: null }));
    const lists = ESSENCES.map(() => div());
    const reconcilers = lists.map(createStaticRowReconciler);

    const tab = useAutomationTab({
        label: "Summoning automation",
        cheats: [CHEAT],
        switchColumn: COLUMNS.on,
        read: async (automation) => {
            const data = await readComputed("automation", "summoning");
            picks.sync(automation.summoning);
            saving.sync(automation.summoningSaving);
            // The rows read these states as they are made, so they hold the game's entries first.
            for (const upgrade of data.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            ESSENCES.forEach((_, colour) => {
                const rows = data.upgrades.filter((upgrade) => upgrade.colour === colour);
                reconcilers[colour](rows.map(({ id }) => id).join("|"), () =>
                    rows.map(({ id, name }) =>
                        PickRow({
                            picks,
                            id: String(id),
                            name: cleanName(name),
                            bonus: () => cleanName(upgrades.get(id).val.bonus ?? ""),
                            detail: upgradeDetail(getOrCreateState(upgrades, id, {})),
                            values: [
                                {
                                    name: "Level",
                                    text: () => upgrades.get(id).val.level ?? 0,
                                    cap: () => upgrades.get(id).val.max || null,
                                },
                                { name: "Next level", quiet: true, text: () => nextLevel(upgrades.get(id).val) },
                            ],
                            save: true,
                            stopAtTitle: "Stop at level",
                        })
                    )
                );
            });
            data.essences.forEach((essence, i) => (essences[i].val = essence));
            waiting.val = data.waiting;
            ids.val = data.upgrades.map(({ id }) => String(id));
        },
    });
    const [automation] = tab.entries;
    // Switching an upgrade on switches Summoning on too (now and at start), in the same save. What each colour saves
    // for changes with every pick, so the tab reads the game again after every save.
    const picks = createAutomationPicks("summoning", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave });
    const saving = createAutomationSetting("summoningSaving", { afterSave: tab.afterSave });

    // What colour i is doing while the automation runs: paused, nothing on, saving for its goal, or buying.
    const statusLine = (i) => {
        if (!automation.val?.on) return "";
        if (waiting.val) return waiting.val;
        const on = ids.val.some((id) => upgrades.get(Number(id))?.val.colour === i && picks.get(id).on.val);
        if (!on) return "Nothing switched on";
        const { goal } = essences[i].val;
        if (!goal) return "Buying cheapest first";
        return `Saving for ${cleanName(upgrades.get(goal.id)?.val.name ?? "")} (${formatNumber(goal.cost)})`;
    };

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every upgrade on it still has work while Summoning is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        words: ["summoning upgrade", "summoning upgrades"],
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return AutomationPage({
        title: "Summoning",
        page: "automation.summoning",
        description: "Buys switched-on upgrades with essence, each colour on its own. Pauses while the board is open.",
        columns: COLUMNS,
        bulk,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        what: "summoning",
        body: [
            AccountSection({ title: "Settings", body: tab.switches }),
            COLUMNS.head("Upgrade"),
            ...ESSENCES.map((colour, i) =>
                AccountSection({
                    title: `${title(colour)} essence`,
                    // What it owns, and while the automation runs, what it is doing.
                    meta: span({ class: "automation-group__meta", role: "status" }, () =>
                        [`${formatNumber(essences[i].val.owned)} owned`, statusLine(i)].filter(Boolean).join(" · ")
                    ),
                    body: [
                        SettingRow({
                            setting: saving,
                            index: i,
                            name: "While saving",
                            title: "% of goal",
                            detail: SAVING_DETAIL,
                            column: COLUMNS.stopAt,
                        }),
                        lists[i],
                    ],
                })
            ),
        ],
    });
};

export default definePage({
    id: "automation.summoning",
    world: "automation",
    system: "Summoning",
    description: "Summoning upgrades bought with essence by the summoning automation, each colour on its own.",
    keywords: ["Autobuy", "Auto buy", "Summoning Upgrades", "Familiar", "Stop at", "Save for it", "Priority"],
    component: SummoningAutomationTab,
});
