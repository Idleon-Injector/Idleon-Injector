/**
 * Clickers: Orion the owl (W1), and Poppy the kangaroo with her Tar Pit (W2). Switched-on upgrades are bought through
 * the owl menu's own buy event, which checks the price and takes it, so every level is paid for in feathers or fish.
 *
 * Settings: cheatConfig.automation[key], one { id, on, stopAt, priority } per upgrade row (stopAt is a level), and
 * cheatConfig.automation[`${key}Saving`], how much of what it saves for Balanced upgrades may cost, in %.
 */

import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { buyCheapestFirst, inMap, nextGoal } from "./engine.js";

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
        buy: buyWith("h"),
        waiting: () => !poppyOpen() && "Waiting for Poppy's menu to be open",
    },
};

export const CLICKER_KEYS = Object.keys(CLICKERS);

const bought = Object.fromEntries(CLICKER_KEYS.map((key) => [key, 0])); // levels bought since each turned on

const unlocked = (clicker, i, row) =>
    clicker.isUnlocked ? clicker.isUnlocked(i) : clicker.progress() >= clicker.unlockAt(i, row);
const label = (row) => String(row[0]).replace(/_/g, " ");
// The game's number style, as the page's formatNumber writes it (game code can't import page code):
// 3 digits with K, M, B, T, Q, QQ, QQQ, then 1.23E27.
const SUFFIXES = ["", "K", "M", "B", "T", "Q", "QQ", "QQQ"];
const notate = (n) => {
    const tier = n < 1000 ? 0 : Math.floor(Math.log10(n) / 3);
    if (tier === 0) return String(Math.ceil(n));
    if (tier >= SUFFIXES.length) return n.toExponential(2).toUpperCase().replace("E+", "E");
    return parseFloat((n / 1000 ** tier).toPrecision(3)) + SUFFIXES[tier];
};

/** The upgrades that may be bought now: switched on, unlocked, below their stop-at, and allowed by the game. */
function buyable(key) {
    const clicker = CLICKERS[key];
    const settings = new Map(cheatConfig.automation[key].map((entry) => [String(entry.id), entry]));
    return clicker.rows().flatMap((row, i) => {
        const entry = settings.get(String(i));
        if (!entry?.on || !unlocked(clicker, i, row) || clicker.level(i) >= (entry.stopAt ?? Infinity)) return [];
        if (clicker.canBuy?.(i) === false) return [];
        return [
            { id: i, name: label(row), cost: clicker.cost(i), priority: entry.priority, buy: () => clicker.buy(i) },
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
        })),
    };
}

export const startClicker = (key) => () => {
    bought[key] = 0;
};

/** One tick: buy what qualifies, saving for the cheapest High or Low upgrade (see engine.js). */
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
