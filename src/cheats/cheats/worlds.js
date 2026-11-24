/**
 * Worlds Cheats
 *
 * World-specific cheats organized by world (W1-W7):
 * - W1: anvil, forge, stampcost, smith, companion, owl
 * - W2: boss, roo, alchemy, vialrng, vialattempt, sigilspeed, killroyreset
 * - W3: mobdeath, towerdamage, refinery, trapping, prayer, shrines, etc.
 * - W4: breeding, spice, kitchens, lab, arena, mainframe, ribbon, chips, etc.
 * - W5: sailing, endercaptains, gaming, divinity, collider, holes, jargems
 * - W6: farming, ninja, summoning, grimoire, endless, ninjaitem, sumunit, etc.
 * - W7: spelunk, gallery, sushi, reef, clam, zenith, spelunkmana, spelunkdepth, etc.
 */

import { defineCheat } from "../core/registration.js";
import { cList, events, gga } from "../core/globals.js";
import { summonUnits } from "../constants.js";
import { cheatConfig, cheatState } from "../core/state.js";
import { getJarGemCatalog } from "../helpers/jarGems.js";

defineCheat({
    name: "w1",
    message: "Activate all World 1 cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "anvil", message: "anvil cost and duration nullification" },
        { name: "forge", message: "forge speed and capacity multiplier check config" },
        { name: "stampcost", message: "stamp cost reduction multiplier check config" },
        { name: "smith", message: "smithing cost nullification (change maps to apply)" },
        { name: "companion", message: "companions cheat" },
        { name: "owl", message: "owl cheats, check config file" },
    ],
    config: {
        anvil: {
            productionspeed: { default: (t) => t * 4, description: "Anvil: Item production speed" },
        },
        forge: {
            speed: { default: (t) => t * 4, description: "Forge: Bar processing speed" },
            capacity: { default: (t) => t * 2, description: "Forge: Ore capacity" },
        },
        stampcost: { default: (t) => t / 4, description: "Stamps: Upgrade costs. (lower is better)" },
        companion: {
            companions: {
                default: "",
                description:
                    "Comma-separated companion IDs. Bare IDs use Pets+; append :0 for normal or :1 for Pets+ (e.g., '0:0,1:1'). Empty means all pets at Pets+, 'none' means no pets",
            },
            current: { default: "11", description: "Active companion ID (e.g., '11' for Glunko)" },
        },
        owl: {
            OwlCost: { default: (t) => t / 2, description: "Owl: Upgrade costs. (lower is better)" },
            OwlFeatherRate: { default: (t) => t * 2, description: "Owl: Feather gain rate" },
            OwlBonuses: { default: (t) => t * 2, description: "Owl: All owl-related bonuses" },
            OwlFeatherShinyGe: {
                default: (t) => t,
                description: "Owl: Shiny feather generation (unknown effect). No change until you set it",
            },
            OwlMegafeather: { example: (t) => t },
            OwlNextUpgReq: { example: (t) => t },
        },
    },
});

defineCheat({
    name: "w2",
    message: "Activate all World 2 cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "boss", message: "unlimited boss attempts" },
        { name: "roo", message: "roo cheats, check config file" },
        { name: "alchemy", message: "alchemy cheats, check config file" },
        { name: "vialrng", message: "vial unlock upon rolling 1+" },
        { name: "vialattempt", message: "unlimited vial attempts" },
        { name: "sigilspeed", message: "fast sigil research (see config)" },
        {
            name: "killroyreset",
            message: "reset killroy weekly progress",
            fn: () => {
                gga.OptionsListAccount[113] = 0;
                return "Killroy weekly progress has been reset";
            },
        },
    ],
    config: {
        roo: {
            RooCost: { default: (t) => t / 2, description: "Roo: Upgrade costs. (lower is better)" },
            RooShinyMulti: { default: (t) => t * 2, description: "Roo: Shiny catch rates" },
            RooCatchRate: { default: (t) => t * 2, description: "Roo: Standard catch rates" },
            RooCatchREQ: { default: (t) => t / 2, description: "Roo: Catch requirements. (lower is better)" },
            RooCatchFishQTY: { default: (t) => t * 2, description: "Roo: Quantity of fish caught" },
            RooCatchRate_S: { default: (t) => t * 2, description: "Roo: Shiny catch rates" },
            RooCatchREQ_S: { default: (t) => t / 2, description: "Roo: Shiny catch requirements. (lower is better)" },
            RooCatchRate_T: { default: (t) => t * 2, description: "Roo: Tar pit catch rates" },
            RooCatchREQ_T: { default: (t) => t / 2, description: "Roo: Tar pit catch requirements. (lower is better)" },
            RooNextUpgReq: { example: (t) => t },
            RooShinyLuck: { example: (t) => t },
            RooTarOwned: { example: (t) => t },
            RooCost_T: { example: (t) => t },
            RooRESETbon: { example: (t) => t },
            RooMegafeather: { example: (t) => t },
            RooBonuse: { example: (t) => t },
        },
        alchemy: {
            BubbleBonus: { default: (t) => t, description: "Alchemy: All bubble effects. No change until you set it" },
            CauldronCosts: {
                default: (t) => t,
                description: "Alchemy: Bubble upgrade costs. No change until you set it",
            },
            ResearchSpeed: { default: (t) => t * 4, description: "Alchemy: Brewing speed" },
            VialCosts: { default: (t) => t / 2, description: "Alchemy: Vial costs. (lower is better)" },
            VialBonus: { default: (t) => t, description: "Alchemy: Vial effects. No change until you set it" },
            PctChanceNewBubble: { default: (t) => t * 4, description: "Alchemy: New bubble discovery chance" },
            CauldronLvsBrewREQ: {
                default: (t) => t / 2,
                description: "Alchemy: Cauldron level requirements. (lower is better)",
            },
            LiquidCap: { default: (t) => t * 2, description: "Alchemy: Liquid storage capacity" },
            LiquidHRrate: { default: (t) => t * 4, description: "Alchemy: Liquid generation speed" },
            sigilspeed: { default: (t) => t * 10, description: "Alchemy: Sigil research speed" },
        },
    },
});

defineCheat({
    name: "w3",
    message: "Activate all World 3 cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "mobdeath", message: "worship mobs insta-death" },
        { name: "towerdamage", message: "multiply tower damage (see config)" },
        { name: "flagreq", message: "flag unlock time nullification" },
        { name: "freebuildings", message: "free tower upgrades" },
        { name: "instabuild", message: "insta-build of buildings" },
        { name: "booktime", message: "book per second" },
        { name: "totalflags", message: "10 total flags" },
        { name: "buildspd", message: "multiply build speed (see config)" },
        { name: "saltlick", message: "Salt Lick upgrade cost nullification" },
        { name: "refinery", message: "refinery cost nullification" },
        { name: "refineryspeed", message: "reduces refinery time (see config)" },
        { name: "trapping", message: "multiply trapping time, make the traps faster by adding more time" },
        { name: "book", message: "always max lvl talent book" },
        { name: "prayer", message: "Prayer curse nullification" },
        { name: "worshipspeed", message: "multiply worship charge speed (see config)" },
        { name: "freeworship", message: "reduce worship charge cost to the minimum" },
        { name: "globalshrines", message: "global shrines" },
        { name: "instantdreams", message: "Dream bar fills instantly" },
        { name: "bettercog", message: "Gives you a bit better cog chances" },
        { name: "jeweledcogs", message: "Unlimited jeweled cogs (needs to be unlocked in gaming first)" },
    ],
    config: {
        buildspd: { default: (t) => t * 10, description: "Construction: Building speed" },
        WorshipSpeed: { default: (t) => t * 10, description: "Worship: Charge generation speed" },
        towerdamage: { default: (t) => t * 10, description: "Tower Defense: Tower damage" },
        refineryspeed: {
            default: (t) => Math.max(1, Math.floor(t / 10)),
            description: "Refinery: Cycle speed. Don't go below 1! (lower is better)",
        },
        trapping: { default: (t) => t * 10, description: "Trapping: Trap timer speed" },
    },
});

defineCheat({
    name: "w4",
    message: "Activate all World 4 cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "battleslots", message: "all 6 battle slots" },
        { name: "eggcap", message: "all egg slots" },
        { name: "fenceyard", message: "all fenceyard slots" },
        { name: "petchance", message: "configurable pet chance (see config)" },
        { name: "genes", message: "0 gene upgrades" },
        { name: "fasteggs", message: "faster incubation (see config)" },
        { name: "fastforaging", message: "fast foraging (see config)" },
        { name: "spiceclaim", message: "unlimited spice claims" },
        { name: "petupgrades", message: "cheaper pet upgrades (see config)" },
        { name: "petrng", message: "max strength pets for level and egg, with a bit of randomness" },
        { name: "superpets", message: "don't mess with these little guys, even if they look cute" },
        { name: "labpx", message: "long lab connections" },
        { name: "mealspeed", message: "configurable meal speed (see config)" },
        { name: "recipespeed", message: "configurable recipe speed (see config)" },
        { name: "luckychef", message: "new recipe chance (see config)" },
        { name: "kitchensdiscount", message: "cheaper kitchens and upgrades (see config)" },
        { name: "platesdiscount", message: "cheaper dinner plate upgrades (see config)" },
        { name: "arena", message: "unlimited arena entries" },
        { name: "mainframe", message: "mainframe cheats" },
        { name: "chipbonuses", message: "chip bonuses" },
        { name: "meals", message: "meal bonus cheats" },
        {
            name: "ribbon",
            message: "Adds a ribbon (1-25) to storage. Usage: w4 ribbon [1-25]",
            needsParam: true,
            fn: (params) => {
                const ribbonLvl = parseInt(params[1]);
                if (isNaN(ribbonLvl) || ribbonLvl < 1 || ribbonLvl > 25) {
                    return "Please provide a ribbon lvl between 1 and 25";
                }

                const ribbons = gga.Ribbon;
                for (let i = 0; i <= 27; i++) {
                    if (ribbons[i] === 0) {
                        ribbons[i] = ribbonLvl;
                        return `Added ribbon ${ribbonLvl} at storage index ${i}.`;
                    }
                }

                return "No empty storage slots available in the Ribbon storage";
            },
        },
        {
            name: "chips",
            message: "Adds to the amount of lab chips. Usage: w4 chips [chipname|all] [amount]",
            needsParam: true,
            suggestions: () =>
                cList.ChipDesc
                    ? [
                          {
                              value: "w4 chips all",
                              message: "Set amount for all lab chips",
                              category: "w4",
                              needsParam: true,
                          },
                          ...cList.ChipDesc.filter((chip) => chip[0]).map((chip) => ({
                              value: `w4 chips ${chip[0].toLowerCase()}`,
                              message: chip[1],
                              category: "w4",
                              needsParam: true,
                          })),
                      ]
                    : [],
            fn: (params) => {
                const target = params[1]?.toLowerCase();
                const amount = parseInt(params[2]);
                if (isNaN(amount)) {
                    return "Please provide a valid numeric amount";
                }

                const lab = gga.Lab;
                const chipsCount = lab[15];

                const chipNames = cList.ChipDesc.map((c) => c[0].toLowerCase());

                if (target === "all") {
                    for (let i = 0; i < chipNames.length && i <= 21; i++) {
                        chipsCount[i] += amount;
                    }
                    return `Added ${amount} to all ${chipNames.length} chip counts.`;
                }

                const index = chipNames.indexOf(target);
                if (index === -1 || index >= chipNames.length) {
                    return `Chip "${target}" not found or out of range. Valid names: ${chipNames.slice(0, 22).join(", ")}`;
                }

                chipsCount[index] += amount;
                return `Added ${amount} to ${cList.ChipDesc[index][0]}.`;
            },
        },
    ],
    config: {
        fasteggs: { default: (t) => t / 4, description: "Breeding: Egg incubation speed. (lower is better)" },
        petchance: { default: (t) => t * 2, description: "Breeding: New pet discovery chance" },
        petupgrades: { default: (t) => t / 4, description: "Breeding: Pet upgrade costs. (lower is better)" },
        mealspeed: { default: (t) => t / 4, description: "Cooking: Meal preparation speed. (lower is better)" },
        recipespeed: { default: (t) => t / 4, description: "Cooking: Recipe research speed. (lower is better)" },
        kitchensdiscount: { default: (t) => t / 4, description: "Cooking: Kitchen and spice costs. (lower is better)" },
        platesdiscount: { default: (t) => t / 2, description: "Cooking: Plate upgrade costs. (lower is better)" },
        fastforaging: { default: (t) => t * 4, description: "Cooking: Foraging speed" },
        luckychef: { default: (t) => t * 2, description: "Cooking: New recipe discovery luck" },
        superpets: {
            BlockChance: { default: (t) => t * 2, description: "Pet Arena: Block chance when attacked" },
            TotalDMG: { default: (t) => t * 4, description: "Pet Arena: Total pet damage" },
        },
        mainframe: {
            0: { default: (t) => Math.max(t, 200), description: "Mainframe: Animal farm damage bonus percentage" },
            1: { default: (t) => Math.max(t, 2), description: "Mainframe: Wired In printer multiplier" },
            2: { default: (t) => Math.max(t, 10), description: "Mainframe: Refinery cycle speed multiplier" },
            3: {
                default: (t) => Math.max(t, 10),
                description: "Mainframe: Alchemy bubble level gain (affects multi-bubble discovery)",
            },
            4: { default: (t) => Math.max(t, 2), description: "Mainframe: Deathnote and portal kill multiplier" },
            5: { default: (t) => 1, description: "Mainframe: Enable Shrine World Tour effect" },
            6: { default: (t) => Math.max(t, 5), description: "Mainframe: Alchemy liquid capacity multiplier" },
            7: { default: (t) => 2, description: "Mainframe: Stamp bonus multiplier (must be 2 to work)" },
            8: { default: (t) => Math.max(t, 5), description: "Mainframe: Spelunker jewel effect multiplier" },
            9: { default: (t) => t * 2, description: "Mainframe: Fungi Finger Pocketer cash bonus multiplier" },
            10: { default: (t) => Math.max(t, 2), description: "Mainframe: Alchemy vial bonus multiplier" },
            11: { default: (t) => t * 1.2, description: "Mainframe: Banking Fury damage multiplier" },
            12: { default: (t) => 1, description: "Mainframe: Enable sigils in alchemy" },
            13: { default: (t) => Math.max(t, 300), description: "Mainframe: Lab connection range multiplier" },
            100: { default: (t) => Math.max(t, 10), description: "Mainframe: Meal cooking speed multiplier" },
            101: { default: (t) => Math.max(t, 3), description: "Mainframe: Additional animal farm damage % per pet" },
            102: { default: (t) => Math.max(t, 60), description: "Mainframe: Lab XP gain bonus percentage" },
            103: { default: (t) => Math.max(t, 36), description: "Mainframe: Trim all building slots bonus" },
            104: { default: (t) => Math.max(t, 15), description: "Mainframe: All Stat bonus percentage" },
            105: { default: (t) => Math.max(t, 100), description: "Mainframe: Breeding XP gain bonus percentage" },
            106: { default: (t) => Math.max(t, 10), description: "Mainframe: Kitchen level up per day bonus" },
            107: { default: (t) => Math.max(t, 2), description: "Mainframe: Adds to bonus 3 (multi-bubble discovery)" },
            108: { default: (t) => Math.max(t, 50), description: "Mainframe: Food non-consume chance percentage" },
            109: {
                default: (t) => Math.max(t, 145),
                description: "Mainframe: Connection range for bonuses and jewels",
            },
            110: { default: (t) => Math.max(t, 100), description: "Mainframe: Extra damage bonus percentage" },
            111: { default: (t) => Math.max(t, 500), description: "Mainframe: Reduced egg incubation time percentage" },
            112: { default: (t) => Math.max(t, 1500), description: "Mainframe: Base efficiency bonus for all skills" },
            113: {
                default: (t) => Math.max(t, 1.5),
                description: "Mainframe: Fungi Finger Pocketer extra cash percentage",
            },
            114: { default: (t) => t * 3, description: "Mainframe: Meal cooking bonus speed percentage" },
            115: { default: (t) => Math.max(t, 45), description: "Mainframe: Pet passive ability speed percentage" },
            116: { default: (t) => Math.max(t, 50), description: "Mainframe: Additional meal bonus percentage" },
            117: { default: (t) => Math.max(t, 1.5), description: "Mainframe: Damage per greened stack bonus" },
        },
        chipbonuses: {
            resp: { default: (t) => Math.max(t, 50), description: "Lab Chip: Mob respawn speed bonus percentage" },
            card1: { default: (t) => 1, description: "Lab Chip: Double top-left card effect (1 = yes)" },
            card2: { default: (t) => 1, description: "Lab Chip: Double bottom-right card effect (1 = yes)" },
            crys: { default: (t) => Math.max(t, 95), description: "Lab Chip: Crystal spawn chance on kill percentage" },
            star: { default: (t) => 1, description: "Lab Chip: Double star sign effects (1 = yes)" },
            mkill: { default: (t) => Math.max(t, 40), description: "Lab Chip: Multikill per tier bonus percentage" },
            linewidth: { default: (t) => Math.max(t, 12), description: "Lab Chip: Lab line width bonus percentage" },
            dmg: { default: (t) => Math.max(t, 100), description: "Lab Chip: Damage bonus percentage" },
            move: { default: (t) => Math.max(t, 30), description: "Lab Chip: Movement speed bonus percentage" },
            acc: { default: (t) => Math.max(t, 30), description: "Lab Chip: Accuracy bonus percentage" },
            pend: { default: (t) => 1, description: "Lab Chip: Double pendant bonuses (1 = yes)" },
            key1: { default: (t) => 1, description: "Lab Chip: Double first keychain bonuses (1 = yes)" },
            troph: { default: (t) => 1, description: "Lab Chip: Double trophy bonuses (1 = yes)" },
            def: { default: (t) => Math.max(t, 10), description: "Lab Chip: Defense bonus percentage" },
            weappow: { default: (t) => Math.max(t, 100), description: "Lab Chip: Weapon power bonus percentage" },
            dr: { default: (t) => Math.max(t, 60), description: "Lab Chip: Drop rarity bonus percentage" },
            toteff: { default: (t) => Math.max(t, 40), description: "Lab Chip: Skilling efficiency bonus percentage" },
            eff: { default: (t) => Math.max(t, 1200), description: "Lab Chip: Base skilling efficiency bonus" },
            labexp: { default: (t) => Math.max(t, 150), description: "Lab Chip: Lab XP bonus percentage" },
            atkspd: { default: (t) => Math.max(t, 60), description: "Lab Chip: Attack speed bonus percentage" },
            safk: { default: (t) => Math.max(t, 15), description: "Lab Chip: Skill AFK gains bonus percentage" },
            fafk: { default: (t) => Math.max(t, 25), description: "Lab Chip: Fight AFK gains bonus percentage" },
        },
        meals: {
            TotDmg: { default: (t) => t, description: "Meals: total damage bonus. No change until you set it" },
            Mcook: { default: (t) => t, description: "Meals: meal cooking speed bonus. No change until you set it" },
            Cash: { default: (t) => t, description: "Meals: cash from monsters bonus. No change until you set it" },
            Rcook: { default: (t) => t, description: "Meals: recipe cooking speed bonus. No change until you set it" },
            Npet: { default: (t) => t, description: "Meals: new mob breed odds bonus. No change until you set it" },
            BrExp: { default: (t) => t, description: "Meals: breeding EXP bonus. No change until you set it" },
            Seff: { default: (t) => t, description: "Meals: skill efficiency bonus. No change until you set it" },
            VIP: { default: (t) => t, description: "Meals: VIP library points bonus. No change until you set it" },
            Lexp: { default: (t) => t, description: "Meals: lab EXP bonus. No change until you set it" },
            Def: { default: (t) => t, description: "Meals: base defence bonus. No change until you set it" },
            PxLine: { default: (t) => t, description: "Meals: lab line width (px) bonus. No change until you set it" },
            KitchenEff: {
                default: (t) => t,
                description: "Meals: cooking speed per ten levels bonus. No change until you set it",
            },
            TimeEgg: {
                default: (t) => t,
                description: "Meals: lower egg creation time bonus. No change until you set it",
            },
            KitchC: { default: (t) => t, description: "Meals: lower kitchen costs bonus. No change until you set it" },
            PetDmg: { default: (t) => t, description: "Meals: mob fighting damage bonus. No change until you set it" },
            TDpts: { default: (t) => t, description: "Meals: tower defence points bonus. No change until you set it" },
            CookExp: { default: (t) => t, description: "Meals: cooking EXP bonus. No change until you set it" },
            Breed: { default: (t) => t, description: "Meals: mob breedability rate bonus. No change until you set it" },
            TotAcc: { default: (t) => t, description: "Meals: total accuracy bonus. No change until you set it" },
            AtkSpd: { default: (t) => t, description: "Meals: basic attack speed bonus. No change until you set it" },
            Sprow: { default: (t) => t, description: "Meals: skilling prowess bonus. No change until you set it" },
            Lib: { default: (t) => t, description: "Meals: library checkout speed bonus. No change until you set it" },
            Critter: { default: (t) => t, description: "Meals: critters from traps bonus. No change until you set it" },
            Crit: { default: (t) => t, description: "Meals: crit chance bonus. No change until you set it" },
            LinePct: { default: (t) => t, description: "Meals: lab line width (%) bonus. No change until you set it" },
            TPpete: { default: (t) => t, description: "Meals: max levels for TPPST bonus. No change until you set it" },
            Liquid12: {
                default: (t) => t,
                description: "Meals: liquid capacity (liquids 1 and 2) bonus. No change until you set it",
            },
            DivExp: { default: (t) => t, description: "Meals: divinity EXP bonus. No change until you set it" },
            GamingBits: {
                default: (t) => t,
                description: "Meals: bits gain in gaming bonus. No change until you set it",
            },
            Liquid34: {
                default: (t) => t,
                description: "Meals: liquid capacity (liquids 3 and 4) bonus. No change until you set it",
            },
            Sailing: { default: (t) => t, description: "Meals: sailing speed bonus. No change until you set it" },
            GamingExp: { default: (t) => t, description: "Meals: gaming EXP bonus. No change until you set it" },
        },
    },
});

defineCheat({
    name: "w5",
    message: "Activate all World 5 cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "sailing", message: "sailing cheats" },
        { name: "endercaptains", message: "100% ender captains (requires Emporium bonus unlock)" },
        { name: "gaming", message: "gaming cheats" },
        { name: "divinity", message: "divinity cheats" },
        { name: "collider", message: "collider cheats" },
        { name: "holes", message: "holes cheats" },
        { name: "lantern", message: "no daily limit on Blinding Lantern uses" },
        { name: "skillcaverns", message: "no daily limit on skilling cavern nodes" },

        {
            name: "jargems",
            message: "Adds to the amount of jar gems. Usage: w5 jargems [jargem_name|all] [amount]",
            needsParam: true,
            suggestions: () => [
                {
                    value: "w5 jargems all",
                    message: "Set amount for all jar gems",
                    category: "w5",
                    needsParam: true,
                },
                ...getJarGemCatalog()
                    .filter((gem) => gem.name)
                    .map((gem) => ({
                        value: `w5 jargems ${gem.commandName}`,
                        message: gem.description || "",
                        category: "w5",
                        needsParam: true,
                    })),
            ],
            fn: (params) => {
                const target = params[1]?.toLowerCase();
                const amount = parseInt(params[2]);
                if (isNaN(amount)) {
                    return "Please provide a valid numeric amount";
                }

                const holes = gga.Holes;
                const gemCounts = holes[24];

                const gems = getJarGemCatalog();
                const gemNames = gems.map((gem) => gem.commandName);

                if (target === "all") {
                    for (let i = 0; i < gemCounts.length && i < gemNames.length; i++) {
                        gemCounts[i] += amount;
                    }
                    return `Added ${amount} to all ${Math.min(gemCounts.length, gemNames.length)} jar gem counts.`;
                }

                const index = gemNames.indexOf(target);
                if (index === -1 || index >= gemCounts.length) {
                    return `Jar gem "${target}" not found or out of range. Valid names: ${gemNames.join(", ")}`;
                }

                gemCounts[index] += amount;
                return `Added ${amount} to ${gems[index].name}.`;
            },
        },
        {
            name: "lanternreset",
            message: "Resets the daily Blinding Lantern use counter (12 per day)",
            fn: () => {
                const used = Number(gga.Holes[11][84]);
                gga.Holes[11][84] = 0;
                return `Blinding Lantern uses reset (was ${used}/12).`;
            },
        },
    ],
    config: {
        sailing: {
            IslandDistance: { default: (t) => t / 2, description: "Sailing: Island distance (lower is closer)" },
            MaxChests: {
                default: (t) => t,
                description:
                    "Sailing: Maximum chest limit (Warning: too high may break cloud saves). No change until you set it",
            },
            RareTreasureChance: { default: (t) => t * 5, description: "Sailing: Rare treasure find chance" },
            Minimumtraveltime: {
                default: (t) => t / 5,
                description: "Sailing: Minimum travel time in minutes. (lower is better)",
            },
            BoatUpgCostType: {
                default: (t) => t,
                description: "Sailing: Loot type ID for boat upgrades. No change until you set it",
            },
            BoatUpgCostQty: {
                default: (t) => t / 2,
                description: "Sailing: Loot quantity for upgrades. (lower is better)",
            },
            BoatValue: { default: (t) => t * 2, description: "Sailing: Loot quantity gained from boats" },
            BoatSpeed: { default: (t) => t * 2, description: "Sailing: Boat travel speed" },
            CloudDiscoverBonus: { default: (t) => t * 2, description: "Sailing: Cloud discovery bonuses" },
            ArtifactRarity: {
                default: (t) => t / 5,
                description: "Sailing: Artifact discovery chance. (lower is better)",
            },
            AncientChances: {
                default: (t) => t / 5,
                description: "Sailing: Ancient artifact chance. (lower is better)",
            },
            EldritchChances: {
                default: (t) => t / 5,
                description: "Sailing: Eldritch artifact chance. (lower is better)",
            },
            SovereignChances: {
                default: (t) => t / 5,
                description: "Sailing: Sovereign artifact chance. (lower is better)",
            },
            OmnipotentChances: {
                default: (t) => t / 5,
                description: "Sailing: Omnipotent artifact chance. (lower is better)",
            },
            TranscendentChances: {
                default: (t) => t / 5,
                description: "Sailing: Transcendent artifact chance. (lower is better)",
            },
            NewCaptBoatSlot: {
                default: (t) => 0,
                description: "Sailing: Cost for unlocking new boat and captain slots. (lower is better)",
            },
            BuyCaptainCost: {
                default: (t) => 0,
                description: "Sailing: Cost for hiring new captains. (lower is better)",
            },
            ArtifactBonus: {
                default: (t) => t,
                description: "Sailing: All artifact-provided bonuses. No change until you set it",
            },
        },
        gaming: {
            FertilizerUpgCosts: {
                default: (t) => 0,
                description: "Gaming: Fertilizer upgrade costs. (lower is better)",
            },
            SproutCapacity: { default: (t) => Math.max(22, t + 2), description: "Gaming: Max sprout slots" },
            MutateUpgCosts: { default: (t) => 0, description: "Gaming: Mutation upgrade costs. (lower is better)" },
            LogBookBitBonus: {
                default: (t) => Math.max(20, t * 2),
                description: "Gaming: Bit bonuses from the logbook",
            },
            GamingExpPCT: { default: (t) => t * 1.5, description: "Gaming: Gaming XP gain percentage" },
            NewMutantChanceDEC: {
                default: (t) => 1,
                description: "Gaming: Decimal new mutant chance (1 = guaranteed)",
            },
            SproutGrowthCHANCEperMUT: {
                default: (t) => t,
                description: "Gaming: Growth chance per mutation. No change until you set it",
            },
            SproutGrowthTime: { default: (t) => t / 5, description: "Gaming: Sprout growth speed. (lower is better)" },
            SaveSprinkler: {
                default: (t) => t * 1.1,
                description: "Gaming: Chance to save water when using sprinkler",
            },
            ImportItemCOST: { default: (t) => 0, description: "Gaming: Import item costs. (lower is better)" },
            AcornShopCost: { default: (t) => 0, description: "Gaming: Acorn shop upgrade costs. (lower is better)" },
            BoxCost: { default: (t) => 0, description: "Gaming: New box costs. (lower is better)" },
            SnailStuff: {
                default: (t, args) => {
                    const fns = { 0: (t) => 1, 1: (t) => 0, 2: (t) => t };
                    return fns[args[1]] ? fns[args[1]](t) : 0;
                },
                description: "Gaming: Snail logic (0: upgrade chance, 1: reset chance, 2: bit multi)",
            },
            SnailMail: { default: false, description: "Gaming: Enable/disable Snail Mail automation" },
            PaletteLuck: { default: (t) => t * 2, description: "Gaming: Palette-related luck" },
            PaletteBonus: { default: (t) => t * 2, description: "Gaming: Palette-related bonuses" },
            RatBitMulti: {
                default: (t) => t,
                description: "Gaming: Rat King crown bit multiplier. No change until you set it",
            },
            RatCrownOdds: { default: (t) => t, description: "Gaming: Rat King crown odds. No change until you set it" },
            RatCurrencyGain: {
                default: (t) => t,
                description: "Gaming: Rat currency gain. No change until you set it",
            },
            RatShopCost: {
                default: (t) => t,
                description: "Gaming: Rat shop costs. (lower is better). No change until you set it",
            },
            RatShopBonuses: { default: (t) => t, description: "Gaming: Rat shop bonuses. No change until you set it" },
        },
        divinity: {
            unlinks: { default: true, description: "Divinity: Allows unlinking gods at any time" },
            StyleLvReq: {
                default: (t) => 0,
                description: "Divinity: Meditation style level requirements. (lower is better)",
            },
            DivPerHr: { default: (t) => t * 3, description: "Divinity: Base divinity points gained per hour" },
            DivPerHr_EXP: { default: (t) => t * 3, description: "Divinity: Base divinity XP gained per hour" },
            BlesssBonus: { default: (t) => t * 2, description: "Divinity: God blessing bonuses" },
            Bonus_MAJOR: { default: (t) => t, description: "Divinity: Major god bonuses. No change until you set it" },
            Bonus_Minor: { default: (t) => t * 2, description: "Divinity: Minor god bonuses" },
            OfferingCost: { default: (t) => 0, description: "Divinity: Offering costs. (lower is better)" },
            OfferingOdds: { default: (t) => 1, description: "Divinity: Success probability for offerings" },
        },
        collider: {
            AtomsUnlocked: {
                default: (t) => t,
                description: "Collider: Number of unlocked atoms (max 10). No change until you set it",
            },
            AtomCost: { default: (t) => 0, description: "Collider: Atom collider upgrade costs. (lower is better)" },
            AtomBonuses: {
                default: (t) => t,
                description: "Collider: Bonuses provided by atoms. No change until you set it",
            },
            AtomBubbleUpgCost: {
                default: (t) => 0,
                description: "Collider: Atom bubble upgrade costs. (lower is better)",
            },
        },
        holes: {
            VillagerExpPerHour: { default: (t) => t * 2, description: "Sneaking: Villager XP gain speed" },
            BuildCost: { default: (t) => t / 2, description: "Sneaking: Building upgrade costs. (lower is better)" },
            BucketFillRate: { default: (t) => t * 2, description: "Sneaking: Bucket fill speed" },
            AmpMulti: { default: (t) => t * 2, description: "Sneaking: Amplifier effects" },
            MeasurementCost: {
                default: (t) => t / 2,
                description: "Sneaking: Measurement upgrade costs. (lower is better)",
            },
            MeasurementBaseBonus: { default: (t) => t * 2, description: "Sneaking: Measurement base bonuses" },
            MotherlodeEffBase: {
                default: (t) => t / 2,
                description: "Sneaking: Base efficiency for the motherlode. (lower is better)",
            },
            MonumentRewardMulti: { default: (t) => t * 2, description: "Sneaking: Monument rewards" },
            MonumentROGbonuses: { default: (t) => t * 2, description: "Sneaking: Right-side monument rewards" },
            MonumentHRbonuses: { example: (t) => t * 2 },
            Bravery_MinDMG: { default: (t) => t * 10, description: "Bravery: Minimum bravery damage" },
            Bravery_MaxDMG: { default: (t) => t * 2, description: "Bravery: Maximum bravery damage" },
            Bravery_SwordsOwned: { default: (t) => 9, description: "Bravery: Number of swords owned" },
            MaxRerolls: { default: (t) => Math.max(t, 20), description: "Bravery: Max rerolls allowed" },
            MaxRevisions: { default: (t) => Math.max(t, 5), description: "Bravery: Max revisions allowed" },
            Bravery_MonsterHP: { default: (t) => t / 2, description: "Bravery: Monster HP. (lower is better)" },
            Bravery_BlueChestChanceDEC: {
                default: (t) => t,
                description: "Bravery: Blue chest chance (higher is better). No change until you set it",
            },
            BellCosts: { default: (t) => t / 2, description: "Sneaking: Bell improvement costs. (lower is better)" },
            BellBonuss: { default: (t) => t * 2, description: "Sneaking: Bell bonuses" },
            BellExpPerHR: { default: (t) => t * 2, description: "Sneaking: Bell XP gain speed" },
            BellEXPreq: { default: (t) => t / 2, description: "Sneaking: Bell XP requirements. (lower is better)" },
            HarpNewNote_Cost: {
                default: (t) => t / 2,
                description: "Sneaking: New harp note costs. (lower is better)",
            },
            HarpNoteProduced: { default: (t) => t * 2, description: "Sneaking: Harp note production" },
            HarpPOWperHR: { default: (t) => t * 10, description: "Sneaking: Harp power gain speed" },
            LampWishCost: { default: (t) => t / 2, description: "Sneaking: Lamp wish costs. (lower is better)" },
            LampWishPerDay: { default: (t) => t * 2, description: "Sneaking: Daily lamp wish limit" },
            MushKillsLeft: {
                default: (t) => 0,
                description: "Sneaking: Remaining mushroom kills required for boss. (lower is better)",
            },
            J_StartCoins: { default: (t) => t * 5, description: "Justice: Starting coins" },
            J_Happiness: { default: (t) => t * 5, description: "Justice: Starting happiness" },
            J_Dismissals: { default: (t) => t * 5, description: "Justice: Starting dismissals" },
            J_StartHealth: { default: (t) => t * 5, description: "Justice: Starting health" },
            Justice_BlueChestChanceDEC: {
                default: (t) => 0.5,
                description: "Justice: Probability of blue chest spawn. (lower is better)",
            },
            BolaiaStudyRate: { default: (t) => t * 2, description: "Sneaking: Bolaia study speed" },
            JarProductionPerHR: { default: (t) => t * 2, description: "Sneaking: Jar production speed" },
            TempleTorchCost: { default: (t) => t / 2, description: "Sneaking: Temple torch costs. (lower is better)" },
            JarCollectibleBonus: { default: (t) => t * 2, description: "Sneaking: Jar collectible bonuses" },
            JarEnchantChance: { default: (t) => t * 2, description: "Sneaking: Jar enchantment success chance" },
            JarNewCollectibleChance: {
                default: (t) => t * 2,
                description: "Sneaking: New jar collectible discovery chance",
            },
            Cost_FountainUPG: { default: (t) => t / 2, description: "Fountain: Upgrade costs. (lower is better)" },
            Fount_RoyalChance: { default: (t) => t * 2, description: "Fountain: Royal stack chance" },
            Fount_RoyalMulti: { default: (t) => t * 2, description: "Fountain: Royal stack value multiplier" },
            Fount_MarblePerFill: {
                default: (t) => t * 2,
                description: "Fountain: Marble gained per Yellow Water fill",
            },
            Fount_MarbleizeCost: {
                default: (t) => t / 2,
                description: "Fountain: Upgrade marbleization costs. (lower is better)",
            },
            FountainBar_REQ: { example: (t) => t },
            FountainBar_Speed: { example: (t) => t },
            CanWeAfford_Fountain: { example: (t) => t },
            Fountain_OpalCost: { example: (t) => t },
            Fountain_UpgUnlocked: { example: (t) => t },
            CanWeAfford_FountainUPG: { example: (t) => t },
            FountainBar_ActiveSpdMulti: { example: (t) => t },
            Fount_CurrencyKEEP: { example: (t) => t },
            HolezBucketGoldOwned: { example: (t) => t },
            HolezBucketGoldMult: { example: (t) => t },
            FountainBar_DoWeHave: { example: (t) => t },
            Fountain_WatersOwned: { example: (t) => t },
            Fountain_BonTOT: { example: (t) => t },
            Fount_SpaceXY: { example: (t) => t },
            SpacesOwned: { example: (t) => t },
            MaxStackSize: { example: (t) => t },
            MaxCoinz: { example: (t) => t },
            Fount_GenerateCoin: { example: (t) => t },
            Fount_CurrencyALLmulti: { example: (t) => t },
            Fount_CurrencyBaseValue: { example: (t) => t },
            Fount_CurrencyTotValue: { example: (t) => t },
            Fount_DesireMulti: { example: (t) => t },
            CanWeBUY_Marbleize: { example: (t) => t },
            CanWeAfford_Marbleize: { example: (t) => t },
            Fountain_MarbleBonNEXT: { example: (t) => t },
            Fountain_MarbleBon: { example: (t) => t },
        },
    },
});

defineCheat({
    name: "w6",
    message: "Activate all World 6 cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "farming", message: "farming cheats" },
        { name: "ninja", message: "ninja cheats" },
        { name: "summoning", message: "summoning cheats" },
        { name: "grimoire", message: "grimoire cheats" },
        { name: "windwalker", message: "windwalker cheats" },
        { name: "arcane", message: "arcane cultist cheats" },
        { name: "royal", message: "royal guardian cheats" },
        { name: "emperor", message: "unlimited emperor tries" },
        { name: "endless", message: "easy endless runs for summoning" },
        { name: "sneaksymbol", message: "sneaksymbol 100% chance" },
        {
            name: "ninjaItem",
            message: "Generates a ninja item based on the floor which ninja twin is inputted",
            needsParam: true,
            fn: function (params) {
                const char = parseInt(params[1]);
                const charCount = gga.GetPlayersUsernames.length;
                if (isNaN(char) || char < 0 || char >= charCount) {
                    return `Please choose a ninja twin to generate item (0-${charCount - 1}).`;
                }

                const loopTimes = Math.max(1, parseInt(params[2]) || 1);
                const actorEvents579 = events(579);
                for (let n = 0; n < loopTimes; n++) {
                    actorEvents579._customBlock_Ninja("GenerateItem", char, 0);
                }
                return `Generated ${loopTimes} ninja items for character ${char}`;
            },
        },
        {
            name: "sumunit",
            message: "Set summoning units to be always a certain type",
            suggestions: () =>
                Object.keys(summonUnits).map((unit) => ({
                    value: `w6 sumunit ${unit}`,
                    message: "",
                    category: "w6",
                })),
            fn: (params) => {
                const unitName = params[1];
                if (!unitName) {
                    return `Please input a unit name ${[...summonUnits.keys()].join(", ")} to summon as per normal.`;
                }
                const summonUnit = summonUnits[unitName];
                if (summonUnit === undefined) {
                    return `no such unit ${unitName} found`;
                }
                if (unitName === "reset") {
                    cheatState.w6.sumunit = false;
                    cheatConfig.w6.sumunit = { UnitTypeDraw: (t) => t };
                    return `summoning units has been reset to default`;
                }

                cheatState.w6.sumunit = true;
                cheatConfig.w6.sumunit = { UnitTypeDraw: () => summonUnit };
                return `${unitName} set as unit to be drawn`;
            },
        },
    ],
    config: {
        farming: {
            GrowthReq: { default: (t) => t / 5, description: "Farming: Plant growth time. (lower is better)" },
            OGunlocked: {
                default: (t) => t,
                description:
                    "Farming: Overgrowth shop unlock state (0 = locked, 1 = unlocked). No change until you set it",
            },
            NextOGchance: { default: (t) => t * 5, description: "Farming: Next overgrowth discovery chance" },
            OGmulti: {
                default: (t) => (t === 1 ? 1 : Math.min(1e9, Math.max(1, t * 2))),
                description: "Farming: Overgrowth bonuses (the game stops at 1e9)",
            },
            PlotOwned: { default: (t) => Math.min(36, t + 2), description: "Farming: Number of plots owned (max 36)" },
            MarketCostType: {
                default: (t) => t,
                description: "Farming: Plant type ID for market upgrades. No change until you set it",
            },
            MarketCostQTY: {
                default: (t) => Math.floor(t / 5),
                description: "Farming: Plant quantity for upgrades. (lower is better)",
            },
            NextCropChance: { default: (t) => t * 2, description: "Farming: Next plant evolution discovery chance" },
            CropsBonusValue: { default: (t) => t * 2, description: "Farming: Crop value/bonus" },
            CropsOnVine: { default: (t) => t * 2, description: "Farming: Crops per plant" },
            GrowthRate: {
                default: (t) => t,
                description: "Farming: Base growth rate multiplier. No change until you set it",
            },
            ExoticPurchasesAllowed: {
                default: (t) => Math.max(t, 8),
                description: "Farming: Allowed exotic purchases (at least 8)",
            },
            ExoticLVQTY: { default: (t) => t * 2, description: "Farming: Exotic level quantities" },
            StickerDMGmulti: {
                default: (t) => t,
                description: "Farming: Sticker damage multiplier. No change until you set it",
            },
            StickersPerRow: { default: (t) => t, description: "Farming: Stickers per row. No change until you set it" },
            StickerOdds: { default: (t) => t, description: "Farming: Sticker find chance. No change until you set it" },
            AttemptMegacropGrowth: {
                default: (t) => t,
                description: "Farming: Megacrop growth roll (1 = it grows). No change until you set it",
            },
            StickerBonus: { default: (t) => t, description: "Farming: Sticker bonuses. No change until you set it" },
            StickerOddsMulti: { example: (t) => t },
            TotalStickers: { example: (t) => t },
            NumberOfBigStickers: { example: (t) => t },
        },
        ninja: {
            EmporiumCost: { default: (t) => t / 5, description: "Ninja: Emporium upgrade costs. (lower is better)" },
            KOtime: { default: (t) => t / 5, description: "Ninja: Knockout duration. (lower is better)" },
            ActionSpd: { default: (t) => t * 2, description: "Ninja: Action speed" },
            Stealth: { default: (t) => t * 2, description: "Ninja: Stealth rating" },
            DetectionDEC: { default: (t) => t / 5, description: "Ninja: Detection rate. (lower is better)" },
            DoorMaxHP: { default: (t) => t, description: "Ninja: Door max HP. No change until you set it" },
            JadeUpgCost: {
                default: (t) => t,
                description: "Ninja: Jade upgrade costs. (lower is better). No change until you set it",
            },
            ItemStat: { default: (t) => t * 2, description: "Ninja: Item stats" },
            ItemFindOdds: { default: (t) => t * 2, description: "Ninja: Item find chance" },
            PristineBon: {
                default: (t) => t,
                description: "Ninja: Pristine Charm bonuses. No change until you set it",
            },
        },
        summoning: {
            ManaStart: {
                default: (t) => t,
                description: "Summoning: Starting mana in battles. No change until you set it",
            },
            ManaRegen: { default: (t) => t * 2, description: "Summoning: Mana regeneration speed" },
            UnitSpd: {
                default: (t) => t,
                description: "Summoning: Ally unit movement speed. No change until you set it",
            },
            UnitHP: { default: (t) => t * 2, description: "Summoning: Ally unit HP" },
            UnitDMG: { default: (t) => t * 2, description: "Summoning: Ally unit damage" },
            UnitDODGE: {
                default: (t) => Math.min(1, t * 2),
                description: "Summoning: Ally unit dodge probability (max 1)",
            },
            EndlessUnlocked: { default: (t) => 1, description: "Summoning: Unlocks endless mode (1 = yes)" },
            SummUpgBonus: { default: (t) => t * 2, description: "Summoning: Summoning upgrade bonuses" },
            SummRockEssGen: { default: (t) => t * 1.5, description: "Summoning: Essence generation rate" },
            UpgCost: { default: (t) => t / 2, description: "Summoning: Upgrade costs (0 = free). (lower is better)" },
            UnitCost: {
                default: (t) => Math.ceil(t / 2),
                description: "Summoning: Unit summoning costs. (lower is better)",
            },
            RerollCost: { default: (t) => 0, description: "Summoning: Reroll costs (0 = free). (lower is better)" },
            SummEXPgain: { default: (t) => t, description: "Summoning: Summoning XP gain. No change until you set it" },
            EnemyHP: { default: (t) => t / 2, description: "Summoning: Enemy unit HP. (lower is better)" },
            EnemyDMG: { default: (t) => t / 2, description: "Summoning: Enemy unit damage. (lower is better)" },
            EnemySpd: {
                default: (t) => t,
                description: "Summoning: Enemy unit movement speed. No change until you set it",
            },
        },
        grimoire: {
            GrimoireBoneQTYbase: { default: (t) => t * 2, description: "Grimoire: Bone quantity base value" },
            GrimoireUpgCost: { default: (t) => t / 2, description: "Grimoire: Upgrade costs. (lower is better)" },
            Grimoire_HP: { default: (t) => t * 2, description: "Grimoire: HP" },
            Grimoire_DMG: { default: (t) => t * 2, description: "Grimoire: Damage" },
            Grimoire_ACC: { default: (t) => t * 2, description: "Grimoire: Accuracy" },
            Grimoire_DEF: { default: (t) => t * 2, description: "Grimoire: Defense" },
            Grimoire_CRITPCT: { default: (t) => t * 2, description: "Grimoire: Crit Chance" },
            Grimoire_CRITDMG: { default: (t) => t * 2, description: "Grimoire: Crit Damage" },
        },
        windwalker: {
            CompassUpgCost: {
                default: (t) => t / 2,
                description: "Windwalker: Compass upgrade costs. (lower is better)",
            },
            Compass_HP: { default: (t) => t * 2, description: "Windwalker: HP" },
            Compass_DMG: { default: (t) => t * 2, description: "Windwalker: Damage" },
            Compass_ACC: { default: (t) => t * 2, description: "Windwalker: Accuracy" },
            Compass_DEF: { default: (t) => t * 2, description: "Windwalker: Defense" },
            Compass_CRITPCT: { default: (t) => t * 2, description: "Windwalker: Crit Chance" },
            Compass_CRITDMG: { default: (t) => t * 2, description: "Windwalker: Crit Damage" },
            Compass_MoveSpeed: { default: (t) => Math.max(t, 300), description: "Windwalker: Movement speed bonus" },
            TempestMultishotPCT: { default: (t) => t * 2, description: "Windwalker: Tempest multishot chance" },
            CompassDustQTYbase: { default: (t) => t * 2, description: "Windwalker: Dust quantity base value" },
            TempestWepDropChance: {
                default: (t) => Math.max(t, 0.1),
                description: "Windwalker: Probability of Tempest weapon drops",
            },
            TempestRingDropChance: {
                default: (t) => Math.max(t, 0.1),
                description: "Windwalker: Probability of Tempest ring drops",
            },
            TempestStoneDropChance: {
                default: (t) => Math.max(t, 0.1),
                description: "Windwalker: Probability of Tempest stone drops",
            },
            TempestMedallionDropChance: {
                default: (t) => 1,
                description: "Windwalker: Probability of Tempest medallion drops",
            },
            PortalCostQTY: {
                default: (t) => 1,
                description: "Windwalker: Items required for portal access. (lower is better)",
            },
            PortalCostType: { example: (t) => t },
            CompassBonus: { example: (t) => t },
            StampDoubler: { example: (t) => t },
            StampDoublersLeft: { example: (t) => t },
            Compass_AttackSpdPCT: { example: (t) => t },
            Compass_InvulnSec: { example: (t) => t },
            Compass_Range: { example: (t) => t },
            CompassUpgTotal: { example: (t) => t },
            TotBreedzWWz: { example: (t) => t },
            TotalTitanKills: { example: (t) => t },
            CompassDustType: { example: (t) => t },
            TempestWepDrop: { example: (t) => t },
            TempestRingDrop: { example: (t) => t },
            TempestWeaponXtraPowerChance: { example: (t) => t },
            TempestAllDropBonus: { example: (t) => t },
            TempestNovadustChance: { example: (t) => t },
            StoneChancePCT: { example: (t) => t },
            ExtraDust: { example: (t) => t },
            CompassUpgXY: { example: (t) => t },
            CompassTempest: { example: (t) => t },
            Compass_MASTERY: { example: (t) => t },
            TitanWeakness: { example: (t) => t },
            MobWeakness: { example: (t) => t },
            EffectAmount: { example: (t) => t },
            CurrentEffect: { example: (t) => t },
            TotalTitansKilled: { example: (t) => t },
            InitializeTitanHP: { example: (t) => t },
            TitanKillReqTown: { example: (t) => t },
            CanWeEnterPortal: { example: (t) => t },
        },
        arcane: {
            ArcaneUpgCost: { default: (t) => t / 2, description: "Arcane: Arcane upgrade costs. (lower is better)" },
            Arcane_HP: { default: (t) => t * 2, description: "Arcane: HP" },
            Arcane_DMG: { default: (t) => t * 2, description: "Arcane: Damage" },
            Arcane_ACC: { default: (t) => t * 2, description: "Arcane: Accuracy" },
            Arcane_DEF: { default: (t) => t * 2, description: "Arcane: Defense" },
            Arcane_CRITPCT: { default: (t) => t * 2, description: "Arcane: Crit Chance" },
            Arcane_CRITDMG: { default: (t) => t * 2, description: "Arcane: Crit Damage" },
            Arcane_AttackSpdPCT: { default: (t) => t * 2, description: "Arcane: Attack Speed" },
            ArcaneMultishotPCT: { default: (t) => t * 2, description: "Arcane: Arcane multishot chance" },
            TenteyeclePCT: { default: (t) => Math.max(t, 100), description: "Arcane: Tenteyecle proc chance" },
            PrismaBubDropChance: { default: (t) => t * 2, description: "Arcane: Probability of Prisma Bubble drops" },
            WepDropChance: { default: (t) => t * 2, description: "Arcane: Probability of weapon drops" },
            WepDropQuality: { example: (t) => t },
            RingDropChance: { default: (t) => t * 2, description: "Arcane: Probability of ring drops" },
            RingDropQuality: { example: (t) => t },
            DoubleItemDropz: {
                default: (t) => Math.max(t, 100),
                description: "Arcane: Probability of double item drops",
            },
            ExtraTachyon: { default: (t) => t * 2, description: "Arcane: Extra tachyon gain" },
            ExtraTachyonMulti: { default: (t) => t * 2, description: "Arcane: Extra tachyon bonuses" },
            ArcaneTachyonQTYbase: { default: (t) => t * 2, description: "Arcane: Tachyon quantity base value" },
            ArcaneMobSpawnQTY: {
                default: (t) => t,
                description: "Arcane: Mobs spawned by Arcane Crystal ability. No change until you set it",
            },
            TimeLeft: {
                default: (t) => t,
                description: "Arcane: Remaining time for the Arcane Barrier encounter. No change until you set it",
            },
            CrystalChargeReq: {
                default: (t) => t,
                description:
                    "Arcane: Kill requirement to spawn Arcane mobs. (lower is better). No change until you set it",
            },
            TesseractArcanist: { example: (t) => t },
            ArcaneUpgUNLOCKED: { example: (t) => t },
            ArcaneUpgTotal: { example: (t) => t },
            ArcaneUpgBonus: { example: (t) => t },
            ArcaneMapMulti: { example: (t) => t },
            ArcaneMapMulti_bon: { example: (t) => t },
            ArcaneMapMulti_bonMAX: { example: (t) => t },
            Arcane_MASTERY: { example: (t) => t },
            KillsReq: { example: (t) => t },
            is_NBLB_on: { example: (t) => t },
            NBLB_bubbleQTY: { example: (t) => t },
            NBLB_bubbleLVrangeDisp: { example: (t) => t },
            ArcaneTachyonType: { example: (t) => t },
        },
        sneaksymbol: {
            SneakSymbolChanceBase: { default: (t) => 1, description: "Sneaking: Base chance for Sneak Symbol procs" },
        },
        royal: {
            StatueUpgOdds: { default: (t) => t * 2, description: "Royal Guardian: Statue upgrade odds" },
            Statue_CanAfford: { default: (t) => 1, description: "Royal Guardian: Statue affordability check" },
            StatueBon: { default: (t) => t * 2, description: "Royal Guardian: Statue bonus multiplier" },
            ArmoryUpgCost: {
                default: (t) => t / 2,
                description: "Royal Guardian: Armory upgrade costs. (lower is better)",
            },
            RatDMG: { default: (t) => t * 2, description: "Royal Guardian: Damage dealt to Verminous rats" },
            ParchmentDrop: { default: (t) => t * 2, description: "Royal Guardian: Parchment of Enchantment drop rate" },
            MarbleDrop: { default: (t) => t * 2, description: "Royal Guardian: Marble drop rate" },
            OutpostKillsReq: {
                default: (t) => t / 2,
                description: "Kingdom: Outpost kills requirement. (lower is better)",
            },
            SupportEXP: { default: (t) => t * 2, description: "Kingdom: Support units EXP gain" },
            OutpostRange: { default: (t) => t * 2, description: "Kingdom: Outpost connection range" },
            OutpostResourceRate: { default: (t) => t * 2, description: "Kingdom: Resource collection rate" },
            Statue_Cost: { example: (t) => t, description: "Royal Guardian: Statue upgrade cost. (lower is better)" },
            SF_unlocked: { example: (t) => t, description: "Royal Guardian: Statue flair unlock state" },
            SF_maxLV: { example: (t) => t, description: "Royal Guardian: Statue flair max level" },
            SF_costo: {
                example: (t) => t,
                description: "Royal Guardian: Statue flair upgrade cost. (lower is better)",
            },
            SF_weOwn: { example: (t) => t, description: "Royal Guardian: Statue flair owned shards" },
            SF_bonus: { example: (t) => t, description: "Royal Guardian: Statue flair bonus" },
            StatueEXPmulti: { example: (t) => t, description: "Royal Guardian: Statue EXP multiplier" },
            ArmoryUpgUNLOCKED: { example: (t) => t, description: "Royal Guardian: Armory upgrades unlocked count" },
            ArmoryUpgTotal: { example: (t) => t, description: "Royal Guardian: Total armory upgrades count" },
            ArmoryUpgBonus: { example: (t) => t, description: "Royal Guardian: Armory upgrade bonus value" },
            RatResp: { example: (t) => t, description: "Royal Guardian: Verminous rat respawn rate" },
            ParchmentDouble: { example: (t) => t, description: "Royal Guardian: Parchment double drop chance" },
            ParchmentRecycle: { example: (t) => t, description: "Royal Guardian: Parchment recycle value" },
            GuardianRoyalRadius: { example: (t) => t, description: "Royal Guardian: Royal aura radius" },
            RI_chance: { example: (t) => t, description: "Royal Guardian: Regal Intervention proc chance" },
            RI_mobs: { example: (t) => t, description: "Royal Guardian: Regal Intervention mobs count" },
            OrbletMultiDrop: { example: (t) => t, description: "Royal Guardian: Orblet drop multiplier" },
            KingdomEnabled: { example: (t) => t, description: "Kingdom: Kingdom enabled check" },
            Yi_OutpostInfo: { example: (t) => t, description: "Kingdom: Outpost info query" },
            HasOutpost: { example: (t) => t, description: "Kingdom: Check if outpost exists on map" },
            OutpostTypesUnlocked: { example: (t) => t, description: "Kingdom: Outpost types unlocked" },
            OutpostTypesAllowed: { example: (t) => t, description: "Kingdom: Outpost types allowed" },
            OutpostROGbon: { example: (t) => t, description: "Kingdom: Outpost rank bonuses" },
            SupportCollection: { example: (t) => t, description: "Kingdom: Support units collection bonus" },
            SavageCollection: { example: (t) => t, description: "Kingdom: Savage collection bonus" },
            XtraClearKillz: { example: (t) => t, description: "Kingdom: Extra clear kills per kill" },
            BarExpRate_Base: { example: (t) => t, description: "Kingdom: Base bar EXP rate" },
            BarExpRate: { example: (t) => t, description: "Kingdom: Total bar EXP rate" },
            MapOutpostBarUnlockedTot: { example: (t) => t, description: "Kingdom: Total outpost bars unlocked" },
            OutpostEXPformula: { example: (t) => t, description: "Kingdom: Outpost EXP formula value" },
            OutpostEXPreq: { example: (t) => t, description: "Kingdom: Outpost EXP requirement. (lower is better)" },
            OutpostEXPreqPREV: { example: (t) => t, description: "Kingdom: Previous rank outpost EXP requirement" },
            OutpostEXPrank: { example: (t) => t, description: "Kingdom: Outpost EXP rank" },
            OutpostPTSleft: { example: (t) => t, description: "Kingdom: Outpost specialty points remaining" },
            OutpostCost: { example: (t) => t, description: "Kingdom: Outpost upgrade cost. (lower is better)" },
            OutpostLV_Bonuses: { example: (t) => t, description: "Kingdom: Outpost level bonuses" },
            UnitSpecEffect: { example: (t) => t, description: "Kingdom: Unit specialty effect value" },
            isMapPurified: { example: (t) => t, description: "Kingdom: Map purification status" },
            OutpostPurifyBonus: { example: (t) => t, description: "Kingdom: Outpost purification bonus" },
            MapOutpostBarUnlocked: { example: (t) => t, description: "Kingdom: Outpost bar unlocked on map" },
            MapWorldsUnlocked: { example: (t) => t, description: "Kingdom: Worlds unlocked for outpost expansion" },
            MapButtonsUnlock: { example: (t) => t, description: "Kingdom: Map buttons unlock status" },
            CanWeDoubleConnect: { example: (t) => t, description: "Kingdom: Double connection capability" },
            UnitsUnlocked: { example: (t) => t, description: "Kingdom: Number of units unlocked" },
            GEDunlocked: { example: (t) => t, description: "Kingdom: GED unlock status" },
            ActiveKillClear: { example: (t) => t, description: "Kingdom: Active kill clear rate" },
            OutpostUnitSlots: { example: (t) => t, description: "Kingdom: Outpost unit slots available" },
            ResNodeQTYmax: { example: (t) => t, description: "Kingdom: Resource node max capacity" },
            ResNodes_LVUP: { example: (t) => t, description: "Kingdom: Resource node level up" },
            ResNodes_LVUPbon: { example: (t) => t, description: "Kingdom: Resource node level up bonus" },
            PassiveUnitsz: { example: (t) => t, description: "Kingdom: Passive units calculation" },
            TotalSupports: { example: (t) => t, description: "Kingdom: Total support units" },
            TotalUnitsz: { example: (t) => t, description: "Kingdom: Total units count" },
            TotalStatz: { example: (t) => t, description: "Kingdom: Total stats calculation" },
        },
    },
});

defineCheat({
    name: "w7",
    message: "Activate all World 7 cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "spelunk", message: "spelunk cheats" },
        { name: "gallery", message: "gallery cheats" },
        { name: "sushi", message: "sushi cheats, check config file" },
        { name: "reef", message: "coral reef nullify cost" },
        { name: "clam", message: "clam cheats" },
        { name: "coralkid", message: "coral kid nullify cost" },
        { name: "bigfish", message: "big fish nullify cost" },
        { name: "bubba", message: "bubba cheats" },
        { name: "zenith", message: "zenith market cheats" },
        { name: "minehead", message: "minehead cheats" },
        { name: "research", message: "research cheats" },
        { name: "jelly", message: "jelly operator dispatch overrides" },
        { name: "menagerie", message: "luminous menagerie dispatch overrides" },
        { name: "glimbo", message: "glimbo cheats" },
        { name: "spelunkmana", message: "no stamina cost in spelunking" },
        {
            name: "spelunkdepth",
            message: "Sets the current spelunking depth. Needs a layer change to activate",
            configurable: true,
        },
    ],
    config: {
        menagerie: {
            LumiGainRate: { default: (t) => t * 2, description: "Menagerie: Lumi generated per hour" },
            ScurgeEXPgain: { default: (t) => t * 2, description: "Menagerie: Scurge EXP gained per kill" },
            PinkJellyCosts: { default: (t) => t / 2, description: "Menagerie: Purple Jellyfish purchase costs" },
            SilverJellyCosts: { default: (t) => t / 2, description: "Menagerie: Silver Jelly Costs" },
            ScurgeEXP_Req: { default: (t) => t / 2, description: "Menagerie: Scurge EXP Req" },
            UpgUnlocked: { example: (t) => t, description: "Menagerie: Available mission, unlock, or upgrade count" },
            ShellEXPreq: { example: (t) => t, description: "Menagerie: Shell EXPreq" },
            LilTownJellyUnlocked: { example: (t) => t, description: "Menagerie: Lil Town Jelly Unlocked" },
            Cost: {
                example: (t) => t,
                description: "Menagerie: Mission progress target or Lumi price, selected by the first argument",
            },
            CostExponent: { example: (t) => t, description: "Menagerie: Cost Exponent" },
            CanClaim: { example: (t) => t, description: "Menagerie: Mission completion or purchase eligibility" },
            BlackStarsOwned: { example: (t) => t, description: "Menagerie: Black Stars Owned" },
            OrganicLabelOwned: { example: (t) => t, description: "Menagerie: Organic Label Owned" },
            MineheadDoublersOwned: { example: (t) => t, description: "Menagerie: Minehead Doublers Owned" },
            MineheadDoublersLEFT: { example: (t) => t, description: "Menagerie: Minehead Doublers LEFT" },
            SushiDoublersOwned: { example: (t) => t, description: "Menagerie: Sushi Doublers Owned" },
            SushiDoublersLEFT: { example: (t) => t, description: "Menagerie: Sushi Doublers LEFT" },
            JellyOpDoublersOwned: { example: (t) => t, description: "Menagerie: Jelly Op Doublers Owned" },
            JellyOpDoublersLEFT: { example: (t) => t, description: "Menagerie: Jelly Op Doublers LEFT" },
            ClickerCheapenerAoE: { example: (t) => t, description: "Menagerie: Clicker Cheapener Ao E" },
            OrionCheapener: { example: (t) => t, description: "Menagerie: Orion Cheapener" },
            PoppyCheapener: { example: (t) => t, description: "Menagerie: Poppy Cheapener" },
            BubbaCheapener: { example: (t) => t, description: "Menagerie: Bubba Cheapener" },
            TotalOrbs: { example: (t) => t, description: "Menagerie: Total Orbs" },
            OrbX: { example: (t) => t, description: "Menagerie: Orb X" },
            OrbY: { example: (t) => t, description: "Menagerie: Orb Y" },
            UnlockOwned: { example: (t) => t, description: "Menagerie: Calculated unlock ownership" },
            BoostQTY: { example: (t) => t, description: "Menagerie: Boost QTY" },
            SumCostReduxMena: { example: (t) => t, description: "Menagerie: Sum Cost Redux Mena" },
            CK_tValue: { example: (t) => t },
            CK_KillMulti: { example: (t) => t, description: "Menagerie: CK Kill Multi" },
            CK_TimeMulti: { example: (t) => t, description: "Menagerie: CK Time Multi" },
            CK_TotalValue: { example: (t) => t, description: "Menagerie: CK Total Value" },
            CK_NonDivHourTime: { example: (t) => t, description: "Menagerie: CK Non Div Hour Time" },
            NightmarinerTotLV: { example: (t) => t, description: "Menagerie: Nightmariner Tot LV" },
            NightmarinerBon: { example: (t) => t, description: "Menagerie: Nightmariner Bon" },
            PinkJellyBonus: { example: (t) => t, description: "Menagerie: Purple Jellyfish Lumi bonus" },
            RedJellyReadingMulti: { example: (t) => t, description: "Menagerie: Red Jellyfish reading multiplier" },
            ObolMISCmulti: { example: (t) => t, description: "Menagerie: Obol MISCmulti" },
            ObolAutoTrashRate: { example: (t) => t, description: "Menagerie: Obol Auto Trash Rate" },
            ConstBuildREQ: { example: (t) => t, description: "Menagerie: Const Build REQ" },
            ConstBuildBONUSES: { example: (t) => t, description: "Menagerie: Const Build BONUSES" },
            SideJellyUnlocked: { example: (t) => t, description: "Menagerie: Side Jelly Unlocked" },
            ScurgeUnlocked: { example: (t) => t, description: "Menagerie: Scurge Unlocked" },
            ScurgePTS_Left: { example: (t) => t, description: "Menagerie: Unspent Scurge upgrade points" },
            ScurgeUpg_LvREQ: { example: (t) => t, description: "Menagerie: Scurge Upg Lv REQ" },
            ScurgeStartingEXP: { example: (t) => t, description: "Menagerie: Scurge Starting EXP" },
            OmegaArcBallChance: { example: (t) => t, description: "Menagerie: Omega Arc Ball Chance" },
            OmniJadeLeft: { example: (t) => t, description: "Menagerie: Unspent Omni Jade nodes" },
            MissionProg: { example: (t) => t, description: "Menagerie: Mission Prog" },
            CK_BaseValue: { description: "Menagerie: CK Base Value" },
        },
        jelly: {
            UpgCost: { default: (t) => t / 2, description: "Jelly Operator: Upgrade cost" },
            UpgLvREQ: { default: (t) => 0, description: "Jelly Operator: Upgrade level requirement" },
            CellExpREQ: { default: (t) => t / 2, description: "Jelly Operator: Cell EXP requirement" },
            DailyTries: { default: (t) => t * 2, description: "Jelly Operator: Daily operation attempts" },
            BloodcellDaily: { default: (t) => t * 2, description: "Jelly Operator: Daily Bloodcells" },
            CellDMG: { default: (t) => t * 2, description: "Jelly Operator: Cell damage" },
            CellSPD: { default: (t) => t * 2, description: "Jelly Operator: Cell speed" },
            EXPMulti: { default: (t) => t * 2, description: "Jelly Operator: Cell EXP multiplier" },
            SlotUnlocked: { example: (t) => t, description: "Jelly Operator: Slot availability" },
            SlotPurchasesLeft: { example: (t) => t, description: "Jelly Operator: Remaining slot purchases" },
            UpgradeQTY: { example: (t) => t, description: "Jelly Operator: Upgrade effect quantity" },
            CanWeBuyUpg: { example: (t) => t, description: "Jelly Operator: Upgrade purchase eligibility" },
            RoG_BonusQTY: { example: (t) => t, description: "Jelly Operator: Obstruction reward bonus" },
            UnitsOwned: { example: (t) => t, description: "Jelly Operator: Owned cells" },
            BossHP: { example: (t) => t, description: "Jelly Operator: Obstruction HP" },
            BossTime: { example: (t) => t, description: "Jelly Operator: Obstruction timing" },
            BossAtkCD: { example: (t) => t, description: "Jelly Operator: Obstruction attack cooldown" },
            CurrencyMulti: { example: (t) => t, description: "Jelly Operator: Bloodcell gain multiplier" },
            DPSmulti: { example: (t) => t, description: "Jelly Operator: DPS multiplier" },
            MainAtkCD: { example: (t) => t, description: "Jelly Operator: Main attack cooldown" },
            UnitSumAtkCD: { example: (t) => t, description: "Jelly Operator: Cell attack cooldown" },
            MainAtkDMG: { example: (t) => t, description: "Jelly Operator: Main attack damage" },
            UnitSumAtk: { example: (t) => t, description: "Jelly Operator: Total cell attack" },
            UnitOffset: { example: (t) => t, description: "Jelly Operator: Cell position offset" },
            CanBuySlots: { example: (t) => t, description: "Jelly Operator: Slot purchase eligibility" },
            CanLvUpUnits: { example: (t) => t, description: "Jelly Operator: Cell level-up eligibility" },
            CritConditionUnlocked: { example: (t) => t, description: "Jelly Operator: Critical Condition unlock" },
            DPSunlocked: { example: (t) => t, description: "Jelly Operator: DPS Biometer unlock" },
            FEVERunlocked: { example: (t) => t, description: "Jelly Operator: Fever unlock" },
            OrganelleSPD: { example: (t) => t, description: "Jelly Operator: Organelle speed" },
            ObstAdj: { example: (t) => t, description: "Jelly Operator: Obstruction adjacency" },
            FeverBonus: { example: (t) => t, description: "Jelly Operator: Fever bonus" },
            ROIDunlocked: { example: (t) => t, description: "Jelly Operator: Steroid unlock" },
            RevivesTotal: { example: (t) => t, description: "Jelly Operator: Available revives" },
            SteroidTimeTOT: { example: (t) => t, description: "Jelly Operator: Steroid duration" },
            RoidMulti: { example: (t) => t, description: "Jelly Operator: Steroid multiplier" },
            VirusesAllowed: { example: (t) => t, description: "Jelly Operator: Allowed virus cells" },
            CellLV_tot: { example: (t) => t, description: "Jelly Operator: Total cell levels" },
            leftright: { example: (t) => t, description: "Jelly Operator: Horizontal position helper" },
            updown: { example: (t) => t, description: "Jelly Operator: Vertical position helper" },
        },
        bubba: {
            MeatsliceRate: { default: (t) => t * 2, description: "Bubba: Meat slicing speed" },
            UpgCost: { default: (t) => t / 2, description: "Bubba: Upgrade costs. (lower is better)" },
            DoubleLVchancePCT: {
                default: (t) => t,
                description: "Bubba: Double level chance on upgrade. No change until you set it",
            },
            DailyPetting: { default: (t) => t * 2, description: "Bubba: Daily petting limit" },
            DailyPet_HappinessQTY: { default: (t) => t * 2, description: "Bubba: Happiness gained from petting" },
            DailyPet_HappinessFromUpg: { default: (t) => t * 2, description: "Bubba: Happiness gained from upgrades" },
            HappinessLoss: { default: (t) => t / 2, description: "Bubba: Happiness decay rate. (lower is better)" },
            CharismaTraitSPD: { default: (t) => t * 2, description: "Bubba: Charisma trait speed" },
            CharismaTraitREQ: {
                default: (t) => t / 2,
                description: "Bubba: Charisma trait requirements. (lower is better)",
            },
            CharismaBonus: { default: (t) => t * 2, description: "Bubba: Charisma bonuses" },
            GiftPassiveBonus: { default: (t) => t * 2, description: "Bubba: Gift-provided passive bonuses" },
            Dice_Result: { default: (t) => t * 2, description: "Bubba: Modifier for dice roll results" },
            SmokeMeat_Multi: { default: (t) => t * 2, description: "Bubba: Smoked Meat gain" },
            SpareCoins_Multi: { default: (t) => t * 2, description: "Bubba: Spare Coins gain" },
            HappinessRank: { example: (t) => t },
            HappinessBonus: { example: (t) => t },
            TotalUpgTypesAvailable: { example: (t) => t },
            TotalQTYofLVs: { example: (t) => t },
            MeatProdREQ: { example: (t) => t },
            Xupg: { example: (t) => t },
            Yupg: { example: (t) => t },
            RealLV: { example: (t) => t },
            DoWeNeedToSelectGift: { example: (t) => t },
            GiftSelectionOptions: { example: (t) => t },
            Dice_Rolled: { example: (t) => t },
            Dice_MaxSides: { example: (t) => t },
            Dice_Luck: { example: (t) => t },
            Dice_Multi: { example: (t) => t },
            SmokeMeat_QTYproduced: { example: (t) => t },
            SmokeMeat_2xChancePCT: { example: (t) => t },
            SmokeMeat_10xChancePCT: { example: (t) => t },
            SpareCoins_FindChance: { example: (t) => t },
            SpareCoins_QTYfound: { example: (t) => t },
            SpareCoins_FoundOne: { example: (t) => t },
            BubbaRoG_Bonuses: { example: (t) => t },
            MegafleshOwned: { example: (t) => t },
            TotUpgBonus: { example: (t) => t },
            T_FeatureUnlocked: { example: (t) => t },
            BubbaUnlocked: { example: (t) => t },
        },
        spelunk: {
            POW: { default: (t) => t * 2, description: "Spelunking: Spelunking power" },
            StaminaMax: { default: (t) => t * 2, description: "Spelunking: Maximum stamina" },
            StaminaRegenRate: { default: (t) => t * 2, description: "Spelunking: Stamina regeneration speed" },
            OverstimFillRate: { default: (t) => t * 2, description: "Spelunking: Overstim fill speed" },
            AmberGain: { default: (t) => t * 2, description: "Spelunking: Amber gain" },
            AmberDropChance: { default: (t) => t * 2, description: "Spelunking: Probability of primary amber drops" },
            AmberDropChance2nd: {
                default: (t) => t * 2,
                description: "Spelunking: Probability of secondary amber drops",
            },
            EscapeRopeChance: { default: (t) => Math.max(t, 1), description: "Spelunking: Escape rope find chance" },
            TollExitTax: {
                default: (t) => 1,
                description: "Spelunking: Share of loot kept at the toll exit (1 = all)",
            },
            SpelunkingEfficiency: { default: (t) => t * 2, description: "Spelunking: Spelunking efficiency" },
            SpelunkingSpeed: { default: (t) => t / 2, description: "Spelunking: Spelunking speed. (lower is better)" },
            ExaltDropChance: { default: (t) => t * 2, description: "Spelunking: Probability of exalt drops" },
            PrismaDropChance: { default: (t) => t * 2, description: "Spelunking: Probability of prisma drops" },
            MiscDropChance: {
                default: (t) => t * 2,
                description: "Spelunking: Probability of miscellaneous item drops",
            },
            GoldPieceDropChance: { default: (t) => t * 2, description: "Spelunking: Probability of gold piece drops" },
            w7itemDropChance: { default: (t) => t * 2, description: "Spelunking: Probability of World 7 item drops" },
            blingbagDropChance: { default: (t) => t * 2, description: "Spelunking: Probability of bling bag drops" },
            ShadowStrikeChance: {
                default: (t) => t * 2,
                description: "Spelunking: Probability of Shadow Strike procs",
            },
            GrandDiscoveries_FindChance: {
                default: (t) => t * 2,
                description: "Spelunking: Grand Discovery find chance",
            },
            RockPOWreq: {
                default: (t) => t / 2,
                description: "Spelunking: Rock power requirements. (lower is better)",
            },
            RockHP: { default: (t) => t / 2, description: "Spelunking: Rock HP. (lower is better)" },
            MaxDailyPageReads: {
                default: (t) => t,
                description: "Spelunking: Maximum page reads per day. No change until you set it",
            },
            PageReadingLVgains: {
                default: (t) => t,
                description: "Spelunking: Levels gained from reading a page. No change until you set it",
            },
            POW_base: { example: (t) => t * 2 },
            POW_multi: { example: (t) => t * 2 },
            SpelunkingMultiOre: { example: (t) => t },
            SpelunkingOreValue: { example: (t) => t },
            SpelunkingExpMulti: { example: (t) => t },
            SpelunkingAFKgains_PCTofALL: { example: (t) => t },
            ShadowStrikeQTY: { example: (t) => t },
            GrandDiscoveries_Total: { example: (t) => t },
            CavesUnlocked: { example: (t) => t },
            QuickRefUnlocked: { example: (t) => t },
            ElixirsUnlocked: { example: (t) => t },
            "4thtabUnlocked": { example: (t) => t },
            "6starCards": { example: (t) => t },
            DuperBits: { example: (t) => t },
            CanWeOveruseStamina: { example: (t) => t },
            DoWeHaveLoreN1: { example: (t) => t },
            CanWeUseAUTO: { example: (t) => t },
            AutoFullClearNECESSARY: { example: (t) => t },
            ToolkitUnlocked: { example: (t) => t },
            BestToolUnlocked: { example: (t) => t },
            ToolUnlocked: { example: (t) => t },
            PlayerSelectSlots: { example: (t) => t },
            BiggestHaulUnlocked: { example: (t) => t },
            BonusDMG: { example: (t) => t },
            RockTypeCreated: { example: (t) => t },
            RockAmber: { example: (t) => t },
            StaminaBarWidth: { example: (t) => t },
            ShopUpgVisible: { example: (t) => t },
            ShopUpgMaxLV: { example: (t) => t },
            ShopUpgCost: { example: (t) => t },
            ShopUpgBuyable: { example: (t) => t },
            ShopUpgBonus: { example: (t) => t },
            ElixirsOwned: { example: (t) => t },
            ElixirMaxDupes: { example: (t) => t },
            ElixirSlotsOwned: { example: (t) => t },
            ElixirNotUsed: { example: (t) => t },
            ElixirEffectQTY: { example: (t) => t },
            CanWeUseElixir: { example: (t) => t },
            ElixirEquippedStatus: { example: (t) => t },
            AmberDenominator: { example: (t) => t },
            AmberIndex: { example: (t) => t },
            AmberDailyHaul: { example: (t) => t },
            GridCoord: { example: (t) => t },
            HolesToNextFloor: { example: (t) => t },
            OmnipotentArtifactsUnlocked: { example: (t) => t },
            OverstimUnlocked: { example: (t) => t },
            OverstimBonus_PerLV: { example: (t) => t },
            OverstimBonus: { example: (t) => t },
            OverstimQtyREQ: { example: (t) => t },
            NovaBlastHitChance: { example: (t) => t },
            SampleRedux: { example: (t) => t },
            ChapterBonus: { example: (t) => t },
            BigFishBonuses: { example: (t) => t },
            BigFishCost: { example: (t) => t },
            isBigFishUpgUnlocked: { example: (t) => t },
            BigFishUpgLVREQ: { example: (t) => t },
            StaminaCostMulti: { description: "Spelunking: Stamina costs. (lower is better)" },
        },
        gallery: {
            GalleryBonusMulti: { default: (t) => t * 2, description: "Gallery: All gallery-provided bonuses" },
            HatrackBonusMulti: { default: (t) => t * 2, description: "Gallery: Premium Hat Rack bonus multiplier" },
            InitializeTrophyBonuses: {
                default: (t) => t,
                description: "Gallery: Logic for initializing trophy bonuses. No change until you set it",
            },
            InitializeNametagBonuses: {
                default: (t) => t,
                description: "Gallery: Logic for initializing nametag bonuses. No change until you set it",
            },
            PodiumsOwned: { example: (t) => t },
            PodiumsOwned_Lv2: { example: (t) => t },
            PodiumsOwned_Lv3: { example: (t) => t },
            PodiumsOwned_Lv4: { default: (t) => 19, description: "Gallery: Level 4 podiums owned (max 19)" },
            GalleryBonusSystemON: { example: (t) => t },
            PodiumX_inGallery: { example: (t) => t },
            PodiumY_inGallery: { example: (t) => t },
            PodiumX_inTown: { example: (t) => t },
            PodiumY_inTown: { example: (t) => t },
            NametagX_inTown: { example: (t) => t },
            NametagY_inTown: { example: (t) => t },
        },
        sushi: {
            UpgLvREQ: { default: (t) => t / 2, description: "Sushi: Upgrade level requirements. (lower is better)" },
            UpgCost: { default: (t) => t / 2, description: "Sushi: Upgrade costs. (lower is better)" },
            FuelCost: { default: (t) => t / 2, description: "Sushi: Sushi fuel costs. (lower is better)" },
            FuelGen: { default: (t) => t * 2, description: "Sushi: Fuel generation rate" },
            FuelCap: { default: (t) => t * 2, description: "Sushi: Maximum fuel capacity" },
            CurrencyperHR: { default: (t) => t * 2, description: "Sushi: Money generation per hour" },
            KnowledgeXP_req: {
                default: (t) => t / 2,
                description: "Sushi: Knowledge XP requirements per level. (lower is better)",
            },
            KnowledgeXP_multi: { default: (t) => t * 2, description: "Sushi: Knowledge XP gain multiplier" },
            UpgradeQTY: { example: (t) => t },
            CanWeBuyUpg: { example: (t) => t },
            SlotsOwned: { example: (t) => t },
            MaxCookTier: { example: (t) => t },
            BonusCookTierPCT: { example: (t) => t },
            MaxTier: { example: (t) => t },
            OvertunedMulti: { example: (t) => t },
            CurrencyMulti: { example: (t) => t },
            CurrencyPerTier: { example: (t) => t },
            CurrencyPerSlot: { example: (t) => t },
            OrangeFireSum: { example: (t) => t },
            CurrencyGain: { example: (t) => t },
            KnowledgeXP_base: { example: (t) => t },
            KnowledgeBonusSpecific: { example: (t) => t },
            KnowledgeBonusTOT: { example: (t) => t },
            FreeShaker: { example: (t) => t },
            PerfectOdds: { example: (t) => t },
            SaffronHRS: { example: (t) => t },
            NewSushiInstaMoney: { example: (t) => t },
            SlotEffect: { example: (t) => t },
            FireTypesUnlocked: { example: (t) => t },
            FireplaceSparkMulti: { example: (t) => t },
            FireplaceEffect: { example: (t) => t },
            isButtonUnlocked: { example: (t) => t },
            MoneyHRdispUnlocked: { example: (t) => t },
            ViewTiersUnlocked: { example: (t) => t },
            KnowledgeLVunlocked: { example: (t) => t },
            UniqueSushi: { example: (t) => t },
            RoG_BonusQTY: { example: (t) => t },
        },
        sushitools: {
            ingameButtons: {
                default: false,
                description: "Sushi tools: Show native Start/Stop and Sort buttons on the in-game board tab.",
            },
            tier: { default: 1, description: "Sushi tools: Unlocked purchase tier, starting at 1." },
            targetCount: {
                default: 40,
                description:
                    "Sushi tools: Stop at this quantity of target-tier sushi or higher. Must fit the working slots.",
            },
            targetTier: {
                default: 64,
                description: "Sushi tools: Keep this tier and higher; never merge them. Tiers start at 1.",
            },
            reserveSlots: {
                default: 2,
                description: "Sushi tools: Empty slots to reserve after sorting and refilling, from 0 to 119.",
            },
            extendChain: {
                default: false,
                description: "Sushi tools: Remove the East Wind 25-tile chain limit. Requires East Wind.",
            },
            higherTier: {
                default: false,
                description: "Sushi tools: Allow East Wind up to one tier below the game maximum. Requires East Wind.",
            },
        },
        reef: {
            ReefCost: { default: (t) => 0, description: "Reef: Costs. (lower is better)" },
        },
        clam: {
            ClamPromochance: { default: (t) => t * 2, description: "Clams: Probability of clam promotion" },
            ClamBonuses: { default: (t) => t * 2, description: "Clams: Clam-provided bonuses" },
            ClamPearlValue: { default: (t) => t * 2, description: "Clams: Pearl value" },
            ClamPearl10x: { example: (t) => t * 2 },
            Clam_BlackPearlValue: { default: (t) => t * 2, description: "Clams: Black pearl value" },
            Clam_Cost: { default: (t) => t / 2, description: "Clams: Clam costs. (lower is better)" },
            Clam_PearlUpgReq: {
                default: (t) => t,
                description: "Clams: Pearl upgrade requirements. (lower is better). No change until you set it",
            },
            Clam_Mobs: { default: (t) => t * 2, description: "Clams: Mob spawns" },
            Clam_Respawn: { example: (t) => t },
            ClamWorkBonus: { example: (t) => t },
            Clamz_HP: { example: (t) => t },
        },
        coralkid: {
            CoralKidUpgCost: {
                default: (t) => 0,
                description: "Coral Kid: Standard and Singularity upgrade costs. (lower is better)",
            },
        },
        bigfish: {
            BigFishCost: { default: (t) => 0, description: "Big Fish: Costs. (lower is better)" },
        },
        zenith: {
            ZenithMarketCost: { default: (t) => t / 2, description: "Zenith: Market upgrade costs. (lower is better)" },
            ZenithMarketBonus: { default: (t) => t * 2, description: "Zenith: Market-provided bonuses" },
        },
        spelunkmana: {
            StaminaCostMulti: { default: (t) => 0, description: "Spelunking: No stamina cost in spelunking" },
        },
        minehead: {
            Button_BonusMULTI: { default: (t) => t * 2, description: "The Button: Bonus multiplier" },
            UpgCost: { default: (t) => t / 2, description: "Minehead: Upgrade costs. (lower is better)" },
            DailyTries: { default: (t) => t * 2, description: "Minehead: Daily tries" },
            MaxHP_You: { default: (t) => t * 2, description: "Minehead: Max HP" },
            BaseDMG: { default: (t) => t * 2, description: "Minehead: Base damage" },
            CurrentOutgoingDMG: { default: (t) => t * 2, description: "Minehead: Outgoing damage" },
            CurrencyGain: { default: (t) => t * 2, description: "Minehead: Currency gain" },
            BluecrownOdds: { default: (t) => t * 2, description: "Minehead: Blue crown odds" },
            JackpotOdds: { default: (t) => t * 2, description: "Minehead: Jackpot odds" },
            JackpotTiles: { default: (t) => t * 2, description: "Minehead: Jackpot tiles" },
            InstaRevealsTotal: { default: (t) => t * 2, description: "Minehead: Total insta reveals" },
            BonusQTY: { example: (t) => t },
            WepPowDmgPCT: { example: (t) => t },
            CanWeBuyUpg: { example: (t) => t },
            BonusDMGperTilePCT: { example: (t) => t },
            MineheadID: { example: (t) => t },
            MaxHP_Opp: { example: (t) => t },
            Mines_Opp: { example: (t) => t },
            UpgradeQTY: { example: (t) => t },
            BluecrownMulti: { example: (t) => t },
            Tiles_RowCol: { example: (t) => t },
            Tiles_XY: { example: (t) => t },
            TotalTiles: { example: (t) => t },
            GoldTilesTotal: { example: (t) => t },
            BlocksTotal: { example: (t) => t },
            FlagsTotal: { example: (t) => t },
        },
        glimbo: {
            Glimbo_Cost: { default: (t) => t / 2, description: "Glimbo: Glimbo cost. (lower is better)" },
            GlimboDRmulti: { default: (t) => t * 2, description: "Glimbo: Drop rate multiplier" },
            Glimbo_CanAfford: { example: (t) => t },
            GlimboTotalTrades: { example: (t) => t },
        },
        research: {
            AFKgainsRatePCT: { default: (t) => t * 2, description: "Research: AFK gains rate" },
            MaxRoll: { default: (t) => t * 2, description: "Research: Max roll" },
            RollsPerDay: { default: (t) => t * 2, description: "Research: Rolls per day" },
            MagnifiersOwned: {
                default: (t) => t,
                description: "Research: Magnifiers owned. No change until you set it",
            },
            KaleidoscopeOwned: {
                default: (t) => t,
                description: "Research: Kaleidoscopes owned. No change until you set it",
            },
            OpticalMonocleOwned: {
                default: (t) => t,
                description: "Research: Optical monocles owned. No change until you set it",
            },
            ResearchEXPrateObj: { default: (t) => t * 2, description: "Research: EXP rate object" },
            ObservationInsightExpRate: { default: (t) => t * 2, description: "Research: Insight EXP rate" },
            Kalei_MultiBase: { default: (t) => t * 2, description: "Research: Kaleidoscope base multi" },
            TinyCogsPerDay: { default: (t) => t * 2, description: "Research: Tiny cogs per day" },
            MSA_BonusRewards: { default: (t) => t * 2, description: "Research: MSA bonus rewards" },
            SmallCogBonus: { default: (t) => t * 2, description: "Research: Small cog bonuses" },
            SmallCogBonusTOTAL: { default: (t) => t * 2, description: "Research: Total small cog bonuses" },
            TotalOccurrencesFound: { example: (t) => t },
            MagnifiersPerSlot: { example: (t) => t },
            ObservationInsightExpREQ: { example: (t) => t },
            ResearchEXPrateTOT: { example: (t) => t },
            ResearchEXPmulti: { example: (t) => t },
            Kalei_MultiTot: { example: (t) => t },
            Grid_MaxLV: { example: (t) => t },
            CanRotateShapes: { example: (t) => t },
            Grid_PTSearned: { example: (t) => t },
            Grid_PTSspent: { example: (t) => t },
            Grid_PTSavailable: { example: (t) => t },
            Grid_Bonus: { example: (t) => t },
            Grid_CanWeUseButton: { example: (t) => t },
            Grid_CanWeUpgrade: { example: (t) => t },
            TranscendentArtifactsUnlocked: { example: (t) => t },
            GreenSigilsUnlocked: { example: (t) => t },
            GreenSigilTrueDMG: { example: (t) => t },
            RefineryTab3Unlocked: { example: (t) => t },
            RefineryTabsOwned: { example: (t) => t },
            TinyCogsUnlocked: { example: (t) => t },
            FarmingStickersUnlocked: { example: (t) => t },
            FarmingStickerDMG_unlocked: { example: (t) => t },
            KingRatUnlocked: { example: (t) => t },
            ZuperBitsUnlocked: { example: (t) => t },
            SmallCogSlotsUnlocked: { example: (t) => t },
            CanWeLevelUpObservations: { example: (t) => t },
            OccurrencesToBeFound: { example: (t) => t },
            OccurrenceYspacing: { example: (t) => t },
            ShapesOwned: { example: (t) => t },
            PostyNotesOwned: { example: (t) => t },
            Grid_ShapeVertices: { example: (t) => t },
            Grid_CanWeSelect: { example: (t) => t },
        },
        spelunkdepth: { description: "Spelunking: Current depth (one-shot, resets to 0 after use)" },
    },
});
