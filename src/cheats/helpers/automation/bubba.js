/**
 * Bubba (W7): switched-on upgrades are bought with meat through Bubba's own buy event, by the shared rule
 * ("Save for it", saving %), each up to its stop-at.
 *
 * Bubba[0][0] is meat, Bubba[0][4] meat made this run, Bubba[1][i] upgrade levels; cList.BubbaUpg[i][4] is the max
 * level (999 is none). Settings: cheatConfig.automation.bubba, one { id, on, stopAt, save } per upgrade, and
 * cheatConfig.automation.bubbaSaving, how much of what it saves for the other upgrades may cost, in %.
 */

import { behavior, cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { belowStopAt, buyCheapestFirst, comma, inMap, nextGoal, notate } from "./engine.js";

let bought = 0; // levels bought since the automation turned on

const bubbastuff = (...args) => events(579)._customBlock_Bubbastuff(...args);
// Bubba's menu behavior; its buy event works with the menu closed.
const seal = () => gga.PixelHelperActor[26].behaviors.getBehavior("ActorEvents_713");
const maxLevel = (row) => (Number(row[4]) === 999 ? Infinity : Number(row[4]));
const unlocked = (i) => gga.Bubba[0][4] >= bubbastuff("MeatProdREQ", i, 0);
const label = (i) => String(cList.BubbaUpg[i][0]).replace(/_/g, " ");

// The buy event draws menu art (dice, smoked meat, ...) onto the screen even with the menu closed. Remove what it
// attached the way the event itself does; an open menu (94) keeps its art.
const clearSealArt = () => {
    if (gga.MenuType2 === 94) return;
    const { _UIinventory16: images, _UIinventory16On: shown } = seal();
    for (const slot of [86, 87, 88, 89, 90, 91, 94, 95]) {
        if (Array.isArray(shown[slot])) {
            shown[slot].forEach((on, i) => {
                if (on !== 1) return;
                behavior.removeImage(images[slot][i]);
                shown[slot][i] = 0;
            });
        } else if (shown[slot] === 1) {
            behavior.removeImage(images[slot]);
            shown[slot] = 0;
        }
    }
};

const buy = (i) => {
    const before = gga.Bubba[1][i];
    const ui = seal();
    ui._TRIGGEREDtext = `Z${i}`;
    ui._customEvent_Bubbathings();
    clearSealArt();
    // Meat income reads a cached level total that only refreshes while the menu is open.
    bubbastuff("TotalQTYofLVs", 0, 99);
    // The event can refuse (the meat moved since the price was read): only a level that went up counts.
    if (gga.Bubba[1][i] > before) bought++;
};

/** Why buying has to wait right now, or null. */
const waiting = () => {
    if (!bubbastuff("BubbaUnlocked", 0, 0)) return "Bubba isn't unlocked yet";
    // The menu blocks buying until the run's gift is picked; the buy event doesn't, so wait here.
    return bubbastuff("DoWeNeedToSelectGift", 0, 0) ? "Waiting for you to pick a gift" : null;
};

function buyable() {
    const settings = new Map(cheatConfig.automation.bubba.map((entry) => [String(entry.id), entry]));
    return cList.BubbaUpg.flatMap((row, i) => {
        const entry = settings.get(String(i));
        const level = gga.Bubba[1][i];
        if (!entry?.on || !unlocked(i) || !belowStopAt(level, entry.stopAt) || level >= maxLevel(row)) return [];
        return [{ id: i, cost: bubbastuff("UpgCost", i, 0), save: Boolean(entry.save), buy: () => buy(i) }];
    });
}

/** Meat, the goal and every upgrade, for Account › Clickers › Automation › Bubba. */
// An upgrade's first line in Bubba's menu (BubbaUpg[i][7] up to its first "@" break), filled in as the menu does from
// TotUpgBonus. A clause left with a mark the menu fills from elsewhere ($, ~) is cut at its comma.
const BARGAINS = [4, 18, 26];
function bonusOf(row, i) {
    const total = bubbastuff("TotUpgBonus", i, 0);
    const multiplier = parseFloat((1 + total / 100).toFixed(2));
    let text = String(row[7]).split("_@_")[0];
    text = text.split("{").join(total < 1e6 ? comma(total) : notate(total));
    // "}x" already carries its x ("}" alone doesn't), so it goes first; "2xx" otherwise.
    text = text.split("}x").join(`${multiplier}x`).split("}").join(`${multiplier}x`);
    if (BARGAINS.includes(i)) text = text.split("$").join(String(Math.floor(1e4 * (1 - 1 / (1 + total / 100))) / 100));
    if (i === 5)
        text = text.split("$").join(String(Math.round(100 * bubbastuff("DailyPet_HappinessFromUpg", 0, 0)) / 100));
    const open = text.search(/[$~]/);
    if (open >= 0 && text.lastIndexOf(",", open) > 0) text = text.slice(0, text.lastIndexOf(",", open));
    return text.replace(/_/g, " ");
}

export function getAutomationBubba() {
    const wait = waiting();
    const goal = wait ? null : nextGoal(buyable());
    return {
        waiting: wait,
        meat: gga.Bubba[0][0],
        goal: goal && { id: goal.id, cost: goal.cost },
        upgrades: cList.BubbaUpg.map((row, i) => ({
            id: i,
            name: row[0],
            level: gga.Bubba[1][i],
            max: Number.isFinite(maxLevel(row)) ? maxLevel(row) : null,
            cost: bubbastuff("UpgCost", i, 0),
            unlockAt: bubbastuff("MeatProdREQ", i, 0),
            unlocked: unlocked(i),
            bonus: bonusOf(row, i),
        })),
    };
}

export const startBubba = () => {
    bought = 0;
};

/** One tick: buy what qualifies while a character is in game and Bubba isn't waiting for the run's gift. */
export function runBubba() {
    if (!inMap() || !cheatConfig.automation.bubba.some((entry) => entry.on) || waiting()) return;
    buyCheapestFirst(buyable, () => gga.Bubba[0][0], cheatConfig.automation.bubbaSaving);
}

export function bubbaStatus() {
    if (!cheatConfig.automation.bubba.some((entry) => entry.on)) return "No upgrade is switched on";
    if (!inMap()) return "Waiting for a character to be in game";
    const wait = waiting();
    if (wait) return wait;
    const goal = nextGoal(buyable());
    const doing = goal ? `Saving for ${label(goal.id)}` : "Buying cheapest first";
    if (!bought) return doing;
    return `${doing}; ${bought === 1 ? "1 level" : `${bought} levels`} bought since it started`;
}
