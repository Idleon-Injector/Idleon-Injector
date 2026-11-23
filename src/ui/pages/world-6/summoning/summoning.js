/**
 * W6 - Summoning
 *
 * One page, the game's summoning screens as its tabs: Upgrades (the board, a group per essence colour), Essence,
 * Battles, and the summoning automation last. One read of the game fills every tab.
 *
 * Data sources:
 *   gga.Summon[0][n]               - board upgrade n's level (cList.SummonUPG: [2] colour, [3] name, [8] max level, 9999
 *                                    for none, [11] bonus)
 *   gga.Summon[2][c]               - essence of colour c (White to Teal)
 *   gga.OptionsListAccount[319]    - Endless Summoning wins
 *   readComputed("automation", "summoning") and cheatConfig.automation.summoning / summoningSaving - the automation
 *
 * The normal battles won (gga.Summon[1], enemy ids from cList.SummonEnemies) aren't shown: the old page kept them
 * hidden, and that stays Lumi's call.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList, loadParts, toolsPerTab } from "../../../components/views/account/tabShared.js";
import {
    PickRow,
    SAVING_DETAIL,
    SettingRow,
    automationColumns,
    automationPart,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// The game's essence colours, in Summon[2] order (also the board's colour numbers and summoningSaving's order).
const COLOURS = ["White", "Green", "Yellow", "Blue", "Purple", "Red", "Cyan", "Teal"];
const NO_MAX = 9999;
// Most upgrades have no max, so no row has a Max button: the values line up down the list (+ stops at a max).

// ---- Upgrades ----------------------------------------------------------------------------------------------------

const UpgradesPart = () => {
    const getLevelState = createIndexedStateGetter(0);
    const nodes = COLOURS.map(() => div());
    const reconcilers = nodes.map(createStaticRowReconciler);
    const counts = COLOURS.map(() => van.state(0));

    const UpgradeRow = (upgrade) => {
        const info = RowTitles({ bonus: upgrade.bonus, name: upgrade.name });
        if (upgrade.max === null)
            return SimpleNumberRow({
                entry: { name: upgrade.name, path: `Summon[0][${upgrade.n}]`, formatted: false, info },
                valueState: getLevelState(upgrade.n),
            });
        return ClampedLevelRow({
            valueState: getLevelState(upgrade.n),
            writePath: `Summon[0][${upgrade.n}]`,
            max: upgrade.max,
            integerMode: "round",
            name: upgrade.name,
            renderInfo: () => info,
        });
    };

    return {
        content: div(
            { class: "field-columns" },
            ...COLOURS.map((colour, c) =>
                div({ hidden: () => !counts[c].val }, AccountSection({ title: colour, body: nodes[c] }))
            )
        ),
        load: async () => {
            const [rawLevels, rawInfo] = await Promise.all([gga("Summon[0]"), readCList("SummonUPG")]);
            const levels = toIndexedArray(rawLevels ?? []);
            const upgrades = toIndexedArray(rawInfo ?? [])
                .map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    const max = toInt(def[8], { min: 0 });
                    return {
                        n,
                        raw: String(def[3] ?? "").trim(),
                        name: cleanName(def[3]),
                        colour: toInt(def[2], { min: 0 }),
                        bonus: bonusText(def[11]),
                        max: max && max < NO_MAX ? max : null,
                    };
                })
                .filter((upgrade) => upgrade.raw);
            COLOURS.forEach((_, c) => {
                const own = upgrades.filter((upgrade) => upgrade.colour === c);
                reconcilers[c](own.map((upgrade) => `${upgrade.raw}:${upgrade.max}`).join("|"), () =>
                    own.map(UpgradeRow)
                );
                counts[c].val = own.length;
            });
            upgrades.forEach((upgrade) => (getLevelState(upgrade.n).val = toInt(levels[upgrade.n], { min: 0 })));
        },
    };
};

// ---- Essence -----------------------------------------------------------------------------------------------------

const EssencePart = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            const amounts = toIndexedArray((await gga("Summon[2]")) ?? []);
            list.show(
                COLOURS.map((colour, c) => ({
                    key: colour,
                    name: `${colour} Essence`,
                    path: `Summon[2][${c}]`,
                    value: toNum(amounts[c], 0),
                    float: true,
                }))
            );
        },
    };
};

// ---- Battles -----------------------------------------------------------------------------------------------------

const BattlesPart = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            list.show([
                {
                    key: "endless",
                    name: "Endless wins",
                    path: "OptionsListAccount[319]",
                    value: toInt(await gga("OptionsListAccount[319]"), { min: 0 }),
                    formatted: false,
                },
            ]);
        },
    };
};

// ---- Automation --------------------------------------------------------------------------------------------------

const CHEAT = "automation summoning";
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

// Which board upgrades the summoning automation buys with essence, each colour on its own: a group per colour with
// what it owns and what it is doing while the automation runs, its saving %, and its upgrades.
const AutomationPart = () => {
    const waiting = van.state(null);
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the game's upgrade entry
    const essences = COLOURS.map(() => van.state({ owned: 0, goal: null }));
    const lists = COLOURS.map(() => div());
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
            COLOURS.forEach((_, colour) => {
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
                                    text: () => {
                                        const { level = 0, max } = upgrades.get(id).val;
                                        return `${level}${max ? ` / ${max}` : ""}`;
                                    },
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

    return automationPart({
        tab,
        columns: COLUMNS,
        bulk,
        said: tab.waiting.over(bulk.said),
        body: [
            AccountSection({ title: "Settings", body: tab.switches }),
            COLUMNS.head("Upgrade"),
            ...COLOURS.map((colour, i) =>
                AccountSection({
                    title: `${colour} essence`,
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

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    { id: "upgrades", label: "Upgrades", part: UpgradesPart, keywords: ["Summoning Upgrades", "Board", "Familiar"] },
    { id: "essence", label: "Essence", part: EssencePart, keywords: ["Summoning Essence"] },
    { id: "battles", label: "Battles", part: BattlesPart, keywords: ["Rounds", "Endless", "Summoning Battles"] },
    {
        id: "automation",
        label: "Automation",
        part: AutomationPart,
        keywords: ["Autobuy", "Auto buy", "Stop at", "Save for it", "Priority"],
    },
];

const SummoningTab = () => {
    const parts = new Map();
    const activeId = van.state(TABS[0].id);
    const busy = () => [...parts.values()].some((part) => part.busy?.());
    const own = useAccountLoad({ label: "Summoning", busy });
    for (const tab of TABS) parts.set(tab.id, tab.part());
    const automation = parts.get("automation");
    // The automation reads on its own; the page says its loading and failure with the rest.
    const loading = van.derive(() => own.loading.val || automation.loading.val);
    const error = van.derive(() => own.error.val ?? automation.error.val);
    const load = () => own.run(() => loadParts(parts));

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container summoning-tab",
        title: "Summoning",
        description: "The board's upgrades, essence and battles.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy() }),
        topNotices: automation.notices(() => activeId.val === "automation"),
        state: { loading, error },
        loadingText: "Reading summoning",
        errorTitle: "Couldn't read summoning",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Summoning",
                page: "w6.summoning",
                activeId,
                busy,
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: parts.get(tab.id).content })),
                tools: toolsPerTab({ automation: automation.tools }),
                toolsOn: (id) => id === "automation",
                toolsLabel: () => automation.toolsLabel(),
            })
        ),
    });
};

export default definePage({
    id: "w6.summoning",
    world: 6,
    system: "Summoning",
    description: "The board's upgrades, essence and battles.",
    // Each tab is found by its own name and words (tabs), and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: SummoningTab,
});
