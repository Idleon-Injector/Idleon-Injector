/**
 * W4 cooking: kitchen upgrades (Speed, Fire, Luck) paid with spices, and meal levels paid with each meal's own
 * quantity. Neither has a buy the game lets us call (both clicks are mouse-gated and buy inline), so each buy copies
 * the click's steps, minus the menu art it draws.
 *
 * Kitchen k's upgrades are ids 3k + slot (0 Speed, 1 Fire, 2 Luck): level Cooking[k][6 + slot], paid with spice
 * Meals[3][CookingUpgSpiceCostType], so neighbouring kitchens share a spice. Each spice saves and buys on its own
 * (High / Low / Balanced, saving % per spice). There is no max level, so the stop-at is the cap.
 *
 * Meals: level Meals[0][i] (0 until discovered), quantity Meals[2][i], one max level for all. Food Lust stacks
 * (OLA[193], up to Dream[11]) discount every meal, and any level-up spends them all, so while stacks are held the
 * priciest affordable meal buys first; otherwise the cheapest.
 *
 * Settings: cheatConfig.automation.kitchens [{ id, on, stopAt, priority }], .kitchenSaving (a % per spice) and
 * .meals [{ id, on, stopAt }].
 */

import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { buyCheapestFirst, inMap, nextGoal } from "./engine.js";

const cooking = (...args) => events(345)._customBlock_CookingR(...args);
const spiceOf = (id) => cooking("CookingUpgSpiceCostType", Math.floor(id / 3), id % 3);
const kitchenLevel = (id) => gga.Cooking[Math.floor(id / 3)][6 + (id % 3)];
const kitchenCost = (id) => cooking("CookingUpgSpiceCostQty", Math.floor(id / 3), id % 3);
// Cooking[k][0] is 0 until the kitchen is bought with coins.
const kitchenOwned = (id) => Number(gga.Cooking[Math.floor(id / 3)]?.[0] ?? 0) !== 0;
const maxMeal = () => cooking("CookingMealMaxLVlol", 0, 0);
const mealCost = (i) => cooking("CookingMenuMealCosts", i, 0);
// The stacks CookingMenuMealCosts applies: OLA[193], capped by Equinox Food Lust's level.
const foodLust = () => Math.min(gga.OptionsListAccount[193], gga.Dream[11]);
// A level may be bought while the next one stays within the stop-at (a fraction from config.custom.js included).
const belowStopAt = (level, stopAt) => level + 1 <= (stopAt ?? Infinity);

let bought = 0; // levels bought since the automation turned on

// The kitchen click (Cooking2 "q") without its level bar art; the caller checked the spice covers it.
function buyKitchen(id) {
    const k = Math.floor(id / 3);
    const slot = id % 3;
    gga.Meals[3][spiceOf(id)] -= kitchenCost(id);
    gga.Cooking[k][6 + slot] = Math.round(gga.Cooking[k][6 + slot] + 1);
    if (gga.Cooking[k][6 + slot] >= 300) events(345)._customBlock_Reg_ach_add_status(226, 10);
    bought++;
}

// The meal menu click without its "j" menu art redraw; affordableMeals checked the quantity and the max.
function buyMeal(i) {
    gga.Meals[2][i] -= mealCost(i);
    gga.Meals[0][i] += 1;
    gga.OptionsListAccount[193] = 0;
    // MealBonus reads a cache only this rebuilds.
    events(124)._customBlock_TalentCalc(-6);
    if (gga.QuestComplete.h.Oinkin1 === 0)
        gga.QuestStatus.h.Oinkin1[0] = gga.Meals[0].slice(0, 10).filter((level) => level >= 2).length;
    const level = gga.Meals[0][i];
    if (level >= 22) events(345)._customBlock_Reg_ach_add_status(233, 2);
    else if (level >= 16) events(345)._customBlock_Reg_ach_add_status(232, 2);
    else if (level >= 11) events(345)._customBlock_Reg_ach_add_status(231, 2);
    if (i === Number(cList.RANDOlist[63][gga.Tasks[1][3][1]]))
        events(266)._customBlock_TaskProgress(3, 1, "total", level);
    bought++;
}

/** The switched-on kitchen upgrades spice `spice` may buy now: owned kitchens below their stop-at. */
function kitchenItems(spice) {
    return cheatConfig.automation.kitchens.flatMap(({ id, on, stopAt, priority }) => {
        const n = Number(id);
        if (!on || !kitchenOwned(n) || spiceOf(n) !== spice || !belowStopAt(kitchenLevel(n), stopAt)) return [];
        return [{ id: n, cost: kitchenCost(n), priority, buy: () => buyKitchen(n) }];
    });
}

/** The switched-on meals that can level now: discovered, below the max and the stop-at, and affordable. */
function affordableMeals() {
    const max = maxMeal();
    return cheatConfig.automation.meals.flatMap(({ id, on, stopAt }) => {
        const i = Number(id);
        const level = gga.Meals[0][i];
        if (!on || !(level > 0) || level >= max || !belowStopAt(level, stopAt)) return [];
        const cost = mealCost(i);
        return gga.Meals[2][i] >= cost ? [{ id: i, cost }] : [];
    });
}

// One saving % per spice; a spice past the list saves config.js's default.
const savingOf = (spice) => cheatConfig.automation.kitchenSaving[spice] ?? 10;
// The spices the switched-on upgrades pay with.
const spicesInUse = () =>
    new Set(cheatConfig.automation.kitchens.filter(({ on }) => on).map(({ id }) => spiceOf(Number(id))));

export const startCooking = () => {
    bought = 0;
};

export function runCooking() {
    if (!inMap()) return;
    for (const spice of spicesInUse())
        buyCheapestFirst(
            () => kitchenItems(spice),
            () => gga.Meals[3][spice],
            savingOf(spice)
        );
    // ponytail: cap per tick so a buy the game ignores can't spin forever; leftovers wait for the next tick.
    for (let n = 0; n < 100; n++) {
        const meals = affordableMeals();
        if (!meals.length) return;
        const priciest = foodLust() > 0;
        buyMeal(
            meals.reduce((best, meal) => ((priciest ? meal.cost > best.cost : meal.cost < best.cost) ? meal : best)).id
        );
    }
}

export function cookingStatus() {
    const count = (list, one) => {
        const on = list.filter((entry) => entry.on).length;
        return on ? [`${on} ${one}${on === 1 ? "" : "s"}`] : [];
    };
    const levelling = [
        ...count(cheatConfig.automation.kitchens, "kitchen upgrade"),
        ...count(cheatConfig.automation.meals, "meal"),
    ].join(" and ");
    if (!levelling) return "No kitchen upgrade or meal is switched on";
    if (!inMap()) return "Waiting for a character to be in game";
    if (!bought) return `Levelling ${levelling}`;
    return `Levelling ${levelling}; ${bought === 1 ? "1 level" : `${bought} levels`} bought since it started`;
}

/** Every kitchen upgrade and meal with what the Cooking › Automation tab shows, and each spice's goal. */
export function getAutomationCooking() {
    const max = maxMeal();
    const upgrades = gga.Cooking.flatMap((_, k) =>
        [0, 1, 2].map((slot) => {
            const id = 3 * k + slot;
            return {
                id,
                kitchen: k,
                slot,
                spice: spiceOf(id),
                level: kitchenLevel(id),
                cost: kitchenCost(id),
                owned: kitchenOwned(id),
                // The kitchen panel's own numbers: Speed and Fire per hour, Luck a multiplier.
                bonus: cooking(["CookingSPEED", "CookingFIRE", "CookingLUCK"][slot], k, 0),
            };
        })
    );
    const spices = [...new Set(upgrades.map(({ spice }) => spice))].sort((a, b) => a - b);
    return {
        spices: spices.map((spice) => {
            const goal = nextGoal(kitchenItems(spice));
            return {
                spice,
                owned: gga.Meals[3][spice],
                goal: goal && { id: goal.id, cost: goal.cost },
            };
        }),
        upgrades,
        foodLust: foodLust(),
        maxMeal: max,
        meals: cList.MealINFO.map((info, i) => {
            const level = gga.Meals[0][i];
            return {
                id: i,
                name: info[0],
                // The meal menu's bonus line: its "{" stands for the value.
                description: info[3],
                bonus:
                    info[5] === "PxLine"
                        ? level * info[2]
                        : cooking("CookingMealBonusMultioo", 0, 0) *
                          events(579)._customBlock_Summoning2("BonusMultiCook", i, 0) *
                          events(579)._customBlock_Summoning("RibbonBonus", gga.Ribbon[28 + i], 0) *
                          level *
                          info[2],
                level,
                owned: gga.Meals[2][i],
                cost: mealCost(i),
            };
        }),
    };
}
