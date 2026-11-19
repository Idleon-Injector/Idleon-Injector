/**
 * ActorEvents_34 hooks: item get notifications
 *
 * - Hide item pickup notifications for autoloot
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { events, behavior, gga, gameContext } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

// Around: a notification the game showed can't be hidden, so its actor is recycled before the game runs.
defineHook(
    { id: "wide.autoloot", target: () => events(34).prototype, method: "_event_ItemGet", around: true },
    function (callOriginal) {
        if (
            cheatState.wide.autoloot &&
            cheatConfig.wide.autoloot.hidenotifications &&
            [0, 1].includes(this._Deployment)
        ) {
            gameContext.HxOverrides.remove(gga.ItemGetPixelQueue, this.actor);
            return behavior.recycleActor(this.actor);
        }
        return callOriginal();
    }
);
