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
        { name: "bubba", message: "buy switched-on Bubba upgrades with meat once the run's gift is picked" },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        bubba: {
            saving: {
                default: 10,
                description:
                    "Automation: Bubba's saving %, how much of a High or Low upgrade's cost a Balanced one may spend",
            },
            items: {
                default: [],
                description:
                    "Automation: Bubba upgrades to buy with meat, { id, on, stopAt, priority }; priority 1 is High, 2 Low, none Balanced.",
            },
        },
    },
});
