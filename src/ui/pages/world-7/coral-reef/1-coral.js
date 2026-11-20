import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { createStaticRowReconciler, getOrCreateState, toInt } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const CORAL_LEVELS_PATH = "Spelunk[13]";
const CORAL_FIELDS = [
    { index: 0, name: "Brain Coral" },
    { index: 1, name: "Carnation Coral" },
    { index: 2, name: "Anemone Coral" },
    { index: 3, name: "Pillar Coral" },
    { index: 4, name: "Paragorgia Coral" },
];

const CoralRow = ({ entry, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `${CORAL_LEVELS_PATH}[${entry.index}]`,
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

const CoralTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Coral Reef" });
    const entriesState = van.state([]);
    const levelStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const buildEntries = (rawDefinitions, pillarUpgradeOwned) => {
        const definitions = toIndexedArray(rawDefinitions ?? []);

        return CORAL_FIELDS.map((field) => {
            const definition = toIndexedArray(definitions[field.index] ?? []);
            const baseMax = toInt(definition[1], { min: 0 });

            return {
                ...field,
                // The game updates this definition only when opening its coral menu.
                maxLevel: field.index === 3 && Number(pillarUpgradeOwned) === 1 && baseMax === 12 ? 15 : baseMax,
            };
        });
    };

    const reconcileCoralRows = () => {
        reconcileRows(entriesState.val.map((entry) => `${entry.index}:${entry.maxLevel}`).join("|"), () =>
            entriesState.val.map((entry) =>
                CoralRow({
                    entry,
                    levelState: getOrCreateState(levelStates, entry.index),
                })
            )
        );
    };

    const load = async () =>
        run(async () => {
            const [definitions, pillarUpgradeOwned] = await Promise.all([
                readCList("CoralReef"),
                readComputed("menagerie", "UnlockOwned", [9, 0]),
            ]);
            entriesState.val = buildEntries(definitions, pillarUpgradeOwned);
            reconcileCoralRows();

            const levels = toIndexedArray((await gga(CORAL_LEVELS_PATH)) ?? []);
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
            title: "Coral levels",
            note: () => `${entriesState.val.length} implemented corals`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: "Coral Reef",
        description: "Set W7 Coral Reef levels from Spelunk[13]. Max levels include Menagerie upgrades.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "Reading Coral Reef",
        errorTitle: "Coral Reef read failed",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w7.coralreef.coral",
    world: 7,
    system: "Coral Reef",
    tab: "Coral",
    description: "Coral Reef levels, with max levels that include Menagerie upgrades.",
    keywords: ["Coral", "Reef"],
    component: CoralTab,
});
