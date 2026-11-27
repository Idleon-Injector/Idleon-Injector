/**
 * Bundles Helper
 *
 * Functions for working with gem shop bundles.
 */

import { gameContext, gga } from "../core/globals.js";
import { knownBundles } from "../constants.js";

/**
 * The free inventory slots a pack needs. The game drops a pack without them: no items, and it isn't received
 * (N.js, game version 144, the SERVER_ITEM_BUNDLE message):
 *   "bun_b"==b[2]?1!=BundlesReceived.h.bun_b&&3<=OpenInvSpace()&&(GiveItem(...),BundlesReceived.h.bun_b=1)
 * The other packs (bun_a only needs a "Blank" anywhere in InventoryOrder) don't ask.
 * ponytail: copied from the game by hand; a game update that changes a pack's items can change its count.
 */
export const bundleSlots = {
    bun_b: 3,
    bun_c: 1,
    bun_d: 4,
    bun_e: 3,
    bun_f: 3,
    bun_g: 1,
    bun_h: 4,
    bun_j: 2,
    bun_k: 3,
    bun_l: 4,
    bun_m: 1,
    bun_n: 2,
    bun_o: 1,
    bun_p: 1,
    bun_q: 1,
    bun_r: 5,
    bun_t: 2,
    bun_u: 1,
    bun_v: 1,
    bun_w: 2,
    bun_x: 1,
    bun_z: 1,
    bon_g: 1,
    bon_i: 1,
    bon_l: 1,
    bon_s: 1,
    bon_v: 1,
    ban_b: 2,
    ban_c: 2,
    ban_g: 1,
    ban_h: 2,
    ban_j: 5,
    ban_l: 1,
    ban_n: 2,
    ban_o: 1,
};

/** The character in play's free inventory slots, counted as the game's OpenInvSpace does. */
export function freeInventorySlots() {
    let free = 0;
    for (let slot = 0; slot < Number(gga.InventorySlotsOwned); slot++) {
        if (gga.InventoryOrder[slot] === "Blank" && Number(gga.ItemQuantity[slot]) === 0) free++;
    }
    return free;
}

// Where the game keeps a pack's picture (the gem shop's banner) in its files.
const picturePath = (code) => `assets/data/${code}.png`;

const getBundleMessages = () => {
    return gameContext["scripts.CustomMapsREAL"].GemPopupBundleMessages().h || {};
};

/**
 * Get all available bundles, merging known bundles with game data.
 *
 * @returns {Array<[string, string]>} Array of [displayName, bundleCode] tuples
 */
export function getAllBundles() {
    const bundleMessages = getBundleMessages();
    const allBundles = [...knownBundles];

    for (const [key] of Object.entries(bundleMessages)) {
        if (key === "Blank") continue;
        if (!allBundles.some((bundle) => bundle[1] === key)) {
            allBundles.push(["Unknown", key]);
        }
    }

    return allBundles;
}

/**
 * Return the current bundle catalog with live ownership flags.
 *
 * The page intentionally displays only manually named entries from knownBundles.
 * Live discovery remains available through getAllBundles() for autocomplete.
 * Ownership is intentionally read-only here: buying is handled by the existing
 * game/Firebase cheat flow.
 *
 * `picture`: the game has the pack's picture loaded, so getBundlePicture can hand it over. `notOutYet`: the game's
 * files have no picture for the pack (Robot Pack, game of 2026-11-21): the game lists it but doesn't sell it yet, and
 * buying it gives nothing but the received mark.
 *
 * @returns {Array<{ code: string, name: string, owned: 0 | 1, slots: number, picture: boolean, notOutYet: boolean }>}
 *   `slots`: see bundleSlots
 */
export function getBundleCatalog() {
    const bundlesReceived = gga.BundlesReceived.h;
    const assets = gameContext["lime.utils.Assets"];
    const loaded = assets.getLibrary("default").cachedImages.h;

    return knownBundles.map(([name, code]) => ({
        code,
        name,
        owned: Number(bundlesReceived[code]) === 1 ? 1 : 0,
        slots: bundleSlots[code] ?? 0,
        picture: Boolean(loaded[picturePath(code)]),
        notOutYet: !assets.exists(picturePath(code)),
    }));
}

/**
 * A pack's picture, read from the running game: the gem shop's banner for it (711x130 for most), as a PNG data URL.
 * Nothing is saved: the server hands it to the menu. The game loads every pack's banner with its other pictures at
 * start (checked 2026-11-27, character select and in play), so nothing has to open the gem shop.
 * Null for a code that isn't a known pack, a pack without a loaded picture, or an image the browser won't read back.
 * About 8 ms a picture (they're big), so the server hands them out one at a time.
 *
 * @param {string} code - a pack's code, `bun_a`
 * @returns {string | null}
 */
export function getBundlePicture(code) {
    if (!knownBundles.some(([, known]) => known === code)) return null;
    const image = gameContext["lime.utils.Assets"].getLibrary("default").cachedImages.h[picturePath(code)];
    if (!image) return null;
    try {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").drawImage(image.buffer.__srcCanvas ?? image.buffer.__srcImage, 0, 0);
        return canvas.toDataURL("image/png");
    } catch {
        // A disposed or tainted image (Steam's file:// page, if it ever taints one) shows the name instead.
        return null;
    }
}

/**
 * Get a map from bundle code to display name.
 *
 * @returns {Map<string, string>} Map of bundleCode -> displayName
 */
export function getBundleCodeToNameMap() {
    return new Map(getAllBundles().map(([name, code]) => [code, name]));
}
