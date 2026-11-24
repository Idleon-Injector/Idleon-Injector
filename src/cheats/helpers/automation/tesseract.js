/**
 * Tesseract, the Arcane Cultist masterclass: switched-on upgrades are bought with tachyons. Each upgrade costs one of
 * six tachyons, so each tachyon saves and buys on its own. Silver is spent like the others, though Massivon Hoarding
 * (upgrade 49) makes every upgrade cheaper per power of 10 Silver held.
 *
 * Upgrade i is cList.ArcaneUpg[i]: [3] its tachyon (OptionsListAccount[388 + tachyon]), [4] its max level (999999 is
 * none), [6] the total of all levels that unlocks it, [9] its line. Its level is Arcane[i]; "Boundless_Energy" rows are
 * placeholders. Settings: cheatConfig.automation.tesseract and tesseractSaving (masterclass.js).
 */

import { cList, events, gga } from "../../core/globals.js";
import { bonusPart, masterclass } from "./masterclass.js";

const arcane = (...args) => events(579)._customBlock_ArcaneType(...args);
const unlocked = () => arcane("ArcaneUpgUNLOCKED", 0, 0);
const cost = (i) => arcane("ArcaneUpgCost", i, 0);

/**
 * The Tesseract menu's click, which buys inline like the Grimoire's: the same checks, then the tachyons, the level and
 * the masterclass level counter (OptionsListAccount[480]), at least 0.1 tachyons left, and the cached total dropped.
 */
function buy(i) {
    const row = cList.ArcaneUpg[i];
    const ola = gga.OptionsListAccount;
    const tachyon = 388 + Number(row[3]);
    const price = cost(i);
    if (!(i < unlocked() && ola[tachyon] >= price && gga.Arcane[i] < Number(row[4]))) return false;
    ola[tachyon] -= price;
    gga.Arcane[i] = Math.round(gga.Arcane[i] + 1);
    ola[480] = Number(ola[480]) + 1;
    if (ola[tachyon] < 0.1) ola[tachyon] = 0.1;
    delete gga.DNSM.h.ArcaneTotLV;
    return true;
}

export const tesseract = masterclass({
    key: "tesseract",
    currencies: ["purple", "brown", "green", "red", "silver", "gold"],
    upgrades: () => cList.ArcaneUpg.flatMap((row, i) => (row[0] === "Boundless_Energy" ? [] : [i])),
    name: (i) => cList.ArcaneUpg[i][0],
    level: (i) => gga.Arcane[i],
    max: (i) => Number(cList.ArcaneUpg[i][4]),
    cost,
    currency: (i) => Number(cList.ArcaneUpg[i][3]),
    owned: (tachyon) => gga.OptionsListAccount[388 + tachyon],
    open: (i) => i < unlocked(),
    buy,
    bonus: (i) => bonusPart(cList.ArcaneUpg[i][9], arcane("ArcaneUpgBonus", i, 0)),
    extra: (i) => ({ unlockAt: Number(cList.ArcaneUpg[i][6]) }),
});
