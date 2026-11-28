/**
 * W5 Gaming: harvests a full garden and digs once the shovel is ready, both while the Gaming menu is open, and buys the
 * switched-on upgrades with bits by the shared rule ("Save for it", saving %), each up to its stop-at, menu open or not.
 *
 * Bits are Gaming[0]. The upgrades: the three fertilizers, Gaming[1..3] (names cList.GamingUpgrades); mutation chance,
 * Gaming[7]; and the imports' levels, GamingSprout[25 + i][0] (names cList.RandoListo2[1]). Import 9 ("idk") is the
 * game's unused slot and isn't offered. The game has no callable buy, so a buy repeats its button: take the price, add a level.
 * Settings: cheatConfig.automation.gaming, one { id, on, stopAt, save } per upgrade, cheatConfig.automation.gamingSaving,
 * and the gamingAutoHarvest and gamingAutoDig switches.
 */

import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { belowStopAt, buyCheapestFirst, inMap, nextGoal, notate } from "./engine.js";

const gaming = (name, index = 0) => events(579)._customBlock_GamingStatType(name, index, 0);
const cleanName = (name) => String(name).replace(/_/g, " ");
// An import is unlocked once its letter is in Gaming[6]; import 1 is the shovel.
const unlocked = (i) => String(gga.Gaming[6]).includes(String(gga.Number2Letter[i]));
const gamingLevel = () => Number(gga.Lv0[15]);

const IMPORTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
// Every upgrade by id: its name, level and price, and when the game lets it be bought.
const UPGRADES = [
    ...[0, 1, 2].map((i) => ({
        id: `fertilizer${i}`,
        name: () => cleanName(cList.GamingUpgrades[i][0]),
        level: () => gga.Gaming[i + 1],
        setLevel: (level) => {
            gga.Gaming[i + 1] = level;
        },
        cost: () => gaming("FertilizerUpgCosts", i),
        // Capacity stops at the game's cap of 24 plots.
        maxed: () => i === 2 && gaming("SproutCapacity") >= 24,
        open: () => true,
    })),
    {
        id: "mutation",
        name: () => "Mutation chance",
        level: () => gga.Gaming[7],
        setLevel: (level) => {
            gga.Gaming[7] = level;
        },
        cost: () => gaming("MutateUpgCosts"),
        maxed: () => false,
        open: () => gamingLevel() >= gaming("LVreq", 1),
    },
    ...IMPORTS.map((i) => ({
        id: `import${i}`,
        name: () => cleanName(cList.RandoListo2[1][i]),
        level: () => gga.GamingSprout[25 + i][0],
        setLevel: (level) => {
            gga.GamingSprout[25 + i][0] = level;
        },
        cost: () => gaming("ImportItemCOST", i),
        maxed: () => false,
        open: () => unlocked(i) && gamingLevel() >= gaming("LVreq", 2),
    })),
];

let bought = 0; // levels bought since the automation turned on
let harvested = 0;
let digs = 0;

function buy(upgrade) {
    // The engine only picks what the bits pay for, at this same price.
    gga.Gaming[0] = Number(gga.Gaming[0]) - upgrade.cost();
    upgrade.setLevel(Math.round(Number(upgrade.level()) + 1));
    bought++;
}

function buyable() {
    const settings = new Map(cheatConfig.automation.gaming.map((entry) => [String(entry.id), entry]));
    return UPGRADES.flatMap((upgrade) => {
        const entry = settings.get(upgrade.id);
        if (!entry?.on || !upgrade.open() || upgrade.maxed() || !belowStopAt(Number(upgrade.level()), entry.stopAt))
            return [];
        return [{ id: upgrade.id, cost: upgrade.cost(), save: Boolean(entry.save), buy: () => buy(upgrade) }];
    });
}

/** The Gaming station, while its menu is open. */
function openStation() {
    if (gga.MenuType2 !== 45) return null;
    const station = gga.PixelHelperActor[23].behaviors.getBehavior("ActorEvents_577");
    return station._UIinventory13On[37] === 1 ? station : null;
}

// The station's click handlers read what was clicked from _TRIGGEREDtext.
function trigger(station, text, method) {
    const previous = station._TRIGGEREDtext;
    try {
        station._TRIGGEREDtext = text;
        station[method]();
    } finally {
        station._TRIGGEREDtext = previous;
    }
}

/**
 * A full garden: every plot holds a plant. Plants of a type the player locked on the Mutation tab
 * (OptionsListAccount[583 + max(0, type − 2)], the game's own slot for it, so types 1 and 2 share 583) stay, as the
 * game's own Harvest All leaves them.
 */
function harvest(station) {
    const plots = gga.GamingSprout.slice(0, gaming("SproutCapacity"));
    if (!plots.every((plot) => Number(plot[1]) > 0)) return;
    plots.forEach((plot, i) => {
        if (Number(gga.OptionsListAccount[583 + Math.max(0, Number(plot[1]) - 2)]) !== 0) return;
        trigger(station, `z${i}`, "_customEvent_GardenETC");
        harvested++;
    });
}

/**
 * The shovel digs floor((hours)^0.44) nuggets, times bonuses of at least 1, so it is ready after an hour. Like a click,
 * it waits for the 6 s the game locks it after a dig (_GenINFO[43][1]).
 */
function dig(station) {
    if (!unlocked(1) || Number(gga.GamingSprout[26][1]) < 3600 || station._GenINFO[43][1] !== 0) return;
    trigger(station, "j1", "_customEvent_W5stuffzz");
    digs++;
}

/** Bits and every upgrade, for Automation › Gaming. */
export function getAutomationGaming() {
    return {
        bits: Number(gga.Gaming[0]),
        upgrades: UPGRADES.map((upgrade) => ({
            id: upgrade.id,
            name: upgrade.name(),
            level: Number(upgrade.level()),
            cost: upgrade.cost(),
            unlocked: upgrade.open(),
            maxed: upgrade.maxed(),
        })),
    };
}

export const startGaming = () => {
    bought = harvested = digs = 0;
};

export function runGaming() {
    if (!inMap()) return;
    buyCheapestFirst(buyable, () => Number(gga.Gaming[0]), cheatConfig.automation.gamingSaving);
    const station = openStation();
    if (!station) return;
    if (cheatConfig.automation.gamingAutoHarvest) harvest(station);
    if (cheatConfig.automation.gamingAutoDig) dig(station);
}

export function gamingStatus() {
    if (!inMap()) return "Waiting for a character to be in game";
    const goal = nextGoal(buyable());
    const parts = [
        !cheatConfig.automation.gaming.some((entry) => entry.on)
            ? "No upgrade is switched on"
            : goal
              ? `Saving for ${UPGRADES.find(({ id }) => id === goal.id).name()} (${notate(goal.cost)} bits)`
              : "Buying cheapest first",
    ];
    if (!openStation()) parts.push("open Gaming to harvest and dig");
    if (bought) parts.push(bought === 1 ? "1 level bought" : `${bought} levels bought`);
    if (harvested) parts.push(`${harvested} harvested`);
    if (digs) parts.push(digs === 1 ? "1 dig" : `${digs} digs`);
    return parts.join("; ");
}
