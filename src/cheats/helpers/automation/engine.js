/**
 * The buying rule every automation shares.
 *
 * A system hands in the items that may be bought right now (switched on, unlocked, below their stop-at), each as
 * { cost, priority, buy }. Priority 1 is High, 2 is Low, anything else Balanced. Buys pay whatever the game charges.
 */

import { bEngine, cList, gga } from "../../core/globals.js";

const HIGH = 1;
const LOW = 2;

const cheapest = (items) => items.reduce((best, item) => (!best || item.cost < best.cost ? item : best), null);

/**
 * The next level stays within the stop-at (none: no limit). It checks the level a buy would reach, so a stop-at with
 * a fraction (2.5, typed into the config file) stops at 2, not 3.
 */
export const belowStopAt = (level, stopAt) => level + 1 <= (stopAt ?? Infinity);

/** A character is in its map; character select has no player, so nothing buys there. */
export const inMap = () => bEngine.scene.name === cList.MapName[gga.CurrentMap];

/** What the system is saving for: the cheapest High or Low item. */
export const nextGoal = (items) => cheapest(items.filter((item) => item.priority === HIGH || item.priority === LOW));

/**
 * An affordable High item goes first. Otherwise the cheapest High or Low item is the goal, bought once
 * affordable; while saving for it, Balanced items may only buy things costing at most `saving`% of it.
 * Without a goal it is plain cheapest-first.
 */
export function choosePurchase(items, money, saving) {
    const high = cheapest(items.filter((item) => item.priority === HIGH && item.cost <= money));
    if (high) return high;

    const goal = nextGoal(items);
    if (goal && goal.cost <= money) return goal;

    const limit = goal ? Math.min(money, (goal.cost * saving) / 100) : money;
    return cheapest(items.filter((item) => item.priority !== HIGH && item.priority !== LOW && item.cost <= limit));
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
