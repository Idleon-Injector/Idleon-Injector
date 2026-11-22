/**
 * W5 - Sailing › Islands
 *
 * Data sources:
 *   gga.Sailing[0][i]  - island i's cloud progress; -1 once the island is unlocked
 *   cList.IslandInfo   - one entry per island, in the game's order (it holds no names: the names below are the map's)
 *
 * One list in the map's order, each island with a switch. Unlock all runs on one press; Lock all asks in the tray.
 * Both act on the islands the top bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    createIndexedStateGetter,
    createStaticRowReconciler,
    runBulkSet,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const PATH = "Sailing[0]";
const UNLOCKED = -1;
const ISLAND_NAMES = [
    "Safari Island",
    "Beachy Coast",
    "Isolated Woods",
    "Rocky Peaks",
    "Stormy North",
    "Snowy South",
    "Toxic Bay Inc",
    "Candied Island",
    "Fungi Meadows",
    "Cloudy Quay",
    "Dungeon Cove",
    "Crystal Enclave",
    "Petulent Garage",
    "Isle Of Note",
    "The Edge",
    "Worlds End",
    "The Maw",
];

const IslandsTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Islands", busy: () => bulk.status.val === "loading" });
    const getState = createIndexedStateGetter(0);
    const islands = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const readPending = () => loading.val || Boolean(error.val);

    const IslandRow = (island) =>
        AccountToggleRow({
            info: span({ class: "account-row__name" }, island.name),
            words: ["Unlocked", ""],
            name: island.name,
            checked: () => getState(island.index).val === UNLOCKED,
            title: `${island.name} unlocked`,
            write: async (on) => {
                const value = on ? UNLOCKED : 0;
                await writeVerified(`${PATH}[${island.index}]`, value);
                getState(island.index).val = value;
            },
        });

    const load = async () =>
        run(async () => {
            const [rawProgress, rawInfo] = await Promise.all([gga(PATH), readCList("IslandInfo")]);
            const progress = toIndexedArray(rawProgress ?? []);
            const next = toIndexedArray(rawInfo ?? []).map((_, index) => ({
                index,
                name: ISLAND_NAMES[index] ?? `Island ${index + 1}`,
            }));
            reconcileRows(next.map((island) => island.name).join("|"), () =>
                next.map((island) => {
                    const row = IslandRow(island);
                    rowOf.set(island.index, row);
                    return row;
                })
            );
            next.forEach((island) => (getState(island.index).val = toNum(progress[island.index], 0)));
            islands.val = next;
        });

    const shown = () => islands.val.filter((island) => shownBySearch(rowOf.get(island.index)));
    const islandWord = (n) => `island${n === 1 ? "" : "s"}`;

    const setAll = async (entries, value) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => value,
                getValueState: (island) => getState(island.index),
                getPath: (island) => `${PATH}[${island.index}]`,
                // Locking clears only an unlocked island: one on its way keeps its cloud progress.
                shouldWrite: ({ currentValue }) =>
                    value === UNLOCKED ? Number(currentValue) !== UNLOCKED : Number(currentValue) === UNLOCKED,
            })
        );
        if (!result.ok && !result.cancelled) await load();
    };

    const tools = (_activeId, ask) => {
        const lockAll = ActionButton({
            label: "Lock all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().some((island) => getState(island.index).val === UNLOCKED),
            onClick: (e) => {
                e.preventDefault();
                const entries = shown().filter((island) => getState(island.index).val === UNLOCKED);
                const n = entries.length;
                ask({
                    question: `Lock ${n} ${islandWord(n)}?`,
                    confirmLabel: n === 1 ? "Lock it" : "Lock them",
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
                disabled: () => readPending() || !shown().length,
                onClick: (e) => {
                    e.preventDefault();
                    return setAll(shown(), UNLOCKED);
                },
            }),
            lockAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Islands",
        description: "Which islands your boats can sail to.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the islands",
        errorTitle: "Couldn't read the islands",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${islandWord(n)}` : `All ${n} ${islandWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w5.sailing.islands",
    world: 5,
    system: "Sailing",
    tab: "Islands",
    description: "Which sailing islands are unlocked.",
    keywords: ["Clouds", "Sailing map"],
    component: IslandsTab,
});
