/**
 * Attire Rack: the outfits (attire items), the ones `wide attire` gives, and the attire each character wears.
 * The Attire Rack page reads these through readComputed("attire", ...).
 */

import { events, gga } from "../../core/globals.js";

const STATS = ["Weapon_Power", "STR", "AGI", "WIS", "LUK", "Defence"];

// ponytail: keyed by the definitions object, which the game builds once per load; a game update brings a new one.
const catalogs = new WeakMap();

/**
 * Every outfit in the item definitions: id, name, its base stats and its two bonuses. EquipmentGown0 is not an
 * outfit.
 * @param {object} definitions - ItemDefinitionsGET.h
 * @returns {{ id: string, name: string, stats: object, bonuses: { key: string, value: number }[] }[]}
 */
export function attireCatalog(definitions) {
    if (!catalogs.has(definitions))
        catalogs.set(
            definitions,
            Object.entries(definitions)
                .filter(
                    ([id, { h: item }]) =>
                        /^EquipmentGown\d+$/.test(id) && id !== "EquipmentGown0" && item.typeGen === "aGown"
                )
                .map(([id, { h: item }]) => ({
                    id,
                    name: String(item.displayName ?? id).replace(/[_|]/g, " "),
                    stats: Object.fromEntries(STATS.map((key) => [key, Number(item[key]) || 0])),
                    bonuses: [1, 2]
                        .filter((n) => item[`UQ${n}txt`] !== "0" && Number(item[`UQ${n}val`]))
                        .map((n) => ({ key: item[`UQ${n}txt`], value: Number(item[`UQ${n}val`]) })),
                }))
        );
    return catalogs.get(definitions);
}

/**
 * The outfits `wide attire` gives, in catalog order. `outfits` is "all" (the outfits of this game version, so ones a
 * game update adds count too), ids separated by commas, or "" for none.
 * @param {object} definitions - ItemDefinitionsGET.h
 * @param {{ outfits?: string }} config - cheatConfig.wide.attire
 * @returns {string[]}
 */
export function configuredAttire(definitions, config) {
    const ids = attireCatalog(definitions).map(({ id }) => id);
    const choice = config?.outfits ?? "all";
    if (choice === "all") return ids;
    const chosen = new Set(
        String(choice)
            .split(",")
            .map((id) => id.trim())
    );
    // ponytail: an id that is no outfit (a typo, or one a game update removed) is skipped; the stat hook calls this,
    // and an error there would break the game's stats.
    return ids.filter((id) => chosen.has(id));
}

/** A character's attire slot: equipment row 0, slot 15, in the live or saved copy. Null when it isn't there. */
function attireSlots(player) {
    if (
        !Array.isArray(player?.EquipmentOrder?.[0]) ||
        player.EquipmentOrder[0].length < 16 ||
        !Array.isArray(player.EquipmentQuantity?.[0]) ||
        player.EquipmentQuantity[0].length < 16 ||
        !player.EquipmentMap?.[0]?.[15]?.h
    )
        return null;
    return { item: player.EquipmentOrder[0][15] };
}

/**
 * Each character's attire. The character in play is read from the live copy, the others from PlayerDATABASE.
 * `available`: the slot is there to change; `saved`: the PlayerDATABASE copy has the slot too (the page writes it).
 */
export function characterAttire(attributes) {
    const active = attributes.UserInfo[0];
    return attributes.GetPlayersUsernames.filter((name) => typeof name === "string" && name.length).map((name) => {
        const saved = attireSlots(attributes.PlayerDATABASE.h[name]?.h);
        const shown = name === active ? attireSlots(attributes) : saved;
        return {
            name,
            active: name === active,
            available: Boolean(shown),
            saved: Boolean(saved),
            item: shown?.item ?? "Blank",
        };
    });
}

/** What the Attire Rack page shows: the outfits, who is in play and each character's attire. */
export function attireStatus() {
    return {
        outfits: attireCatalog(gga.ItemDefinitionsGET.h),
        current: gga.UserInfo[0],
        characters: characterAttire(gga),
    };
}

/**
 * Work out the active character's stats again, as the game does when gear changes: empty the stat cache, then
 * rebuild the bonus map. The page calls this after it changes attire, and after an undo of that change.
 * @returns {ReturnType<typeof attireStatus>}
 */
export function recalculateStats() {
    gga.DNSM.h.TotStatMAP.h = {};
    events(12)._customBlock_TotalStats("calcEtcBonuses");
    return attireStatus();
}
