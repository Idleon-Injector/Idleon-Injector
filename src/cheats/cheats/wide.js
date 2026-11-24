/**
 * Wide Cheats
 *
 * Account-wide cheats:
 * - gembuylimit, mtx, post, guild, task, quest, star
 * - giant, gems, plunderous, candy, candytime, nodmg, nogamingpop
 * - hidenames, noanim, bigmodel, eventitems, autoloot, perfectobols, autoparty
 * - arcade, eventspins, hoopshop, dartshop, guildpoints, cardcopy, cardpassive, autoboss
 * - votebonus, attire, attirestats, perfectequipped, wardrobestats
 */

import { defineCheat } from "../core/registration.js";
import { cheatState } from "../core/state.js";
import { firebase, gga } from "../core/globals.js";
import { deepCopy } from "../utils/deepCopy.js";
import { rollAllObols } from "../helpers/obolRolling.js";
import { recalculateStats } from "../helpers/attire/outfits.js";
import { perfectEquipped } from "../helpers/wardrobe/perfect.js";
import { recalculateWardrobe } from "../helpers/wardrobe/index.js";

// Wide (account-wide) cheats
defineCheat({
    name: "wide",
    category: "Costs & limits",
    message: "all account-wide cheats",
    // One switch for the whole family is gone (#23): each cheat is on its own, in its group or on its page.
    registerParent: false,
    subcheats: [
        { name: "storagecap", message: "uncapped storage stacks; pauses Atom Collider conversion" },
        { name: "gembuylimit", message: "set max gem item purchases", configurable: true },
        { name: "mtx", message: "gem shop cost nullification" },
        { name: "post", message: "post cost nullification" },
        { name: "guild", message: "guild cost nullification" },
        { name: "task", message: "task cost nullification" },
        { name: "quest", message: "quest item requirement nullification" },
        { name: "star", message: "star point requirement nullification" },
        { name: "giant", category: "Combat", message: "100% giant mob spawn rate" },
        { name: "gems", message: "freezes current gem amount" },
        { name: "plunderous", category: "Combat", message: "100% plunderous mob spawn rate" },
        { name: "candy", message: "candy use everywhere" },
        { name: "candytime", message: "buffs 1 hr candys in minutes", configurable: true },
        { name: "nodmg", category: "Display", message: "no damage numbers" },
        {
            name: "nogamingpop",
            category: "Display",
            message: "no gaming popups (bits, nuggets, acorns, cactus); nuggets still count",
        },
        { name: "hidenames", category: "Display", message: "hide player names in world and UI" },
        { name: "noanim", category: "Display", message: "stop all game animations" },
        { name: "bigmodel", category: "Display", message: "set all player model sizes on spawn", configurable: true },
        { name: "eventitems", message: "unlimited event item drops" },
        { name: "autoloot", category: "Items & drops", message: "autoloot immeditely to chest. Check config for more" },
        { name: "autoparty", category: "Tools", message: "Automatically add on screen players to your party" },
        { name: "arcade", message: "arcade cost nullify" },
        { name: "eventspins", message: "Infinite event spins" },
        { name: "hoopshop", message: "hoopshop cost nullify" },
        { name: "dartshop", message: "dartshop cost nullify" },
        { name: "autoboss", category: "Combat", message: "automatically reload defeated boss maps" },
        {
            name: "guildpoints",
            message: "Adds guild points to the guild (max 1200 per week)",
            needsParam: true,
            fn: function (params) {
                const amount = parseInt(params[1]) || 1200;
                firebase.guildPointAdjust(amount);
                return `Added ${amount} guild points to the guild`;
            },
        },
        {
            name: "perfectobols",
            category: "Items & drops",
            message: "Roll all obols perfectly for class. Family and inventory obols update on character change",
            fn: function () {
                cheatState.wide.perfectobols = !cheatState.wide.perfectobols;
                if (cheatState.wide.perfectobols) rollAllObols();
                return `${
                    cheatState.wide.perfectobols ? "Activated" : "Deactivated"
                } Perfect obol rolls. Family and inventory obols update on character change.`;
            },
        },
        {
            name: "perfectequipped",
            category: "Dangerous",
            message: "Permanently rebuild current gear for your class; increase food stacks.",
            // It replaces the rolls of the gear worn, with no way back from the command line.
            dangerous: true,
            fn: perfectEquipped,
        },
        {
            name: "cardcopy",
            message: "Copies current CardPreset to all players",
            fn: function () {
                const cardPreset = deepCopy(gga.CardPreset);
                const players = gga.PlayerDATABASE.h;
                let count = 0;

                for (const playerName in players) {
                    players[playerName].h.CardPreset = deepCopy(cardPreset);
                    const cardPresetIndex = players[playerName].h.PlayerStuff[2];
                    players[playerName].h.CardEquip = deepCopy(cardPreset[cardPresetIndex]);

                    count++;
                }

                return `Copied CardPreset to ${count} player(s).`;
            },
        },
        { name: "cardpassive", message: "all cards always give bonus (passive)" },
        { name: "votebonus", category: "Unlocks", message: "all Ballot and Meritocracy bonuses active" },
        { name: "attire", message: "the bonuses of the outfits chosen on the Attire Rack page" },
        {
            name: "attirestats",
            message:
                "work out the stats of the character in play again after its attire changed (the Attire Rack page runs this)",
            fn: () => {
                recalculateStats();
                return "Worked out the stats of the character in play again";
            },
        },
        {
            name: "wardrobestats",
            message:
                "work out the stats, chips and talents of the character in play again after its gear changed (the Wardrobe page runs this)",
            fn: () => {
                recalculateWardrobe();
                return "Worked out the stats of the character in play again";
            },
        },
    ],
    config: {
        attire: {
            outfits: {
                default: "all",
                description:
                    "Outfits whose bonuses wide attire gives: all (outfits added by game updates too), outfit ids separated by commas (EquipmentGown1,EquipmentGown3), or empty for none",
            },
        },
        wardrobe: {
            loadouts: {
                default: [],
                description:
                    "Loadouts saved on the Wardrobe page (Account > Player > Wardrobe). The page adds and deletes them",
            },
            goldenfood: {
                default: {},
                description:
                    "The largest golden food stack each character had, kept by the Wardrobe page so a loadout's golden food keeps that size",
            },
        },
        autoloot: {
            itemstochest: { default: true, description: "Automatically sends looted items to the chest" },
            moneytochest: { default: true, description: "Automatically sends looted money to the chest" },
            zenithfarm: {
                default: false,
                description: "Zenith farming drops are excluded from autoloot and drop normally",
            },
            materialfarm: {
                default: false,
                description: "Monster material drops are excluded from autoloot and drop normally",
            },
            hidenotifications: { default: true, description: "Hides loot and money notifications" },
        },
        perfectobols: {
            preferredstat: {
                default: "PRIMARY",
                description: "The stats that should be rolled when using perfectobols (e.g., PRIMARY, STR)",
            },
        },
        plunderous: {
            allcharacters: { default: false, description: "Enables plunderous mob bonuses for all characters" },
        },
        arcade: {
            ArcadeCost: { default: (t) => 0, description: "Arcade Shop costs. (lower is better)" },
        },
        dartshop: {
            DartsUpgCost: { default: (t) => 0, description: "Dart Shop upgrade costs. (lower is better)" },
        },
        hoopshop: {
            HoopsUpgCost: { default: (t) => 0, description: "Hoop Shop upgrade costs. (lower is better)" },
        },
    },
});
