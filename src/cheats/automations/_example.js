/**
 * Example automation: copy this file to start a new one.
 *
 * An automation is work that repeats while its toggle cheat is on. The build picks up every file in this folder, so
 * adding the file is all it takes; files starting with "_" are skipped, so this one never runs.
 *
 * The core runs `tick` every `interval` milliseconds while the cheat is on, and shows the cheat in the active-cheats
 * list. Never start a setInterval or setTimeout of your own: to wait, count ticks. A tick that throws is reported
 * and the next one runs as usual.
 */

import { defineAutomation } from "../core/automations.js";
import { gga } from "../core/globals.js";

let heals = 0;

defineAutomation({
    id: "example.autoheal",
    // A toggle declared by a defineCheat row (see cheats/_example.js): turning it on starts this, off stops it.
    cheat: "example autoheal",
    interval: 1000,
    tick() {
        if (gga.PlayerHP >= 100) return;
        gga.PlayerHP = 100;
        heals++;
    },
    // What the menu shows while it runs.
    status: () => `Healed ${heals} times`,
    // Optional: runs when it turns on, before the first tick. Throw to refuse to start; the toggle stays off.
    start() {
        heals = 0;
    },
});
