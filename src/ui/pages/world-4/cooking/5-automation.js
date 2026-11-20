/**
 * World 4 › Cooking › Automation: which kitchen upgrades and meals the cooking automation levels.
 *
 * Kitchens: one section per kitchen (Speed, Fire, Luck), each paid with a spice; every spice saves and buys on its own
 * (High / Low / Balanced and its saving %). Meals: one row per meal, levelled with its own quantity up to the max.
 *
 * Reads readComputed("automation", "cooking") and saves cheatConfig.automation.kitchens (+ kitchenSaving) and .meals.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { fetchConfig, readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationRow,
    PickRow,
    SavingRow,
    createAutomationPicks,
    readAutomations,
    setAtStart,
    switchAutomation,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { renderPersistentPagePanes, renderTabNav } from "../../../components/views/account/tabShared.js";
import { SPICE_NAMES } from "./4-spices.js";

const { div, span } = van.tags;

const CHEAT = "automation cooking";
const SLOTS = ["Speed", "Fire", "Luck"];
const TABS = [
    { id: "kitchens", label: "Kitchens", one: "kitchen upgrade" },
    { id: "meals", label: "Meals", one: "meal" },
];
const spiceName = (spice) => SPICE_NAMES[spice] ?? `Spice ${spice + 1}`;
const kitchenName = (id) => `Kitchen ${Math.floor(id / 3) + 1} ${SLOTS[id % 3]}`;
// Like the kitchen panel, small amounts show whole: what is held rounded down, costs up.
const whole = (value, round) => formatNumber(value < 1e5 ? round(value) : value);
const plural = (count, one) => `${count} ${one}${count === 1 ? "" : "s"}`;

const CookingAutomationTab = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    // Switching an item on switches Cooking on too (now and at start), so levelling starts at once.
    const onTurnedOn = async () => {
        await readSwitch(); // the overview may have switched it since this tab read it
        if (automation.val?.on) return setAtStart(CHEAT, true);
        await switchAutomation(CHEAT, true);
        await readSwitch();
    };
    const picks = {
        kitchens: createAutomationPicks("kitchens", { onTurnedOn, savingKey: "kitchenSaving" }),
        meals: createAutomationPicks("meals", { onTurnedOn }),
    };
    const ids = { kitchens: van.state([]), meals: van.state([]) };
    const upgrades = new Map(); // id -> state of the game's upgrade
    const meals = new Map(); // id -> state of the game's meal
    const spices = van.state([]); // [{ spice, owned, goal }]
    const foodLust = van.state(0);
    const maxMeal = van.state(0);
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const activeTab = van.state("kitchens");
    const { loading, error, run } = useAccountLoad({ label: "Cooking automation" });

    const switchNode = div();
    const spiceList = div({ class: "account-item-stack" });
    const reconcileSpices = createStaticRowReconciler(spiceList);
    const kitchenList = div({ class: "content-stack" });
    const reconcileKitchens = createStaticRowReconciler(kitchenList);
    const mealList = div({ class: "account-item-stack" });
    const reconcileMeals = createStaticRowReconciler(mealList);

    const isOn = (tab, id) => picks[tab].get(String(id)).on.val;
    const spiceLine = ({ owned, goal }) =>
        `${whole(Math.max(0, owned), Math.floor)} held · ${
            goal ? `saving for ${kitchenName(goal.id)} (${whole(goal.cost, Math.ceil)})` : "buying cheapest first"
        }`;

    const KitchenRow = ({ id }) => {
        const upgrade = getOrCreateState(upgrades, id, {});
        return PickRow({
            picks: picks.kitchens,
            id: String(id),
            name: SLOTS[id % 3],
            label: kitchenName(id),
            priority: true,
            badge: () => `LV ${upgrade.val.level ?? 0}`,
            detail: () => {
                const { slot, bonus, owned, cost, spice } = upgrade.val;
                if (!owned) return "Kitchen not bought yet";
                const value = slot === 2 ? `${Math.round(100 * bonus) / 100}x` : `${formatNumber(bonus)}/hr`;
                return `${value} · next level ${whole(cost, Math.ceil)} ${spiceName(spice)}`;
            },
        });
    };

    const MealRow = ({ id, name }) => {
        const meal = getOrCreateState(meals, id, {});
        return PickRow({
            picks: picks.meals,
            id: String(id),
            name,
            badge: () => `LV ${meal.val.level ?? 0} / ${maxMeal.val}`,
            detail: () => {
                const { level, owned, cost, bonus, description } = meal.val;
                if (!(level > 0)) return "Not discovered yet";
                const effect = cleanName(String(description).split("{").join(formatNumber(bonus)));
                const held = `${formatNumber(Math.max(0, owned))} held`;
                return `${effect} · ${held}${level >= maxMeal.val ? "" : ` · next level ${formatNumber(cost)}`}`;
            },
        });
    };

    const load = () =>
        run(async () => {
            // A save that ends while this reads makes the read old.
            const since = { kitchens: picks.kitchens.edits(), meals: picks.meals.edits() };
            const [data, config] = await Promise.all([readComputed("automation", "cooking"), fetchConfig()]);
            await readSwitch();
            const saved = config.cheatConfig.automation;
            picks.kitchens.sync(saved.kitchens, since.kitchens, saved.kitchenSaving);
            picks.meals.sync(saved.meals, since.meals);
            if (!switchNode.firstChild && automation.val)
                switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));

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
                        SavingRow({
                            picks: picks.kitchens,
                            index: spice,
                            name: spiceName(spice),
                            detail: () => (spices.val[n] ? spiceLine(spices.val[n]) : ""),
                        })
                    )
                )
            );
            const kitchens = Math.ceil(data.upgrades.length / 3);
            reconcileKitchens(String(kitchens), () =>
                Array.from({ length: kitchens }, (_, k) =>
                    AccountSection({
                        title: `KITCHEN ${k + 1}`,
                        body: div(
                            { class: "account-item-stack" },
                            [0, 1, 2].map((slot) => KitchenRow({ id: 3 * k + slot }))
                        ),
                    })
                )
            );
            reconcileMeals(data.meals.map(({ id }) => id).join("|"), () =>
                data.meals.map(({ id, name }) => MealRow({ id, name: cleanName(name) }))
            );
            ids.kitchens.val = data.upgrades.map(({ id }) => String(id));
            ids.meals.val = data.meals.map(({ id }) => String(id));
        });

    // Enable all and Disable all cover the open tab; Disable all asks "Click again" first (#25).
    const tab = () => TABS.find(({ id }) => id === activeTab.val);
    const switchedOn = () => ids[activeTab.val].val.filter((id) => isOn(activeTab.val, id)).length;
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                await picks[activeTab.val].setAll(ids[activeTab.val].val, on);
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const isAnyOn = (tab) => ids[tab].val.some((id) => isOn(tab, id));

    const panes = renderPersistentPagePanes({
        tabs: TABS,
        activeId: activeTab,
        renderContent: ({ id }) =>
            id === "kitchens"
                ? [
                      AccountSection({
                          title: "SPICES",
                          body: [
                              div(
                                  { hidden: () => isAnyOn("kitchens") || !ids.kitchens.val.length },
                                  AccountRow({
                                      info: span({ class: "account-row__name" }, "No kitchen upgrade is switched on"),
                                  })
                              ),
                              spiceList,
                          ],
                      }),
                      kitchenList,
                  ]
                : AccountSection({
                      title: "MEALS",
                      note: () =>
                          foodLust.val > 0
                              ? `${plural(foodLust.val, "Food Lust stack")}: the priciest meal goes first`
                              : "",
                      body: mealList,
                  }),
    });

    load();

    return PersistentAccountListPage({
        title: "COOKING AUTOMATION",
        description:
            "Switched-on kitchen upgrades level with their spice, and switched-on meals with their own quantity, up to the stop-at (empty is no limit). Each spice saves and buys on its own: an affordable High goes first, the cheapest High or Low is saved for, and Balanced ones spend within the spice's %. Any meal level-up spends every Food Lust stack, so while you hold some the priciest meal goes first. Switching one on turns Cooking on; kitchens not bought and meals not found yet can be switched on ahead.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    // With every item on it still has work while Cooking itself is off: switching Cooking on.
                    disabled: () =>
                        busy() || (switchedOn() === ids[activeTab.val].val.length && Boolean(automation.val?.on)),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? `1 ${tab().one}` : `all ${plural(switchedOn(), tab().one)}`}.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        subNav: renderTabNav({
            tabs: TABS,
            activeId: activeTab,
            navClass: "account-page-nav",
            buttonClass: "account-page-btn",
        }),
        state: { loading, error },
        loadingText: "READING COOKING",
        errorTitle: "COOKING READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATION", body: switchNode }),
            ...panes
        ),
    });
};

export default definePage({
    id: "w4.cooking.automation",
    world: 4,
    system: "Cooking",
    tab: "Automation",
    description: "Kitchen upgrades and meals levelled automatically, each up to its stop-at.",
    keywords: ["Autobuy", "Auto buy", "Kitchens", "Meals", "Spices", "Food Lust", "Stop at"],
    component: CookingAutomationTab,
});
