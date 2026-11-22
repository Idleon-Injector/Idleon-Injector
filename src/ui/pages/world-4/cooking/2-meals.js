/**
 * W4 - Cooking › Meals
 *
 * Data sources:
 *   gga.Meals[0][n]          - meal n's level
 *   gga.Meals[2][n]          - how many of meal n are cooked
 *   gga.Ribbon[28 + n]       - meal n's ribbon
 *   cList.MealINFO[n][0, 3]  - the meal's name and its bonus in the game's words
 *
 * One meal per line in the game's order, the bonus first, its Level, Amount and Ribbon in the table's columns. The
 * Amount only supports the level, so it is the quiet column.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    toInt,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const RIBBON_OFFSET = 28;
const RIBBON_MAX = 25;

const paths = (index) => ({
    level: `Meals[0][${index}]`,
    amount: `Meals[2][${index}]`,
    ribbon: `Ribbon[${RIBBON_OFFSET + index}]`,
});

const MealsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cooking meals" });
    const states = new Map();
    const stateOf = (index) => {
        if (!states.has(index)) states.set(index, { level: van.state(0), amount: van.state(0), ribbon: van.state(0) });
        return states.get(index);
    };
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const MealRow = (meal) => {
        const at = paths(meal.index);
        const state = stateOf(meal.index);
        return ValueTableRow({
            name: meal.name,
            info: RowTitles({ bonus: meal.bonus, name: meal.name }),
            fields: [
                { key: "level", label: "Level", valueState: state.level, paths: [at.level] },
                {
                    key: "amount",
                    label: "Amount",
                    valueState: state.amount,
                    paths: [at.amount],
                    formatted: true,
                    quiet: true,
                },
                { key: "ribbon", label: "Ribbon", valueState: state.ribbon, paths: [at.ribbon], max: RIBBON_MAX },
            ],
            read: async () => {
                const [level, amount, ribbon] = await Promise.all([gga(at.level), gga(at.amount), gga(at.ribbon)]);
                return { level: toInt(level, { min: 0 }), amount: toNum(amount, 0), ribbon: toInt(ribbon, { min: 0 }) };
            },
        });
    };

    const load = async () =>
        run(async () => {
            const [rawMeals, rawMealInfo, rawRibbons] = await Promise.all([
                gga("Meals"),
                readCList("MealINFO"),
                gga("Ribbon"),
            ]);
            const levels = toIndexedArray(rawMeals?.[0] ?? []);
            const amounts = toIndexedArray(rawMeals?.[2] ?? []);
            const ribbons = toIndexedArray(rawRibbons ?? []);
            const meals = toIndexedArray(rawMealInfo ?? [])
                .map((raw, index) => {
                    const info = toIndexedArray(raw ?? []);
                    const rawName = String(info[0] ?? "").trim();
                    if (!rawName) return null;
                    return { index, name: cleanName(rawName, `Meal ${index + 1}`), bonus: bonusText(info[3]) };
                })
                .filter(Boolean);

            reconcileRows(meals.map((meal) => `${meal.index}:${meal.name}`).join("|"), () => meals.map(MealRow));
            for (const { index } of meals) {
                const state = stateOf(index);
                state.level.val = toInt(levels[index], { min: 0 });
                state.amount.val = toNum(amounts[index], 0);
                state.ribbon.val = toInt(ribbons[RIBBON_OFFSET + index], { min: 0 });
            }
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container meals-tab",
        title: "Meals",
        description: "Each meal's level, how many are cooked, and its ribbon.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the meals",
        errorTitle: "Couldn't read the meals",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: [ValueTableHead({ name: "Meal", columns: ["Level", "Amount", "Ribbon"] }), listNode],
            })
        ),
    });
};

export default definePage({
    id: "w4.cooking.meals",
    world: 4,
    system: "Cooking",
    tab: "Meals",
    description: "Meal levels, amounts and ribbon levels.",
    keywords: ["Ribbons"],
    component: MealsTab,
});
