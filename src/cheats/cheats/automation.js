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
        { name: "orion", message: "buy switched-on Orion upgrades with feathers" },
        { name: "poppy", message: "buy switched-on Poppy upgrades with fish while her menu is open" },
        { name: "tarpit", message: "buy switched-on Tar Pit upgrades with tartar fish while Poppy's menu is open" },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        // Orion's preset: The Great Mega Reset is High and Feather Restart Low, both switched off.
        orion: {
            default: [
                { id: "8", on: false, priority: 1 },
                { id: "4", on: false, priority: 2 },
            ],
            description:
                "Automation: Orion upgrades to buy, { id: row, on, stopAt, priority }; stopAt is a level, priority 1 is High and 2 Low (none is Balanced).",
        },
        orionSaving: {
            default: 10,
            description:
                "Automation: while Orion saves for a High or Low upgrade, Balanced ones may cost up to this % of it.",
        },
        poppy: {
            default: [],
            description: "Automation: Poppy upgrades to buy, { id: row, on, stopAt, priority }, like orion.",
        },
        poppySaving: {
            default: 10,
            description:
                "Automation: while Poppy saves for a High or Low upgrade, Balanced ones may cost up to this % of it.",
        },
        tarpit: {
            default: [],
            description: "Automation: Tar Pit upgrades to buy, { id: row, on, stopAt, priority }, like orion.",
        },
        tarpitSaving: {
            default: 10,
            description:
                "Automation: while the Tar Pit saves for a High or Low upgrade, Balanced ones may cost up to this % of it.",
        },
    },
});
