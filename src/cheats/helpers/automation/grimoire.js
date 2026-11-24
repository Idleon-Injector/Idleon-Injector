/**
 * Grimoire, the Death Bringer masterclass: switched-on upgrades are bought with bones from whatever map the character
 * is in. Each upgrade costs one of four bone types, so each bone type saves and buys on its own.
 *
 * Upgrade i is cList.GrimoireUpg[i]: [3] its bone (OptionsListAccount[330 + bone]), [4] its max level (999999 is
 * none), [6] the total of all levels that unlocks it, [9] its line. Its level is Grimoire[i]; "Ripped_Page" rows are
 * placeholders. Settings: cheatConfig.automation.grimoire and grimoireSaving (masterclass.js).
 */

import { cList, events, gga } from "../../core/globals.js";
import { bonusPart, masterclass } from "./masterclass.js";

const summoning = (...args) => events(579)._customBlock_Summoning(...args);
const unlocked = () => summoning("GrimoireUpgUNLOCKED", 0, 0);
const cost = (i) => summoning("GrimoireUpgCost", i, 0);

/**
 * The Grimoire menu's click, which buys inline (the game has no Grimoire buy event): the same checks, then the bones,
 * the level and the masterclass level counter (OptionsListAccount[480]), and the cached total level dropped.
 */
function buy(i) {
    const row = cList.GrimoireUpg[i];
    const ola = gga.OptionsListAccount;
    const bone = 330 + Number(row[3]);
    const price = cost(i);
    if (!(i < unlocked() && gga.Grimoire[i] < Number(row[4]) && ola[bone] >= price)) return false;
    ola[bone] -= price;
    gga.Grimoire[i] = Math.round(gga.Grimoire[i] + 1);
    ola[480] = Number(ola[480]) + 1;
    if (ola[bone] < 0.1) ola[bone] = 0.1;
    delete gga.DNSM.h.GrimoireTotLV;
    return true;
}

export const grimoire = masterclass({
    key: "grimoire",
    currencies: ["femur", "ribcage", "cranium", "bovinae"],
    upgrades: () => cList.GrimoireUpg.flatMap((row, i) => (row[0] === "Ripped_Page" ? [] : [i])),
    name: (i) => cList.GrimoireUpg[i][0],
    level: (i) => gga.Grimoire[i],
    max: (i) => Number(cList.GrimoireUpg[i][4]),
    cost,
    currency: (i) => Number(cList.GrimoireUpg[i][3]),
    owned: (bone) => gga.OptionsListAccount[330 + bone],
    open: (i) => i < unlocked(),
    buy,
    bonus: (i) => bonusPart(cList.GrimoireUpg[i][9], summoning("GrimoireUpgBonus", i, 0)),
    extra: (i) => ({ unlockAt: Number(cList.GrimoireUpg[i][6]) }),
});
