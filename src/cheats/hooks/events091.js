/**
 * ActorEvents_91 hooks: player name rendering
 *
 * - Hide the in-world name tags under players
 */

import { cheatState } from "../core/state.js";
import { events } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

const hideNameImages = (instance) => {
    if (!instance?._NameImgInst) return;

    for (const group of instance._NameImgInst) {
        if (!Array.isArray(group)) continue;
        for (const img of group) {
            if (img?.set_alpha) img.set_alpha(0);
        }
    }
};

for (const method of ["_event_Updating", "init"]) {
    defineHook({ id: "wide.hidenames", target: () => events(91).prototype, method }, function (base) {
        if (cheatState.wide.hidenames) hideNameImages(this);
        return base;
    });
}
