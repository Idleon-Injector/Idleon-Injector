/**
 * Upgrade Vault Tab
 *
 * Reads/writes gga.UpgVault[index] for all vault upgrades.
 *
 * Data sources:
 *   cList.UpgradeVault[i][0] = name (underscores + 製 stripped)
 *   cList.UpgradeVault[i][4] = base max level (soft cap)
 *   VaultUpgMaxLV via readComputedMany("summoning", "VaultUpgMaxLV", [[i, 0], ...])
 *                 = real max level (includes applicable trade, bundle, research, and event bonuses)
 *   gga.UpgVault[i]                = current level
 *
 * Write: gga.UpgVault[XX] = YY
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputedMany } from "../../../services/api.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";
import { WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// realMaxState follows every load; the row itself stays, so its save and undo feedback stays with it.
const VaultRow = ({ index, name, baseMax, realMaxState, levelState }) => {
    const maxLabel = () =>
        realMaxState.val !== baseMax ? `${realMaxState.val} (base ${baseMax})` : String(realMaxState.val);

    return ClampedLevelRow({
        valueState: levelState,
        writePath: `UpgVault[${index}]`,
        max: Infinity,
        indexLabel: `#${index}`,
        name,
        renderBadge: (currentValue) => `LV ${currentValue ?? 0} / ${realMaxState.val}`,
        maxAction: {
            value: () => realMaxState.val,
            tooltip: () => `Set to max level (${maxLabel()})`,
        },
    });
};

const UpgradeVaultTab = () => {
    const data = van.state(null);
    const { loading, error, run } = useAccountLoad({ label: "Upgrade Vault" });
    const { status: maxAllStatus, run: runMaxAll } = useWriteStatus();
    // Why the last Max all failed, until the next one.
    const maxAllFailure = van.state("");
    const getLevelState = createIndexedStateGetter();
    const getRealMaxState = createIndexedStateGetter();
    const listNode = div({ class: "account-list" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const upgradeRows = await readLevelDefinitions({
                levelsPath: "UpgVault",
                definitionsPath: "UpgradeVault",
                mapEntry: ({ definition, rawLevel, index }) => {
                    const name = cleanName(definition[0], "", { stripMarker: true });
                    const baseMax = toNum(definition[4]);
                    if (!name || baseMax <= 0) return null;
                    return { index, name, baseMax, level: toNum(rawLevel) };
                },
            });

            const argSets = upgradeRows.map((upgrade) => [upgrade.index, 0]);
            const computedResults = await readComputedMany("summoning", "VaultUpgMaxLV", argSets);

            const realMaxes = computedResults.map((item, i) => {
                if (!item?.ok) {
                    throw new Error(`VaultUpgMaxLV failed for upgrade ${upgradeRows[i].index}`);
                }
                const value = toNum(item.value);
                return value > 0 ? value : 0;
            });

            const upgrades = upgradeRows.map((upgrade, i) => ({
                index: upgrade.index,
                name: upgrade.name,
                baseMax: upgrade.baseMax,
                level: upgrade.level,
                realMax: realMaxes[i],
            }));

            upgrades.forEach((upgrade) => {
                getLevelState(upgrade.index).val = upgrade.level;
                getRealMaxState(upgrade.index).val = upgrade.realMax;
            });

            data.val = { upgrades };
            reconcileRows(upgrades.map(({ index, name, baseMax }) => `${index}:${name}:${baseMax}`).join("|"), () =>
                upgrades.map(({ index, name, baseMax }) =>
                    VaultRow({
                        index,
                        name,
                        baseMax,
                        realMaxState: getRealMaxState(index),
                        levelState: getLevelState(index),
                    })
                )
            );
        });

    const doMaxAll = async () => {
        if (loading.val || error.val || !data.val?.upgrades.length) return;
        maxAllFailure.val = "";
        const outcome = await runMaxAll(async () => {
            await runBulkSet({
                entries: data.val.upgrades,
                getTargetValue: (upgrade) => upgrade.realMax,
                getValueState: (upgrade) => getLevelState(upgrade.index),
                getPath: (upgrade) => `UpgVault[${upgrade.index}]`,
            });
        });
        if (!outcome.error) return;
        maxAllFailure.val = saveFailureReason(outcome.error);
        await load(); // some levels may have saved
    };

    load();

    return PersistentAccountListPage({
        title: "UPGRADE VAULT",
        description:
            "Set levels for all vault upgrades. Real max includes applicable trade, bundle, research, and event bonuses.",
        wrapActions: false,
        actions: BulkActionBar({
            leading: span({ class: "account-write-feedback", role: "status" }, () => {
                if (maxAllStatus.val === "loading") return "Saving all vault upgrades";
                if (maxAllStatus.val === "success") return "All vault upgrades saved";
                if (maxAllFailure.val) return `Failed to save all vault upgrades: ${maxAllFailure.val}`;
                return "";
            }),
            actions: [
                {
                    label: "Max all",
                    status: maxAllStatus,
                    disabled: () => loading.val || Boolean(error.val) || !data.val?.upgrades.length,
                    tooltip: "Set all vault upgrades to their real max levels",
                    onClick: doMaxAll,
                },
            ],
            refresh: {
                onClick: load,
                tooltip: "Re-read vault levels from game memory",
                disabled: () => maxAllStatus.val === "loading",
            },
        }),
        topNotices: WarningBanner(
            " Max level is sourced from the game's VaultUpgMaxLV formula. " +
                "Any level from 0 up saves; no hard upper limit is enforced."
        ),
        state: { loading, error },
        body: listNode,
    });
};

export default definePage({
    id: "account.upgradevault",
    world: "account",
    system: "Upgrade Vault",
    description: "Upgrade Vault upgrade levels, up to their real max.",
    component: UpgradeVaultTab,
});
