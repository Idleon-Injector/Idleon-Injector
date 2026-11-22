/**
 * The buying rule every automation shares.
 *
 * A system hands in the items that may be bought right now (switched on, unlocked, below their stop-at), each as
 * { cost, save, buy }; `save` is the item's "Save for it" switch. Buys pay whatever the game charges.
 */

import { bEngine, cList, gga } from "../../core/globals.js";

/**
 * The game's number style, as the page's formatNumber writes it (game code can't import page code): 3 digits with K, M,
 * B, T, Q, QQ, QQQ, then 1.23E27.
 */
const SUFFIXES = ["", "K", "M", "B", "T", "Q", "QQ", "QQQ"];
export const notate = (n) => {
    const tier = n < 1000 ? 0 : Math.floor(Math.log10(n) / 3);
    if (tier === 0) return String(Math.ceil(n));
    if (tier >= SUFFIXES.length) return n.toExponential(2).toUpperCase().replace("E+", "E");
    return parseFloat((n / 1000 ** tier).toPrecision(3)) + SUFFIXES[tier];
};

/** The game's CommaNotation: thousands parted by commas, at most two decimals. */
export const comma = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const cheapest = (items) => items.reduce((best, item) => (!best || item.cost < best.cost ? item : best), null);

/**
 * The next level stays within the stop-at (none: no limit). It checks the level a buy would reach, so a stop-at with
 * a fraction (2.5, typed into the config file) stops at 2, not 3.
 */
export const belowStopAt = (level, stopAt) => level + 1 <= (stopAt ?? Infinity);

/** A character is in its map; character select has no player, so nothing buys there. */
export const inMap = () => bEngine.scene.name === cList.MapName[gga.CurrentMap];

/** What the system is saving for: the cheapest item with "Save for it" on. */
export const nextGoal = (items) => cheapest(items.filter((item) => item.save));

/**
 * The cheapest saved-for item is the goal, bought once affordable. While saving for it, at least (100 − `saving`)% of
 * its cost stays put, and only the money above that buys the other items, cheapest first. It is a floor on what is
 * held, not a running total: income above the floor keeps buying them (#214: with a % per buy instead, Orion spent
 * 1.73T feathers down to 131B before saving started). Without a goal it is plain cheapest-first.
 */
export function choosePurchase(items, money, saving) {
    const goal = nextGoal(items);
    if (goal && goal.cost <= money) return goal;

    const keep = goal ? (goal.cost * (100 - saving)) / 100 : 0;
    const limit = money - keep;
    return cheapest(items.filter((item) => !item.save && item.cost <= limit));
}

/**
 * Buy until nothing qualifies, re-reading after every buy because one can change everything (resets).
 * @returns {number} how many buys it made
 */
export function buyCheapestFirst(readItems, readMoney, saving = 0) {
    // ponytail: cap per tick so a buy the game ignores can't spin forever; leftovers wait for the next tick.
    for (let i = 0; i < 100; i++) {
        const pick = choosePurchase(readItems(), readMoney(), saving);
        if (!pick) return i;
        pick.buy();
    }
    return 100;
}
