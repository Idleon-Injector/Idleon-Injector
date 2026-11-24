/**
 * The Cheats area's short names: one line per cheat, in the words of a page's cheats panel (menu/pageCheats.js), with
 * the command small under it. `hint` is the placeholder of a cheat that takes a value. A cheat not listed here (one the
 * game side adds later) shows its own words, cut to their first part (`cheatName`).
 * scripts/cheats-tab.test.mjs checks every name here is a real cheat.
 */

export const CHEAT_NAMES = {
    // Combat
    "godlike reach": { label: "Reach 666" },
    "godlike crit": { label: "100% crit chance" },
    "godlike ability": { label: "No cooldown or mana cost" },
    "godlike food": { label: "Food never runs out" },
    "godlike hitchance": { label: "100% hit chance" },
    "godlike intervention": { label: "Instant divine intervention" },
    "godlike speed": { label: "Weapon speed", hint: "speed" },
    "godlike card": { label: "Cards 100× stronger" },
    "godlike poison": { label: "Instant bubo poison" },
    "godlike respawn": { label: "Instant mob respawn" },
    "godlike hp": { label: "Never lose HP" },
    "wide giant": { label: "Always giant mobs" },
    "wide plunderous": { label: "Always plunderous mobs" },
    "wide autoboss": { label: "Reload beaten boss maps" },

    // Multipliers
    "multiply damage": { label: "Damage", hint: "times" },
    "multiply efficiency": { label: "Skill efficiency", hint: "times" },
    "multiply afk": { label: "AFK gains", hint: "times" },
    "multiply drop": { label: "Drop rate", hint: "times" },
    "multiply money": { label: "Coin drops", hint: "times" },
    "multiply classexp": { label: "Class EXP", hint: "times" },
    "multiply crystal": { label: "Crystal spawns", hint: "times" },
    "multiply skillexp": { label: "Skill EXP", hint: "times" },
    "multiply shopstock": { label: "Town shop stock", hint: "times" },
    "multiply printer": { label: "Sample prints", hint: "times" },
    "multiply carrycap": { label: "Carry capacity", hint: "times" },

    // Items & drops
    "qnty inv": { label: "First inventory slot's amount", hint: "amount" },
    "qnty chest": { label: "First chest slot's amount", hint: "amount" },
    "upstones rng": { label: "Upgrade stones always work" },
    "upstones use": { label: "Upgrade stones use no slot" },
    "upstones misc": { label: "Mystery stones hit misc" },
    "wide autoloot": { label: "Loot straight to chest" },
    "wide perfectobols": { label: "Perfect obols for your class" },

    // Costs & limits
    daily: { label: "Daily reset now" },
    "unlock teleports": { label: "Free teleports" },
    "unlock tickets": { label: "Free colosseum tickets" },
    "unlock silvpen": { label: "Free silver pens" },
    "unlock obolfrag": { label: "Free obol fragments" },
    "unlock revive": { label: "Unlimited revives" },
    "wide storagecap": { label: "No storage stack cap" },
    "wide gembuylimit": { label: "Gem shop buy limit", hint: "number" },
    "wide mtx": { label: "Free gem shop" },
    "wide guild": { label: "Free guild upgrades" },
    "wide quest": { label: "Quests need no items" },
    "wide gems": { label: "Gems never go down" },
    "wide candy": { label: "Use candy anywhere" },
    "wide candytime": { label: "1-hour candy time", hint: "minutes" },
    "wide hoopshop": { label: "Free hoop shop" },
    "wide dartshop": { label: "Free dart shop" },
    "wide guildpoints": { label: "Add guild points", hint: "points" },

    // Unlocks
    "unlock presets": { label: "Change presets anywhere" },
    "unlock quickref": { label: "Quickref anywhere" },
    "unlock achievements": { label: "Unlock all achievements" },
    "unlock portals": { label: "Unlock all portals" },
    "unlock questsall": { label: "Complete all quests" },
    "unlock bg": { label: "Unlock all backgrounds" },
    "wide votebonus": { label: "Every ballot bonus on" },

    // Minigames
    minigame: { label: "Unlimited minigames" },
    "minigame mining": { label: "Mining minigame" },
    "minigame fishing": { label: "Fishing aimbot" },
    "minigame catching": { label: "Catching minigame" },
    "minigame choppin": { label: "Choppin minigame" },
    "minigame poing": { label: "Poing minigame" },
    "minigame hoops": { label: "Hoops minigame" },
    "minigame darts": { label: "Darts minigame" },
    "minigame wisdom": { label: "Wisdom monument" },
    "minigame scratch": { label: "Event scratch card" },
    "minigame minehead": { label: "Show Minehead's tiles" },
    "minigame log": { label: "Show gaming log cards" },
    "minigame valentine": { label: "Valentine chocolates" },
    "minigame goldrush": { label: "Faster gold pot rush" },
    "minigame card": { label: "Event card game" },
    "minigame wheel": { label: "Wheel lands on the bonus" },
    "minigame instawheel": { label: "Instant wheel spins" },

    // Display
    "wide nodmg": { label: "No damage numbers" },
    "wide nogamingpop": { label: "No gaming popups" },
    "wide hidenames": { label: "Hide player names" },
    "wide noanim": { label: "No game animations" },
    "wide bigmodel": { label: "Player model size", hint: "size" },

    // Tools
    noob: { label: "Kill your character" },
    update: { label: "Update the injector" },
    "wide autoparty": { label: "Party with players nearby" },

    // Dangerous
    equipall: { label: "Equip any item" },
    "wipe inv": { label: "Wipe inventory" },
    "wipe invslot": { label: "Wipe an inventory slot", hint: "slot" },
    "wipe chest": { label: "Wipe chest" },
    "wipe chestslot": { label: "Wipe a chest slot", hint: "slot" },
    "wipe forge": { label: "Wipe forge" },
    "wipe overpurchases": { label: "Fix gem shop overbuys" },
    "wipe cogs": { label: "Remove unused cogs" },
    "wipe ribbon": { label: "Wipe ribbon storage" },
    "wipe invlocked": { label: "Wipe unlocked inventory slots" },
    "wipe chips": { label: "Wipe lab chips" },
    "wipe jargems": { label: "Wipe jar gems" },
    "wipe legends": { label: "Wipe legends" },
    "wipe prisma": { label: "Wipe prisma" },
    "wipe exalted": { label: "Wipe exalted" },
    "wipe sumdoubler": { label: "Wipe summoning doublers" },
    "wipe exp": { label: "Reset broken skill EXP", hint: "skill or all" },
    cloudz: { label: "Stop cloud saving" },
    fix_save: { label: "Save an attribute to memory", hint: "attribute" },
    fix_write: { label: "Write an attribute back", hint: "attribute" },
    "wide perfectequipped": { label: "Rebuild gear for your class" },
};

/**
 * A cheat's short name and hint: its own here, else its words cut to their first part,
 * "!danger! Equip any item at any class/level" -> "Equip any item at any class/level".
 */
export const cheatName = ({ value, message = "" }) => {
    if (CHEAT_NAMES[value]) return CHEAT_NAMES[value];
    const words = message
        .replace(/^!danger!\s*/i, "")
        .split(/\.\s|\s\(|;/)[0]
        .replace(/\.$/, "")
        .trim();
    return { label: words ? words.charAt(0).toUpperCase() + words.slice(1) : value };
};
