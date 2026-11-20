/**
 * World 6 › Summoning › Automation: which summoning board upgrades the summoning automation buys. Each essence colour
 * has its own section: what it owns, what it is doing while the automation runs, its saving %, and its upgrades, each
 * with High / Low / Balanced, a stop-at level and a switch.
 *
 * Reads readComputed("automation", "summoning") ({ waiting, essences, upgrades }) and saves
 * cheatConfig.automation.summoning (one { id, on, stopAt, priority } per upgrade) and
 * cheatConfig.automation.summoningSaving (one % per colour, in the order below).
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

const CHEAT = "automation summoning";
// The game's essence colours in Summon[2] order, which is also the order of summoningSaving.
const ESSENCES = ["white", "green", "yellow", "blue", "purple", "red", "cyan", "teal"];
const title = (colour) => `${colour[0].toUpperCase()}${colour.slice(1)}`;

const lockedText = ({ lockedBy: { parent, lore } = {} }) =>
    lore ? "Unlocks once Spelunking's Lore Boss 5 is beaten" : `Unlocks once ${cleanName(parent ?? "")} has a level`;

// The board's bonus text, the Familiar row's note, then the next cost, the lock or the max.
const upgradeDetail = (upgrade) => [
    span({ hidden: () => !upgrade.val.bonus }, () => cleanName(upgrade.val.bonus ?? "")),
    span({ hidden: () => !upgrade.val.note }, () => upgrade.val.note ?? ""),
    span(() => {
        const { level, max, unlocked, cost, colour } = upgrade.val;
        if (max !== null && level >= max) return "Max level";
        if (!unlocked) return lockedText(upgrade.val);
        // The board rounds a cost under 1000 up, as here; it pays the exact cost.
        return `Next level ${formatNumber(cost < 1000 ? Math.ceil(cost) : cost)} ${ESSENCES[colour] ?? ""} essence`;
    }),
];

const SummoningAutomationTab = () => {
    const waiting = van.state(null);
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the game's upgrade entry
    const essences = ESSENCES.map(() => van.state({ owned: 0, goal: null }));
    const lists = ESSENCES.map(() => div({ class: "account-item-stack" }));
    const reconcilers = lists.map(createStaticRowReconciler);

    const tab = useAutomationTab({
        label: "Summoning automation",
        cheats: [CHEAT],
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
                            detail: upgradeDetail(getOrCreateState(upgrades, id, {})),
                            badge: () => {
                                const { level = 0, max } = upgrades.get(id).val;
                                return `LV ${level}${max ? ` / ${max}` : ""}`;
                            },
                            selects: [PRIORITY],
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
        noun: (n) => `${n === 1 ? "1 summoning upgrade" : `all ${n} summoning upgrades`}, in every colour`,
        waiting: tab.waiting,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Switched-on upgrades are bought with essence, each colour saving and buying on its own, and switching one on turns Summoning automation on. A colour saves for its cheapest High or Low upgrade (an affordable High one goes first) and buys Balanced ones cheapest first. Buying stops at the stop-at level; leave it empty for no limit. It pauses while the summoning board is open. Doubler slots stay manual.",
        actions: BulkActionBar({ actions: bulk.actions(busy), refresh: { onClick: tab.load, disabled: busy } }),
        topNotices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: "READING SUMMONING AUTOMATION",
        errorTitle: "SUMMONING AUTOMATION READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({ title: "AUTOMATION", body: tab.switches }),
            ...ESSENCES.map((colour, i) =>
                AccountSection({
                    title: `${colour.toUpperCase()} ESSENCE`,
                    meta: span(
                        { class: "account-row__sub-label" },
                        () => `${formatNumber(essences[i].val.owned)} owned`
                    ),
                    body: [
                        span(
                            {
                                class: "automation-row__status automation-colour-status",
                                role: "status",
                                hidden: () => !statusLine(i),
                            },
                            () => statusLine(i)
                        ),
                        SettingRow({
                            setting: saving,
                            index: i,
                            name: `${title(colour)} essence saving`,
                            title: "% of the goal",
                            detail: "While this colour saves for a High or Low upgrade, Balanced ones may cost up to this much of it.",
                        }),
                        lists[i],
                    ],
                })
            )
        ),
    });
};

export default definePage({
    id: "w6.summoning.automation",
    world: 6,
    system: "Summoning",
    tab: "Automation",
    description: "Summoning upgrades bought with essence by the summoning automation, each colour on its own.",
    keywords: ["Autobuy", "Auto buy", "Summoning Upgrades", "Familiar", "Stop at", "Priority"],
    component: SummoningAutomationTab,
});
