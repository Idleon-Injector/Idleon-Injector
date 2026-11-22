/**
 * World 4 › Cooking › Automation: which kitchen upgrades and meals the cooking automation levels.
 *
 * Kitchens: one section per kitchen (Speed, Fire, Luck), each paid with a spice; every spice saves and buys on its own
 * ("Save for it" and its saving %). Meals: one row per meal, levelled with its own quantity up to the max.
 *
 * Reads readComputed("automation", "cooking") and saves cheatConfig.automation.kitchens, kitchenSaving (one % per
 * spice) and meals, each a plain list like Shops.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../../components/inPlace.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationPage,
    AutomationRow,
    AutomationStats,
    PickRow,
    SettingRow,
    automationColumns,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { SPICE_NAMES } from "./4-spices.js";

const { div, span } = van.tags;

const CHEAT = "automation cooking";
const SLOTS = ["Speed", "Fire", "Luck"];
const TABS = [
    { id: "kitchens", label: "Kitchens", words: ["kitchen upgrade", "kitchen upgrades"] },
    { id: "meals", label: "Meals", words: ["meal", "meals"] },
];
const KITCHEN_COLUMNS = automationColumns({ values: ["Level", "Next level"], save: true, stopAt: "Stop at level" });
const MEAL_COLUMNS = automationColumns({ values: ["Level", "Next level"], stopAt: "Stop at level" });
const spiceName = (spice) => SPICE_NAMES[spice] ?? `Spice ${spice + 1}`;
const kitchenName = (id) => `Kitchen ${Math.floor(id / 3) + 1} ${SLOTS[id % 3]}`;
// Like the kitchen panel, small amounts show whole: what is held rounded down, costs up.
const whole = (value, round) => formatNumber(value < 1e5 ? round(value) : value);

const CookingAutomationTab = () => {
    const ids = { kitchens: van.state([]), meals: van.state([]) };
    const upgrades = new Map(); // id -> state of the game's upgrade
    const meals = new Map(); // id -> state of the game's meal
    const spices = van.state([]); // [{ spice, owned, goal }]
    const foodLust = van.state(0);
    const maxMeal = van.state(0);
    const activeTab = van.state("kitchens");

    const spiceList = div();
    const reconcileSpices = createStaticRowReconciler(spiceList);
    const kitchenList = div();
    const reconcileKitchens = createStaticRowReconciler(kitchenList);
    const mealList = div();
    const mealSwitch = div();
    const reconcileMeals = createStaticRowReconciler(mealList);

    const isOn = (tab, id) => picks[tab].get(String(id)).on.val;
    // What a spice holds, and, while Cooking runs, what it is doing.
    const spiceLine = ({ owned, goal }) => {
        const held = `${whole(Math.max(0, owned), Math.floor)} held`;
        if (!automation.val?.on) return held;
        return `${held} · ${goal ? `saving for ${kitchenName(goal.id)} (${whole(goal.cost, Math.ceil)})` : "buying cheapest first"}`;
    };

    const KitchenRow = ({ id }) => {
        const upgrade = getOrCreateState(upgrades, id, {});
        return PickRow({
            picks: picks.kitchens,
            id: String(id),
            name: SLOTS[id % 3],
            label: kitchenName(id),
            save: true,
            stopAtTitle: "Stop at level",
            values: [
                { name: "Level", text: () => formatNumber(upgrade.val.level ?? 0) },
                {
                    name: "Next level",
                    quiet: true,
                    text: () => (upgrade.val.owned ? whole(upgrade.val.cost ?? 0, Math.ceil) : "Locked"),
                },
            ],
            detail: () => {
                const { slot, bonus, owned, spice } = upgrade.val;
                if (!owned) return "Kitchen not bought yet";
                const value = slot === 2 ? `${Math.round(100 * bonus) / 100}x` : `${formatNumber(bonus)}/hr`;
                return `${value} · paid with ${spiceName(spice)}`;
            },
        });
    };

    const MealRow = ({ id, name }) => {
        const meal = getOrCreateState(meals, id, {});
        return PickRow({
            picks: picks.meals,
            id: String(id),
            name,
            stopAtTitle: "Stop at level",
            values: [
                { name: "Level", text: () => `${meal.val.level ?? 0} / ${maxMeal.val}` },
                {
                    name: "Next level",
                    quiet: true,
                    text: () => {
                        const { level, cost } = meal.val;
                        if (!(level > 0)) return "Locked";
                        return level >= maxMeal.val ? "Max" : formatNumber(cost ?? 0);
                    },
                },
            ],
            // What the meal does, in the game's words with its value, then how many are held.
            bonus: () =>
                meal.val.description === undefined
                    ? ""
                    : cleanName(String(meal.val.description).split("{").join(formatNumber(meal.val.bonus))),
            detail: () => {
                const { level, owned } = meal.val;
                if (!(level > 0)) return "Not discovered yet";
                return `${formatNumber(Math.max(0, owned))} held`;
            },
        });
    };

    const tab = useAutomationTab({
        label: "Cooking automation",
        cheats: [CHEAT],
        switchColumn: KITCHEN_COLUMNS.on,
        read: async (saved) => {
            const data = await readComputed("automation", "cooking");
            picks.kitchens.sync(saved.kitchens);
            picks.meals.sync(saved.meals);
            saving.sync(saved.kitchenSaving);
            spices.val = data.spices;
            foodLust.val = data.foodLust;
            maxMeal.val = data.maxMeal;
            for (const upgrade of data.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            for (const meal of data.meals) getOrCreateState(meals, meal.id, {}).val = meal;

            reconcileSpices(data.spices.map(({ spice }) => spice).join("|"), () =>
                data.spices.map(({ spice }, n) =>
                    div(
                        // Only the spices a switched-on upgrade pays with.
                        {
                            hidden: () =>
                                !data.upgrades.some(
                                    (upgrade) => upgrade.spice === spice && isOn("kitchens", upgrade.id)
                                ),
                        },
                        SettingRow({
                            setting: saving,
                            index: spice,
                            name: spiceName(spice),
                            title: "% of goal",
                            detail: () => (spices.val[n] ? spiceLine(spices.val[n]) : ""),
                            column: KITCHEN_COLUMNS.stopAt,
                        })
                    )
                )
            );
            const kitchens = Math.ceil(data.upgrades.length / 3);
            reconcileKitchens(String(kitchens), () =>
                Array.from({ length: kitchens }, (_, k) =>
                    AccountSection({
                        title: `Kitchen ${k + 1}`,
                        body: [0, 1, 2].map((slot) => KitchenRow({ id: 3 * k + slot })),
                    })
                )
            );
            reconcileMeals(data.meals.map(({ id }) => id).join("|"), () =>
                data.meals.map(({ id, name }) => MealRow({ id, name: cleanName(name) }))
            );
            if (!mealSwitch.firstChild)
                mealSwitch.append(AutomationRow({ entry: automation, onSwitched: tab.load, column: MEAL_COLUMNS.on }));
            ids.kitchens.val = data.upgrades.map(({ id }) => String(id));
            ids.meals.val = data.meals.map(({ id }) => String(id));
        },
    });
    const [automation] = tab.entries;
    // Switching an item on switches Cooking on too (now and at start), in the same save; after every save the tab
    // reads the game again, so the spice lines follow.
    const picks = {
        kitchens: createAutomationPicks("kitchens", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave }),
        meals: createAutomationPicks("meals", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave }),
    };
    const saving = createAutomationSetting("kitchenSaving", { afterSave: tab.afterSave });

    // Enable all and Disable all cover the open sub-tab; Disable all asks in the tray first.
    const open = () => TABS.find(({ id }) => id === activeTab.val);
    const bulk = usePicksBulk({
        targets: () => [[picks[activeTab.val], ids[activeTab.val].val]],
        // With every item on it still has work while Cooking is off now or at start: switching Cooking on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        words: () => open().words,
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const busy = () => tab.loading.val || bulk.busy();
    const isAnyOn = (name) => ids[name].val.some((id) => isOn(name, id));

    // Each tab is its own table. The kitchens' tab has Cooking's switch and the spices first; the meals' tab its own
    // copy of the switch, made once the first read found the automation.
    const kitchensBody = [
        AccountSection({
            title: "Settings",
            body: [
                tab.switches,
                div(
                    { hidden: () => isAnyOn("kitchens") || !ids.kitchens.val.length },
                    AccountRow({
                        info: span({ class: "automation-row__status" }, "No kitchen upgrade is switched on"),
                    })
                ),
                spiceList,
            ],
        }),
        KITCHEN_COLUMNS.head("Kitchen"),
        kitchenList,
    ];
    const mealsBody = [AccountSection({ title: "Settings", body: mealSwitch }), MEAL_COLUMNS.head("Meal"), mealList];

    tab.load();

    return AutomationPage({
        description: "Levels switched-on kitchen upgrades with spice and meals with themselves.",
        // While Food Lust stacks are held, any meal level-up spends them all, so the priciest meal goes first.
        total: AutomationStats(() =>
            activeTab.val === "meals" && foodLust.val > 0
                ? [
                      [formatNumber(foodLust.val), `Food Lust ${foodLust.val === 1 ? "stack" : "stacks"}`],
                      ["", "priciest meal first"],
                  ]
                : []
        ),
        tabs: [
            { ...TABS[0], columns: KITCHEN_COLUMNS, bulk, body: kitchensBody },
            { ...TABS[1], columns: MEAL_COLUMNS, bulk, body: mealsBody },
        ],
        activeId: activeTab,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        what: "cooking",
    });
};

export default definePage({
    id: "w4.cooking.automation",
    world: 4,
    system: "Cooking",
    tab: "Automation",
    description: "Kitchen upgrades and meals levelled automatically, each up to its stop-at.",
    keywords: ["Autobuy", "Auto buy", "Kitchens", "Meals", "Spices", "Food Lust", "Stop at", "Save for it", "Priority"],
    component: CookingAutomationTab,
});
