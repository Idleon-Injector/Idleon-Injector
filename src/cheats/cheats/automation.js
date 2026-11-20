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
        {
            name: "construction",
            message: "build switched-on W3 buildings and pay their salt, as the build button does",
        },
    ],
    config: {
        shops: {
            default: [],
            description:
                'Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.',
        },
        construction: {
            default: [],
            description:
                "Automation: W3 buildings to build, { id, on, stopAt, priority }; id is the building (0-8 buildings, 9-17 towers, 18-26 shrines), priority 1 is High and 2 Low. Empty slots take High, Low, then Balanced buildings, the closest to done first, up to stopAt; the 8th slot stays free once it feeds the Menagerie jelly.",
        },
    },
});
