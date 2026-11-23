/**
 * W6 - Sneaking
 *
 * One page, the game's sneaking screens as its tabs: Ninja Knowledge (with Omni Jade on each upgrade that can have it),
 * Jade Emporium and Charms. One read of the game fills every tab. The sneaking automation is its own page
 * in the Automation section (automation/sneaking).
 *
 * Data sources:
 *   gga.Ninja[103][n]           - Ninja Knowledge upgrade n's level (cList.NinjaUpg: [4] name, [6] bonus; row 9 is the
 *                                 game's placeholder)
 *   gga.Ninja[102][9]           - the Jade Emporium upgrades bought, one letter each (gga.Number2Letter[n]); the
 *                                 emporium shows them in the order cList.NinjaInfo[24] lists (cList.JadeUpg: [0] name;
 *                                 UNDER_CONSTRUCTION rows are still to come)
 *   gga.Ninja[107][c]           - Pristine Charm c unlocked (1) or not; its record is gga.CustomMaps.h.NjEQ.h.NjTrP<c>:
 *                                 [2] name, [5] bonus
 *   gga.Menagerie[6][n], [7][n] - Omni Jade on Ninja Knowledge upgrade n (the first 17), and the bonus levels it earned
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList, loadParts, toolsPerTab } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    oneAtATime,
    runBulkSet,
    toInt,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";

const { div, span } = van.tags;

const plural = (n, word) => `${word}${n === 1 ? "" : "s"}`;
// The game's placeholder rows ("Name", "UNDER_CONSTRUCTION").
const isPlaceholder = (raw) => !raw || raw === "Name" || raw === "UNDER_CONSTRUCTION";

// ---- Ninja Knowledge ---------------------------------------------------------------------------------------------

const KNOWLEDGE_PATH = "Ninja[103]";
// Omni Jade goes on the first 17 upgrades: each one with it on gets bonus levels every day, kept when it comes off.
const OMNI_COUNT = 17;
const KNOWLEDGE_FIELDS = [
    { key: "level", label: "Level", path: (n) => `${KNOWLEDGE_PATH}[${n}]` },
    { key: "omni", label: "Omni Jade levels", path: (n) => `Menagerie[7][${n}]`, quiet: true },
];

const KnowledgePart = () => {
    const states = new Map();
    const stateOf = (n) => {
        if (!states.has(n)) states.set(n, { level: van.state(0), omni: van.state(0), on: van.state(0) });
        return states.get(n);
    };
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    // Omni Jade on or off with one press, saved at once; lavender while on. A failure says why before the button.
    const OmniButton = (upgrade) => {
        const { status, run } = useWriteStatus();
        const failure = van.state("");
        const on = stateOf(upgrade.n).on;
        return span(
            { class: "row-toggle" },
            span({ class: "row-toggle__failure", role: "status" }, () => failure.val),
            ActionButton({
                label: "Omni Jade",
                status,
                className: "row-toggle__button",
                keepEnabled: true,
                buttonProps: { "aria-pressed": () => String(on.val >= 1), "aria-label": `${upgrade.name} omni jade` },
                onClick: () => {
                    const next = on.val >= 1 ? 0 : 1;
                    failure.val = "";
                    return run(
                        async () => {
                            await writeVerified(`Menagerie[6][${upgrade.n}]`, next);
                            on.val = next;
                        },
                        { onError: (error) => (failure.val = saveFailureReason(error)) }
                    );
                },
            })
        );
    };

    const UpgradeRow = (upgrade) => {
        const hasOmni = upgrade.n < OMNI_COUNT;
        const fields = KNOWLEDGE_FIELDS.map((field) =>
            field.key === "omni" && !hasOmni
                ? { key: field.key, blank: true }
                : { ...field, valueState: stateOf(upgrade.n)[field.key], paths: [field.path(upgrade.n)] }
        );
        return ValueTableRow({
            name: upgrade.name,
            info: RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
            fields,
            read: async () => {
                const live = fields.filter((field) => !field.blank);
                const values = await Promise.all(live.map((field) => gga(field.paths[0])));
                return Object.fromEntries(live.map((field, i) => [field.key, toInt(values[i], { min: 0 })]));
            },
            // A line without Omni Jade keeps the button's column empty.
            action: hasOmni ? OmniButton(upgrade) : span(),
            // Set all sets each upgrade's level; its Omni Jade levels stay its own.
            setAll: "level",
        });
    };

    return {
        content: div(
            { class: "sneaking-knowledge" },
            // The last column is the Omni Jade button's.
            ValueTableHead({ name: "Upgrade", columns: [...KNOWLEDGE_FIELDS.map((field) => field.label), ""] }),
            listNode
        ),
        load: async () => {
            const [rawLevels, rawOn, rawOmni, rawInfo] = await Promise.all([
                gga(KNOWLEDGE_PATH),
                gga("Menagerie[6]"),
                gga("Menagerie[7]"),
                readCList("NinjaUpg"),
            ]);
            const levels = toIndexedArray(rawLevels ?? []);
            const on = toIndexedArray(rawOn ?? []);
            const omni = toIndexedArray(rawOmni ?? []);
            const upgrades = toIndexedArray(rawInfo ?? [])
                .map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    return { n, raw: String(def[4] ?? "").trim(), name: cleanName(def[4]), bonus: bonusText(def[6]) };
                })
                .filter((upgrade) => !isPlaceholder(upgrade.raw));
            reconcileRows(upgrades.map((upgrade) => upgrade.raw).join("|"), () => upgrades.map(UpgradeRow));
            upgrades.forEach((upgrade) => {
                const state = stateOf(upgrade.n);
                state.level.val = toInt(levels[upgrade.n], { min: 0 });
                state.omni.val = toInt(omni[upgrade.n], { min: 0 });
                state.on.val = toNum(on[upgrade.n], 0) >= 1 ? 1 : 0;
            });
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

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    {
        id: "knowledge",
        label: "Ninja Knowledge",
        part: KnowledgePart,
        keywords: ["Upgrades", "Sneaking Upgrades", "Ninja", "Omni Jade", "Omnijade", "Bonus levels"],
    },
    { id: "jade", label: "Jade Emporium", part: JadePart, keywords: ["Jade"] },
    { id: "charms", label: "Charms", part: CharmsPart, keywords: ["Pristine Charms"] },
];

const SneakingTab = () => {
    const parts = new Map();
    const busy = () => [...parts.values()].some((part) => part.busy?.());
    const { loading, error, run } = useAccountLoad({ label: "Sneaking", busy });
    // After a read that failed, what the tabs show may be old: their tools wait for one that works.
    const pending = () => loading.val || Boolean(error.val);
    const load = () => run(() => loadParts(parts));
    for (const tab of TABS) parts.set(tab.id, tab.part({ pending, reload: load }));

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container sneaking-tab",
        title: "Sneaking",
        automation: { page: "automation.sneaking" },
        description: "Ninja Knowledge, the Jade Emporium and charms.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy() }),
        state: { loading, error },
        loadingText: "Reading sneaking",
        errorTitle: "Couldn't read sneaking",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Sneaking",
                page: "w6.sneaking",
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
                setAll: { word: (n, tab) => `${tab === "knowledge" ? "upgrade" : "line"}${n === 1 ? "" : "s"}` },
            })
        ),
    });
};

export default definePage({
    id: "w6.sneaking",
    world: 6,
    system: "Sneaking",
    description: "Ninja Knowledge, the Jade Emporium and charms.",
    // Each tab is found by its own name and words (tabs), and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: SneakingTab,
});
