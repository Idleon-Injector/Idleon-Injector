/**
 * Compass, the Wind Walker masterclass: switched-on upgrades are bought with dust. Each upgrade costs one of five
 * dusts, so each dust saves and buys on its own. Only the upgrades the Compass shows can be clicked, so only those
 * buy; one switched on while hidden starts once the Compass shows it. Dust is not kept back for portals.
 *
 * Upgrade i is cList.CompassUpg[i]: [3] its dust (OptionsListAccount[357 + dust]), [4] its max level (999999 is none),
 * [11] its line. Its level is Compass[0][i]; titan t is slain when Compass[1][t] is 1. Settings:
 * cheatConfig.automation.compass and compassSaving (masterclass.js).
 */

import { cList, events, gga } from "../../core/globals.js";
import { bonusPart, masterclass } from "./masterclass.js";

const COMPASS_MENU = 76;
// Each path's first upgrade (its level is how many of the path's upgrades show) and the list of those, in order.
const PATHS = [
    [1, 105],
    [13, 106],
    [27, 107],
    [40, 108],
];

const windwalker = (...args) => events(579)._customBlock_Windwalker(...args);
const bonus = (i) => windwalker("CompassBonus", i, 0);
const cost = (i) => windwalker("CompassUpgCost", i, 0);

/**
 * What the Compass shows, built as its menu builds it on opening (_customEvent_Compass "a"): Pathfinder always; the
 * four paths, Worldfinder once Pathfinder has a level; two upgrades once they give a bonus; the first N of each path,
 * N its first upgrade's level; an Abomination Slayer for each titan slain.
 */
export function shownUpgrades() {
    const shown = new Set([0]);
    if (bonus(0) >= 1) [1, 13, 27, 40, 170].forEach((i) => shown.add(i));
    if (bonus(3) >= 0.01) shown.add(171);
    if (bonus(4) >= 0.01) shown.add(172);
    for (const [first, list] of PATHS) {
        const upgrades = cList.RANDOlist[list];
        const count = Math.min(Math.round(bonus(first)), upgrades.length);
        for (let n = 0; n < count; n++) shown.add(Number(upgrades[n]));
    }
    cList.Titans.forEach((_, t) => {
        if (Number(gga.Compass[1][t]) === 1) shown.add(60 + t);
    });
    return shown;
}

/**
 * The Compass's buy button (_customEvent_Compass "b"), copied because the event tints the open menu's icon: the same
 * checks on a shown upgrade, then the dust, the level, the masterclass level counter (OptionsListAccount[480]) and the
 * cached total level dropped. Unlike the Grimoire it leaves no 0.1 behind.
 */
function buy(i) {
    const row = cList.CompassUpg[i];
    const ola = gga.OptionsListAccount;
    const dust = 357 + Number(row[3]);
    const price = cost(i);
    if (!(shownUpgrades().has(i) && ola[dust] >= price && gga.Compass[0][i] < Number(row[4]))) return false;
    ola[dust] -= price;
    gga.Compass[0][i] = Math.round(gga.Compass[0][i] + 1);
    ola[480] = Number(ola[480]) + 1;
    delete gga.DNSM.h.CompassTotLV;
    return true;
}

export const compass = masterclass({
    key: "compass",
    currencies: ["stardust", "moondust", "solardust", "cooldust", "novadust"],
    upgrades: () => cList.CompassUpg.map((_, i) => i),
    name: (i) => cList.CompassUpg[i][0],
    level: (i) => gga.Compass[0][i],
    max: (i) => Number(cList.CompassUpg[i][4]),
    cost,
    currency: (i) => Number(cList.CompassUpg[i][3]),
    owned: (dust) => gga.OptionsListAccount[357 + dust],
    // ponytail: rebuilt per call (a few dozen lookups); cache per tick if the Compass grows a lot.
    open: (i) => shownUpgrades().has(i),
    buy,
    bonus: (i) => bonusPart(cList.CompassUpg[i][11], bonus(i)),
    // The open menu builds its list only on opening and tints maxed icons itself: a buy behind it would leave both stale.
    paused: () => (Number(gga.MenuType2) === COMPASS_MENU ? "Paused while the Compass is open" : null),
});
