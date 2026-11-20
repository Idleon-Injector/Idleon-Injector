/**
 * Automation: buying the game would have the player click through, done with the game's own prices and currency.
 *
 * Each system is one toggle here ("automation shops") that turns on its automation in src/cheats/automations/, and
 * one key of cheatConfig.automation holding what it buys: a list of { id, on, stopAt, ... }, one per item, as Shops
 * keeps it. A system-wide setting (a saving %, a target) is a key of its own beside the list. Account › Automation
 * lists every "automation" toggle.
 */

import { defineCheat } from "../core/registration.js";

const PRIORITY = "priority 1 is High, 2 Low, none Balanced";
const saving = (what) => ({
    default: 10,
    description: `Automation: while ${what} saves for a High or Low upgrade, Balanced ones may cost up to this % of it.`,
});

defineCheat({
    name: "automation",
    message: "automation",
    registerParent: false,
    subcheats: [
        { name: "shops", message: "buy switched-on town shop items into the chest with chest coins" },
        { name: "orion", message: "buy switched-on Orion upgrades with feathers" },
        { name: "poppy", message: "buy switched-on Poppy upgrades with fish while her menu is open" },
        { name: "tarpit", message: "buy switched-on Tar Pit upgrades with tartar fish while Poppy's menu is open" },
        { name: "bubbles", message: "raise switched-on alchemy bubbles with their materials or particles" },
        {
            name: "construction",
            message: "build switched-on W3 buildings and pay their salt, as the build button does",
        },
        { name: "cooking", message: "level switched-on kitchen upgrades with spices and meals with themselves" },
        { name: "sneaking", message: "buy switched-on Ninja Knowledge upgrades with jade coins" },
        { name: "summoning", message: "buy switched-on summoning board upgrades with essence" },
        { name: "bubba", message: "buy switched-on Bubba upgrades with meat once the run's gift is picked" },
        { name: "grimoire", message: "buy switched-on Grimoire upgrades with bones" },
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
            description: `Automation: Orion upgrades to buy, { id: row, on, stopAt, priority }; stopAt is a level, ${PRIORITY}.`,
        },
        orionSaving: saving("Orion"),
        poppy: {
            default: [],
            description: `Automation: Poppy upgrades to buy, { id: row, on, stopAt, priority }; stopAt is a level, ${PRIORITY}.`,
        },
        poppySaving: saving("Poppy"),
        tarpit: {
            default: [],
            description: `Automation: Tar Pit upgrades to buy, { id: row, on, stopAt, priority }; stopAt is a level, ${PRIORITY}.`,
        },
        tarpitSaving: saving("the Tar Pit"),
        bubbles: {
            default: [],
            description:
                'Automation: alchemy bubbles to raise, { id: "cauldron:bubble", on, stopAt, pay }; stopAt is a level, pay is "particles" or left out for materials.',
        },
        bubblesTarget: {
            default: 90,
            description: "Automation: bubbles that have a max are raised to this % of it (0 to 99.9).",
        },
        construction: {
            default: [],
            description: `Automation: W3 buildings to build, { id, on, stopAt, priority }; id is the building (0-8 buildings, 9-17 towers, 18-26 shrines), ${PRIORITY}. Empty slots take High, Low, then Balanced buildings, the closest to done first, up to stopAt; the 8th slot stays free once it feeds the Menagerie jelly.`,
        },
        kitchens: {
            default: [],
            description: `Automation: kitchen upgrades to level, { id: 3 * kitchen + slot (0 Speed, 1 Fire, 2 Luck), on, stopAt, priority }; ${PRIORITY}.`,
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
        sneaking: {
            default: [],
            description: `Automation: Ninja Knowledge upgrades to buy with jade, { id: row, on, stopAt, priority }; stopAt is a level, ${PRIORITY}.`,
        },
        sneakingSaving: saving("Sneaking"),
        summoning: {
            default: [],
            description: `Automation: summoning upgrades to buy, { id: "upgrade index", on, stopAt, priority }; stopAt is a level, ${PRIORITY}.`,
        },
        // One saving % per essence colour (white, green, yellow, blue, purple, red, cyan, teal), so a colour's goal
        // never holds up another colour.
        summoningSaving: {
            default: Array(8).fill(10),
            description:
                "Automation: per essence colour, the % of what it saves for that Balanced summoning upgrades may spend meanwhile.",
        },
        bubba: {
            default: [],
            description: `Automation: Bubba upgrades to buy with meat, { id, on, stopAt, priority }; stopAt is a level, ${PRIORITY}.`,
        },
        bubbaSaving: saving("Bubba"),
        grimoire: {
            default: [],
            description: `Automation: Grimoire upgrades to buy with bones, { id: row, on, stopAt, priority }; stopAt is a level, ${PRIORITY}.`,
        },
        grimoireSaving: {
            default: 10,
            description:
                "Automation: while a bone type saves for its cheapest High or Low upgrade, Balanced upgrades may cost up to this % of it.",
        },
    },
});
