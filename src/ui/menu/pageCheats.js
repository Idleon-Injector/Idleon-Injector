/**
 * Which cheats belong to a system page (#23). They leave the Cheats area and stand in the page's own cheats panel
 * (components/SystemCheats.js), each row a short label with its command under it.
 *
 * Keyed by "<world>:<system>" as the pages declare them. A row with `tab` shows only on that tab's page; a row
 * without one shows on every page of its system. scripts/page-cheats.test.mjs checks every command is a real cheat.
 */

export const PAGE_CHEATS = {
    "account:Card Search": [
        { cheat: "wide cardcopy", label: "Copy card preset to everyone" },
        { cheat: "wide cardpassive", label: "Every card counts as passive" },
    ],
    "account:Event Shop": [
        { cheat: "unlock eventshop", label: "Unlock every event shop item" },
        { cheat: "wide eventitems", label: "Unlimited event item drops" },
        { cheat: "wide eventspins", label: "Unlimited event spins" },
    ],
    "account:Task Board": [{ cheat: "wide task", label: "Free tasks" }],
    "account:Bundles": [{ cheat: "buy", label: "Buy a gem shop pack" }],
    "account:Clickers": [
        { cheat: "w1 owl", label: "Orion boosts", tab: "Orion" },
        { cheat: "w2 roo", label: "Poppy boosts", tab: "Poppy" },
        { cheat: "w7 bubba", label: "Bubba boosts", tab: "Bubba" },
    ],

    "classes:Compass": [{ cheat: "w6 windwalker", label: "Windwalker boosts" }],
    "classes:Grimoire": [{ cheat: "w6 grimoire", label: "Grimoire boosts" }],
    "classes:Royal Armory": [{ cheat: "w6 royal", label: "Royal Guardian boosts" }],
    "classes:Tesseract": [{ cheat: "w6 arcane", label: "Arcane Cultist boosts" }],

    "1:Stamps": [{ cheat: "w1 stampcost", label: "Cheaper stamp upgrades" }],
    "1:Star Signs": [{ cheat: "wide star", label: "Star signs need no star points" }],
    "1:Anvil": [
        { cheat: "w1 anvil", label: "Free, faster anvil" },
        { cheat: "w1 smith", label: "Free smithing" },
        { cheat: "unlock storagecrafting", label: "Craft from storage" },
    ],
    "1:Forge": [{ cheat: "w1 forge", label: "Faster, bigger forge" }],

    "2:Alchemy": [
        { cheat: "w2 alchemy", label: "Alchemy boosts" },
        { cheat: "w2 vialrng", label: "Any vial roll unlocks it", tab: "Vials" },
        { cheat: "w2 vialattempt", label: "Unlimited vial attempts", tab: "Vials" },
        { cheat: "w2 sigilspeed", label: "Faster sigil research", tab: "Sigils" },
    ],
    "2:Arcade Shop": [
        { cheat: "wide arcade", label: "Free arcade upgrades" },
        { cheat: "jackpot", label: "Hit the jackpot" },
    ],
    "2:Post Office": [{ cheat: "wide post", label: "Free post orders" }],
    "2:Killroy": [{ cheat: "w2 killroyreset", label: "Reset this week's progress" }],
    "2:Islands": [{ cheat: "unlock islands", label: "Unlock fishing islands" }],
    "2:Weekly Bosses": [{ cheat: "w2 boss", label: "Unlimited boss attempts" }],

    "3:Refinery": [
        { cheat: "w3 refinery", label: "Free refinery cycles" },
        { cheat: "w3 refineryspeed", label: "Faster refinery" },
    ],
    "3:Atom Collider": [{ cheat: "w3 collider", label: "Collider boosts" }],
    "3:Construction": [
        { cheat: "w3 freebuildings", label: "Free building upgrades" },
        { cheat: "w3 instabuild", label: "Instant builds" },
        { cheat: "w3 buildspd", label: "Faster building" },
        { cheat: "w3 flagreq", label: "Flags unlock at once" },
        { cheat: "w3 totalflags", label: "10 flags" },
        { cheat: "w3 globalshrines", label: "Shrines work on every map" },
        { cheat: "w3 bettercog", label: "Better cog chances" },
        { cheat: "w3 jeweledcogs", label: "Unlimited jeweled cogs" },
        { cheat: "unlock construct", label: "Unlock every building" },
    ],
    "3:Worship": [
        { cheat: "w3 mobdeath", label: "Worship mobs die at once" },
        { cheat: "w3 towerdamage", label: "Stronger towers" },
        { cheat: "w3 worshipspeed", label: "Faster worship charge" },
        { cheat: "w3 freeworship", label: "Cheapest worship charge" },
    ],
    "3:Traps": [{ cheat: "w3 trapping", label: "Faster traps" }],
    "3:Library": [
        { cheat: "w3 booktime", label: "Faster books" },
        { cheat: "w3 book", label: "Talent books at max level" },
    ],
    "3:Prayers": [{ cheat: "w3 prayer", label: "No prayer curses" }],
    "3:Equinox": [{ cheat: "w3 instantdreams", label: "Dream bar fills at once" }],
    "3:Salt Lick": [{ cheat: "w3 saltlick", label: "Free Salt Lick upgrades" }],

    "4:Breeding": [
        { cheat: "w4 eggcap", label: "All egg slots", tab: "Eggs" },
        { cheat: "w4 fasteggs", label: "Faster incubation", tab: "Eggs" },
        { cheat: "w4 petchance", label: "Better new pet chance", tab: "Eggs" },
        { cheat: "w4 petrng", label: "Strongest pets for their level", tab: "Eggs" },
        { cheat: "w4 genes", label: "Free gene upgrades", tab: "Upgrades" },
        { cheat: "w4 petupgrades", label: "Cheaper pet upgrades", tab: "Upgrades" },
        { cheat: "w4 fenceyard", label: "All fence yard slots", tab: "Pets" },
        { cheat: "w4 battleslots", label: "All 6 battle slots", tab: "Territory" },
        { cheat: "w4 fastforaging", label: "Faster foraging", tab: "Territory" },
        { cheat: "w4 arena", label: "Unlimited arena entries", tab: "Arena" },
        { cheat: "w4 superpets", label: "Stronger pets in fights" },
    ],
    "4:Laboratory": [
        { cheat: "w4 labpx", label: "Longer lab connections" },
        { cheat: "w4 mainframe", label: "Mainframe boosts" },
        { cheat: "w4 chipbonuses", label: "Chip boosts", tab: "Chips" },
        { cheat: "w4 chips", label: "Add lab chips", tab: "Chips" },
    ],
    "4:Cooking": [
        { cheat: "w4 mealspeed", label: "Faster cooking", tab: "Tables" },
        { cheat: "w4 recipespeed", label: "Faster recipes", tab: "Tables" },
        { cheat: "w4 luckychef", label: "Better new recipe chance", tab: "Tables" },
        { cheat: "w4 kitchensdiscount", label: "Cheaper kitchens", tab: "Tables" },
        { cheat: "w4 meals", label: "Meal boosts", tab: "Meals" },
        { cheat: "w4 platesdiscount", label: "Cheaper dinner plates", tab: "Meals" },
        { cheat: "w4 ribbon", label: "Add a ribbon to storage", tab: "Meals", hint: "1-25" },
        { cheat: "w4 spiceclaim", label: "Unlimited spice claims", tab: "Spices" },
    ],
    "4:Rift": [{ cheat: "unlock rifts", label: "Unlock rift portals" }],

    "5:Sailing": [
        { cheat: "w5 sailing", label: "Sailing boosts" },
        { cheat: "w5 endercaptains", label: "Only ender captains" },
    ],
    "5:Divinity": [
        { cheat: "w5 divinity", label: "Divinity boosts" },
        { cheat: "unlock divinitypearl", label: "Pearls past level 50" },
    ],
    "5:Gaming": [
        { cheat: "w5 gaming", label: "Gaming boosts" },
        { cheat: "w5 betternuggets", label: "Bigger nuggets" },
    ],
    "5:Hole": [
        { cheat: "w5 holes", label: "Hole boosts" },
        { cheat: "w5 lantern", label: "No daily lantern limit", tab: "Caverns" },
        { cheat: "w5 lanternreset", label: "Reset today's lantern uses", tab: "Caverns" },
        { cheat: "w5 skillcaverns", label: "No daily cavern node limit", tab: "Caverns" },
        { cheat: "w5 jargems", label: "Add jar gems", tab: "Caverns" },
    ],

    "6:Farming": [{ cheat: "w6 farming", label: "Farming boosts" }],
    "6:Sneaking": [
        { cheat: "w6 ninja", label: "Sneaking boosts" },
        { cheat: "w6 sneaksymbol", label: "Symbols always found" },
        { cheat: "w6 ninjaItem", label: "Make a ninja item", hint: "twin" },
    ],
    "6:Summoning": [
        { cheat: "w6 summoning", label: "Summoning boosts" },
        { cheat: "w6 endless", label: "Easy endless runs" },
        { cheat: "w6 sumunit", label: "Always the same unit" },
    ],
    "6:Emperor": [{ cheat: "w6 emperor", label: "Unlimited emperor tries" }],

    "7:Spelunking": [
        { cheat: "w7 spelunk", label: "Spelunking boosts" },
        { cheat: "w7 spelunkmana", label: "No stamina cost" },
        { cheat: "w7 spelunkdepth", label: "Set the depth", tab: "Caves" },
    ],
    "7:Gallery": [{ cheat: "w7 gallery", label: "Gallery boosts" }],
    "7:Coral Reef": [
        { cheat: "w7 reef", label: "Free reef upgrades", tab: "Coral" },
        { cheat: "w7 coralkid", label: "Free Coral Kid upgrades", tab: "Coral Kid" },
        { cheat: "w7 bigfish", label: "Free Big Fish upgrades" },
    ],
    "7:Clam Work": [{ cheat: "w7 clam", label: "Clam boosts" }],
    "7:Zenith Market": [{ cheat: "w7 zenith", label: "Zenith Market boosts" }],
    "7:Research": [
        { cheat: "w7 research", label: "Research boosts" },
        { cheat: "fix_magnifier", label: "Fix magnifier data" },
    ],
    "7:Sushi Station": [{ cheat: "w7 sushi", label: "Sushi boosts" }],
    "7:Minehead": [{ cheat: "w7 minehead", label: "Minehead boosts" }],
    "7:Glimbo": [{ cheat: "w7 glimbo", label: "Glimbo boosts" }],
    "7:Jelly Operator": [{ cheat: "w7 jelly", label: "Jelly Operator boosts" }],
    "7:Menagerie": [{ cheat: "w7 menagerie", label: "Menagerie boosts" }],
};

/**
 * Cheats a page runs itself (its own switch, button or picker), so they leave the Cheats area with no panel row:
 * the automation pages, the Attire Rack and Wardrobe, the Pets companions and the Sushi tools.
 */
export const PAGE_RUNS = {
    automation: "Automation",
    "wide attire": "Attire Rack",
    "wide attirestats": "Attire Rack",
    "wide wardrobestats": "Wardrobe",
    "w1 companion": "Pets",
    "w7 sushitools": "Sushi Station",
};

const rowsByCommand = new Map(
    Object.entries(PAGE_CHEATS).flatMap(([key, rows]) => rows.map((row) => [row.cheat, { key, ...row }]))
);

/** The longest page command `value` runs ("w4 chips Copper 5" -> "w4 chips"), or "". */
const pageCommandOf = (value) => {
    const words = value.split(" ");
    for (let i = words.length; i > 0; i--) {
        const command = words.slice(0, i).join(" ");
        if (rowsByCommand.has(command) || command in PAGE_RUNS) return command;
    }
    return "";
};

/** Whether a page has `value` (a command or a suggestion for one), so the Cheats area leaves it out. */
export const isPageCheat = (value) => pageCommandOf(value) !== "";

/** The panel row `value` belongs to ({ key, cheat, label, tab? }), or null. */
export const pageRowOf = (value) => rowsByCommand.get(pageCommandOf(value)) ?? null;

/** A page's panel rows: its system's rows for its own tab, plus the ones for every tab. */
export const cheatsOfPage = (page) =>
    (PAGE_CHEATS[`${page.world}:${page.system}`] ?? []).filter((row) => !row.tab || row.tab === page.tab);

/** Old command names that still run (the game side maps them in runCheat): search finds a cheat by them too. */
export const OLD_NAMES = { "w5 collider": "w3 collider" };

/** A startup list with old names put as the new ones, so My cheats' Autostart reads what runs at start. */
export const withNewNames = (list) =>
    list.map((command) => {
        const old = Object.keys(OLD_NAMES).find((name) => command === name || command.startsWith(`${name} `));
        return old ? OLD_NAMES[old] + command.slice(old.length) : command;
    });
