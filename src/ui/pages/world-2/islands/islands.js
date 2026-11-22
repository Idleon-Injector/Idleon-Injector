/**
 * W2 - Islands Tab
 *
 * Native controls for the Fishing Islands fields in OptionsListAccount.
 * Island unlocks are stored as a compact token string in [169].
 *
 * The game's islands are tabs: Islands (which are unlocked), then Trash, Rando, Shimmer and Fractal with their own
 * values. The tray acts on the open tab: Unlock all and Lock all (asks) on Islands, a level for every upgrade the top
 * bar's search shows on Trash, Rando and Shimmer (asks before it lowers). Fractal has no tools.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readGgaEntries } from "../../../services/api.js";
import { SetAllNumberControl, refuseSetAll } from "../../../components/views/account/BulkActionBar.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    getOrCreateState,
    oneAtATime,
    resolveNumberInput,
    runBulkSet,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const UNLOCK_PATH = "OptionsListAccount[169]";
const BRIBE_INDEX = 165;
const ISLANDS = [
    { token: "_", label: "Trash Island" },
    { token: "a", label: "Rando Island" },
    { token: "b", label: "Crystal Island" },
    { token: "c", label: "Seasalt Island" },
    { token: "d", label: "Shimmer Island" },
    { token: "e", label: "Fractal Isle" },
];
const CANONICAL_UNLOCK_ORDER = "abcde_";

// Each island's tab: its values (`fields`) and the upgrades the tray's level acts on (`upgrades`).
const TABS = [
    { id: "islands", label: "Islands" },
    {
        id: "trash",
        label: "Trash",
        noun: "trash upgrade",
        fields: [
            { index: 161, name: "Garbage" },
            { index: 162, name: "Bottles" },
            { index: 170, name: "Docks Bottle Days" },
        ],
        upgrades: [
            { index: 163, name: "Garbage %" },
            { index: 164, name: "Bottles %" },
        ],
    },
    {
        id: "rando",
        label: "Rando",
        noun: "rando upgrade",
        fields: [],
        upgrades: [
            { index: 166, name: "Loot %" },
            { index: 167, name: "Double Boss %" },
        ],
    },
    {
        id: "shimmer",
        label: "Shimmer",
        noun: "shimmer upgrade",
        fields: [
            { index: 172, name: "Dummy DPS" },
            { index: 173, name: "Shimmers" },
        ],
        upgrades: [
            { index: 174, name: "Base STR" },
            { index: 175, name: "Base AGI" },
            { index: 176, name: "Base WIS" },
            { index: 177, name: "Base LUK" },
            { index: 178, name: "Total Damage %" },
            { index: 179, name: "Class EXP %" },
            { index: 180, name: "Skill Efficiency %" },
        ],
    },
    { id: "fractal", label: "Fractal", fields: [{ index: 184, name: "AFK hours" }], upgrades: [] },
];
const NUMBER_INDICES = TABS.flatMap((tab) => [...(tab.fields ?? []), ...(tab.upgrades ?? [])]).map(
    ({ index }) => index
);
const ALL_OPTION_INDICES = [...NUMBER_INDICES, BRIBE_INDEX, 169];

const canonicalizeUnlocks = (rawValue) => {
    const raw = String(rawValue ?? "");
    return [...CANONICAL_UNLOCK_ORDER].filter((token) => raw.includes(token)).join("");
};

const IslandUnlockRow = ({ island, unlocksState, writeUnlocks }) =>
    AccountToggleRow({
        info: span({ class: "account-row__name" }, island.label),
        // Only an unlocked island says so; the switch already shows the rest are locked.
        words: ["Unlocked", ""],
        name: island.label,
        checked: () => unlocksState.val.includes(island.token),
        write: (enabled) =>
            writeUnlocks((current) => (enabled ? `${current}${island.token}` : current.replace(island.token, ""))),
    });

const NumericRow = ({ field, valueState }) =>
    SimpleNumberRow({
        entry: {
            ...field,
            path: `OptionsListAccount[${field.index}]`,
            min: 0,
            showIndex: false,
        },
        valueState,
    });

const IslandsTab = () => {
    // The tray's tools share one status, so a bulk write runs alone.
    const bulk = useWriteStatus();
    const bulkRunning = () => bulk.status.val === "loading";
    const { loading, error, run: runLoad, reload, pending } = useAccountLoad({ label: "Islands", busy: bulkRunning });
    const valueStates = new Map();
    const unlocksState = van.state("");
    const bribeState = van.state(0);
    const setAllInput = van.state("");

    const getValueState = (index) => getOrCreateState(valueStates, index);
    // A bulk action waits for a read, and Refresh for a bulk action, so an older read can't land over a newer write.
    // After a failed read the values shown may be old, so the bulk actions wait for one that works.
    const readPending = () => loading.val || Boolean(error.val) || pending.val;

    const load = async () =>
        runLoad(async () => {
            const values = await readGgaEntries("OptionsListAccount", ALL_OPTION_INDICES.map(String));
            unlocksState.val = canonicalizeUnlocks(values["169"]);
            bribeState.val = Number(values[String(BRIBE_INDEX)] ?? 0) === 1 ? 1 : 0;

            NUMBER_INDICES.forEach((index) => {
                getValueState(index).val = Math.max(0, Math.round(Number(values[String(index)] ?? 0) || 0));
            });
        });

    // Every island lives in one string, so unlock writes save one at a time, each from the string the game holds now.
    const unlocksInTurn = oneAtATime();
    // `next`: the new string, or a function from the string the game holds to the new one.
    const writeUnlocks = (next, { batch = false } = {}) =>
        unlocksInTurn(async () => {
            const held = typeof next === "function" ? canonicalizeUnlocks(await gga(UNLOCK_PATH)) : null;
            const canonical = canonicalizeUnlocks(held === null ? next : next(held));
            try {
                if (batch) {
                    await writeManyVerified([{ path: UNLOCK_PATH, value: canonical }]);
                } else {
                    await writeVerified(UNLOCK_PATH, canonical, { write: gga });
                }
            } catch (error) {
                // The write may have landed: the switches show what the game holds now (what it held when this save
                // started, or what they showed, if that read fails too).
                unlocksState.val = await gga(UNLOCK_PATH).then(canonicalizeUnlocks, () => held ?? unlocksState.val);
                throw error;
            }
            unlocksState.val = canonical;
        });

    // Each upgrade's row, so the tray's level acts only on the upgrades the top bar's search shows.
    const rowOf = new Map();
    const numericRow = (field) => {
        const row = NumericRow({ field, valueState: getValueState(field.index) });
        rowOf.set(field.index, row);
        return row;
    };
    const tabOf = (activeId) => TABS.find((tab) => tab.id === activeId.val);
    const upgradesOn = (tab) => (tab.upgrades ?? []).filter((field) => shownBySearch(rowOf.get(field.index)));
    const islandRows = ISLANDS.map((island) => IslandUnlockRow({ island, unlocksState, writeUnlocks }));
    const islandsShown = () => ISLANDS.filter((_, i) => shownBySearch(islandRows[i]));
    const plural = (word, n) => `${word}${n === 1 ? "" : "s"}`;

    const toolsLabel = (activeId) => {
        const tab = tabOf(activeId);
        const [n, word] = tab.id === "islands" ? [islandsShown().length, "island"] : [upgradesOn(tab).length, tab.noun];
        return isSearching() ? `${n} matching ${plural(word, n)}` : `All ${n} ${plural(word, n)}`;
    };

    const tools = (activeId, ask) => {
        const onIslands = () => activeId.val === "islands";
        const setUpgrades = (fields, target) =>
            bulk
                .run(() =>
                    runBulkSet({
                        entries: fields,
                        getTargetValue: () => target,
                        getValueState: (field) => getValueState(field.index),
                        getPath: (field) => `OptionsListAccount[${field.index}]`,
                    })
                )
                // Some of it may have landed: the rows show what the game holds, read once the tools are done.
                .then((result) => {
                    if (!result.ok && !result.cancelled) reload();
                    return result;
                });
        // Lowering takes upgrade levels away, so it asks first; raising runs on one click. An empty field writes nothing.
        const setAll = () => {
            const target = resolveNumberInput(setAllInput.val, { min: 0, fallback: null });
            if (target === null) return refuseSetAll(setAllInput);
            const tab = tabOf(activeId);
            return askOrSet(upgradesOn(tab), target, tab.noun);
        };
        const askOrSet = (fields, target, noun) => {
            const loweredOf = () => fields.filter((field) => Number(getValueState(field.index).val) > target);
            const n = loweredOf().length;
            if (!n) return setUpgrades(fields, target);
            ask({
                question: `Lower ${n} ${plural(noun, n)} to ${target}?`,
                confirmLabel: n === 1 ? "Lower it" : "Lower them",
                from: setAllControl.querySelector(".account-btn"),
                lowers: loweredOf,
                again: () => askOrSet(fields, target, noun),
                onConfirm: () => setUpgrades(fields, target),
            });
            return undefined;
        };
        const setAllControl = SetAllNumberControl({
            label: "",
            placeholder: "Level",
            value: setAllInput,
            status: bulk.status,
            disabled: readPending,
            onApply: setAll,
        });

        // The level is for the upgrade tabs; Islands has its own tools.
        van.derive(() => (setAllControl.hidden = onIslands()));

        // Unlocking every island adds, so it runs on one press; locking removes, so it asks first. Both act on the
        // islands the search shows.
        const unlockTokens = (tokens, unlock) =>
            bulk.run(() =>
                writeUnlocks(
                    (current) =>
                        unlock
                            ? `${current}${tokens.join("")}`
                            : [...current].filter((token) => !tokens.includes(token)).join(""),
                    { batch: true }
                )
            );
        const lockAll = ActionButton({
            label: "Lock all",
            variant: "danger",
            status: bulk.status,
            disabled: () => readPending() || !islandsShown().some((island) => unlocksState.val.includes(island.token)),
            onClick: (e) => {
                e.preventDefault();
                const tokens = islandsShown()
                    .filter((island) => unlocksState.val.includes(island.token))
                    .map((island) => island.token);
                ask({
                    question: `Lock ${tokens.length} ${plural("island", tokens.length)}?`,
                    confirmLabel: tokens.length === 1 ? "Lock it" : "Lock them",
                    from: lockAll,
                    onConfirm: () => unlockTokens(tokens, false),
                });
            },
        });

        return [
            div(
                { class: "tabbed-list__tool-group", hidden: () => !onIslands() },
                ActionButton({
                    label: "Unlock all",
                    status: bulk.status,
                    disabled: () =>
                        readPending() || islandsShown().every((island) => unlocksState.val.includes(island.token)),
                    onClick: (e) => {
                        e.preventDefault();
                        void unlockTokens(
                            islandsShown().map((island) => island.token),
                            true
                        );
                    },
                }),
                lockAll
            ),
            setAllControl,
        ];
    };

    load();

    const tabContent = (tab) => {
        if (tab.id === "islands") return div({ class: "account-page-pane" }, ...islandRows);
        return div(
            { class: "account-page-pane" },
            ...tab.fields.map(numericRow),
            ...tab.upgrades.map(numericRow),
            // The Emporium bribe is Trash Island's.
            tab.id === "trash"
                ? AccountToggleRow({
                      info: span({ class: "account-row__name" }, "Emporium Bonus Bribe"),
                      words: ["Owned", ""],
                      name: "Emporium Bonus Bribe",
                      checked: () => bribeState.val === 1,
                      write: async (enabled) => {
                          const next = enabled ? 1 : 0;
                          await writeVerified(`OptionsListAccount[${BRIBE_INDEX}]`, next, { write: gga });
                          bribeState.val = next;
                      },
                  })
                : null
        );
    };

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Islands",
        description: "Which fishing islands are unlocked, and each island's values.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val || bulkRunning(),
        }),
        state: { loading, error },
        loadingText: "Reading islands",
        errorTitle: "Couldn't read islands",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Islands",
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: tabContent(tab) })),
                tools,
                toolsLabel,
                toolsOn: (id) => id !== "fractal",
            })
        ),
    });
};

export default definePage({
    id: "w2.islands",
    world: 2,
    system: "Islands",
    description: "Which fishing islands are unlocked, their currencies and upgrades.",
    keywords: ["Fishing Islands", "Trash", "Rando", "Shimmer", "Fractal"],
    component: IslandsTab,
});
