/**
 * ActorEvents_713 hooks (W7 spelunking)
 *
 * - SpelunkStuff (start the next dive at a chosen depth)
 */

import { events, gga } from "../core/globals.js";
import { cheatConfig } from "../core/state.js";
import { defineHook } from "../core/hooks.js";

defineHook(
    { id: "w7.spelunkdepth", target: () => events(713).prototype, method: "_customEvent_SpelunkStuff" },
    function (base) {
        // Only apply when spelunking menu is active (MenuType2 === 82)
        if (gga.MenuType2 !== 82) return base;

        const targetDepth = cheatConfig.w7.spelunkdepth;
        if (targetDepth && targetDepth > 0 && this._GenINFO) {
            this._GenINFO[70] = targetDepth - 1;
            cheatConfig.w7.spelunkdepth = 0;
        }
        return base;
    }
);
