/**
 * ActorEvents_20 hooks: player actor init
 *
 * - Big model scale for all players
 */

import { cheatState, cheatConfig } from "../core/state.js";
import { events } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

// Around: the player's growTo is swapped while init runs, so it never shows at normal size when maps change.
defineHook(
    { id: "wide.bigmodel", target: () => events(20).prototype, method: "init", around: true },
    function (callOriginal) {
        if (!cheatState.wide.bigmodel) {
            return callOriginal();
        }

        const actor = this.actor;
        const originalGrowTo = actor.growTo;

        const targetSize = cheatConfig.wide.bigmodel;
        const targetScale = targetSize / 100;

        actor.growTo = function (...growArgs) {
            return Reflect.apply(originalGrowTo, this, [targetScale, targetScale, ...growArgs.slice(2)]);
        };

        const base = callOriginal();

        this._PlayerSize = targetSize;
        actor.growTo = originalGrowTo;

        return base;
    }
);
