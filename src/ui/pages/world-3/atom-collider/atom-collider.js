/**
 * W3 - Atom Collider Tab
 *
 * Data sources:
 *   gga.Atoms[b]          - current level of atom b
 *   cList.AtomInfo[b][0]  - "Hydrogen_-_Stamp_Decreaser": the atom, then its bonus
 *
 * Max level is computed via:
 *   readComputedMany("atomCollider", "AtomMaxLv", [[b, 0], ...])
 *
 * One list in the game's order, the bonus first. Max all and Reset all sit in the tray and act on the atoms the top
 * bar's search shows; Reset asks there first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readComputedMany } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

// "Hydrogen_-_Stamp_Decreaser": the atom's name, then what it does.
const atomTitles = (raw, index) => {
    const [name, bonus] = cleanName(raw, `Atom ${index + 1}`).split(/\s+-\s+/);
    return { name, bonus: bonus ?? "" };
};

const AtomRow = ({ index, atom, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `Atoms[${index}]`,
        max: atom.maxLevel,
        renderInfo: () => RowTitles({ bonus: atom.bonus, name: atom.name }),
    });

const AtomColliderTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({
        label: "Atom Collider",
        busy: () => bulk.status.val === "loading",
    });
    const getLevelState = createIndexedStateGetter();
    const rowList = div({ class: "account-page-pane" });
    const atoms = van.state([]);
    const rowOf = new Map();
    const reconcileRows = createStaticRowReconciler(rowList);
    // After a read that failed, the levels shown may be old: the tools wait for one that works.
    const readPending = () => loading.val || Boolean(error.val);

    const load = async () =>
        run(async () => {
            const atomRows = await readLevelDefinitions({
                levelsPath: "Atoms",
                definitionsPath: "AtomInfo",
                mapEntry: ({ definition, rawLevel, index }) => ({
                    ...atomTitles(definition[0], index),
                    level: toNum(rawLevel),
                }),
            });
            const computedResults = await readComputedMany(
                "atomCollider",
                "AtomMaxLv",
                atomRows.map((_, i) => [i, 0])
            );

            const next = atomRows.map((atom, i) => {
                const item = computedResults?.[i];
                if (!item?.ok) {
                    throw new Error(item?.error || `Failed to read AtomMaxLv for atom index ${i}`);
                }
                return { ...atom, index: i, maxLevel: toNum(item.value) };
            });

            reconcileRows(next.map((atom) => `${atom.name}:${atom.bonus}:${atom.maxLevel}`).join("|"), () =>
                next.map((atom) => {
                    const row = AtomRow({ index: atom.index, atom, levelState: getLevelState(atom.index) });
                    rowOf.set(atom.index, row);
                    return row;
                })
            );
            next.forEach((atom) => (getLevelState(atom.index).val = atom.level));
            atoms.val = next;
        });

    // The atoms the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => atoms.val.filter((atom) => shownBySearch(rowOf.get(atom.index)));
    const atomWord = (n) => `atom${n === 1 ? "" : "s"}`;

    const setLevels = async (entries, targetOf) => {
        const result = await bulk.run(async () => {
            // What each row shows before the read: a row saved while it runs keeps its save.
            const shownBefore = entries.map(({ index }) => getLevelState(index).val);
            const fresh = toIndexedArray(await gga("Atoms"));
            await runBulkSet({
                entries,
                getTargetValue: targetOf,
                getValueState: (atom) => getLevelState(atom.index),
                getPath: (atom) => `Atoms[${atom.index}]`,
                // Planned from the game, not the fields: a level bought there since the page read it is reset too,
                // and a row the game already holds at the target shows it.
                shouldWrite: ({ entry, index, targetValue, valueState }) => {
                    if (Number(fresh[entry.index] ?? 0) !== targetValue) return true;
                    if (valueState.val === shownBefore[index]) valueState.val = targetValue;
                    return false;
                },
            });
        });
        // Some of it may have landed: the rows show what the game holds.
        if (!result.ok && !result.cancelled) await load();
    };

    // Max all only raises, so it runs on one press; Reset takes levels away, so it asks first.
    const tools = (_activeId, ask) => {
        const resetAll = ActionButton({
            label: "Reset all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().length,
            onClick: (e) => {
                e.preventDefault();
                const entries = shown();
                const n = entries.length;
                ask({
                    question: `Reset ${n} ${atomWord(n)} to 0?`,
                    confirmLabel: n === 1 ? "Reset it" : "Reset them",
                    from: resetAll,
                    onConfirm: () => setLevels(entries, () => 0),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Max all",
                status: bulk.status,
                disabled: () => readPending() || !shown().length,
                onClick: (e) => {
                    e.preventDefault();
                    return setLevels(shown(), (atom) => atom.maxLevel);
                },
            }),
            resetAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Atom Collider",
        description: "Atom levels, each up to its max.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the atom collider",
        errorTitle: "Couldn't read the atom collider",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: rowList,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${atomWord(n)}` : `All ${n} ${atomWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w3.atomcollider",
    world: 3,
    system: "Atom Collider",
    description: "Atom levels in the Atom Collider.",
    keywords: ["Atoms", "Collider"],
    component: AtomColliderTab,
});
