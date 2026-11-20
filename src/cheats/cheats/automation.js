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
        { name: "sneaking", message: "buy switched-on Ninja Knowledge upgrades with jade coins" },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        sneaking: {
            saving: {
                default: 10,
                description:
                    "Automation, Sneaking: while saving for a High or Low upgrade, Balanced ones may cost up to this % of it.",
            },
            items: {
                default: [],
                description:
                    'Automation, Sneaking: Ninja Knowledge upgrades to buy with jade, { id: "row", on, stopAt, priority }; priority 1 is High, 2 Low, none Balanced. No max level, so give each a stopAt.',
            },
        },
    },
});
