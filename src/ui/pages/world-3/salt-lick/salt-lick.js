/**
 * W3 - Salt Lick Tab
 *
 * Data sources:
 *   gga.SaltLick[n]        - current level of upgrade n
 *   cList.SaltLicks[n][1]  - the upgrade's bonus in the game's words
 *   cList.SaltLicks[n][4]  - max level for upgrade n
 *
 * Array length is taken from cList.SaltLicks (authoritative game table); gga.SaltLick may hold more entries.
 * One list in the game's order. Max all and Reset all sit in the tray and act on the upgrades the top bar's search
 * shows; Reset asks there first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    createIndexedStateGetter,
    createStaticRowReconciler,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const SaltLickRow = ({ upgrade, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `SaltLick[${upgrade.index}]`,
        max: upgrade.maxLevel,
        integerMode: "trunc",
        name: upgrade.name,
    });

const SaltLickTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Salt Lick", busy: () => bulk.status.val === "loading" });
    const getLevelState = createIndexedStateGetter();
    const rowList = div({ class: "account-page-pane" });
    const upgrades = van.state([]);
    const rowOf = new Map();
    const reconcileRows = createStaticRowReconciler(rowList);
    // After a read that failed, the levels shown may be old: the tools wait for one that works.
    const readPending = () => loading.val || Boolean(error.val);

    const load = async () =>
        run(async () => {
            const next = await readLevelDefinitions({
                levelsPath: "SaltLick",
                definitionsPath: "SaltLicks",
                mapEntry: ({ definition, rawLevel, index }) => ({
                    index,
                    name: bonusText(definition[1]) || `Salt Lick ${index + 1}`,
                    // The level the game holds, above the max too (the game counts it all): Max all lowers it.
                    level: Math.max(0, Math.trunc(toNum(rawLevel))),
                    maxLevel: Math.max(0, Math.trunc(toNum(definition[4]))),
                }),
            });

            reconcileRows(next.map((upgrade) => `${upgrade.index}:${upgrade.name}:${upgrade.maxLevel}`).join("|"), () =>
                next.map((upgrade) => {
                    const row = SaltLickRow({ upgrade, levelState: getLevelState(upgrade.index) });
                    rowOf.set(upgrade.index, row);
                    return row;
                })
            );
            next.forEach((upgrade) => (getLevelState(upgrade.index).val = upgrade.level));
            upgrades.val = next;
        });

    // The upgrades the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => upgrades.val.filter((upgrade) => shownBySearch(rowOf.get(upgrade.index)));
    const upgradeWord = (n) => `salt lick upgrade${n === 1 ? "" : "s"}`;

    const setLevels = async (entries, targetOf) => {
        const result = await bulk.run(async () => {
            // What each row shows before the read: a row saved while it runs keeps its save.
            const shownBefore = entries.map(({ index }) => getLevelState(index).val);
            const fresh = toIndexedArray(await gga("SaltLick"));
            await runBulkSet({
                entries,
                getTargetValue: targetOf,
                getValueState: (upgrade) => getLevelState(upgrade.index),
                getPath: (upgrade) => `SaltLick[${upgrade.index}]`,
                // Planned from the game, not the fields: a level bought there since the page read it is reset too,
                // and a row the game already holds at the target shows it.
                shouldWrite: ({ entry, index, targetValue, valueState }) => {
                    if (Number(fresh[entry.index] ?? 0) !== targetValue) return true;
                    if (valueState.val === shownBefore[index]) valueState.val = targetValue;
                    return false;
                },
            });
        });
        // Some of it may have landed: the rows show what the game holds. The tools wait for that read, so an older
        // one can't put earlier levels back over a newer write.
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
                    question: `Reset ${n} ${upgradeWord(n)} to 0?`,
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
                    return setLevels(shown(), (upgrade) => upgrade.maxLevel);
                },
            }),
            resetAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Salt Lick",
        description: "Salt Lick upgrade levels, each up to its max.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the salt lick",
        errorTitle: "Couldn't read the salt lick",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: rowList,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${upgradeWord(n)}` : `All ${n} ${upgradeWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w3.saltlick",
    world: 3,
    system: "Salt Lick",
    description: "Salt Lick upgrade levels.",
    keywords: ["Saltlick", "Upgrades"],
    component: SaltLickTab,
});
