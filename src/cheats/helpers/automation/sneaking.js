/**
 * W6 Sneaking, Ninja Knowledge: switched-on upgrades are bought with jade coins by the shared rule (High / Low /
 * Balanced, saving %), each up to its stop-at. They have no max level.
 *
 * Jade is Ninja[102][1], levels Ninja[103][i], rows cList.NinjaUpg (row 9 is a placeholder). The game has no callable
 * buy, so a buy repeats the Knowledge panel's click (minus its "i" tree redraw, which draws art on screen).
 * Settings: cheatConfig.automation.sneaking = { saving, items: [{ id: "i", on, stopAt, priority }] }.
 */

import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { buyCheapestFirst, inMap, nextGoal } from "./engine.js";

const ninja = (...args) => events(579)._customBlock_Ninja(...args);
const notate = (...args) => events(124)._customBlock_NotateNumber(...args);

let bought = 0; // levels bought since the automation turned on

// Rows 0-16 need their parent (NinjaUpg[i][9], patched at load by mastery; row 13 has none). Later rows need a level
// of the W7 Coral Reef upgrade Spelunk[13][3].
const isUnlocked = (i) =>
    i < 17 ? i === 13 || gga.Ninja[103][cList.NinjaUpg[i][9]] >= 1 : gga.Spelunk[13][3] > i - 17;

function buy(i) {
    // The engine only picks what the jade pays for, at this same price.
    gga.Ninja[102][1] -= ninja("JadeUpgCost", i, 0);
    gga.Ninja[103][i] = Math.round(gga.Ninja[103][i] + 1);
    // Talent 430 counts Knowledge levels and discounts their cost.
    const talents = gga.DNSM.h.CalcTalentMAP;
    talents.h[430] = (Number(talents.h[430]) || 0) + 1;
    if (i === 16) gga.Ninja[102][8] = ninja("NLbonuses", 16, 0); // Star Sweeping: refresh the daily revives
    if (i === 14 && gga.QuestComplete.h.Lafu_Shi3 === 0) gga.QuestStatus.h.Lafu_Shi3[1] = 1;
    bought++;
}

function buyable() {
    const settings = new Map(cheatConfig.automation.sneaking.items.map((entry) => [String(entry.id), entry]));
    return cList.NinjaUpg.flatMap((row, i) => {
        const entry = settings.get(String(i));
        // Row 9, the placeholder, is its own parent, so it never unlocks.
        if (!entry?.on || !isUnlocked(i) || gga.Ninja[103][i] >= (entry.stopAt ?? Infinity)) return [];
        return [{ id: i, cost: ninja("JadeUpgCost", i, 0), priority: entry.priority, buy: () => buy(i) }];
    });
}

// The Knowledge panel's own text: { is the bonus, } its multiplier, # dropped; Menagerie omni levels count on 0-16.
function bonusText(i, row) {
    const value = (gga.Ninja[103][i] + (i < 17 ? gga.Menagerie[7][i] : 0)) * row[5];
    return String(row[6])
        .split("{")
        .join(notate(value, "Big"))
        .split("}")
        .join(notate(1 + value / 100, "MultiplierInfo"))
        .split("#")
        .join("");
}

/** Jade and every upgrade, for World 6 › Sneaking › Automation (what it saves for is in its status). */
export function getAutomationSneaking() {
    return {
        jade: gga.Ninja[102][1],
        upgrades: cList.NinjaUpg.flatMap((row, i) => {
            if (i === 9) return [];
            const parent = Number(row[9]);
            return [
                {
                    id: i,
                    name: row[4],
                    bonus: bonusText(i, row),
                    level: gga.Ninja[103][i],
                    cost: ninja("JadeUpgCost", i, 0),
                    unlocked: isUnlocked(i),
                    // Row i is its own parent until mastery patches it.
                    unlockAt: i < 17 ? { parent: parent === i ? null : cList.NinjaUpg[parent][4] } : { reef: i - 16 },
                },
            ];
        }),
    };
}

export const startSneaking = () => {
    bought = 0;
};

export function runSneaking() {
    if (inMap()) buyCheapestFirst(buyable, () => gga.Ninja[102][1], cheatConfig.automation.sneaking.saving);
}

export function sneakingStatus() {
    if (!cheatConfig.automation.sneaking.items.some((entry) => entry.on))
        return "No Ninja Knowledge upgrade is switched on";
    if (!inMap()) return "Waiting for a character to be in game";
    const goal = nextGoal(buyable());
    const doing = goal
        ? `Saving for ${cList.NinjaUpg[goal.id][4].replace(/_/g, " ")} (${notate(goal.cost, "Big")} jade)`
        : "Buying cheapest first";
    if (!bought) return doing;
    return `${doing}; ${bought === 1 ? "1 level" : `${bought} levels`} bought since it started`;
}
