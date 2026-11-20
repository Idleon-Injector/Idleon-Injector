/**
 * Automation: buying the game would have the player click through, done with the game's own prices and currency.
 *
 * Each system is one toggle here ("automation shops") that turns on its automation in src/cheats/automations/, and
 * one key of cheatConfig.automation holding what it buys. Account › Automation lists every "automation" toggle.
 */

import { defineCheat } from "../core/registration.js";
import { ESSENCES } from "../helpers/automation/summoning.js";

defineCheat({
    name: "automation",
    message: "automation",
    registerParent: false,
    subcheats: [
        { name: "shops", message: "buy switched-on town shop items into the chest with chest coins" },
        { name: "summoning", message: "buy switched-on summoning board upgrades with essence" },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        summoning: {
            default: [],
            description:
                'Automation: summoning upgrades to buy, { id: "upgrade index", on, stopAt, priority }; stopAt is a level, priority 1 is High, 2 Low, none Balanced.',
        },
        // One saving % per essence colour, so a colour's goal never holds up another colour.
        summoningSaving: Object.fromEntries(
            ESSENCES.map((colour) => [
                colour,
                {
                    default: 10,
                    description: `Automation: while a High or Low summoning upgrade saves ${colour} essence, Balanced ones may spend up to this % of its cost.`,
                },
            ])
        ),
    },
});
