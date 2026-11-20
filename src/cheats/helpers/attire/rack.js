/**
 * The Attire Rack's bonus (`wide attire`): the chosen outfits count as if worn, through the game's own stat code.
 *
 * The game works out the character in play's stats in events(12)._customBlock_TotalStats and keeps each one in a
 * cache (DNSM.TotStatMAP). While outfits are on the rack, the TotalStats hook refills that cache by running the
 * game's method again with the attire slot holding a made-up outfit: the worn one's stats plus the chosen ones'.
 * The EquipmentOrder and ItemDefinitionsGET hooks show that outfit to the game, only while the refill runs. Each
 * chosen outfit's two bonuses go into the game's bonus map (TotalStatsETCmap), raised by the research grid bonus 172.
 * The worn outfit counts once; nothing counts in a dungeon.
 */

import { events, gga } from "../../core/globals.js";
import { cheatConfig, cheatState } from "../../core/state.js";
import { attireCatalog, configuredAttire } from "./outfits.js";

const RACK_ID = "AttireRackBonus";
const STATS = ["Weapon_Power", "STR", "AGI", "WIS", "LUK", "Defence"];

// While the game's method runs again for the rack: what EquipmentOrder and ItemDefinitionsGET show it. Else null.
let scope = null;
// What the stat cache was last refilled for; null once it holds only the game's own values (the hooks then rest).
let signature = null;
// The stat keys refilled since the game last emptied its cache.
let correctedCache = null;
const corrected = new Set();
// The bonus maps the chosen outfits' bonuses were added to.
const decorated = new WeakSet();

/** The EquipmentOrder hook: during a refill, an empty attire slot holds the rack's made-up outfit. */
export const rackEquipment = (stored) => (scope ? scope.equipment : stored);

/** The ItemDefinitionsGET hook: during a refill, the attire slot's item has the rack's stats. */
export const rackDefinitions = (stored) => (scope ? scope.definitions : stored);

/** The game data the refill shows, for the worn outfit `equipped` plus the outfits in `extra`. */
function rackScope(equipped, extra) {
    const definitions = gga.ItemDefinitionsGET;
    const order = gga.EquipmentOrder;
    const id = equipped === "Blank" ? RACK_ID : equipped;
    const definition = { ...definitions.h[equipped]?.h };
    for (const stat of STATS)
        definition[stat] = (Number(definition[stat]) || 0) + extra.reduce((sum, outfit) => sum + outfit.stats[stat], 0);
    // ponytail: objects that inherit from the game's own, with only the attire item in front, instead of copies.
    const items = Object.assign(Object.create(definitions.h), { [id]: { ...definitions.h[equipped], h: definition } });
    return {
        definitions: Object.create(definitions, { h: { value: items, enumerable: true } }),
        equipment: id === RACK_ID ? [Object.assign(order[0].slice(), { 15: RACK_ID }), ...order.slice(1)] : order,
    };
}

/**
 * The TotalStats hook (around). `callOriginal(args?)` runs the game's method. With the rack off it only runs the
 * game's method; the first call after the rack goes off puts the game's own values back.
 */
export function totalStatsWithRack(callOriginal, key) {
    if (scope || (!cheatState.wide.attire && signature === null)) return callOriginal();
    const base = callOriginal();
    const definitions = gga.ItemDefinitionsGET.h;
    const ids = cheatState.wide.attire ? configuredAttire(definitions, cheatConfig.wide.attire) : [];
    if (!ids.length && signature === null) return base;
    const equipped = gga.EquipmentOrder[0][15];
    const dungeon = ids.length > 0 && events(345)._customBlock_Dungon() !== -1;
    const research = ids.length && !dungeon ? Number(events(579)._customBlock_ResearchStuff("Grid_Bonus", 172, 0)) : 0;
    const next = ids.length ? JSON.stringify([gga.UserInfo[0], equipped, ids, dungeon, research]) : null;
    const changed = next !== signature;
    const extra = dungeon ? [] : attireCatalog(definitions).filter(({ id }) => id !== equipped && ids.includes(id));
    if (changed) {
        signature = next;
        gga.DNSM.h.TotStatMAP.h = {};
    }
    const cache = gga.DNSM.h.TotStatMAP.h;
    if (correctedCache !== cache) {
        correctedCache = cache;
        corrected.clear();
    }
    const multiplier = research >= 1 ? 1 + research / 100 : 1;
    const decorate = () => {
        const map = gga.DNSM.h.TotalStatsETCmap.h;
        if (decorated.has(map)) return;
        decorated.add(map);
        for (const outfit of extra)
            for (const bonus of outfit.bonuses)
                map[bonus.key] = (Number(map[bonus.key]) || 0) + bonus.value * multiplier;
    };
    if (key === "calcEtcBonuses" && !changed) {
        decorate();
        return base;
    }
    if (!changed && (!extra.length || corrected.has(key))) return base;
    if (extra.length) scope = rackScope(equipped, extra);
    try {
        // The first call kept the game's side effects. Refill only a stale or not yet refilled cache entry, under the
        // rack's view; a cache hit is never run again.
        let etc = base;
        if (changed) {
            delete cache.calcEtcBonuses;
            etc = callOriginal(["calcEtcBonuses"]);
            decorate();
        }
        if (key === "calcEtcBonuses") return etc;
        delete cache[key];
        const result = callOriginal();
        corrected.add(key);
        return result;
    } catch (error) {
        gga.DNSM.h.TotStatMAP.h = {};
        signature = null;
        throw error;
    } finally {
        scope = null;
    }
}
