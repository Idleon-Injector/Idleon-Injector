/**
 * W3 - Salt Lick Tab
 *
 * Data sources:
 *   gga.SaltLick[n]                   - current level of upgrade n
 *   cList.SaltLicks[n][1] - upgrade name
 *   cList.SaltLicks[n][4] - max level for upgrade n
 *
 * Array length is taken from cList.SaltLicks (authoritative game table).
 * gga.SaltLick may contain more entries than there are actual upgrades - it is
 * implicitly trimmed because load() only iterates over defs.length entries.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    cleanNameEffect,
    createIndexedStateGetter,
    createStaticRowReconciler,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const toLevelInt = (value, maxLevel) => {
    const n = Math.trunc(toNum(value));
    const cap = Math.max(0, Math.trunc(toNum(maxLevel)));
    return Math.max(0, Math.min(cap, n));
};

const SaltLickRow = ({ index, name, maxLevel, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `SaltLick[${index}]`,
        max: maxLevel,
        integerMode: "trunc",
        indexLabel: `#${index + 1}`,
        name,
    });

const SaltLickTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Salt Lick" });
    const { status: bulkStatus, run: runBulk } = useWriteStatus();
    const getLevelState = createIndexedStateGetter();
    const rowList = div({ class: "account-list" });
    let upgradesMeta = [];
    const reconcileRows = createStaticRowReconciler(rowList);

    const doSetAll = async (targetLevel) => {
        if (!upgradesMeta.length) return;
        const result = await runBulk(async () => {
            await runBulkSet({
                entries: upgradesMeta,
                getTargetValue: (upgrade) =>
                    toLevelInt(targetLevel === null ? upgrade.maxLevel : targetLevel, upgrade.maxLevel),
                getValueState: (_, index) => getLevelState(index),
                getPath: (_, index) => `SaltLick[${index}]`,
            });
        });
        // Some of it may have landed: the rows show what the game holds. The bulk buttons wait for that read, so an
        // older one can't put earlier levels back over a newer write.
        if (!result.ok && !result.cancelled) await load();
    };

    const load = async () =>
        run(async () => {
            const upgrades = await readLevelDefinitions({
                levelsPath: "SaltLick",
                definitionsPath: "SaltLicks",
                mapEntry: ({ definition, rawLevel, index }) => {
                    const maxLevel = Math.max(0, Math.trunc(toNum(definition[4])));
                    return {
                        name: cleanNameEffect(definition[1], `Salt Lick ${index + 1}`),
                        // The level the game holds, above the max too (the game counts it all): Max all lowers it.
                        level: Math.max(0, Math.trunc(toNum(rawLevel))),
                        maxLevel,
                    };
                },
            });

            reconcileRows(
                upgrades.map((upgrade, index) => `${index}:${upgrade.name}:${upgrade.maxLevel}`).join("|"),
                () =>
                    upgrades.map((upgrade, index) =>
                        SaltLickRow({
                            index,
                            name: upgrade.name,
                            maxLevel: upgrade.maxLevel,
                            levelState: getLevelState(index),
                        })
                    )
            );

            upgrades.forEach((upgrade, i) => {
                getLevelState(i).val = upgrade.level;
            });

            upgradesMeta = upgrades;
        });

    load();

    return PersistentAccountListPage({
        title: "SALT LICK",
        description: "Set Salt Lick upgrade levels.",
        wrapActions: false,
        actions: BulkActionBar({
            actions: [
                {
                    label: "Max all",
                    status: bulkStatus,
                    disabled: () => loading.val,
                    tooltip: "Set every Salt Lick upgrade to its max level",
                    onClick: () => doSetAll(null),
                },
                {
                    label: "Reset all",
                    variant: "danger",
                    status: bulkStatus,
                    disabled: () => loading.val,
                    tooltip: "Reset every Salt Lick upgrade to 0",
                    confirm: "reset every Salt Lick upgrade to 0.",
                    onClick: () => doSetAll(0),
                },
            ],
            refresh: {
                onClick: load,
                disabled: () => loading.val || bulkStatus.val === "loading",
            },
        }),
        state: { loading, error },
        loadingText: "READING SALT LICK",
        errorTitle: "SALT LICK READ FAILED",
        initialWrapperClass: "account-list",
        body: rowList,
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
