/**
 * W4 - Cooking › Spices
 *
 * Data source:
 *   gga.Meals[3][n] - how much of spice n the account holds, one per breeding territory
 *
 * One list in the game's order, each spice with its amount.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { createIndexedStateGetter } from "../../../components/views/account/accountShared.js";
import { SPICE_NAMES } from "../../../components/views/account/spiceNames.js";

const { div } = van.tags;

const SPICE_AMOUNTS_PATH = "Meals[3]";

const SpicesTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cooking spices" });
    const getAmountState = createIndexedStateGetter(0);
    // The spices never change, so their rows are made once; a read only sets their amounts.
    const rows = SPICE_NAMES.map((name, index) =>
        SimpleNumberRow({
            entry: { name, path: `${SPICE_AMOUNTS_PATH}[${index}]`, float: true, showIndex: false },
            valueState: getAmountState(index),
        })
    );

    const load = async () =>
        run(async () => {
            const amounts = toIndexedArray((await gga(SPICE_AMOUNTS_PATH)) ?? []);
            SPICE_NAMES.forEach((_, index) => (getAmountState(index).val = Number(amounts[index] ?? 0)));
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Spices",
        description: "Spices in the kitchen, one from each breeding territory.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the spices",
        errorTitle: "Couldn't read the spices",
        initialWrapperClass: "account-list",
        body: div({ class: "account-list account-list--tabbed" }, ListPanel({ body: rows })),
    });
};

export default definePage({
    id: "w4.cooking.spices",
    world: 4,
    system: "Cooking",
    tab: "Spices",
    description: "Spice amounts.",
    component: SpicesTab,
});
