/**
 * Clickers: Orion the owl (W1), and Poppy the kangaroo with her Tar Pit (W2). Switched-on upgrades are bought through
 * the owl menu's own buy event, which checks the price and takes it, so every level is paid for in feathers or fish.
 *
 * Settings: cheatConfig.automation[key], one { id, on, stopAt, save } per upgrade row (stopAt is a level), and
 * cheatConfig.automation[`${key}Saving`], how much of what it saves for the other upgrades may cost, in %.
 */

import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { belowStopAt, buyCheapestFirst, comma, inMap, nextGoal, notate } from "./engine.js";

const ola = () => gga.OptionsListAccount;
const summoning = (...args) => events(579)._customBlock_Summoning(...args);
// Orion and Poppy share the owl menu's behavior; its buy event reads "a<i>" (Orion), "b<i>" (Poppy) or "h<i>" (Tar Pit).
// It works with the menu closed, but skips the unlock check, so only unlocked rows are handed to it.
const owl = () => gga.PixelHelperActor[25].behaviors.getBehavior("ActorEvents_670");
const buyWith = (letter) => (i) => {
    const menu = owl();
    menu._TRIGGEREDtext = `${letter}${i}`;
    menu._customEvent_OwlStuffz();
};
// Poppy's fish only land while her menu is open; closed they wait in a timer, so her upgrades wait too.
const poppyOpen = () => gga.MenuType2 === 65;

const CLICKERS = {
    // OLA 253 feathers, 254 + i levels, 263 feathers produced this run. Owlz rows 0-8; 4 = Feather Restart, 8 = Mega Reset.
    orion: {
        rows: () => cList.Owlz.slice(0, 9),
        money: () => ola()[253],
        rate: () => summoning("OwlFeatherRate", 0, 0),
        level: (i) => ola()[254 + i],
        cost: (i) => summoning("OwlCost", i, 0),
        unlockAt: (i, row) => (i === 0 ? 0 : Number(row[3])),
        progress: () => ola()[263],
        // The shop's line for the upgrade, as the owl menu fills it in.
        bonus: (i, row) => {
            const level = ola()[254 + i];
            const restart = Math.round(3 + 2 * summoning("OwlMegafeather", 6, 0)) ** (ola()[258] + 1);
            const cheaper = (percent) => String(Math.floor(1e4 * (1 - 1 / (1 + percent / 100))) / 100);
            let text = fill(row[5], {
                "{": notate(restart),
                "}": notate(ORION_PER_LEVEL[i] * level),
                "@": cheaper(10 * level),
            });
            const megafeather = summoning("OwlMegafeather", 2, 0);
            if (i === 0 && megafeather === 1) text += `, and lowers all costs by ${cheaper(megafeather * level)}%`;
            return text;
        },
        buy: buyWith("a"),
    },
    // OLA 267 fish, 268 + i levels, 280 fish caught this run. Owlz rows 9-20; 6 = Fisheroo Reset, 11 = Greatest Catch.
    poppy: {
        rows: () => cList.Owlz.slice(9, 21),
        money: () => ola()[267],
        level: (i) => ola()[268 + i],
        cost: (i) => summoning("RooCost", i, 0),
        unlockAt: (i, row) => (i === 0 ? 0 : Number(row[3])),
        progress: () => ola()[280],
        // The game refuses both resets mid shiny catch.
        canBuy: (i) => (i !== 6 && i !== 11) || owl()._GenINFO[22] === 0,
        bonus: (i, row) => rooBonus(row, ola()[268 + i]),
        buy: buyWith("b"),
        waiting: () => !poppyOpen() && "Waiting for Poppy's menu to be open",
    },
    // OLA 296 tartar fish, 297 + i levels. Owlz rows 21-28; RooTarOwned of them are open (it grows with megafish).
    tarpit: {
        rows: () => cList.Owlz.slice(21, 29),
        money: () => ola()[296],
        level: (i) => ola()[297 + i],
        cost: (i) => summoning("RooCost_T", i, 0),
        unlockAt: () => null,
        isUnlocked: (i) => i < summoning("RooTarOwned", 0, 0),
        bonus: (i, row) => rooBonus(row, ola()[297 + i]),
        buy: buyWith("h"),
        waiting: () => !poppyOpen() && "Waiting for Poppy's menu to be open",
    },
};

export const CLICKER_KEYS = Object.keys(CLICKERS);

const bought = Object.fromEntries(CLICKER_KEYS.map((key) => [key, 0])); // levels bought since each turned on

const unlocked = (clicker, i, row) =>
    clicker.isUnlocked ? clicker.isUnlocked(i) : clicker.progress() >= clicker.unlockAt(i, row);
// The game writes spaces as "_" and line breaks as "|".
const label = (row) => String(row[0]).replace(/[_|]/g, " ");
// What each Orion level adds to its line's "}" (Owlz rows 0-8), as the owl menu has it.
const ORION_PER_LEVEL = [1, 0, 5, 10, 0, 5, 1, 20, 0];
// The game's text with each placeholder replaced everywhere, as its StringTools.replace does, and spaces for "_".
const fill = (text, values) =>
    Object.entries(values)
        .reduce((out, [mark, value]) => out.split(mark).join(value), String(text))
        .replace(/_/g, " ");
// Small amounts as the game's "Small" notation writes them: at most two decimals.
const small = (n) => (n < 1000 ? String(Math.round(100 * n) / 100) : notate(n));
// Poppy's and the Tar Pit's lines: Owlz[row][6] is what a level adds (the fish menu's own formulas).
const rooBonus = (row, level) => {
    const amount = level * Number(row[6]);
    return fill(row[5], {
        "{": comma(amount),
        "]": String(Math.round(100 + amount) / 100),
        "~": small(100 * (1 - 1 / (1 + amount / 100))),
        "?": small(Number(row[6]) * (level / (40 + level))),
    });
};

/** The upgrades that may be bought now: switched on, unlocked, below their stop-at, and allowed by the game. */
function buyable(key) {
    const clicker = CLICKERS[key];
    const settings = new Map(cheatConfig.automation[key].map((entry) => [String(entry.id), entry]));
    return clicker.rows().flatMap((row, i) => {
        const entry = settings.get(String(i));
        if (!entry?.on || !unlocked(clicker, i, row) || !belowStopAt(clicker.level(i), entry.stopAt)) return [];
        if (clicker.canBuy?.(i) === false) return [];
        return [
            { id: i, name: label(row), cost: clicker.cost(i), save: Boolean(entry.save), buy: () => clicker.buy(i) },
        ];
    });
}

/** One clicker's currency and upgrades, for its Automation tab. */
export function getAutomationClicker(key) {
    const clicker = CLICKERS[key];
    return {
        money: clicker.money(),
        rate: clicker.rate?.() ?? null,
        upgrades: clicker.rows().map((row, i) => ({
            id: i,
            name: row[0],
            level: clicker.level(i),
            cost: clicker.cost(i),
            unlockAt: clicker.unlockAt(i, row),
            unlocked: unlocked(clicker, i, row),
            bonus: clicker.bonus(i, row),
        })),
    };
}

export const startClicker = (key) => () => {
    bought[key] = 0;
};

/** One tick: buy what qualifies, saving for the cheapest saved-for upgrade (see engine.js). */
export const runClicker = (key) => () => {
    if (!inMap() || CLICKERS[key].waiting?.()) return;
    bought[key] += buyCheapestFirst(
        () => buyable(key),
        () => CLICKERS[key].money(),
        cheatConfig.automation[`${key}Saving`]
    );
};

export const clickerStatus = (key) => () => {
    if (!cheatConfig.automation[key].some((entry) => entry.on)) return "No upgrade is switched on";
    if (!inMap()) return "Waiting for a character to be in game";
    const waiting = CLICKERS[key].waiting?.();
    if (waiting) return waiting;
    const goal = nextGoal(buyable(key));
    const doing = goal ? `Saving for ${goal.name} (${notate(goal.cost)})` : "Buying cheapest first";
    const levels = bought[key] === 1 ? "1 level" : `${bought[key]} levels`;
    return bought[key] ? `${doing}; ${levels} bought since it started` : doing;
};
