/**
 * Account - Upgrade Vault
 *
 * Reads/writes gga.UpgVault[index] for all vault upgrades.
 *
 * Data sources:
 *   cList.UpgradeVault[i][0] = name (underscores + 製 stripped)
 *   cList.UpgradeVault[i][4] = base max level (soft cap)
 *   cList.UpgradeVault[i][9] = the game's line for the upgrade (its bonus)
 *   VaultUpgMaxLV via readComputedMany("summoning", "VaultUpgMaxLV", [[i, 0], ...])
 *                 = real max level (includes applicable trade, bundle, research, and event bonuses)
 *   gga.UpgVault[i]                = current level
 *
 * One list in the game's order, the bonus first. A level is typed up to its real max (#28: the max was only a note
 * before); Max all sits in the tray and acts on the upgrades the top bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputedMany } from "../../../services/api.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

// The real max follows every load; the row itself stays, so its save and undo feedback stays with it.
const VaultRow = ({ upgrade, realMaxState, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `UpgVault[${upgrade.index}]`,
        max: () => realMaxState.val,
        renderInfo: () => RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
        maxAction: true,
    });

const UpgradeVaultTab = () => {
    const upgrades = van.state([]);
    const { loading, error, run } = useAccountLoad({ label: "Upgrade Vault" });
    const { status: maxAllStatus, run: runMaxAll } = useWriteStatus();
    const getLevelState = createIndexedStateGetter();
    const getRealMaxState = createIndexedStateGetter();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const rowOf = new Map();

    const load = async () =>
        run(async () => {
            const upgradeRows = await readLevelDefinitions({
                levelsPath: "UpgVault",
                definitionsPath: "UpgradeVault",
                mapEntry: ({ definition, rawLevel, index }) => {
                    const name = cleanName(definition[0], "", { stripMarker: true });
                    const baseMax = toNum(definition[4]);
                    if (!name || baseMax <= 0) return null;
                    return { index, name, bonus: bonusText(definition[9]), level: toNum(rawLevel) };
                },
            });

            const computedResults = await readComputedMany(
                "summoning",
                "VaultUpgMaxLV",
                upgradeRows.map((upgrade) => [upgrade.index, 0])
            );
            const realMaxes = computedResults.map((item, i) => {
                if (!item?.ok) throw new Error(`VaultUpgMaxLV failed for upgrade ${upgradeRows[i].index}`);
                return Math.max(0, toNum(item.value));
            });

            upgradeRows.forEach((upgrade, i) => {
                upgrade.realMax = realMaxes[i];
                getLevelState(upgrade.index).val = upgrade.level;
                getRealMaxState(upgrade.index).val = upgrade.realMax;
            });
            upgrades.val = upgradeRows;
            reconcileRows(upgradeRows.map(({ index, name }) => `${index}:${name}`).join("|"), () =>
                upgradeRows.map((upgrade) => {
                    const row = VaultRow({
                        upgrade,
                        realMaxState: getRealMaxState(upgrade.index),
                        levelState: getLevelState(upgrade.index),
                    });
                    rowOf.set(upgrade.index, row);
                    return row;
                })
            );
        });

    // The upgrades Max all acts on: every one, or the ones the top bar's search shows.
    const shown = () => upgrades.val.filter((upgrade) => shownBySearch(rowOf.get(upgrade.index)));
    const atMax = (upgrade) => getLevelState(upgrade.index).val === getRealMaxState(upgrade.index).val;
    const upgradeWord = (n) => `vault upgrade${n === 1 ? "" : "s"}`;

    // Max all only raises (and brings a level above its max down to it), so it runs on one press.
    const doMaxAll = () =>
        runMaxAll(async () => {
            await runBulkSet({
                entries: shown(),
                getTargetValue: (upgrade) => getRealMaxState(upgrade.index).val,
                getValueState: (upgrade) => getLevelState(upgrade.index),
                getPath: (upgrade) => `UpgVault[${upgrade.index}]`,
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Upgrade Vault",
        description: "Vault upgrade levels, each up to its real max with every bonus counted.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || maxAllStatus.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the vault",
        errorTitle: "Couldn't read the vault",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                empty: () => (loading.val || upgrades.val.length ? null : "No vault upgrades found"),
                tools: () =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Max all",
                            status: maxAllStatus,
                            disabled: () => !shown().length || shown().every(atMax),
                            onClick: (e) => {
                                e.preventDefault();
                                void doMaxAll();
                            },
                        })
                    ),
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${upgradeWord(n)}` : `All ${n} ${upgradeWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "account.upgradevault",
    world: "account",
    system: "Upgrade Vault",
    description: "Upgrade Vault upgrade levels, up to their real max.",
    keywords: ["Vault"],
    component: UpgradeVaultTab,
});
