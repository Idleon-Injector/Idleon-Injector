/**
 * ActorEvents_312 hooks: items menu
 *
 * - Talent preset reset anywhere
 */

import { cheatState } from "../core/state.js";
import { events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

// Around: the game checks the map while it resets, so the map reads as town during the call.
defineHook(
    { id: "unlock.presets", target: () => events(312).prototype, method: "_event_resetTalPresets", around: true },
    (callOriginal) => {
        if (cheatState.unlock.presets) {
            const originalMap = gga.CurrentMap;
            gga.CurrentMap = 0;
            callOriginal();
            gga.CurrentMap = originalMap;
            return;
        }
        return callOriginal();
    }
);
