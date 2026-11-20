/**
 * W2 alchemy bubbles: switched-on bubbles are raised with the alchemy menu's own upgrade (ActorEvents_232
 * BubbleHoldDown), paying its materials, or particles on a Particles row. Bubbles with a max (the decay formulas)
 * rise to the target % of it, L / (L + x2); the others need a stop-at, which also caps any bubble. Each buy goes to
 * the switched-on, affordable bubble furthest from its goal.
 *
 * Settings: cheatConfig.automation.bubbles = { target, items: [{ id: "cauldron:bubble", on, stopAt, pay }] }, pay
 * being "particles" or left out for materials.
 */

import { behavior, cList, events, gga, itemDefs } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { buyCheapestFirst, inMap } from "./engine.js";

const stats = (...args) => events(189)._customBlock_CauldronStats(...args);

// The cauldron titles the alchemy menu draws (POWER_CAULDRON, ...).
const CAULDRONS = ["POWER CAULDRON", "QUICC CAULDRON", "HIGH-IQ CAULDRON", "KAZAM CAULDRON"];
// Formulas of the form x1 * L / (L + x2), plus 1 for decayMulti.
const DECAY = ["decay", "decayMulti"];

// Cost slots that are currencies rather than items have no real item name.
// ponytail: plain labels where the game draws only an icon; W6item1-5 are FarmCrop entries 4, 30, 46, 72, 99.
const LIQUIDS = ["Water Droplets", "Liquid Nitrogen", "Trench Seawater", "Toxic Mercury"];
const ESSENCES = ["White", "Green", "Yellow", "Blue", "Purple"];
const W6_CROPS = [4, 30, 46, 72, 99];
const currencyName = (item) => {
    const [, kind, n] = /^(Liquid|W6item|W7item|SailTr|Spice|Meal)(\d+)$/.exec(item) ?? [];
    if (kind === "Liquid") return LIQUIDS[n - 1];
    if (kind === "W6item")
        return n === "0" ? "Jade Coins" : n > 5 ? `${ESSENCES[n - 6]} Essence` : `Crop ${W6_CROPS[n - 1]}`;
    if (kind === "W7item") return `Spelunking item ${n}`;
    if (kind === "SailTr") return `Sailing treasure ${n}`;
    if (kind === "Spice") return `Spice ${n}`;
    if (kind === "Meal") return cList.MealINFO[n][0];
    // Bits (Gaming) is a currency the menu counts like an item; it may have no item definition.
    return itemDefs[item]?.h.displayName ?? item;
};

let bought = 0; // levels raised since the automation turned on
let popups = null; // while a buy runs: the actors it spawned

/** The alchemy menu's behavior: its buy event, its owned-items cache and the selection fields the buy reads. */
function alchemy() {
    // 0 until the game creates its UI actors (character select, loading).
    const actor = gga.PixelHelperActor[5];
    if (!actor) throw new Error("The alchemy menu isn't loaded yet; bubbles can be read once a character is in game");
    return actor.behaviors.getBehavior("ActorEvents_232");
}

/**
 * Run fn with the menu set to its Bubbles tab, then put the menu's fields back.
 * _GenINFO[17] keeps the menu's last tab after it closes, and at 1 (liquid shop) CauldronCosts returns
 * liquid-shop prices, also inside the buy event. _GenINFO[39], _TRIGGERtext2 and _ParticleAfford are
 * the menu's selected bubble, buy mode and particle flag, which a buy overwrites.
 */
function onBubblesTab(fn) {
    const menu = alchemy();
    const saved = [menu._GenINFO[17], menu._GenINFO[39], menu._TRIGGERtext2, menu._ParticleAfford];
    menu._GenINFO[17] = 0;
    try {
        return fn(menu);
    } finally {
        [menu._GenINFO[17], menu._GenINFO[39], menu._TRIGGERtext2, menu._ParticleAfford] = saved;
    }
}

// The menu's own owned-items map (inventory + chest, liquids, salts, Bits, W6/W7 currencies), rebuilt the way a buy does.
const ownedItems = (menu) => {
    menu._TRIGGERtext = "z";
    menu._customEvent_PostOfficeIMG();
    return menu._ItemsAndStorageOWNED.h;
};

/** The bubble panel's description at the current level, with the panel's rounding and per-bubble totals ($). */
function bonusText(menu, cauldron, bubble, row) {
    const value = stats("BubbleBonus", cauldron, bubble, 0);
    const decay = DECAY.includes(row[3]);
    let shown = Math.round(value);
    if (value < 10 && decay) shown = Math.round(100 * value) / 100;
    else if (value < 1 || (row[3] === "add" && Number(row[2]) < 1 && value < 100) || (value < 25 && decay))
        shown = Math.round(10 * value) / 10;
    const text = String(row[9]);
    const total = (scale) =>
        text
            .split("$")
            .join(
                events(266)._customBlock_FormatBonuses(shown * scale, String(row[3]), Number(row[1]), Number(row[2]))
            );
    const tools = (kinds) => text.split("{").join(String(shown)).split("$").join(kinds);
    const ae12 = events(12);
    const ae124 = events(124);
    const key = `${cauldron}:${bubble}`;
    if (key === "0:5") return total(ae124._customBlock_getLOG(Math.max(ae12._customBlock_PlayerHPmax() - 250, 1)));
    if (key === "1:5")
        return total(ae124._customBlock_Log2(Math.max(ae12._customBlock_PlayerSpeedBonus() - 0.1, 0)) / 0.25);
    if (key === "2:5") return total(ae124._customBlock_getLOG(Math.max(ae12._customBlock_PlayerMPmax() - 150, 1)));
    if (key === "3:7") return total(Math.max(Math.pow(menu._GenINFO[87] / 25, 0.3), 0));
    if (key === "0:7") return tools("Pickaxes_and_Fishing_Rods.");
    if (key === "1:6") return tools("Catching_Nets_and_Traps.");
    if (key === "2:6") return tools("Hatchets_and_Worship_Skulls.");
    const y6 = key === "3:25" ? ae124._customBlock_NotateNumber(Number(gga.DNSM.h.AlchBubbles.h.Y6), "Big") + "%" : "$";
    return text.split("$").join(y6).split("{").join(String(shown));
}

/**
 * One bubble's level, % of max, next cost per slot and particle option. The menu offers a particle buy when
 * the atom collider is on, the first cost slot is 1e8 or more and not Bits or a W6 currency; it pays only the
 * liquid slots, plus particles and one charge.
 */
function readBubble(owned, cauldron, bubble) {
    const row = cList.AlchemyDescription[cauldron][bubble];
    const level = Number(gga.CauldronInfo[cauldron][bubble]);
    const costs = [5, 6, 7, 8].flatMap((field, slot) => {
        const item = String(row[field]);
        if (item === "Blank") return [];
        return [{ item, cost: stats("CauldronCosts", cauldron, bubble, slot), owned: Number(owned[item]) || 0 }];
    });
    const liquids = costs.filter(({ item }) => item.startsWith("Liquid"));
    const first = String(row[5]);
    const firstCost = stats("CauldronCosts", cauldron, bubble, 0);
    let particle;
    if (!(gga.Atoms[4] > 0.5)) particle = { waiting: "Particles wait for the Atom Collider" };
    else if (first === "Bits" || first.startsWith("W6item")) particle = { waiting: "This bubble can't use particles" };
    else if (!(firstCost >= 1e8)) particle = { waiting: "Particles open once the first cost reaches 100M" };
    else {
        const cost = events(579)._customBlock_AtomCollider("AtomBubbleUpgCost", bubble, firstCost);
        let waiting = null;
        if (!(gga.OptionsListAccount[135] > 0)) waiting = "Particles wait for an upgrade charge";
        else if (!(gga.Divinity[39] >= cost)) waiting = "Not enough particles";
        else if (liquids.some((slot) => slot.owned < slot.cost)) waiting = "Not enough liquid for a particle buy";
        particle = { cost, liquids, waiting };
    }
    return {
        id: `${cauldron}:${bubble}`,
        name: String(row[0]),
        level,
        // null for bubbles without a max.
        percent: DECAY.includes(row[3]) ? (100 * level) / (level + Number(row[2])) : null,
        costs,
        particle,
    };
}

// Placeholder rows are named "BUBBLE" and never get a level.
const bubbleRows = (cauldron) =>
    cList.AlchemyDescription[cauldron].flatMap((row, bubble) => (row[0] === "BUBBLE" ? [] : [bubble]));

/** Why buying waits right now; null when it may buy. */
function waiting() {
    if (!inMap()) return "Waiting for a character to be in game";
    if (gga.MenuType2 === 21) return "Paused while the alchemy menu is open";
    // Any bubble buy uses up every Bargain Tag, so they are left for a bubble you pick.
    if (gga.OptionsListAccount[62] > 0) return "Paused while you hold Bargain Tags";
    return null;
}

// The page-wide target: one decimal from 0 to 99.9 (a decay bubble never reaches 100%); anything else raises nothing.
const targetOf = (target) => Math.min(Number(target), 99.9);

/** Bubbles per cauldron with their bonus text, level, % of max, costs and particle option, for the Automation tab. */
export function getAutomationBubbles() {
    return onBubblesTab((menu) => {
        const owned = ownedItems(menu);
        return {
            waiting: waiting(),
            atoms: gga.Atoms[4] > 0.5,
            particles: gga.Divinity[39],
            charges: gga.OptionsListAccount[135],
            cauldrons: CAULDRONS.map((name, cauldron) => ({
                name,
                bubbles: bubbleRows(cauldron).map((bubble) => {
                    const data = readBubble(owned, cauldron, bubble);
                    return {
                        ...data,
                        bonus: bonusText(menu, cauldron, bubble, cList.AlchemyDescription[cauldron][bubble]),
                        costs: data.costs.map(({ item, cost, owned: have }) => ({
                            name: currencyName(item),
                            cost,
                            short: have < cost,
                            liquid: item.startsWith("Liquid"),
                        })),
                        particle: { cost: data.particle.cost ?? null, waiting: data.particle.waiting },
                    };
                }),
            })),
        };
    });
}

/**
 * How far a switched-on bubble is towards its goal, 1 meaning done: % of max over the target for decay
 * bubbles, where a stop-at only caps (so the lowest % of max still goes first), and level over stop-at for the
 * others. null when it can't have a goal (no max and no stop-at).
 */
function progress({ percent, level }, target, stopAt) {
    const hasStop = stopAt !== undefined && stopAt !== null;
    if (percent === null) return hasStop ? (stopAt > 0 ? level / stopAt : 1) : null;
    if (hasStop && level >= stopAt) return 1;
    // A target of 0, or one that isn't a number, has every decay bubble done.
    return target > 0 ? percent / target : Infinity;
}

/** The game's buy with the menu closed; the "+n" level popup it spawns at the panel's spot is taken away after. */
function buyWithoutPopup(menu) {
    popups = [];
    try {
        menu._customEvent_BubbleHoldDown();
    } finally {
        const spawned = popups;
        popups = null;
        spawned.forEach((actor) => behavior.recycleActor(actor));
    }
}

/** The createRecycledActor hook hands every actor the game creates here; only those a bubble buy spawned are kept. */
export function noteBubblePopup(actor) {
    if (popups && actor) popups.push(actor);
}

/**
 * The bubbles that may buy now, each with its progress as the cost, so the engine's cheapest-first buys the one
 * furthest behind. The menu's buy event skips its affordability check with the menu closed (that check only covers
 * cost icons on screen) and would take currencies below 0, so every slot is checked here; a Particles row only buys
 * with particles, once the particle buy is open and affordable.
 */
function buyable(menu, settings, target) {
    const owned = ownedItems(menu);
    return [0, 1, 2, 3].flatMap((cauldron) =>
        bubbleRows(cauldron).flatMap((bubble) => {
            const entry = settings.get(`${cauldron}:${bubble}`);
            // Level 0 is undiscovered: the menu doesn't let it be picked, so neither does this.
            if (!entry?.on || !(gga.CauldronInfo[cauldron][bubble] > 0)) return [];
            const data = readBubble(owned, cauldron, bubble);
            const done = progress(data, target, entry.stopAt);
            if (done === null || done >= 1) return [];
            const particles = entry.pay === "particles";
            const affordable = particles
                ? data.particle.liquids && !data.particle.waiting
                : data.costs.every(({ cost, owned: have }) => have >= cost);
            if (!affordable) return [];
            return [
                {
                    cost: done,
                    buy: () => {
                        const before = gga.CauldronInfo[cauldron][bubble];
                        menu._GenINFO[39] = [cauldron, bubble];
                        menu._TRIGGERtext2 = particles ? "bubbleParticle" : "bubbleNormal";
                        // The event wants the particle flag the open panel computes; the checks above stand in for it.
                        menu._ParticleAfford = 1;
                        buyWithoutPopup(menu);
                        bought += gga.CauldronInfo[cauldron][bubble] - before;
                    },
                },
            ];
        })
    );
}

export const startBubbles = () => {
    bought = 0;
};

/** One tick: raise what qualifies, the bubble furthest behind first, re-reading after every buy. */
export function runBubbles() {
    const { target, items } = cheatConfig.automation.bubbles;
    if (!items.some((entry) => entry.on) || waiting()) return;
    const settings = new Map(items.map((entry) => [String(entry.id), entry]));
    onBubblesTab((menu) =>
        buyCheapestFirst(
            () => buyable(menu, settings, targetOf(target)),
            () => Infinity
        )
    );
}

export function bubblesStatus() {
    const { target, items } = cheatConfig.automation.bubbles;
    const on = items.filter((entry) => entry.on).length;
    if (!on) return "No bubble is switched on";
    const wait = waiting();
    if (wait) return wait;
    const raising = `Raising ${on === 1 ? "1 bubble" : `${on} bubbles`} to ${targetOf(target)}%`;
    return bought ? `${raising}; ${bought === 1 ? "1 level" : `${bought} levels`} since it started` : raising;
}
