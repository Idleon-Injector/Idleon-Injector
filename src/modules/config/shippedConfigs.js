/**
 * The configs the injector ships (#198), listed in Settings beside the player's own. Each is the cheats it starts and
 * the cheat settings it changes from config.js; a player who edits one gets their own copy, which Reset puts back.
 */
const LIGHT = [
    "wide autoloot",
    "wide nodmg",
    "wide nogamingpop",
    "wide candy",
    "unlock quickref",
    "unlock presets",
    "unlock storagecrafting",
    "unlock teleports",
    "minigame instawheel",
];

// No `multiply afk`, Orion's resets (off in its default list), minigame aimbots or `w3 freeworship` (MrJoiny#152).
const AFK = [
    ...LIGHT,
    "godlike respawn",
    "godlike food",
    "wide autoboss",
    "w3 trapping",
    "w3 refineryspeed",
    "w3 worshipspeed",
    "w4 fasteggs",
    "w4 mealspeed",
    "w4 recipespeed",
    "w7 sushitools",
    "automation shops",
    "automation orion",
    "automation bubbles",
    "automation construction",
    "automation cooking",
    "automation sneaking",
    "automation summoning",
    "automation bubba",
    "automation grimoire",
];

module.exports = {
    Light: { about: "Quality of life only", startupCheats: LIGHT, cheatConfig: {} },
    AFK: { about: "Light, plus help while idling", startupCheats: AFK, cheatConfig: {} },
};
