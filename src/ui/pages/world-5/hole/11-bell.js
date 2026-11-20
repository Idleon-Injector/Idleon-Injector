import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanNameEffect,
    createStaticRowReconciler,
    getOrCreateState,
    toNum,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div } = van.tags;

const BellRow = ({ entry, valueState }) =>
    SimpleNumberRow({
        entry,
        valueState,
    });

const buildImprovementEntries = (holes, improvements) => {
    const values = toIndexedArray(toIndexedArray(holes)[16]);
    return toIndexedArray(improvements ?? [])
        .map((rawName, index) => {
            const name = cleanNameEffect(rawName, "");
            if (!name) return null;
            return {
                key: `bell-improvement-${index}`,
                index,
                name,
                path: `Holes[16][${index}]`,
                value: toNum(values[index], 0),
            };
        })
        .filter(Boolean);
};

const buildRandomEntries = (holes, randomBonuses) => {
    const values = toIndexedArray(toIndexedArray(holes)[17]);
    const names = toIndexedArray(randomBonuses ?? []);
    return Array.from({ length: Math.floor(names.length / 2) }, (_, index) => {
        const effect = cleanNameEffect(names[index * 2], "");
        if (!effect) return null;
        return {
            key: `bell-random-${index}`,
            index,
            name: effect,
            path: `Holes[17][${index}]`,
            value: toNum(values[index], 0),
        };
    }).filter(Boolean);
};

const BellTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Hole Bell" });
    const improvementEntries = van.state([]);
    const randomEntries = van.state([]);
    const valueStates = new Map();
    const improvementNode = div({ class: "account-item-stack" });
    const randomNode = div({ class: "account-item-stack" });
    const reconcileImprovements = createStaticRowReconciler(improvementNode);
    const reconcileRandom = createStaticRowReconciler(randomNode);

    const reconcile = (entries, reconciler) => {
        reconciler(entries.map((entry) => entry.key).join("|"), () =>
            entries.map((entry) => BellRow({ entry, valueState: getOrCreateState(valueStates, entry.key) }))
        );
        for (const entry of entries) getOrCreateState(valueStates, entry.key).val = entry.value;
    };

    const load = async () =>
        run(async () => {
            const [holes, randomBonuses, improvements] = await Promise.all([
                gga("Holes"),
                readCList("HolesInfo[59]"),
                readCList("HolesInfo[60]"),
            ]);
            improvementEntries.val = buildImprovementEntries(holes, improvements);
            randomEntries.val = buildRandomEntries(holes, randomBonuses);
            reconcile(improvementEntries.val, reconcileImprovements);
            reconcile(randomEntries.val, reconcileRandom);
        });

    load();

    return PersistentAccountListPage({
        title: "The Bell",
        description: "Edit Bell improvement methods and random bonus levels from Holes[16] and Holes[17].",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading hole bell",
        errorTitle: "Hole bell read failed",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({
                title: "Improvement methods",
                note: () => `${improvementEntries.val.length} ROWS`,
                body: improvementNode,
            }),
            AccountSection({
                title: "Random bonuses",
                note: () => `${randomEntries.val.length} ROWS`,
                body: randomNode,
            })
        ),
    });
};

export default definePage({
    id: "w5.hole.bell",
    world: 5,
    system: "Hole",
    tab: "Bell",
    description: "Bell improvement methods and random bonus levels.",
    keywords: ["The Bell"],
    component: BellTab,
});
