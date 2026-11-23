/**
 * Pet pictures, read from the running game's own sprite. Nothing is saved: the server hands each one to the menu.
 */

import { cList, gameContext, monsterDefs } from "../core/globals.js";

// Each pet's idle frames and the part of them the pet fills, worked out once per game session.
const idleOf = new Map();

/**
 * A pet's idle frames (the ones the game's pet menu loops: it jumps back to frame 0 at the monster's MovingFrame) and
 * the box the pet fills across them. A frame also holds room for the death animation, which the picture leaves out.
 * Null for a pet with no picture; undefined while the game hasn't loaded its monsters yet (asked again later).
 */
function readIdle(key) {
    // ponytail: resource 2 is the game's "Monster" sprite, which holds every monster's animation (checked 2026-11-23).
    const resources = gameContext["com.stencyl.Data"].get().resources;
    // The game loads the sprite with the first monster it shows. Loading it here instead stalls the game for about
    // a second (character select), so until then there are no pictures and the rows show names.
    if (!(2 in resources.map.h)) return undefined;
    const sprite = resources.get(2);
    const anim = Object.values(sprite.animations.h).find((entry) => entry.animName === key);
    if (!anim?.frames[0]?.readable) return null;
    const def = monsterDefs[key].h;
    // A pet without a MovingFrame (w5c2) plays up to its death frames.
    const count = Number(def.MovingFrame) || Number(def.DeathFrame) || anim.frames.length;
    const canvases = anim.frames.slice(0, count).map((frame) => frame.image.buffer.__srcCanvas);
    const { width, height } = canvases[0];
    // Every idle frame drawn over one another, read back once: the pixels the pet ever fills.
    const union = document.createElement("canvas");
    union.width = width;
    union.height = height;
    const pen = union.getContext("2d");
    canvases.forEach((canvas) => pen.drawImage(canvas, 0, 0));
    const pixels = new Uint32Array(pen.getImageData(0, 0, width, height).data.buffer);
    const bounds = { left: width, top: height, right: 0, bottom: 0 };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!pixels[y * width + x]) continue;
            if (x < bounds.left) bounds.left = x;
            if (x >= bounds.right) bounds.right = x + 1;
            if (y < bounds.top) bounds.top = y;
            bounds.bottom = y + 1;
        }
    }
    if (bounds.right <= bounds.left) return null;
    return { canvases, bounds, durations: anim.durations.slice(0, count).map(Number) };
}

/**
 * One pet's picture as a PNG data URL, at the size the game draws it, cut to the pet.
 *
 * `idle` false: frame 0, the pet standing still. `idle` true: its idle frames side by side in one strip, with how long
 * each one shows. Both are cut the same way, so frame 0 of the strip is the still.
 * Null when the game has no picture (pets 93 and 97) or won't hand the canvas over (disposed or unreadable images).
 * About 1 ms a pet the first time; the menu asks for a few at a time, since all 177 in one go stalls the game a frame.
 *
 * @param {number} id - the pet's index in CompanionDB
 * @param {boolean} [idle]
 * @returns {{ png: string, width: number, height: number, durations: number[] } | null}
 */
export function getPetPicture(id, idle = false) {
    const key = String(cList.CompanionDB[id]?.[0]);
    try {
        let pet = idleOf.get(key);
        if (pet === undefined) {
            pet = readIdle(key);
            if (pet !== undefined) idleOf.set(key, pet);
        }
        if (!pet) return null;
        const { left, top, right, bottom } = pet.bounds;
        const width = right - left;
        const height = bottom - top;
        const frames = idle ? pet.canvases : pet.canvases.slice(0, 1);
        const strip = document.createElement("canvas");
        strip.width = width * frames.length;
        strip.height = height;
        const draw = strip.getContext("2d");
        frames.forEach((canvas, index) =>
            draw.drawImage(canvas, left, top, width, height, index * width, 0, width, height)
        );
        return { png: strip.toDataURL("image/png"), width, height, durations: pet.durations.slice(0, frames.length) };
    } catch {
        // A canvas the browser won't read back (Steam's file:// page, if it ever taints one) shows the name instead.
        return null;
    }
}
