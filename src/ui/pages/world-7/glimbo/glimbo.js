import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const GLIMBO_LEVELS_PATH = "Research[12]";

const GlimboRow = ({ entry, levelState }) =>
    SimpleNumberRow({
        entry,
        valueState: levelState,
    });

const GlimboTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Glimbo" });
    const entriesState = van.state([]);
    const levelStates = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const buildEntries = async (rawItemIds) => {
        const itemIds = toIndexedArray(rawItemIds ?? [])
            .map((entry) => String(entry ?? "").trim())
            .filter(Boolean);
        const itemDefs = itemIds.length
            ? await readGgaEntries("ItemDefinitionsGET.h", itemIds, ["displayName", "DisplayName", "Name", "name"])
            : {};

        return itemIds.map((itemId, index) => {
            const definition = itemDefs[itemId] ?? {};

            return {
                index,
                path: `${GLIMBO_LEVELS_PATH}[${index}]`,
                itemId,
                name: cleanName(
                    definition.displayName ?? definition.DisplayName ?? definition.Name ?? definition.name,
                    itemId
                ),
                formatted: false,
                showIndex: false,
            };
        });
    };

    const reconcileGlimboRows = () => {
        reconcileRows(entriesState.val.map((entry) => entry.itemId).join("|"), () =>
            entriesState.val.map((entry) =>
                GlimboRow({
                    entry,
                    levelState: getOrCreateState(levelStates, entry.index),
                })
            )
        );
    };

    const load = async () =>
        run(async () => {
            entriesState.val = await buildEntries(await readCList("Research[27]"));
            reconcileGlimboRows();

            const levels = toIndexedArray((await gga(GLIMBO_LEVELS_PATH)) ?? []);
            for (const entry of entriesState.val) {
                getOrCreateState(levelStates, entry.index).val = toInt(levels[entry.index], { min: 0 });
            }
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Glimbo",
        description: "Glimbo's trade levels, one per item.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading Glimbo",
        errorTitle: "Couldn't read Glimbo",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({ body: listNode, setAll: { word: (n) => (n === 1 ? "trade" : "trades") } })
        ),
    });
};

export default definePage({
    id: "w7.glimbo",
    world: 7,
    system: "Glimbo",
    description: "Glimbo trade levels.",
    keywords: ["Trades"],
    component: GlimboTab,
});
