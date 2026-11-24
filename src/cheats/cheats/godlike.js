/**
 * Godlike Cheats
 *
 * Overpowered combat cheats:
 * - reach, crit, ability, food, hitchance, intervention
 * - speed, card, poison, respawn, hp
 */

import { defineCheat } from "../core/registration.js";

defineCheat({
    name: "godlike",
    category: "Combat",
    message: "all godlike powers",
    // One switch for the whole family is gone (#23): each cheat is on its own, in its group or on its page.
    registerParent: false,
    subcheats: [
        { name: "reach", message: "reach set to 666" },
        { name: "crit", message: "crit set to 100" },
        { name: "ability", message: "no cooldown, no mana cost, cast time 0.1s" },
        { name: "food", message: "food deduction nullification" },
        { name: "hitchance", message: "hitchance set to 100" },
        { name: "intervention", message: "instant divine intervention" },
        { name: "speed", message: "weapon super speed (default 9)", configurable: true },
        { name: "card", message: "All cards get 100x stat multiplier" },
        { name: "poison", message: "instant bubo poison" },
        { name: "respawn", message: "instant mob respawn" },
        { name: "hp", message: "never lose hp, become invincible (when active)" },
    ],
    config: {
        respawn: { default: (t) => Math.min(t, 1), description: "Mob respawn time (lower is faster)" },
    },
});
