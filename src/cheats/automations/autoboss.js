/**
 * Autoboss: while "wide autoboss" is on, a boss map whose boss was seen alive and then dead reloads 5 seconds later.
 */

import { defineAutomation } from "../core/automations.js";
import { behavior, gga } from "../core/globals.js";

const bossMaps = new Set([29, 66, 114, 165, 214, 266]);
let armed = false; // the boss was seen alive
let reloadIn = 0; // seconds until the map reloads; 0 when no reload is due
let map = null;

const reset = () => {
    armed = false;
    reloadIn = 0;
};

defineAutomation({
    id: "wide.autoboss",
    cheat: "wide autoboss",
    interval: 1000,
    tick() {
        if (!bossMaps.has(gga.CurrentMap)) return reset();
        if (gga.CurrentMap !== map) {
            map = gga.CurrentMap;
            reset();
        }
        if (gga.BossHP > 0) armed = true;
        else if (armed && !reloadIn) {
            armed = false;
            reloadIn = 5;
            return;
        }
        if (reloadIn && --reloadIn === 0) {
            armed = false;
            behavior.reloadCurrentScene(behavior.createFadeOut(0.4, 0), behavior.createFadeIn(0.5, 0));
        }
    },
    stop: reset,
    status: () => {
        if (!bossMaps.has(gga.CurrentMap)) return "Not on a boss map";
        if (reloadIn) return `Reloading the map in ${reloadIn} s`;
        return armed ? "Waiting for the boss to die" : "Waiting for a boss";
    },
});
