/**
 * W6 - Sneaking
 *
 * One page, the game's sneaking screens as its tabs: Ninja Knowledge, Jade Emporium, Charms, Omni Jade, and the
 * sneaking automation last. One read of the game fills every tab.
 *
 * Data sources:
 *   gga.Ninja[103][n]           - Ninja Knowledge upgrade n's level (cList.NinjaUpg: [4] name, [6] bonus; row 9 is the
 *                                 game's placeholder)
 *   gga.Ninja[102][9]           - the Jade Emporium upgrades bought, one letter each (gga.Number2Letter[n]); the
 *                                 emporium shows them in the order cList.NinjaInfo[24] lists (cList.JadeUpg: [0] name;
 *                                 UNDER_CONSTRUCTION rows are still to come)
 *   gga.Ninja[107][c]           - Pristine Charm c unlocked (1) or not; its record is gga.CustomMaps.h.NjEQ.h.NjTrP<c>:
 *                                 [2] name, [5] bonus
 *   gga.Menagerie[6][n], [7][n] - Omni Jade on Ninja Knowledge upgrade n (the first 17), and the bonus levels it earned;
 *                                 _customBlock_MenagerieStuff("OmniJadeDailyLVs") is the levels a day
 *   readComputed("automation", "sneaking") and cheatConfig.automation.sneaking / sneakingSaving - the automation
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { TabbedList, loadParts, toolsPerTab } from "../../../components/views/account/tabShared.js";
import {
    AutomationStats,
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
    oneAtATime,
    runBulkSet,
    toInt,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const plural = (n, word) => `${word}${n === 1 ? "" : "s"}`;
// The game's placeholder rows ("Name", "UNDER_CONSTRUCTION").
const isPlaceholder = (raw) => !raw || raw === "Name" || raw === "UNDER_CONSTRUCTION";

// ---- Ninja Knowledge ---------------------------------------------------------------------------------------------

const KNOWLEDGE_PATH = "Ninja[103]";

const KnowledgePart = () => {
    const getLevelState = createIndexedStateGetter(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const UpgradeRow = (upgrade) =>
        SimpleNumberRow({
            entry: {
                name: upgrade.name,
                path: `${KNOWLEDGE_PATH}[${upgrade.n}]`,
                formatted: false,
                info: RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
            },
            valueState: getLevelState(upgrade.n),
        });

    return {
        content: div({ class: "field-columns" }, listNode),
        load: async () => {
            const [rawLevels, rawInfo] = await Promise.all([gga(KNOWLEDGE_PATH), readCList("NinjaUpg")]);
            const levels = toIndexedArray(rawLevels ?? []);
            const upgrades = toIndexedArray(rawInfo ?? [])
                .map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    return { n, raw: String(def[4] ?? "").trim(), name: cleanName(def[4]), bonus: bonusText(def[6]) };
                })
                .filter((upgrade) => !isPlaceholder(upgrade.raw));
            reconcileRows(upgrades.map((upgrade) => upgrade.raw).join("|"), () => upgrades.map(UpgradeRow));
            upgrades.forEach((upgrade) => (getLevelState(upgrade.n).val = toInt(levels[upgrade.n], { min: 0 })));
        },
    };
};

// ---- Jade Emporium -----------------------------------------------------------------------------------------------

const JADE_PATH = "Ninja[102][9]";

const JadePart = () => {
    const bought = van.state("");
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    // Every upgrade lives in one string: flips save one at a time, each from the string the game holds now.
    const inTurn = oneAtATime();

    const UpgradeRow = (upgrade) =>
        AccountToggleRow({
            info: span({ class: "account-row__name" }, upgrade.name),
            words: ["Bought", ""],
            name: upgrade.name,
            checked: () => bought.val.includes(upgrade.letter),
            write: (on) =>
                inTurn(async () => {
                    const now = String((await gga(JADE_PATH)) ?? "");
                    const without = now.split(upgrade.letter).join("");
                    const next = on ? `${without}${upgrade.letter}` : without;
                    await writeVerified(JADE_PATH, next);
                    bought.val = next;
                }),
        });

    return {
        content: listNode,
        load: async () => {
            const [rawBought, rawInfo, rawOrder, rawLetters] = await Promise.all([
                gga(JADE_PATH),
                readCList("JadeUpg"),
                readCList("NinjaInfo[24]"),
                gga("Number2Letter"),
            ]);
            const info = toIndexedArray(rawInfo ?? []);
            const letters = toIndexedArray(rawLetters ?? []);
            const upgrades = toIndexedArray(rawOrder ?? [])
                .map((raw) => {
                    const n = Number(raw);
                    const name = String(toIndexedArray(info[n] ?? [])[0] ?? "").trim();
                    return { n, raw: name, name: cleanName(name), letter: letters[n] };
                })
                .filter((upgrade) => Number.isInteger(upgrade.n) && upgrade.letter && !isPlaceholder(upgrade.raw));
            reconcileRows(upgrades.map((upgrade) => `${upgrade.raw}:${upgrade.letter}`).join("|"), () =>
                upgrades.map(UpgradeRow)
            );
            bought.val = String(rawBought ?? "");
        },
    };
};

// ---- Charms ------------------------------------------------------------------------------------------------------

const CHARMS_PATH = "Ninja[107]";
const CHARM_COUNT = 23;

const CharmsPart = ({ pending, reload }) => {
    const bulk = useWriteStatus();
    const getState = createIndexedStateGetter(0);
    const charms = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const CharmRow = (charm) =>
        AccountToggleRow({
            info: RowTitles({ bonus: charm.bonus, name: charm.name }),
            words: ["Unlocked", ""],
            name: charm.name,
            checked: () => getState(charm.n).val === 1,
            write: async (on) => {
                await writeVerified(`${CHARMS_PATH}[${charm.n}]`, on ? 1 : 0);
                getState(charm.n).val = on ? 1 : 0;
            },
        });

    const shown = () => charms.val.filter((charm) => shownBySearch(rowOf.get(charm.n)));
    const isUnlocked = (charm) => getState(charm.n).val === 1;
    const setAll = async (entries, value) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => value,
                getValueState: (charm) => getState(charm.n),
                getPath: (charm) => `${CHARMS_PATH}[${charm.n}]`,
            })
        );
        if (!result.ok && !result.cancelled) await reload();
    };

    return {
        content: listNode,
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [rawUnlocked, ...records] = await Promise.all([
                gga(CHARMS_PATH),
                ...Array.from({ length: CHARM_COUNT }, (_, n) => gga(`CustomMaps.h.NjEQ.h.NjTrP${n}`)),
            ]);
            const unlocked = toIndexedArray(rawUnlocked ?? []);
            const next = records.map((raw, n) => {
                const record = toIndexedArray(raw ?? []);
                return { n, name: cleanName(record[2], `Charm ${n + 1}`), bonus: bonusText(record[5]) };
            });
            reconcileRows(next.map((charm) => charm.name).join("|"), () =>
                next.map((charm) => {
                    const row = CharmRow(charm);
                    rowOf.set(charm.n, row);
                    return row;
                })
            );
            next.forEach((charm) => (getState(charm.n).val = toNum(unlocked[charm.n], 0) ? 1 : 0));
            charms.val = next;
        },
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${plural(n, "charm")}` : `All ${n} ${plural(n, "charm")}`;
        },
        tools: (ask) => {
            const lockAll = ActionButton({
                label: "Lock all",
                status: bulk.status,
                variant: "danger",
                disabled: () => pending() || !shown().some(isUnlocked),
                onClick: (e) => {
                    e.preventDefault();
                    const entries = shown().filter(isUnlocked);
                    ask({
                        question: `Lock ${entries.length} ${plural(entries.length, "charm")}?`,
                        confirmLabel: entries.length === 1 ? "Lock it" : "Lock them",
                        from: lockAll,
                        onConfirm: () => setAll(entries, 0),
                    });
                },
            });
            return div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Unlock all",
                    status: bulk.status,
                    disabled: () => pending() || !shown().some((charm) => !isUnlocked(charm)),
                    onClick: (e) => {
                        e.preventDefault();
                        return setAll(shown(), 1);
                    },
                }),
                lockAll
            );
        },
    };
};

// ---- Omni Jade ---------------------------------------------------------------------------------------------------

const OMNI_COUNT = 17;

const OmniJadePart = () => {
    const getOnState = createIndexedStateGetter(0);
    const getLevelState = createIndexedStateGetter(0);
    const daily = van.state(null);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    // A Ninja Knowledge upgrade with Omni Jade on gets bonus levels every day. Off keeps the levels it earned.
    const NodeRow = (node) =>
        SimpleNumberRow({
            entry: {
                name: node.name,
                path: `Menagerie[7][${node.n}]`,
                formatted: false,
                info: RowTitles({ bonus: node.bonus, name: node.name }),
            },
            valueState: getLevelState(node.n),
            renderExtraActions: ({ run }) =>
                StateSwitch({
                    checked: () => getOnState(node.n).val >= 1,
                    words: ["On", ""],
                    name: `${node.name} omni jade`,
                    ownStatus: true,
                    onFlip: (on) =>
                        run(async () => {
                            await writeVerified(`Menagerie[6][${node.n}]`, on ? 1 : 0);
                            getOnState(node.n).val = on ? 1 : 0;
                        }),
                }),
        });

    return {
        content: div(
            { class: "field-columns" },
            AccountSection({
                title: "Bonus levels",
                meta: span(() =>
                    daily.val === null ? "" : `+${formatNumber(daily.val)} a day on each upgrade that's on`
                ),
                body: listNode,
            })
        ),
        load: async () => {
            const [rawOn, rawLevels, rawInfo, rawDaily] = await Promise.all([
                gga("Menagerie[6]"),
                gga("Menagerie[7]"),
                readCList("NinjaUpg"),
                readComputed("menagerie", "OmniJadeDailyLVs", [0, 0]),
            ]);
            const on = toIndexedArray(rawOn ?? []);
            const levels = toIndexedArray(rawLevels ?? []);
            const nodes = toIndexedArray(rawInfo ?? [])
                .slice(0, OMNI_COUNT)
                .map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    const name = String(def[4] ?? "").trim();
                    return { n, raw: name, name: cleanName(name), bonus: bonusText(def[6]) };
                })
                .filter((node) => !isPlaceholder(node.raw));
            reconcileRows(nodes.map((node) => node.raw).join("|"), () => nodes.map(NodeRow));
            nodes.forEach((node) => {
                getOnState(node.n).val = toNum(on[node.n], 0);
                getLevelState(node.n).val = toInt(levels[node.n], { min: 0 });
            });
            daily.val = toNum(rawDaily, 0);
        },
    };
};

// ---- Automation --------------------------------------------------------------------------------------------------

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

// Which Ninja Knowledge upgrades the sneaking automation buys with jade, by the shared rule ("Save for it", saving %),
// each up to its stop-at.
const AutomationPart = () => {
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

    return automationPart({
        tab,
        columns: COLUMNS,
        bulk,
        total: AutomationStats(() => (jade.val === null ? [] : [[heldText(jade.val), "jade"]])),
        said: tab.waiting.over(bulk.said),
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

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    {
        id: "knowledge",
        label: "Ninja Knowledge",
        part: KnowledgePart,
        keywords: ["Upgrades", "Sneaking Upgrades", "Ninja"],
    },
    { id: "jade", label: "Jade Emporium", part: JadePart, keywords: ["Jade"] },
    { id: "charms", label: "Charms", part: CharmsPart, keywords: ["Pristine Charms"] },
    { id: "omnijade", label: "Omni Jade", part: OmniJadePart, keywords: ["Omnijade", "Bonus levels"] },
    {
        id: "automation",
        label: "Automation",
        part: AutomationPart,
        keywords: ["Autobuy", "Auto buy", "Jade", "Stop at", "Save for it", "Priority"],
    },
];

const SneakingTab = () => {
    const parts = new Map();
    const activeId = van.state(TABS[0].id);
    const busy = () => [...parts.values()].some((part) => part.busy?.());
    const own = useAccountLoad({ label: "Sneaking", busy });
    for (const tab of TABS) parts.set(tab.id, tab.part({ pending: () => pending(), reload: () => load() }));
    const automation = parts.get("automation");
    // The automation reads on its own; the page says its loading and failure with the rest.
    const loading = van.derive(() => own.loading.val || automation.loading.val);
    const error = van.derive(() => own.error.val ?? automation.error.val);
    // After a read that failed, what the tabs show may be old: their tools wait for one that works.
    const pending = () => loading.val || Boolean(error.val);
    const load = () => own.run(() => loadParts(parts));
    const onAutomation = () => activeId.val === "automation";

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container sneaking-tab",
        title: "Sneaking",
        description: "Ninja Knowledge, the Jade Emporium, charms and Omni Jade.",
        total: automation.total(onAutomation),
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy() }),
        topNotices: automation.notices(onAutomation),
        state: { loading, error },
        loadingText: "Reading sneaking",
        errorTitle: "Couldn't read sneaking",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Sneaking",
                page: "w6.sneaking",
                activeId,
                wrap: true,
                busy,
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: parts.get(tab.id).content })),
                // Each tab's own tools; the tray shows the open tab's.
                tools: toolsPerTab(
                    Object.fromEntries(
                        TABS.filter((tab) => parts.get(tab.id).tools).map((tab) => [tab.id, parts.get(tab.id).tools])
                    )
                ),
                toolsOn: (id) => Boolean(parts.get(id).tools),
                toolsLabel: (open) => parts.get(open.val).toolsLabel?.() ?? "",
            })
        ),
    });
};

export default definePage({
    id: "w6.sneaking",
    world: 6,
    system: "Sneaking",
    description: "Ninja Knowledge, the Jade Emporium, charms and Omni Jade.",
    // Each tab is found by its own name and words (tabs), and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: SneakingTab,
});
