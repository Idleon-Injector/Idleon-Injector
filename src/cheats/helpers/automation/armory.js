/**
 * Royal Armory, the Royal Guardian masterclass: switched-on Armory upgrades are bought with royal resources, each
 * resource saving and buying on its own, and switched-on Royal Statues are rolled with Parchments of Enchantment.
 *
 * Upgrade id sits on the shelf at position p, where cList.Research[43][p] is id. The game reads its name, max level
 * ([4], 999999 is none) and line ([9]) from cList.ArmoryUpg[id], but the resource it pays ([3]) and the total level that
 * unlocks it ([6]) from cList.ArmoryUpg[p]; the price takes p too. Its level is RoyalG[2][id], resource r is
 * RoyalG[1][r]. Statue s's level is RoyalG[0][s], 0 while locked; cList.Research[40][s] is its line ("4" to "7" are
 * statues still to come).
 * Settings: cheatConfig.automation.armory and armorySaving (masterclass.js), and cheatConfig.automation.statues, one
 * { id, on, stopAt } per statue.
 */

import { cList, events, gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { belowStopAt, inMap } from "./engine.js";
import { reachable } from "./construction.js";
import { bonusPart, masterclass } from "./masterclass.js";

const PARCHMENT = "RGenh";
// Ten resources a world; only the kinds the map nodes give are real. The game names none (only a picture): the first
// four go by the names players use for them, the rest by their world and place. Classes > Royal Armory shows these
// too (readComputed("royal", "resourceNames")).
const NAMED = ["Wheat", "Berries", "Sticks", "Spider webs"];
export const RESOURCES = Array.from(
    { length: 70 },
    (_, r) => NAMED[r] ?? `W${Math.floor(r / 10) + 1} resource ${(r % 10) + 1}`
);
// ponytail: a cap per tick so a large parchment pile rolls over a few seconds instead of in one frame.
const ROLLS_PER_TICK = 20;

const royal = (...args) => events(579)._customBlock_RoyalG(...args);
const shelf = (id) => cList.Research[43].findIndex((entry) => Number(entry) === id);
const cost = (id) => royal("ArmoryUpgCost", shelf(id), 0);
const open = (id) => {
    const p = shelf(id);
    return p >= 0 && p < royal("ArmoryUpgUNLOCKED", 0, 0);
};
// The Royal Guardian's menu behavior, which holds the Armory's buy event.
const guardian = () => gga.PixelHelperActor[27].behaviors.getBehavior("ActorEvents_741");
// The alchemy menu's behavior holds the owned-items map the statue roll checks.
const storage = () => gga.PixelHelperActor[5].behaviors.getBehavior("ActorEvents_232");

/**
 * The Armory's buy click: its checks (unlocked, affordable, below max) done here, then the game's own buy event
 * (_customEvent_RG_Stuff "b"), so the shelves that add map units or an outpost do it as the game does.
 */
function buy(id) {
    const p = shelf(id);
    const resource = Number(cList.ArmoryUpg[p][3]);
    if (!(open(id) && gga.RoyalG[1][resource] >= cost(id) && gga.RoyalG[2][id] < Number(cList.ArmoryUpg[id][4])))
        return false;
    const actor = guardian();
    const picked = actor._GenINFO[204];
    actor._GenINFO[204] = p;
    actor._TRIGGEREDtext = "b";
    actor._customEvent_RG_Stuff();
    actor._GenINFO[204] = picked;
    return true;
}

export const armory = masterclass({
    key: "armory",
    currencies: RESOURCES,
    upgrades: () => cList.Research[43].map(Number),
    name: (id) => cList.ArmoryUpg[id][0],
    level: (id) => gga.RoyalG[2][id],
    max: (id) => Number(cList.ArmoryUpg[id][4]),
    cost,
    currency: (id) => Number(cList.ArmoryUpg[shelf(id)][3]),
    owned: (r) => gga.RoyalG[1][r] ?? 0,
    open,
    buy,
    bonus: (id) => bonusPart(cList.ArmoryUpg[id][9], royal("ArmoryUpgBonus", id, 0)),
    extra: (id) => ({ unlockAt: Number(cList.ArmoryUpg[shelf(id)][6]) }),
});

let rolls = 0; // parchments rolled since the automation turned on
let raised = 0; // statue levels those won

const statueIds = () => cList.Research[40].flatMap((line, s) => (/^\d+$/.test(String(line)) ? [] : [s]));

/** The switched-on statues a parchment may roll now: unlocked, below their stop-at; the lowest level first. */
function statuesToRoll() {
    const picks = new Map(cheatConfig.automation.statues.map((entry) => [String(entry.id), entry]));
    const level = (s) => Number(gga.RoyalG[0][s]);
    return statueIds()
        .filter((s) => picks.get(String(s))?.on && level(s) > 0 && belowStopAt(level(s), picks.get(String(s)).stopAt))
        .sort((a, b) => level(a) - level(b));
}

/**
 * Parchments the roll can take: what removeitems reaches, and the owned-items map the game checks, refreshed first
 * (the injector's w6.royal makes the game's own check always say yes, so it is counted here).
 */
function parchments() {
    const owned = storage();
    owned._TRIGGERtext = "z";
    owned._customEvent_PostOfficeIMG();
    return Math.min(reachable(PARCHMENT), Number(owned._ItemsAndStorageOWNED.h[PARCHMENT] ?? 0));
}

/**
 * The statue roll (_customEvent_RG_Stuff "a" on an unlocked statue), without its popup: a parchment, kept at the
 * ParchmentRecycle chance, then a StatueUpgOdds roll for +1 level.
 */
function rollStatues() {
    if (!statuesToRoll().length) return;
    const cost = royal("Statue_Cost", 0, 0);
    let left = parchments();
    let rolled = 0;
    for (; rolled < ROLLS_PER_TICK && left >= cost; rolled++) {
        const [s] = statuesToRoll();
        if (s === undefined) break;
        if (Math.random() >= royal("ParchmentRecycle", 0, 0)) {
            events(189)._customBlock_removeitems(PARCHMENT, cost, "InventoryStorage");
            left -= cost;
        }
        if (Math.random() < royal("StatueUpgOdds", s, 0)) {
            gga.RoyalG[0][s] = Math.round(Number(gga.RoyalG[0][s]) + 1);
            raised++;
        }
    }
    if (!rolled) return;
    rolls += rolled;
    storage()._TRIGGERtext = "z";
    gga.PixelHelperActor[5].shout("_customEvent_PostOfficeIMG");
}

export const startArmory = () => {
    armory.start();
    rolls = raised = 0;
};

export function runArmory() {
    if (!inMap()) return;
    armory.run();
    rollStatues();
}

export function armoryStatus() {
    const statues = cheatConfig.automation.statues.filter((entry) => entry.on).length;
    const upgrades = armory.status();
    if (!statues || !inMap()) return upgrades;
    const rolling = `${statues === 1 ? "1 statue" : `${statues} statues`}`;
    const done = rolls
        ? `; ${rolls === 1 ? "1 roll" : `${rolls} rolls`}, ${raised === 1 ? "1 level" : `${raised} levels`} since it started`
        : "";
    return upgrades.startsWith("No ") ? `Rolling ${rolling}${done}` : `${upgrades}; rolling ${rolling}${done}`;
}

/** The Armory for the Masterclasses page, with the statues (each with its line, level and odds) and the parchments held. */
export function getAutomationArmory() {
    return {
        ...armory.read(),
        parchments: reachable(PARCHMENT),
        statues: statueIds().map((s) => ({
            id: s,
            line: String(cList.Research[40][s]),
            level: Number(gga.RoyalG[0][s]),
            odds: Number(gga.RoyalG[0][s]) > 0 ? royal("StatueUpgOdds", s, 0) : null,
        })),
    };
}
