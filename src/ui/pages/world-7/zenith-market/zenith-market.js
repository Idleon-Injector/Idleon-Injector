import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const ZENITH_LEVELS_PATH = "Spelunk[45]";
const ZENITH_CLUSTERS_PATH = "OptionsListAccount[486]";

const ZenithRow = ({ entry, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `${ZENITH_LEVELS_PATH}[${entry.index}]`,
        max: entry.maxLevel,
        integerMode: "round",
        name: entry.name,
        maxAction: true,
    });

const ZenithClustersRow = ({ valueState }) =>
    SimpleNumberRow({
        entry: {
            name: "Zenith Clusters",
            path: ZENITH_CLUSTERS_PATH,
            formatted: true,
        },
        valueState,
    });

const ZenithTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Zenith" });
    const entriesState = van.state([]);
    const clusterState = van.state(0);
    const levelStates = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const buildEntries = (rawDefinitions) =>
        toIndexedArray(rawDefinitions ?? [])
            .map((rawDefinition, index) => {
                const definition = toIndexedArray(rawDefinition ?? []);
                const rawName = String(definition[0] ?? "").trim();
                if (!rawName) return null;

                return {
                    index,
                    rawName,
                    name: cleanName(rawName, `Zenith ${index}`),
                    maxLevel: toInt(definition[3], { min: 0 }),
                };
            })
            .filter(Boolean);

    const reconcileZenithRows = () => {
        reconcileRows(entriesState.val.map((entry) => entry.rawName).join("|"), () =>
            entriesState.val.map((entry) =>
                ZenithRow({
                    entry,
                    levelState: getOrCreateState(levelStates, entry.index),
                })
            )
        );
    };

    const load = async () =>
        run(async () => {
            entriesState.val = buildEntries(await readCList("ZenithMarket"));
            reconcileZenithRows();

            const [rawLevels, rawClusters] = await Promise.all([gga(ZENITH_LEVELS_PATH), gga(ZENITH_CLUSTERS_PATH)]);
            const levels = toIndexedArray(rawLevels ?? []);
            clusterState.val = toInt(rawClusters, { min: 0 });
            for (const entry of entriesState.val) {
                getOrCreateState(levelStates, entry.index).val = Math.min(
                    entry.maxLevel,
                    toInt(levels[entry.index], { min: 0 })
                );
            }
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Zenith Market",
        description: "Zenith Clusters and the market's upgrade levels.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the Zenith Market",
        errorTitle: "Couldn't read the Zenith Market",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                setAll: { word: (n) => (n === 1 ? "line" : "lines"), placeholder: "Value" },
                body: [
                    AccountSection({ title: "Currency", body: ZenithClustersRow({ valueState: clusterState }) }),
                    AccountSection({ title: "Upgrades", body: listNode }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w7.zenithmarket",
    world: 7,
    system: "Zenith Market",
    description: "Zenith Market upgrade levels.",
    keywords: ["Zenith"],
    component: ZenithTab,
});
