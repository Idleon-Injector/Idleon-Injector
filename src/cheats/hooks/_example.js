/**
 * Example hook: copy this file to start a new one.
 *
 * The build picks up every file in this folder, so adding the file is all it takes; there is no list to edit.
 * Files starting with "_" are skipped, so this one never runs (godlike reach has its real hook in proxies/events012.js).
 */

import { cheatState } from "../core/state.js";
import { events } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

// Godlike reach: the player hits from anywhere.
defineHook(
    {
        // The feature this belongs to. If the game method is gone after an update, the WebUI reports it under this id.
        id: "godlike.reach",
        // The game object that owns the method. Looked up at setup, when the game globals are ready.
        target: () => events(12),
        // The game method to wrap.
        method: "_customBlock_PlayerReach",
    },
    // The game's method has already run (base first) and `base` is its result. Return what the game should get.
    (base) => {
        if (cheatState.godlike.reach) return 666;
        return base;
    }
);

// Need the game's method to run later, or not at all? See `around` in core/hooks.js. A class whose actors exist
// before setup? See `early`.
