/**
 * W5 - Sailing › Loot Pile
 *
 * Data sources:
 *   gga.Sailing[1][n]                          - how many of treasure n you have (0 is Gold Bars)
 *   ItemDefinitionsGET.h.SailTr{n}.displayName - the treasure's name
 *   cList.IslandInfo                           - one entry per island; each island has two treasures
 *
 * The treasures the boats have brought home, in the game's order.
 */

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
    createIndexedStateGetter,
    createStaticRowReconciler,
    toNum,
    unwrapH,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const PATH = "Sailing[1]";

const LootPileTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Loot Pile" });
    const getAmountState = createIndexedStateGetter(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawAmounts, rawIslands] = await Promise.all([gga(PATH), readCList("IslandInfo")]);
            const amounts = toIndexedArray(rawAmounts ?? []);
            const count = Math.max(amounts.length, 1 + toIndexedArray(rawIslands ?? []).length * 2);
            const ids = Array.from({ length: count }, (_, n) => `SailTr${n}`);
            const items = await readGgaEntries("ItemDefinitionsGET.h", ids, ["displayName"]);
            const treasures = ids.map((id, index) => ({
                index,
                name: cleanName(unwrapH(items[id])?.displayName, `Treasure ${index + 1}`),
            }));
            reconcileRows(treasures.map((treasure) => treasure.name).join("|"), () =>
                treasures.map((treasure) =>
                    SimpleNumberRow({
                        entry: { name: treasure.name, path: `${PATH}[${treasure.index}]`, float: true },
                        valueState: getAmountState(treasure.index),
                    })
                )
            );
            treasures.forEach((treasure) => (getAmountState(treasure.index).val = toNum(amounts[treasure.index], 0)));
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Loot Pile",
        description: "The treasures your boats have brought home.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the loot pile",
        errorTitle: "Couldn't read the loot pile",
        initialWrapperClass: "account-list",
        body: div({ class: "account-list account-list--tabbed" }, ListPanel({ body: listNode })),
    });
};

export default definePage({
    id: "w5.sailing.lootpile",
    world: 5,
    system: "Sailing",
    tab: "Loot Pile",
    description: "Sailing treasures, Gold Bars first.",
    keywords: ["Currency", "Treasure", "Gold Bars", "Sailing currency"],
    component: LootPileTab,
});
