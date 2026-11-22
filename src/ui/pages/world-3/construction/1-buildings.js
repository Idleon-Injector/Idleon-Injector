/**
 * W3 — Construction: Buildings Tab
 *
 * Data sources:
 *   gga.TowerInfo[i]       — current level of building i
 *   gga.TowerInfo[i + 27]  — pending/target level of building i
 *   cList.TowerInfo[i][0]  — building name
 *   cList.TowerInfo[i][8]  — base max level
 *
 * Real max level is the base cap plus the game's Workbench helper
 * (read through the injected ActorEvents bridge, not reimplemented in the UI).
 *
 * When setting a building level, write both TowerInfo[i] and TowerInfo[i + 27].
 *
 * One list in the game's order; Max all sits in the tray and acts on the buildings the top bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { readComputedMany } from "../../../services/api.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    cleanName,
    createStaticRowReconciler,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const BUILDING_COUNT = 27;

const BuildingRow = ({ index, name, maxLevel, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        max: maxLevel,
        write: async (nextLevel) => {
            // Both in one call to the game, so a dropped connection can't leave the level and its pending copy apart.
            // The game still writes them one by one: if it refuses one, the other stays written (History lists it,
            // and the row says why). ponytail: an all-or-nothing write needs the game's writePaths to put it back.
            await writeManyVerified([
                { path: `TowerInfo[${index}]`, value: nextLevel },
                { path: `TowerInfo[${index + BUILDING_COUNT}]`, value: nextLevel },
            ]);
            return nextLevel;
        },
        name,
        maxAction: true,
    });

const ConstructionBuildingsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Construction Buildings" });
    const { status: bulkStatus, run: runMaxAll } = useWriteStatus();
    const levelStates = Array.from({ length: BUILDING_COUNT }, () => van.state(0));
    const rowList = div({ class: "account-page-pane" });
    const buildings = van.state([]);
    const rowOf = new Map();
    const reconcileRows = createStaticRowReconciler(rowList);

    const load = async () =>
        run(async () => {
            const buildingRows = await readLevelDefinitions({
                levelsPath: "TowerInfo",
                definitionsPath: "TowerInfo",
                selectDefinitions: (_, definitions) => definitions.slice(0, BUILDING_COUNT),
                mapEntry: ({ definition, rawLevel, index }) => ({
                    index,
                    name: cleanName(definition[0], `Building ${index + 1}`),
                    baseMax: toNum(definition[8]),
                    level: toNum(rawLevel),
                }),
            });
            const computedResults = await readComputedMany(
                "workbench",
                "ExtraMaxLvAtom",
                buildingRows.map((building, i) => [building.baseMax, i])
            );

            const next = buildingRows.map((building, i) => {
                if (!computedResults[i]?.ok) {
                    throw new Error(`ExtraMaxLvAtom failed for building ${i}`);
                }
                const extraMax = toNum(computedResults[i].value);
                return { ...building, extraMax, maxLevel: building.baseMax + extraMax };
            });

            reconcileRows(next.map((building) => `${building.name}:${building.maxLevel}`).join("|"), () =>
                next.map((building) => {
                    const row = BuildingRow({
                        index: building.index,
                        name: building.name,
                        maxLevel: building.maxLevel,
                        levelState: levelStates[building.index],
                    });
                    rowOf.set(building.index, row);
                    return row;
                })
            );

            for (let i = 0; i < BUILDING_COUNT; i++) {
                levelStates[i].val = toNum(next[i]?.level);
            }
            buildings.val = next;
        });

    // The buildings Max all acts on: every one, or the ones the top bar's search shows.
    const shown = () => buildings.val.filter((building) => shownBySearch(rowOf.get(building.index)));
    const buildingWord = (n) => `building${n === 1 ? "" : "s"}`;

    // Max only raises, so it runs on one press.
    const doMaxAll = async () => {
        await runMaxAll(async () => {
            await runBulkSet({
                entries: shown(),
                getTargetValue: (building) => building.maxLevel,
                getValueState: (building) => levelStates[building.index],
                getWrites: ({ entry, currentValue, targetValue }) => [
                    toNum(currentValue) !== targetValue
                        ? { path: `TowerInfo[${entry.index}]`, value: targetValue }
                        : null,
                    { path: `TowerInfo[${entry.index + BUILDING_COUNT}]`, value: targetValue },
                ],
            });
        });
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Buildings",
        description: "Building levels, each up to its max with the Workbench's extra levels.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading buildings",
        errorTitle: "Couldn't read buildings",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: rowList,
                tools: () =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Max all",
                            status: bulkStatus,
                            disabled: () => loading.val || !shown().length,
                            onClick: (e) => {
                                e.preventDefault();
                                return doMaxAll();
                            },
                        })
                    ),
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${buildingWord(n)}` : `All ${n} ${buildingWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w3.construction.buildings",
    world: 3,
    system: "Construction",
    tab: "Buildings",
    description: "Building levels, with their caps raised by the Workbench.",
    keywords: ["Construction", "Towers"],
    component: ConstructionBuildingsTab,
});
