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
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const ZENITH_LEVELS_PATH = "Spelunk[45]";
const ZENITH_CLUSTERS_PATH = "OptionsListAccount[486]";

const ZenithRow = ({ entry, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `${ZENITH_LEVELS_PATH}[${entry.index}]`,
        max: entry.maxLevel,
        integerMode: "round",
        renderInfo: () => [
            span({ class: "account-row__index" }, `#${entry.index}`),
            div({ class: "account-row__name-group" }, span({ class: "account-row__name" }, entry.name)),
        ],
        rowClass: "account-row--wide-controls",
        controlsClass: "account-row__controls--xl",
        maxAction: true,
    });

const ZenithClustersRow = ({ valueState }) =>
    SimpleNumberRow({
        entry: {
            name: "Zenith Clusters",
            path: ZENITH_CLUSTERS_PATH,
            formatted: true,
            showIndex: false,
            controlsClass: "account-row__controls--xl",
        },
        valueState,
    });

const ZenithTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Zenith" });
    const entriesState = van.state([]);
    const clusterState = van.state(0);
    const levelStates = new Map();
    const listNode = div({ class: "account-item-stack" });
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

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "Currency",
            note: "OptionsListAccount[486]",
            body: div({ class: "account-item-stack" }, ZenithClustersRow({ valueState: clusterState })),
        }),
        AccountSection({
            title: "Zenith upgrades",
            note: () => `${entriesState.val.length} market upgrades`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: "Zenith",
        description: "Set W7 Zenith market levels from Spelunk[45]. Max levels come from ZenithMarket definitions.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "Reading Zenith",
        errorTitle: "Zenith read failed",
        initialWrapperClass: "scrollable-panel",
        body,
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
