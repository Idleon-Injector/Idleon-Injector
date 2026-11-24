/**
 * What the masterclass automations share (Grimoire, Compass, Tesseract, Royal Armory): switched-on upgrades are bought
 * with the class's currencies (bones, dust, tachyons, royal resources), each currency saving and buying on its own by
 * the shared rule, with one saving % per class, up to each stop-at and max level.
 *
 * A class hands in its game:
 *   key          its settings: cheatConfig.automation[key], one { id, on, stopAt, save } per upgrade, and [key + "Saving"]
 *   currencies   the currency names, in the game's order
 *   upgrades()   the upgrade ids, the game's placeholders left out
 *   name(i), level(i), max(i), cost(i), currency(i), bonus(i)
 *   open(i)      whether the menu would let the upgrade be clicked now (unlocked, shown)
 *   buy(i)       the menu click: it checks again, then pays; returns true when it bought a level
 *   owned(c)     what is held of currency c
 *   paused()     why it waits, if it does (a menu that must be closed)
 *   extra(i)     more of an upgrade for the page (what unlocks it)
 */

import { cheatConfig } from "../../core/state.js";
import { belowStopAt, buyCheapestFirst, comma, inMap, nextGoal, notate } from "./engine.js";

const NO_MAX = 999999;

/**
 * A line of the game's ("+{%_Total_Damage", "}x_Drop_Rate") with its bonus filled in as the menus do: { the value,
 * } the multiplier it makes.
 */
export function fillLine(line, value) {
    const small = value < 1e9;
    let multiplier = notate(1 + value / 100);
    if (small)
        multiplier = value < 1e3 ? `${parseFloat((1 + value / 100).toFixed(2))}x` : comma(Math.floor(1 + value / 100));
    return String(line)
        .split("{")
        .join(small ? comma(value) : notate(value))
        .split("}")
        .join(multiplier)
        .replace(/_/g, " ");
}

/** The part of a game line ("…_@_+{%_Tempest_Damage") that holds its number, filled in; "" when none does. */
export const bonusPart = (line, value) => {
    const part = String(line)
        .split("_@_")
        .find((piece) => /[{}]/.test(piece));
    return part ? fillLine(part, value) : "";
};

export function masterclass(game) {
    const { key, currencies, upgrades, level, max, cost, currency, open, buy, owned } = game;
    const paused = game.paused ?? (() => null);
    let bought = 0; // levels bought since the automation turned on

    const settings = () => new Map(cheatConfig.automation[key].map((entry) => [String(entry.id), entry]));

    /** The switched-on upgrades of currency c that may buy a level now. */
    const upgradesFor = (c) => {
        const picks = settings();
        return upgrades().flatMap((i) => {
            const entry = picks.get(String(i));
            if (!entry?.on || currency(i) !== c || !open(i)) return [];
            if (level(i) >= max(i) || !belowStopAt(level(i), entry.stopAt)) return [];
            return [{ id: i, cost: cost(i), save: Boolean(entry.save), buy: () => buy(i) && bought++ }];
        });
    };

    return {
        upgradesFor,
        start: () => {
            bought = 0;
        },
        /** One tick: each currency buys on its own, with the one saving % they share. */
        run: () => {
            if (!inMap() || paused()) return;
            const saving = cheatConfig.automation[`${key}Saving`];
            const picks = settings();
            // Only the currencies a switched-on upgrade pays with (the Armory has 70).
            const used = new Set(upgrades().flatMap((i) => (picks.get(String(i))?.on ? [currency(i)] : [])));
            for (const c of used)
                buyCheapestFirst(
                    () => upgradesFor(c),
                    () => owned(c),
                    saving
                );
        },
        /** How many are switched on, or why nothing buys; then what was bought since it started. */
        status: (what = ["upgrade", "upgrades"]) => {
            const on = cheatConfig.automation[key].filter((entry) => entry.on).length;
            if (!on) return `No ${what[0]} is switched on`;
            if (!inMap()) return "Waiting for a character to be in game";
            const reason = paused();
            if (reason) return reason;
            const buying = `Buying ${on === 1 ? `1 ${what[0]}` : `${on} ${what[1]}`}`;
            if (!bought) return buying;
            return `${buying}; ${bought === 1 ? "1 level" : `${bought} levels`} bought since it started`;
        },
        /** The currencies (held, and what each saves for) and every upgrade, for the Masterclasses page. */
        read: () => ({
            // The currencies some upgrade pays with, in the game's order.
            currencies: [...new Set(upgrades().map(currency))]
                .sort((a, b) => a - b)
                .map((c) => {
                    const goal = nextGoal(upgradesFor(c));
                    return { name: currencies[c], owned: owned(c), goal: goal && { id: goal.id, cost: goal.cost } };
                }),
            upgrades: upgrades().map((i) => ({
                id: i,
                name: game.name(i),
                currency: currencies[currency(i)],
                level: level(i),
                max: max(i) >= NO_MAX ? null : max(i),
                cost: cost(i),
                open: Boolean(open(i)),
                bonus: game.bonus(i),
                ...game.extra?.(i),
            })),
        }),
    };
}
