/**
 * W4 - Breeding › Upgrades
 *
 * Data sources:
 *   gga.Breeding[2][n]               - breeding upgrade n's level; PetUpgMaxLV(0, n) is its max
 *   gga.Breeding[3][8]               - dead cells, what the upgrades cost
 *   cList.PetUpgradeINFO[n][0, 10]   - the upgrade's name and its bonus in the game's words
 *
 * The game's Upgrades screen as one list: dead cells, then each upgrade, the bonus first. Max all and Reset all sit in
 * the tray and act on the upgrades the top bar's search shows; Reset asks there first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList, readComputedMany } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    runBulkSet,
    toInt,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const UPGRADES_PATH = "Breeding[2]";
const DEAD_CELLS_PATH = "Breeding[3][8]";

// "Gene_Splicing_}_Helps_unlock_next_Mob_type": the upgrade's name is what comes before the game's number mark.
const upgradeName = (raw, index) => cleanName(String(raw ?? "").split("}")[0], `Upgrade ${index}`);

// The game's bonus line. It marks the number with "}" ("+}_Egg_Max"), where most lists use "{" ("}x" stays: a
// multiplier). The first slot is the game's filler, whose level adds 1% breeding EXP (its own text says so).
const upgradeBonus = (raw, index) =>
    index === 0 ? "Breeding EXP %" : bonusText(raw === "_" ? "" : String(raw ?? "").replace(/}(?!x)/g, "{"));

const readUpgrades = async () => {
    const [rawLevels, rawDefs] = await Promise.all([gga(UPGRADES_PATH), readCList("PetUpgradeINFO")]);
    const levels = toIndexedArray(rawLevels ?? []);
    const upgrades = toIndexedArray(rawDefs ?? [])
        .map((raw, index) => {
            const def = toIndexedArray(raw ?? []);
            if (!String(def[0] ?? "").trim()) return null;
            return {
                index,
                name: upgradeName(def[0], index),
                bonus: upgradeBonus(def[10], index),
                level: toInt(levels[index], { min: 0 }),
            };
        })
        .filter(Boolean);
    const maximums = await readComputedMany(
        "breeding",
        "PetUpgMaxLV",
        upgrades.map(({ index }) => [0, index])
    );
    return upgrades.map((upgrade, i) => {
        if (!maximums[i]?.ok) throw new Error(`Couldn't read the max level of ${upgrade.name}. Refresh.`);
        return { ...upgrade, max: toInt(maximums[i].value, { min: 0 }) };
    });
};

const UpgradesTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({
        label: "Breeding upgrades",
        busy: () => bulk.status.val === "loading",
    });
    const getLevelState = createIndexedStateGetter(0);
    const deadCellsState = van.state(0);
    const upgrades = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    // After a read that failed, the levels shown may be old: the tools wait for one that works.
    const readPending = () => loading.val || Boolean(error.val);
    const deadCellsRow = SimpleNumberRow({
        entry: { name: "Dead cells", path: DEAD_CELLS_PATH, showIndex: false },
        valueState: deadCellsState,
    });

    const load = async () =>
        run(async () => {
            const [next, deadCells] = await Promise.all([readUpgrades(), gga(DEAD_CELLS_PATH)]);
            reconcileRows(next.map((upgrade) => `${upgrade.index}:${upgrade.name}:${upgrade.max}`).join("|"), () => [
                deadCellsRow,
                ...next.map((upgrade) => {
                    const row = ClampedLevelRow({
                        valueState: getLevelState(upgrade.index),
                        writePath: `${UPGRADES_PATH}[${upgrade.index}]`,
                        max: upgrade.max,
                        integerMode: "trunc",
                        name: upgrade.name,
                        renderInfo: () => RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
                    });
                    rowOf.set(upgrade.index, row);
                    return row;
                }),
            ]);
            // The level the game holds, above the max too (the game counts it all): Max all lowers it.
            next.forEach((upgrade) => (getLevelState(upgrade.index).val = upgrade.level));
            deadCellsState.val = toInt(deadCells, { min: 0 });
            upgrades.val = next;
        });

    // The upgrades the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => upgrades.val.filter((upgrade) => shownBySearch(rowOf.get(upgrade.index)));
    const upgradeWord = (n) => `upgrade${n === 1 ? "" : "s"}`;

    const setLevels = async (entries, targetOf) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: targetOf,
                getValueState: (upgrade) => getLevelState(upgrade.index),
                getPath: (upgrade) => `${UPGRADES_PATH}[${upgrade.index}]`,
            })
        );
        // Some of it may have landed: the rows show what the game holds.
        if (!result.ok && !result.cancelled) await load();
    };

    // Max all only raises (and brings a level above its max down to it), so it runs on one press; Reset takes levels
    // away, so it asks first.
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
                    return setLevels(shown(), (upgrade) => upgrade.max);
                },
            }),
            resetAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Upgrades",
        description: "Breeding upgrades and the dead cells that buy them.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the breeding upgrades",
        errorTitle: "Couldn't read the breeding upgrades",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: listNode,
                tools,
                // Set all acts on every line, the dead cells too, so the tray counts lines.
                setAll: {
                    word: (n) => (n === 1 ? "line" : "lines"),
                    bulk,
                    disabled: readPending,
                    onDone: (result) => !result.ok && !result.cancelled && load(),
                },
            })
        ),
    });
};

export default definePage({
    id: "w4.breeding.upgrades",
    world: 4,
    system: "Breeding",
    tab: "Upgrades",
    description: "Breeding upgrade levels and dead cells.",
    keywords: ["Pet Upgrades", "Dead cells"],
    component: UpgradesTab,
});
