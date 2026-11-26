import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const BIG_FISH_LEVELS_PATH = "Spelunk[11]";

const splitDefinition = (rawDefinition) =>
    Array.isArray(rawDefinition) ? toIndexedArray(rawDefinition ?? []) : String(rawDefinition ?? "").split(",");

const BigFishRow = ({ entry, levelState }) =>
    SimpleNumberRow({
        entry,
        valueState: levelState,
    });

const BigFishTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Big Fish" });
    const entriesState = van.state([]);
    const levelStates = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const buildEntries = (rawDefinitions) =>
        toIndexedArray(rawDefinitions ?? [])
            .map((rawDefinition, index) => {
                const definition = splitDefinition(rawDefinition);
                const rawName = String(definition[0] ?? "").trim();
                if (!rawName) return null;

                return {
                    index,
                    path: `${BIG_FISH_LEVELS_PATH}[${index}]`,
                    rawName,
                    // "Advice_on_Sleeping,Don't_do_it_while_awake._@_+{%_Spelunking_AFK_Gains": the bonus after the joke.
                    info: RowTitles({
                        bonus: bonusText(
                            String(definition[1] ?? "")
                                .split("_@_")
                                .pop()
                        ),
                        name: cleanName(rawName, `Big Fish ${index}`),
                    }),
                    name: cleanName(rawName, `Big Fish ${index}`),
                    formatted: false,
                    showIndex: false,
                };
            })
            .filter(Boolean);

    const reconcileBigFishRows = () => {
        reconcileRows(entriesState.val.map((entry) => entry.rawName).join("|"), () =>
            entriesState.val.map((entry) =>
                BigFishRow({
                    entry,
                    levelState: getOrCreateState(levelStates, entry.index),
                })
            )
        );
    };

    const load = async () =>
        run(async () => {
            entriesState.val = buildEntries(await readCList("Spelunky[18]"));
            reconcileBigFishRows();

            const levels = toIndexedArray((await gga(BIG_FISH_LEVELS_PATH)) ?? []);
            for (const entry of entriesState.val) {
                getOrCreateState(levelStates, entry.index).val = toInt(levels[entry.index], { min: 0 });
            }
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Advice Fish",
        description: "Big Fish bonus levels.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the Big Fish",
        errorTitle: "Couldn't read the Big Fish",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                empty: () => (entriesState.val.length ? null : "No Big Fish found"),
                setAll: { word: (n) => (n === 1 ? "Big Fish bonus" : "Big Fish bonuses") },
            })
        ),
    });
};

export default definePage({
    id: "w7.advicefish",
    world: 7,
    system: "Advice Fish",
    description: "Big Fish bonus levels.",
    keywords: ["Big Fish"],
    component: BigFishTab,
});
