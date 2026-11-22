/**
 * W1 - Forge Tab
 *
 * FurnaceLevels layout (indices 0-5 in the game's order, index 6 = XP progress, ignored):
 *     [0] New Forge Slot      - max 16
 *     [1] Ore Capacity Boost  - max 50
 *     [2] Forge Speed         - max 90
 *     [3] Forge EXP Gain      - max 85
 *     [4] Bar Bonanza         - max 75
 *     [5] Puff Puff Go        - max 60
 * One list like every page (the game's Page 1 and Page 2 are only its screens); Max all sits in the tray.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { runBulkSet, useWriteStatus } from "../../../components/views/account/accountShared.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";

const { div } = van.tags;

const FORGE_UPGRADES = [
    { label: "New Forge Slot", index: 0, max: 16 },
    { label: "Ore Capacity Boost", index: 1, max: 50 },
    { label: "Forge Speed", index: 2, max: 90 },
    { label: "Forge EXP Gain", index: 3, max: 85 },
    { label: "Bar Bonanza", index: 4, max: 75 },
    { label: "Puff Puff Go", index: 5, max: 60 },
];

const ForgeRow = ({ upgrade, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `FurnaceLevels[${upgrade.index}]`,
        max: upgrade.max,
        name: upgrade.label,
        maxAction: true,
    });

const ForgeTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Forge" });
    const { status: maxAllStatus, run: runMaxAll } = useWriteStatus();
    const levelStates = Array.from({ length: 6 }, () => van.state(0));

    const load = async () =>
        run(async () => {
            const raw = await gga("FurnaceLevels");
            const levels = toIndexedArray(raw);
            for (let i = 0; i < levelStates.length; i++) {
                levelStates[i].val = Number(levels[i] ?? 0);
            }
        });

    // The upgrades Max all acts on: every one, or the ones the top bar's search shows.
    const rowOf = new Map();
    const shown = () => FORGE_UPGRADES.filter((upgrade) => shownBySearch(rowOf.get(upgrade.index)));
    const upgradeWord = (n) => `forge upgrade${n === 1 ? "" : "s"}`;

    // Max only raises, so it runs on one press.
    const doMaxAll = async () => {
        await runMaxAll(async () => {
            await runBulkSet({
                entries: shown(),
                getTargetValue: (upgrade) => upgrade.max,
                getValueState: (upgrade) => levelStates[upgrade.index],
                getPath: (upgrade) => `FurnaceLevels[${upgrade.index}]`,
            });
        });
    };

    load();

    const rows = FORGE_UPGRADES.map((upgrade) => {
        const row = ForgeRow({ upgrade, levelState: levelStates[upgrade.index] });
        rowOf.set(upgrade.index, row);
        return row;
    });
    const allMaxed = () => shown().every((upgrade) => levelStates[upgrade.index].val >= upgrade.max);

    const body = div(
        { class: "account-list account-list--tabbed" },
        ListPanel({
            body: rows,
            tools: () =>
                div(
                    { class: "tabbed-list__tool-group" },
                    ActionButton({
                        label: "Max all",
                        status: maxAllStatus,
                        disabled: () => !shown().length || allMaxed(),
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
    );
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Forge",
        description: "Forge upgrade levels, each up to its cap.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the forge",
        errorTitle: "Couldn't read the forge",
        initialWrapperClass: "account-list",
        body,
    });
};

export default definePage({
    id: "w1.forge",
    world: 1,
    system: "Forge",
    description: "Forge upgrade levels.",
    keywords: ["Furnace", "Upgrades"],
    component: ForgeTab,
});
