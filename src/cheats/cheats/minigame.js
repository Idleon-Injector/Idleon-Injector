/**
 * Minigame Cheats
 *
 * Cheats for minigame manipulation:
 * - Mining, Fishing, Catching, Choppin, Poing
 * - Hoops, Darts, Wisdom Monument, Scratch, Minehead, Gold Pot Rush, Event Card Game, Event Wheel
 *
 * The hooks that read these toggles are in hooks/minigames.js.
 * These commands only toggle cheatState booleans.
 */

import { defineCheat } from "../core/registration.js";

// Register minigame cheats
defineCheat({
    name: "minigame",
    message: "unlimited minigames",
    subcheats: [
        { name: "mining", message: "mining minigame cheat" },
        { name: "fishing", message: "fish aimbot" },
        { name: "catching", message: "catching minigame cheat" },
        { name: "choppin", message: "choppin minigame cheat" },
        { name: "poing", message: "poing minigame cheat" },
        { name: "hoops", message: "hoops minigame cheat" },
        { name: "darts", message: "darts minigame cheat" },
        { name: "wisdom", message: "wisdom monument minigame cheat" },
        { name: "scratch", message: "event scratch minigame cheat" },
        { name: "minehead", message: "minehead minigame visual reveal" },
        { name: "log", message: "gaming log minigame card reveal" },
        { name: "valentine", message: "valentine chocolate minigame cheat" },
        { name: "goldrush", message: "gold pot rush ball drop speed cheat" },
        { name: "card", message: "event card game cheat" },
        { name: "wheel", message: "event wheel always lands on the bonus" },
        { name: "instawheel", message: "instant event wheel spins without changing the odds" },
    ],
    config: {
        fishing: {
            skipWhale: {
                default: true,
                description: "Fishing: the fish aimbot skips the whale (turn off for megalodon farming)",
            },
        },
    },
});
