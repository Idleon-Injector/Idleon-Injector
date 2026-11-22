/**
 * W4 - Cooking › Tables
 *
 * Data source:
 *   gga.Cooking[k][6..8] - kitchen k's Speed, Fire and Luck upgrade levels
 *
 * One kitchen per line, its three levels in the table's columns, like Refinery.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { createStaticRowReconciler, toInt } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const FIELDS = [
    { key: "speed", label: "Speed", index: 6 },
    { key: "fire", label: "Fire", index: 7 },
    { key: "luck", label: "Luck", index: 8 },
];

// A kitchen's three levels as the game holds them.
const kitchenValues = (raw) => {
    const kitchen = toIndexedArray(raw ?? []);
    return Object.fromEntries(FIELDS.map((field) => [field.key, toInt(kitchen[field.index], { min: 0 })]));
};

const TablesTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cooking tables" });
    const states = [];
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const kitchens = toIndexedArray((await gga("Cooking")) ?? []).map(kitchenValues);
            while (states.length < kitchens.length) {
                states.push(Object.fromEntries(FIELDS.map((field) => [field.key, van.state(0)])));
            }
            reconcileRows(String(kitchens.length), () =>
                kitchens.map((_, k) => {
                    const name = `Kitchen ${k + 1}`;
                    return ValueTableRow({
                        name,
                        info: span({ class: "account-row__name" }, name),
                        fields: FIELDS.map((field) => ({
                            key: field.key,
                            label: field.label,
                            valueState: states[k][field.key],
                            paths: [`Cooking[${k}][${field.index}]`],
                        })),
                        read: async () => kitchenValues(await gga(`Cooking[${k}]`)),
                    });
                })
            );
            kitchens.forEach((values, k) => FIELDS.forEach((field) => (states[k][field.key].val = values[field.key])));
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container kitchen-tables-tab",
        title: "Tables",
        description: "Each kitchen's Speed, Fire and Luck levels.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the kitchens",
        errorTitle: "Couldn't read the kitchens",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: [ValueTableHead({ name: "Kitchen", columns: FIELDS.map((field) => field.label) }), listNode],
            })
        ),
    });
};

export default definePage({
    id: "w4.cooking.tables",
    world: 4,
    system: "Cooking",
    tab: "Tables",
    description: "Kitchen table upgrade levels: speed, fire and luck.",
    keywords: ["Kitchens"],
    component: TablesTab,
});
