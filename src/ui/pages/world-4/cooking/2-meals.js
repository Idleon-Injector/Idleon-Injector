/**
 * W4 - Cooking › Meals
 *
 * Data sources:
 *   gga.Meals[0][n]          - meal n's level
 *   gga.Meals[2][n]          - how many of meal n are cooked
 *   gga.Ribbon[28 + n]       - meal n's ribbon
 *   gga.CookMaster[0][n]     - meal n's Cooking Mastery level
 *   cList.MealINFO[n][0, 3]  - the meal's name and its bonus in the game's words
 *   PtsLeftCook_Y            - the meal mastery points left (the game works them out)
 *
 * One meal per line in the game's order, the bonus first, its Level, Amount, Ribbon and Mastery in the table's columns
 * (Mastery here is Lumi's pick, with its points left beside the title). The Amount only supports the level, so it is
 * the quiet column.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { AmountLeft, RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
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

const { div, span } = van.tags;

const RIBBON_OFFSET = 28;
const RIBBON_MAX = 25;

const paths = (index) => ({
    level: `Meals[0][${index}]`,
    amount: `Meals[2][${index}]`,
    ribbon: `Ribbon[${RIBBON_OFFSET + index}]`,
    mastery: `CookMaster[0][${index}]`,
});
const FIELDS = ["level", "amount", "ribbon", "mastery"];

const MealsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cooking meals" });
    const states = new Map();
    const stateOf = (index) => {
        if (!states.has(index)) states.set(index, Object.fromEntries(FIELDS.map((key) => [key, van.state(0)])));
        return states.get(index);
    };
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const pointsState = van.state(0);

    // A save already landed, so a failed points read doesn't fail it; the points say they may be off until the next
    // good read.
    const pointsOff = van.state(false);
    let pointsRead = 0;
    const refreshPoints = async () => {
        const read = ++pointsRead;
        try {
            const points = await readComputed("cookingMastery", "PtsLeftCook_Y");
            // An older read answering last would show the points from before the newer save.
            if (read !== pointsRead) return;
            pointsState.val = toInt(points, { min: 0 });
            pointsOff.val = false;
        } catch {
            if (read === pointsRead) pointsOff.val = true;
        }
    };

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
                { key: "mastery", label: "Mastery", valueState: state.mastery, paths: [at.mastery] },
            ],
            // Read after every save: the points left follow a mastery change.
            read: async () => {
                const [level, amount, ribbon, mastery] = await Promise.all(FIELDS.map((key) => gga(at[key])));
                await refreshPoints();
                return {
                    level: toInt(level, { min: 0 }),
                    amount: toNum(amount, 0),
                    ribbon: toInt(ribbon, { min: 0 }),
                    mastery: toInt(mastery, { min: 0 }),
                };
            },
            // Set all sets each meal's level; how many are cooked stays its own.
            setAll: "level",
        });
    };

    const load = async () =>
        run(async () => {
            const [rawMeals, rawMealInfo, rawRibbons, rawMastery, points] = await Promise.all([
                gga("Meals"),
                readCList("MealINFO"),
                gga("Ribbon"),
                gga("CookMaster[0]"),
                readComputed("cookingMastery", "PtsLeftCook_Y"),
            ]);
            const mastery = toIndexedArray(rawMastery ?? []);
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
                state.mastery.val = toInt(mastery[index], { min: 0 });
            }
            // A good read; a points read still running from before it can no longer say the points are off.
            pointsRead++;
            pointsState.val = toInt(points, { min: 0 });
            pointsOff.val = false;
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container meals-tab",
        title: "Meals",
        automation: { page: "automation.cooking", tab: "meals" },
        description: "Each meal's level, how many are cooked, its ribbon and its mastery.",
        total: () =>
            pointsOff.val
                ? span({ class: "amount-left" }, "Points may be off. Refresh.")
                : AmountLeft({ value: () => pointsState.val, one: "mastery point", many: "mastery points" }),
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the meals",
        errorTitle: "Couldn't read the meals",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "meals-table value-table--wide",
                setAll: { word: (n) => `meal${n === 1 ? "" : "s"}` },
                body: [ValueTableHead({ name: "Meal", columns: ["Level", "Amount", "Ribbon", "Mastery"] }), listNode],
            })
        ),
    });
};

export default definePage({
    id: "w4.cooking.meals",
    world: 4,
    system: "Cooking",
    tab: "Meals",
    description: "Meal levels, amounts, ribbons and meal mastery.",
    keywords: ["Ribbons", "Meal Mastery"],
    component: MealsTab,
});
