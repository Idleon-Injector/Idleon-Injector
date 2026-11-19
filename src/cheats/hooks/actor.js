/**
 * Actor model hooks (com.stencyl.models.Actor)
 *
 * - internalUpdate: no animations
 */

import { cheatState } from "../core/state.js";
import { ActorModel } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

// Around: animation time is an argument, so it must change before the game updates the actor.
defineHook(
    { id: "wide.noanim", target: () => ActorModel.prototype, method: "internalUpdate", around: true },
    (callOriginal, elapsed, isAnimationTime) =>
        callOriginal([elapsed, cheatState.wide?.noanim ? false : isAnimationTime])
);
