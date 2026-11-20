/**
 * Automation: buying the game would have the player click through, done with the game's own prices and currency.
 *
 * Each system is one toggle here ("automation shops") that turns on its automation in src/cheats/automations/, and
 * one key of cheatConfig.automation holding what it buys. Account › Automation lists every "automation" toggle.
 */

import { defineCheat } from "../core/registration.js";

defineCheat({
    name: "automation",
    message: "automation",
    registerParent: false,
    subcheats: [
        { name: "shops", message: "buy switched-on town shop items into the chest with chest coins" },
        { name: "cooking", message: "level switched-on kitchen upgrades with spices and meals with themselves" },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        kitchens: {
            default: [],
            description:
                "Automation: kitchen upgrades to level, { id: 3 * kitchen + slot (0 Speed, 1 Fire, 2 Luck), on, stopAt, priority (1 High, 2 Low) }.",
        },
        kitchenSaving: {
            default: Array(21).fill(10),
            description:
                "Automation: per spice, the % of what it saves for that Balanced kitchen upgrades may spend meanwhile.",
        },
        meals: {
            default: [],
            description: "Automation: meals to level with their own quantity, { id: meal index, on, stopAt }.",
        },
    },
});
