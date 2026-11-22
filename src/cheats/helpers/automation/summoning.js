/**
 * W6 Summoning board: switched-on upgrades are bought with essence, each essence colour saving and buying on its own,
 * the way a click on the board buys them. Buying pauses while the board is open (MenuType2 60), so it never fights the
 * player's own clicks. Doubler slots (Holes[28]) stay manual.
 *
 * Summon[0][i] is upgrade i's level, Summon[2][c] colour c's essence, Summon[4][t] the familiars of tier t.
 * SummonUPG[i]: [2] colour, [3] name, [8] max level (9999 = none), [9] parent upgrade, [11] the board's text.
 * Settings: cheatConfig.automation.summoning, one { id: "i", on, stopAt, priority } per upgrade (stopAt is a level),
 * and cheatConfig.automation.summoningSaving, the saving % of each colour in ESSENCES order.
 */

import { behavior, cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { belowStopAt, buyCheapestFirst, inMap, nextGoal } from "./engine.js";

/** Essence colours in Summon[2] order. */
export const ESSENCES = ["white", "green", "yellow", "blue", "purple", "red", "cyan", "teal"];
// Familiar tiers (Summon[4]), named after their units.
const FAMILIARS = ["Slime", "Vrumbi", "Bloomy", "Tonka", "Regalis", "Sparkie", "Guardio", "Muddah"];
// Board rows whose "}" total multiplies the bonus by that colour's wins, or by the character's Summoning level.
const VICTORY_ROWS = [0, 11, 18, 27, 38, 46, 54, 73];
const LEVEL_ROWS = [65, 66, 67, 30, 40, 52, 58, 80];

const summoning = (...args) => events(579)._customBlock_Summoning(...args);
// The board's behavior; _GenINFO[170] is its cached total level / 100.
const board = () => gga.PixelHelperActor[24].behaviors.getBehavior("ActorEvents_623");

let bought = 0; // levels bought since the automation turned on

const level = (i) => Number(gga.Summon[0][i]);
const max = (i) => Number(cList.SummonUPG[i][8]);

/**
 * The board shows a row once its parent (SummonUPG[i][9]) has a level; Muddah (71) is its own parent and shows with
 * Spelunking's lore flag 4 instead. Row 0 has no parent. The board's buy doesn't check this, so it is checked here.
 */
function unlocked(i) {
    const parent = Number(cList.SummonUPG[i][9]);
    return (
        parent === -1 ||
        level(parent) >= 1 ||
        (i === 71 && events(579)._customBlock_Spelunk("DoWeHaveLoreN1", 4, 0) === 1)
    );
}

const waiting = () => (gga.MenuType2 === 60 ? "Paused while the summoning board is open" : null);

/** The Familiar row's roll after its level is bought, as the board click does it, minus the sprites and popup. */
function rollFamiliar() {
    const familiars = gga.Summon[4];
    const add = (tier) => (familiars[tier] = Math.min(30, Math.round(Number(familiars[tier]) + 1)));
    // Free familiar: the level comes back, the essence stays spent.
    if (behavior.randomFloat() < Math.min(0.8, events(579)._customBlock_Thingies("LegendPTS_bonus", 4, 0) / 100))
        gga.Summon[0][2] = Math.round(Math.max(0, level(2) - 1));
    const skipping = summoning("SummUpgBonus", 39, 0);
    let tier = 0;
    if (skipping > 0.5) {
        if (behavior.randomFloat() < 0.125 * (1 + skipping / 100)) tier = 1;
        else if (behavior.randomFloat() < 0.02 * (1 + skipping / 100)) tier = 2;
    }
    add(tier);
    if (behavior.randomFloat() < events(345)._customBlock_getbonus2(2, 596, -1) / 100) add(tier);
    // Familiar_Merging: 3 + t of tier t become one of the next tier.
    if (summoning("SummUpgBonus", 6, 0) > 0) {
        for (let t = 0; t < 7; t++) {
            if (familiars[t] >= 3 + t) {
                familiars[t] = Math.round(familiars[t] - (3 + t));
                familiars[t + 1] = Math.round(Number(familiars[t + 1]) + 1);
            }
        }
    }
    // The sprite redraw this skips also flags the "have a Regalis" quest step.
    if (gga.QuestComplete.h.Sussy_Gene3 === 0 && familiars[4] >= 1) gga.QuestStatus.h.Sussy_Gene3[0] = 1;
}

/**
 * The board click's buy (ActorEvents_623 SummonUPGq, mouse-bound, so it can't be called): its steps, minus the art
 * it draws ("ehz" on a first level, "v" familiar sprites) and the FREE_FAMILIAR! popup.
 */
function buy(i) {
    const info = board()._GenINFO; // read first: without the board actor nothing is spent
    const colour = Number(cList.SummonUPG[i][2]);
    const cost = summoning("UpgCost", i, 0);
    if (!(gga.Summon[2][colour] >= cost && level(i) < max(i))) return;
    gga.Summon[2][colour] -= cost;
    gga.Summon[0][i] = Math.round(level(i) + 1);
    if (gga.QuestComplete.h.Lafu_Shi6 === 0)
        gga.QuestStatus.h.Lafu_Shi6[0] = Number(gga.QuestStatus.h.Lafu_Shi6[0]) + 1;
    if (i === 2) rollFamiliar();
    const total = gga.Summon[0].reduce((sum, lv) => sum + Number(lv), 0);
    gga.DNSM.h.CalcTalentMAP.h[595] = total;
    info[170] = Math.floor(total / 100);
    bought++;
}

/** The switched-on upgrades of one colour that may buy now: unlocked, below their max and stop-at. */
function buyable(colour) {
    const settings = new Map(cheatConfig.automation.summoning.map((entry) => [String(entry.id), entry]));
    return cList.SummonUPG.flatMap((row, i) => {
        const entry = settings.get(String(i));
        if (!entry?.on || Number(row[2]) !== colour || !unlocked(i)) return [];
        if (level(i) >= max(i) || !belowStopAt(level(i), entry.stopAt)) return [];
        return [{ id: i, cost: summoning("UpgCost", i, 0), priority: entry.priority, buy: () => buy(i) }];
    });
}

const saving = (colour) => cheatConfig.automation.summoningSaving[colour];

export const startSummoning = () => {
    bought = 0;
};

/** One tick: each colour buys what qualifies with its own essence and saving %. */
export function runSummoning() {
    if (!inMap() || waiting()) return;
    ESSENCES.forEach((_, colour) =>
        buyCheapestFirst(
            () => buyable(colour),
            () => gga.Summon[2][colour],
            saving(colour)
        )
    );
}

export function summoningStatus() {
    const on = cheatConfig.automation.summoning.filter((entry) => entry.on).length;
    if (!on) return "No summoning upgrade is switched on";
    if (!inMap()) return "Waiting for a character to be in game";
    const paused = waiting();
    if (paused) return paused;
    const upgrades = on === 1 ? "1 upgrade" : `${on} upgrades`;
    if (!bought) return `Buying ${upgrades}`;
    return `Buying ${upgrades}; ${bought === 1 ? "1 level" : `${bought} levels`} bought since it started`;
}

/** The board's own text: { the bonus, > its multiplier, | the familiar cost reset, } a per-row total, @ a break. */
function bonusText(i, row) {
    const comma = events(189)._customBlock_CommaNotation;
    const value = summoning("SummUpgBonus", i, 0);
    const boardLevel = Math.max(0, board()._GenINFO[170]);
    const shrink = (x) => Math.round(1e4 * (1 - 1 / (1 + x / 100))) / 100;
    const victories = VICTORY_ROWS.indexOf(i);
    let total = null;
    if (victories >= 0) total = comma(value * summoning("SummVictories", victories, 0));
    else if (LEVEL_ROWS.includes(i)) total = comma(value * gga.Lv0[18]);
    else if (i === 49 || i === 57 || i === 72) total = shrink(value);
    else if (i === 60 || i === 61) total = comma(Math.round(value * boardLevel));
    else if (i === 62 || i === 63 || i === 64) total = comma(Math.round(value * gga.OptionsListAccount[319]));
    else if (i === 68) total = comma(summoning("UnitDMG", -1, 0) * (value / 100));
    else if (i === 75) total = shrink(value * boardLevel);
    const restock = events(266)._customBlock_timeDisp2(gga.TimeAway.h.ShopRestock + 86400 * gga.Summon[3][3]);
    const text = String(row[11])
        .split("{")
        .join(comma(value))
        .split(">")
        .join(String(Math.round(100 + value) / 100))
        .split("|")
        .join(restock)
        .split("@")
        .join("");
    return total === null ? text : text.split("}").join(String(total));
}

/**
 * The Summoning › Automation tab: each colour's essence and what it saves for, and every upgrade.
 * An upgrade's `lockedBy` names what shows it on the board: { parent } (an upgrade's name) or { lore: true }.
 */
export function getAutomationSummoning() {
    const paused = waiting();
    return {
        waiting: paused,
        essences: ESSENCES.map((name, colour) => {
            const goal = paused ? null : nextGoal(buyable(colour));
            return { name, owned: gga.Summon[2][colour], goal: goal && { id: goal.id, cost: goal.cost } };
        }),
        upgrades: cList.SummonUPG.map((row, i) => {
            const familiars = FAMILIARS.flatMap((name, tier) =>
                gga.Summon[4][tier] > 0 ? `${gga.Summon[4][tier]} ${name}` : []
            );
            return {
                id: i,
                name: row[3],
                colour: Number(row[2]),
                bonus: bonusText(i, row),
                note: i !== 2 ? null : familiars.length ? `Familiars: ${familiars.join(", ")}` : "No familiars yet",
                level: level(i),
                max: max(i) === 9999 ? null : max(i),
                cost: summoning("UpgCost", i, 0),
                unlocked: unlocked(i),
                lockedBy: i === 71 ? { lore: true } : { parent: cList.SummonUPG[row[9]]?.[3] ?? null },
            };
        }),
    };
}
