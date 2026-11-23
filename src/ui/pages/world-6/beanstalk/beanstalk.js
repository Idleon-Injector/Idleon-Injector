/**
 * W6 - Beanstalk
 *
 * The gold foods on the Beanstalk behind the ninja castle, in the game's order, each with its level (0 to 3).
 *
 * Data sources:
 *   gga.Ninja[104][f]        - gold food f's level on the Beanstalk
 *   cList.NinjaInfo[29]      - the foods, three entries each, the item id last; names from ItemDefinitionsGET
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import {
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    resolveNumberInput,
} from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const LEVELS_PATH = "Ninja[104]";
const MAX_LEVEL = 3;

const BeanstalkTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Beanstalk" });
    const getLevelState = createIndexedStateGetter(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const FoodRow = (food) =>
        ClampedLevelRow({
            valueState: getLevelState(food.n),
            writePath: `${LEVELS_PATH}[${food.n}]`,
            max: MAX_LEVEL,
            integerMode: "round",
            name: food.name,
            maxAction: true,
        });

    const load = () =>
        run(async () => {
            const [rawLevels, rawFoods] = await Promise.all([gga(LEVELS_PATH), readCList("NinjaInfo[29]")]);
            const ids = toIndexedArray(rawFoods ?? []).filter((_, i) => i % 3 === 2);
            const names = ids.length ? await readGgaEntries("ItemDefinitionsGET.h", ids, ["displayName"]) : {};
            const levels = toIndexedArray(rawLevels ?? []);
            const foods = ids.map((id, n) => ({ n, id, name: cleanName(names[id]?.displayName, id) }));
            reconcileRows(foods.map((food) => food.id).join("|"), () => foods.map(FoodRow));
            foods.forEach(
                (food) => (getLevelState(food.n).val = resolveNumberInput(levels[food.n], { min: 0, fallback: 0 }))
            );
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Beanstalk",
        description: "Gold foods added to the Beanstalk.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the beanstalk",
        errorTitle: "Couldn't read the beanstalk",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({ body: div({ class: "field-columns" }, listNode) })
        ),
    });
};

export default definePage({
    id: "w6.beanstalk",
    world: 6,
    system: "Beanstalk",
    description: "Gold foods added to the Beanstalk.",
    keywords: ["Beanstack", "Gold Food", "Golden Food"],
    component: BeanstalkTab,
});
