/**
 * Grimoire, the Death Bringer masterclass: switched-on upgrades are bought with bones from whatever map the character
 * is in. Each upgrade costs one of four bone types, so each bone type saves and buys on its own.
 *
 * Upgrade i is cList.GrimoireUpg[i]: [3] its bone (OptionsListAccount[330 + bone]), [4] its max level (999999 is
 * none), [6] the total of all levels that unlocks it. Its level is Grimoire[i]; "Ripped_Page" rows are placeholders.
 * Settings: cheatConfig.automation.grimoire, one { id, on, stopAt, priority } per upgrade (id the row index), and
 * cheatConfig.automation.grimoireSaving, the saving % the four bone types share.
 */

import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { buyCheapestFirst, inMap, nextGoal } from "./engine.js";

const BONES = ["femur", "ribcage", "cranium", "bovinae"];
const NO_MAX = 999999;

const summoning = (...args) => events(579)._customBlock_Summoning(...args);
const placeholder = (row) => row[0] === "Ripped_Page";

let bought = 0; // levels bought since the automation turned on

/**
 * The Grimoire menu's click, which buys inline (the game has no Grimoire buy event): the same checks, then the bones,
 * the level and the masterclass level counter (OptionsListAccount[480]), and the cached total level dropped.
 */
function buy(i) {
    const row = cList.GrimoireUpg[i];
    const ola = gga.OptionsListAccount;
    const bone = 330 + Number(row[3]);
    const cost = summoning("GrimoireUpgCost", i, 0);
    if (!(i < summoning("GrimoireUpgUNLOCKED", 0, 0) && gga.Grimoire[i] < Number(row[4]) && ola[bone] >= cost)) return;
    ola[bone] -= cost;
    gga.Grimoire[i] = Math.round(gga.Grimoire[i] + 1);
    ola[480] = Number(ola[480]) + 1;
    if (ola[bone] < 0.1) ola[bone] = 0.1;
    delete gga.DNSM.h.GrimoireTotLV;
    bought++;
}

/** The switched-on upgrades of one bone type that may buy a level now. */
function upgradesFor(bone) {
    const settings = new Map(cheatConfig.automation.grimoire.map((entry) => [String(entry.id), entry]));
    const unlocked = summoning("GrimoireUpgUNLOCKED", 0, 0);
    return cList.GrimoireUpg.flatMap((row, i) => {
        const entry = settings.get(String(i));
        if (!entry?.on || placeholder(row) || Number(row[3]) !== bone || i >= unlocked) return [];
        if (gga.Grimoire[i] >= Math.min(Number(row[4]), entry.stopAt ?? Infinity)) return [];
        return [{ id: i, cost: summoning("GrimoireUpgCost", i, 0), priority: entry.priority, buy: () => buy(i) }];
    });
}

export const startGrimoire = () => {
    bought = 0;
};

/** One tick: each bone type buys on its own, with the one saving % they share. */
export function runGrimoire() {
    if (!inMap()) return;
    const saving = cheatConfig.automation.grimoireSaving;
    BONES.forEach((_, bone) =>
        buyCheapestFirst(
            () => upgradesFor(bone),
            () => gga.OptionsListAccount[330 + bone],
            saving
        )
    );
}

export function grimoireStatus() {
    const on = cheatConfig.automation.grimoire.filter((entry) => entry.on).length;
    if (!on) return "No upgrade is switched on";
    if (!inMap()) return "Waiting for a character to be in game";
    const upgrades = on === 1 ? "1 upgrade" : `${on} upgrades`;
    if (!bought) return `Buying ${upgrades}`;
    return `Buying ${upgrades}; ${bought === 1 ? "1 level" : `${bought} levels`} bought since it started`;
}

/** The bones (owned, and what each saves for) and every upgrade, for Classes › Grimoire › Automation. */
export function getAutomationGrimoire() {
    const unlocked = summoning("GrimoireUpgUNLOCKED", 0, 0);
    return {
        bones: BONES.map((name, bone) => {
            const goal = nextGoal(upgradesFor(bone));
            return { name, owned: gga.OptionsListAccount[330 + bone], goal: goal && { id: goal.id, cost: goal.cost } };
        }),
        upgrades: cList.GrimoireUpg.flatMap((row, i) => {
            if (placeholder(row)) return [];
            const max = Number(row[4]);
            return [
                {
                    id: i,
                    name: row[0],
                    bone: BONES[Number(row[3])],
                    level: gga.Grimoire[i],
                    max: max >= NO_MAX ? null : max,
                    cost: summoning("GrimoireUpgCost", i, 0),
                    unlockAt: Number(row[6]),
                    unlocked: i < unlocked,
                },
            ];
        }),
    };
}
