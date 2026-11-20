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
        { name: "grimoire", message: "buy switched-on Grimoire upgrades with bones" },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        grimoire: {
            saving: {
                default: 10,
                description:
                    "Automation: while a bone type saves for its cheapest High or Low upgrade, Balanced upgrades may cost up to this % of it.",
            },
            items: {
                default: [],
                description:
                    "Automation: Grimoire upgrades to buy, { id: row, on, stopAt, priority }; stopAt is a level, priority 1 is High, 2 Low, none Balanced.",
            },
        },
    },
});
