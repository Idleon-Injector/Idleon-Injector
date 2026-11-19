import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { createStaticRowReconciler, getOrCreateState } from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div } = van.tags;

const ESSENCE_PATH = "Summon[2]";
const ESSENCE_NAMES = ["White", "Green", "Yellow", "Blue", "Purple", "Red", "Cyan", "Teal", "Unused"];

const EssenceRow = ({ entry, amountState }) =>
    SimpleNumberRow({
        entry,
        valueState: amountState,
    });

const buildEssenceEntries = (rawAmounts) =>
    toIndexedArray(rawAmounts ?? []).map((amount, index) => ({
        index,
        path: `${ESSENCE_PATH}[${index}]`,
        name: `${ESSENCE_NAMES[index] ?? `Essence ${index + 1}`} Essence`,
        float: true,
        amount,
    }));

const EssenceTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Summoning Essence" });
    const entries = van.state([]);
    const amountStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            entries.val = buildEssenceEntries(await gga(ESSENCE_PATH));
            reconcileRows(entries.val.map((entry) => `${entry.index}:${entry.name}`).join("|"), () =>
                entries.val.map((entry) =>
                    EssenceRow({
                        entry,
                        amountState: getOrCreateState(amountStates, entry.index),
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(amountStates, entry.index).val = entry.amount;
            }
        });

    load();

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "ESSENCE",
            note: () => `${entries.val.length} ESSENCE AMOUNTS FROM Summon[2]`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: "ESSENCE",
        description: "Edit Summoning essence amounts from Summon[2]. Names use the in-game essence color order.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "READING SUMMONING ESSENCE",
        errorTitle: "SUMMONING ESSENCE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w6.summoning.essence",
    world: 6,
    system: "Summoning",
    tab: "Essence",
    description: "Summoning essence amounts.",
    keywords: ["Summoning Essence"],
    component: EssenceTab,
});
