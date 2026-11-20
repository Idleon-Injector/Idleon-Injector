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
        { name: "bubbles", message: "raise switched-on alchemy bubbles with their materials or particles" },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        bubbles: {
            target: {
                default: 90,
                description: "Automation: bubbles that have a max are raised to this % of it (0 to 99.9).",
            },
            items: {
                default: [],
                description:
                    'Automation: alchemy bubbles to raise, { id: "cauldron:bubble", on, stopAt, pay }; stopAt is a level, pay is "particles" or left out for materials.',
            },
        },
    },
});
