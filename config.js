// The default settings. Don't edit this file: it is generated (npm run config:generate) from the cheats in
// src/cheats/cheats/ and from src/modules/config/coreSettings.js, and an update replaces it.
// Put your own settings in config.custom.js; the WebUI's Config page saves them there.

exports.startupCheats = [];

exports.cheatConfig = {
    unban: true, // Prevents accounts from being banned. May not work due to multiple ban methods
    ingameUI: true, // Enables the in-game UI overlay
    steamachieve: true, // Allows unlocking Steam achievements
    chng_enabled: false, // ⚠ DANGER: If true, 'chng' command becomes available. ONLY enable if you know what you are doing!
    maxval: {
        bones: 1e21, // Maximum limit for bones to prevent save corruption
        totalbones: 1e22, // Maximum limit for total bones across all characters
        dust: 1e21, // Maximum limit for dust to prevent save corruption
        totaldust: 1e22, // Maximum limit for total dust across all characters
        tach: 1e21, // Maximum limit for tachyon to prevent save corruption
        totaltach: 1e22, // Maximum limit for total tachyon across all characters
        creditcap: 10000000, // Maximum credit capacity for dungeons
        flurbocap: 1000000, // Maximum flurbo capacity for dungeons
    },
    automation: {
        shops: [], // Automation: town shop items to buy, { id: "shop:item", on, stopAt }; stopAt is how many the chest should hold.
        construction: [], // Automation: W3 buildings to build, { id, on, stopAt, priority }; id is the building (0-8 buildings, 9-17 towers, 18-26 shrines), priority 1 is High and 2 Low. Empty slots take High, Low, then Balanced buildings, the closest to done first, up to stopAt; the 8th slot stays free once it feeds the Menagerie jelly.
    },
    godlike: {
        respawn: (t) => Math.min(t, 1), // Mob respawn time (lower is faster)
    },
    minigame: {
        fishing: {
            skipWhale: true, // Fishing: the fish aimbot skips the whale (turn off for megalodon farming)
        },
    },
    unlock: {
        islands: "abcde_", // String of IDs for islands to unlock (e.g., 'abcde_')
    },
    wide: {
        attire: {
            outfits: "all", // Outfits whose bonuses wide attire gives: all (outfits added by game updates too), outfit ids separated by commas (EquipmentGown1,EquipmentGown3), or empty for none
        },
        wardrobe: {
            loadouts: [], // Loadouts saved on the Wardrobe page (Account > Player > Wardrobe). The page adds and deletes them
            goldenfood: {}, // The largest golden food stack each character had, kept by the Wardrobe page so a loadout's golden food keeps that size
        },
        autoloot: {
            itemstochest: true, // Automatically sends looted items to the chest
            moneytochest: true, // Automatically sends looted money to the chest
            zenithfarm: false, // Zenith farming drops are excluded from autoloot and drop normally
            materialfarm: false, // Monster material drops are excluded from autoloot and drop normally
            hidenotifications: true, // Hides loot and money notifications
        },
        perfectobols: {
            preferredstat: "PRIMARY", // The stats that should be rolled when using perfectobols (e.g., PRIMARY, STR)
        },
        plunderous: {
            allcharacters: false, // Enables plunderous mob bonuses for all characters
        },
        arcade: {
            ArcadeCost: (t) => 0, // Arcade Shop costs. (lower is better)
        },
        dartshop: {
            DartsUpgCost: (t) => 0, // Dart Shop upgrade costs. (lower is better)
        },
        hoopshop: {
            HoopsUpgCost: (t) => 0, // Hoop Shop upgrade costs. (lower is better)
        },
    },
    w1: {
        anvil: {
            productionspeed: (t) => t * 4, // Anvil: Item production speed
        },
        forge: {
            speed: (t) => t * 4, // Forge: Bar processing speed
            capacity: (t) => t * 2, // Forge: Ore capacity
        },
        stampcost: (t) => t / 4, // Stamps: Upgrade costs. (lower is better)
        companion: {
            companions: "", // Comma-separated companion IDs. Bare IDs use Pets+; append :0 for normal or :1 for Pets+ (e.g., '0:0,1:1'). Empty means all pets at Pets+, 'none' means no pets
            current: "11", // Active companion ID (e.g., '11' for Glunko)
        },
        owl: {
            OwlCost: (t) => t / 2, // Owl: Upgrade costs. (lower is better)
            OwlFeatherRate: (t) => t * 2, // Owl: Feather gain rate
            OwlBonuses: (t) => t * 2, // Owl: All owl-related bonuses
            OwlFeatherShinyGe: (t) => t, // Owl: Shiny feather generation (unknown effect)
            // OwlMegafeather: (t) => t,
            // OwlNextUpgReq: (t) => t,
        },
    },
    w2: {
        roo: {
            RooCost: (t) => t / 2, // Roo: Upgrade costs. (lower is better)
            RooShinyMulti: (t) => t * 2, // Roo: Shiny catch rates
            RooCatchRate: (t) => t * 2, // Roo: Standard catch rates
            RooCatchREQ: (t) => t / 2, // Roo: Catch requirements. (lower is better)
            RooCatchFishQTY: (t) => t * 2, // Roo: Quantity of fish caught
            RooCatchRate_S: (t) => t * 2, // Roo: Shiny catch rates
            RooCatchREQ_S: (t) => t / 2, // Roo: Shiny catch requirements. (lower is better)
            RooCatchRate_T: (t) => t * 2, // Roo: Tar pit catch rates
            RooCatchREQ_T: (t) => t / 2, // Roo: Tar pit catch requirements. (lower is better)
            // RooNextUpgReq: (t) => t,
            // RooShinyLuck: (t) => t,
            // RooTarOwned: (t) => t,
            // RooCost_T: (t) => t,
            // RooRESETbon: (t) => t,
            // RooMegafeather: (t) => t,
            // RooBonuse: (t) => t,
        },
        alchemy: {
            BubbleBonus: (t) => t, // Alchemy: All bubble effects
            CauldronCosts: (t) => t, // Alchemy: Bubble upgrade costs
            ResearchSpeed: (t) => t * 4, // Alchemy: Brewing speed
            VialCosts: (t) => t / 2, // Alchemy: Vial costs. (lower is better)
            VialBonus: (t) => t, // Alchemy: Vial effects
            PctChanceNewBubble: (t) => t * 4, // Alchemy: New bubble discovery chance
            CauldronLvsBrewREQ: (t) => t / 2, // Alchemy: Cauldron level requirements. (lower is better)
            LiquidCap: (t) => t * 2, // Alchemy: Liquid storage capacity
            LiquidHRrate: (t) => t * 4, // Alchemy: Liquid generation speed
            sigilspeed: (t) => t * 10, // Alchemy: Sigil research speed
        },
    },
    w3: {
        buildspd: (t) => t * 10, // Construction: Building speed
        WorshipSpeed: (t) => t * 10, // Worship: Charge generation speed
        towerdamage: (t) => t * 10, // Tower Defense: Tower damage
        refineryspeed: (t) => Math.max(1, Math.floor(t / 10)), // Refinery: Cycle speed. Don't go below 1! (lower is better)
        trapping: (t) => t * 10, // Trapping: Trap timer speed
    },
    w4: {
        fasteggs: (t) => t / 4, // Breeding: Egg incubation speed. (lower is better)
        petchance: (t) => t * 2, // Breeding: New pet discovery chance
        petupgrades: (t) => t / 4, // Breeding: Pet upgrade costs. (lower is better)
        mealspeed: (t) => t / 4, // Cooking: Meal preparation speed. (lower is better)
        recipespeed: (t) => t / 4, // Cooking: Recipe research speed. (lower is better)
        kitchensdiscount: (t) => t / 4, // Cooking: Kitchen and spice costs. (lower is better)
        platesdiscount: (t) => t / 2, // Cooking: Plate upgrade costs. (lower is better)
        fastforaging: (t) => t * 4, // Cooking: Foraging speed
        luckychef: (t) => t * 2, // Cooking: New recipe discovery luck
        superpets: {
            BlockChance: (t) => t * 2, // Pet Arena: Block chance when attacked
            TotalDMG: (t) => t * 4, // Pet Arena: Total pet damage
        },
        mainframe: {
            0: (t) => 200, // Mainframe: Animal farm damage bonus percentage
            1: (t) => 2, // Mainframe: Wired In printer multiplier
            2: (t) => 10, // Mainframe: Refinery cycle speed multiplier
            3: (t) => 10, // Mainframe: Alchemy bubble level gain (affects multi-bubble discovery)
            4: (t) => 2, // Mainframe: Deathnote and portal kill multiplier
            5: (t) => 1, // Mainframe: Enable Shrine World Tour effect
            6: (t) => 5, // Mainframe: Alchemy liquid capacity multiplier
            7: (t) => 2, // Mainframe: Stamp bonus multiplier (must be 2 to work)
            8: (t) => 5, // Mainframe: Spelunker jewel effect multiplier
            9: (t) => t * 2, // Mainframe: Fungi Finger Pocketer cash bonus multiplier
            10: (t) => 2, // Mainframe: Alchemy vial bonus multiplier
            11: (t) => t * 1.2, // Mainframe: Banking Fury damage multiplier
            12: (t) => 1, // Mainframe: Enable sigils in alchemy
            13: (t) => 300, // Mainframe: Lab connection range multiplier
            100: (t) => 10, // Mainframe: Meal cooking speed multiplier
            101: (t) => 3, // Mainframe: Additional animal farm damage % per pet
            102: (t) => 60, // Mainframe: Lab XP gain bonus percentage
            103: (t) => 36, // Mainframe: Trim all building slots bonus
            104: (t) => 15, // Mainframe: All Stat bonus percentage
            105: (t) => 100, // Mainframe: Breeding XP gain bonus percentage
            106: (t) => 10, // Mainframe: Kitchen level up per day bonus
            107: (t) => 2, // Mainframe: Adds to bonus 3 (multi-bubble discovery)
            108: (t) => 50, // Mainframe: Food non-consume chance percentage
            109: (t) => 145, // Mainframe: Connection range for bonuses and jewels
            110: (t) => 100, // Mainframe: Extra damage bonus percentage
            111: (t) => 500, // Mainframe: Reduced egg incubation time percentage
            112: (t) => 1500, // Mainframe: Base efficiency bonus for all skills
            113: (t) => 1.5, // Mainframe: Fungi Finger Pocketer extra cash percentage
            114: (t) => t * 3, // Mainframe: Meal cooking bonus speed percentage
            115: (t) => 45, // Mainframe: Pet passive ability speed percentage
            116: (t) => 50, // Mainframe: Additional meal bonus percentage
            117: (t) => 1.5, // Mainframe: Damage per greened stack bonus
        },
        chipbonuses: {
            resp: (t) => 50, // Lab Chip: Mob respawn speed bonus percentage
            card1: (t) => 1, // Lab Chip: Double top-left card effect (1 = yes)
            card2: (t) => 1, // Lab Chip: Double bottom-right card effect (1 = yes)
            crys: (t) => 95, // Lab Chip: Crystal spawn chance on kill percentage
            star: (t) => 1, // Lab Chip: Double star sign effects (1 = yes)
            mkill: (t) => 40, // Lab Chip: Multikill per tier bonus percentage
            linewidth: (t) => 12, // Lab Chip: Lab line width bonus percentage
            dmg: (t) => 100, // Lab Chip: Damage bonus percentage
            move: (t) => 30, // Lab Chip: Movement speed bonus percentage
            acc: (t) => 30, // Lab Chip: Accuracy bonus percentage
            pend: (t) => 1, // Lab Chip: Double pendant bonuses (1 = yes)
            key1: (t) => 1, // Lab Chip: Double first keychain bonuses (1 = yes)
            troph: (t) => 1, // Lab Chip: Double trophy bonuses (1 = yes)
            def: (t) => 10, // Lab Chip: Defense bonus percentage
            weappow: (t) => 100, // Lab Chip: Weapon power bonus percentage
            dr: (t) => 60, // Lab Chip: Drop rarity bonus percentage
            toteff: (t) => 40, // Lab Chip: Skilling efficiency bonus percentage
            eff: (t) => 1200, // Lab Chip: Base skilling efficiency bonus
            labexp: (t) => 150, // Lab Chip: Lab XP bonus percentage
            atkspd: (t) => 60, // Lab Chip: Attack speed bonus percentage
            safk: (t) => 15, // Lab Chip: Skill AFK gains bonus percentage
            fafk: (t) => 25, // Lab Chip: Fight AFK gains bonus percentage
        },
        meals: {
            TotDmg: (t) => t, // Meals: total damage bonus
            Mcook: (t) => t, // Meals: meal cooking speed bonus
            Cash: (t) => t, // Meals: cash from monsters bonus
            Rcook: (t) => t, // Meals: recipe cooking speed bonus
            Npet: (t) => t, // Meals: new mob breed odds bonus
            BrExp: (t) => t, // Meals: breeding EXP bonus
            Seff: (t) => t, // Meals: skill efficiency bonus
            VIP: (t) => t, // Meals: VIP library points bonus
            Lexp: (t) => t, // Meals: lab EXP bonus
            Def: (t) => t, // Meals: base defence bonus
            PxLine: (t) => t, // Meals: lab line width (px) bonus
            KitchenEff: (t) => t, // Meals: cooking speed per ten levels bonus
            TimeEgg: (t) => t, // Meals: lower egg creation time bonus
            KitchC: (t) => t, // Meals: lower kitchen costs bonus
            PetDmg: (t) => t, // Meals: mob fighting damage bonus
            TDpts: (t) => t, // Meals: tower defence points bonus
            CookExp: (t) => t, // Meals: cooking EXP bonus
            Breed: (t) => t, // Meals: mob breedability rate bonus
            TotAcc: (t) => t, // Meals: total accuracy bonus
            AtkSpd: (t) => t, // Meals: basic attack speed bonus
            Sprow: (t) => t, // Meals: skilling prowess bonus
            Lib: (t) => t, // Meals: library checkout speed bonus
            Critter: (t) => t, // Meals: critters from traps bonus
            Crit: (t) => t, // Meals: crit chance bonus
            LinePct: (t) => t, // Meals: lab line width (%) bonus
            TPpete: (t) => t, // Meals: max levels for TPPST bonus
            Liquid12: (t) => t, // Meals: liquid capacity (liquids 1 and 2) bonus
            DivExp: (t) => t, // Meals: divinity EXP bonus
            GamingBits: (t) => t, // Meals: bits gain in gaming bonus
            Liquid34: (t) => t, // Meals: liquid capacity (liquids 3 and 4) bonus
            Sailing: (t) => t, // Meals: sailing speed bonus
            GamingExp: (t) => t, // Meals: gaming EXP bonus
        },
    },
    w5: {
        sailing: {
            IslandDistance: (t) => t / 2, // Sailing: Island distance (lower is closer)
            MaxChests: (t) => t, // Sailing: Maximum chest limit (Warning: too high may break cloud saves)
            RareTreasureChance: (t) => t * 5, // Sailing: Rare treasure find chance
            Minimumtraveltime: (t) => t / 5, // Sailing: Minimum travel time in minutes. (lower is better)
            BoatUpgCostType: (t) => t, // Sailing: Loot type ID for boat upgrades
            BoatUpgCostQty: (t) => t / 2, // Sailing: Loot quantity for upgrades. (lower is better)
            BoatValue: (t) => t * 2, // Sailing: Loot quantity gained from boats
            BoatSpeed: (t) => t * 2, // Sailing: Boat travel speed
            CloudDiscoverBonus: (t) => t * 2, // Sailing: Cloud discovery bonuses
            ArtifactRarity: (t) => t / 5, // Sailing: Artifact discovery chance. (lower is better)
            AncientChances: (t) => t / 5, // Sailing: Ancient artifact chance. (lower is better)
            EldritchChances: (t) => t / 5, // Sailing: Eldritch artifact chance. (lower is better)
            SovereignChances: (t) => t / 5, // Sailing: Sovereign artifact chance. (lower is better)
            OmnipotentChances: (t) => t / 5, // Sailing: Omnipotent artifact chance. (lower is better)
            TranscendentChances: (t) => t / 5, // Sailing: Transcendent artifact chance. (lower is better)
            NewCaptBoatSlot: (t) => 0, // Sailing: Cost for unlocking new boat and captain slots. (lower is better)
            BuyCaptainCost: (t) => 0, // Sailing: Cost for hiring new captains. (lower is better)
            ArtifactBonus: (t) => t, // Sailing: All artifact-provided bonuses
        },
        gaming: {
            FertilizerUpgCosts: (t) => 0, // Gaming: Fertilizer upgrade costs. (lower is better)
            SproutCapacity: (t) => Math.max(22, t + 2), // Gaming: Max sprout slots
            MutateUpgCosts: (t) => 0, // Gaming: Mutation upgrade costs. (lower is better)
            LogBookBitBonus: (t) => Math.max(20, t * 2), // Gaming: Bit bonuses from the logbook
            GamingExpPCT: (t) => t * 1.5, // Gaming: Gaming XP gain percentage
            NewMutantChanceDEC: (t) => 1, // Gaming: Decimal new mutant chance (1 = guaranteed)
            SproutGrowthCHANCEperMUT: (t) => t, // Gaming: Growth chance per mutation
            SproutGrowthTime: (t) => t / 5, // Gaming: Sprout growth speed. (lower is better)
            SaveSprinkler: (t) => t * 1.1, // Gaming: Chance to save water when using sprinkler
            ImportItemCOST: (t) => 0, // Gaming: Import item costs. (lower is better)
            AcornShopCost: (t) => 0, // Gaming: Acorn shop upgrade costs. (lower is better)
            BoxCost: (t) => 0, // Gaming: New box costs. (lower is better)
            SnailStuff: (t, args) => {
                const fns = { 0: (t) => 1, 1: (t) => 0, 2: (t) => t };
                return fns[args[1]] ? fns[args[1]](t) : 0;
            }, // Gaming: Snail logic (0: upgrade chance, 1: reset chance, 2: bit multi)
            SnailMail: false, // Gaming: Enable/disable Snail Mail automation
            PaletteLuck: (t) => t * 2, // Gaming: Palette-related luck
            PaletteBonus: (t) => t * 2, // Gaming: Palette-related bonuses
            RatBitMulti: (t) => t, // Gaming: Rat King crown bit multiplier
            RatCrownOdds: (t) => t, // Gaming: Rat King crown odds
            RatCurrencyGain: (t) => t, // Gaming: Rat currency gain
            RatShopCost: (t) => t, // Gaming: Rat shop costs. (lower is better)
            RatShopBonuses: (t) => t, // Gaming: Rat shop bonuses
        },
        divinity: {
            unlinks: true, // Divinity: Allows unlinking gods at any time
            StyleLvReq: (t) => 0, // Divinity: Meditation style level requirements. (lower is better)
            DivPerHr: (t) => t * 3, // Divinity: Base divinity points gained per hour
            DivPerHr_EXP: (t) => t * 3, // Divinity: Base divinity XP gained per hour
            BlesssBonus: (t) => t * 2, // Divinity: God blessing bonuses
            Bonus_MAJOR: (t) => t, // Divinity: Major god bonuses
            Bonus_Minor: (t) => t * 2, // Divinity: Minor god bonuses
            OfferingCost: (t) => 0, // Divinity: Offering costs. (lower is better)
            OfferingOdds: (t) => 1, // Divinity: Success probability for offerings
        },
        collider: {
            AtomsUnlocked: (t) => t, // Collider: Number of unlocked atoms (max 10)
            AtomCost: (t) => 0, // Collider: Atom collider upgrade costs. (lower is better)
            AtomBonuses: (t) => t, // Collider: Bonuses provided by atoms
            AtomBubbleUpgCost: (t) => 0, // Collider: Atom bubble upgrade costs. (lower is better)
        },
        holes: {
            VillagerExpPerHour: (t) => t * 2, // Sneaking: Villager XP gain speed
            BuildCost: (t) => t / 2, // Sneaking: Building upgrade costs. (lower is better)
            BucketFillRate: (t) => t * 2, // Sneaking: Bucket fill speed
            AmpMulti: (t) => t * 2, // Sneaking: Amplifier effects
            MeasurementCost: (t) => t / 2, // Sneaking: Measurement upgrade costs. (lower is better)
            MeasurementBaseBonus: (t) => t * 2, // Sneaking: Measurement base bonuses
            MotherlodeEffBase: (t) => t / 2, // Sneaking: Base efficiency for the motherlode. (lower is better)
            MonumentRewardMulti: (t) => t * 2, // Sneaking: Monument rewards
            MonumentROGbonuses: (t) => t * 2, // Sneaking: Right-side monument rewards
            // MonumentHRbonuses: (t) => t * 2,
            Bravery_MinDMG: (t) => t * 10, // Bravery: Minimum bravery damage
            Bravery_MaxDMG: (t) => t * 2, // Bravery: Maximum bravery damage
            Bravery_SwordsOwned: (t) => 8, // Bravery: Number of swords owned
            MaxRerolls: (t) => 20, // Bravery: Max rerolls allowed
            MaxRevisions: (t) => 5, // Bravery: Max revisions allowed
            Bravery_MonsterHP: (t) => t / 2, // Bravery: Monster HP. (lower is better)
            Bravery_BlueChestChanceDEC: (t) => 0.5, // Bravery: Probability of blue chest spawn. (lower is better)
            BellCosts: (t) => t / 2, // Sneaking: Bell improvement costs. (lower is better)
            BellBonuss: (t) => t * 2, // Sneaking: Bell bonuses
            BellExpPerHR: (t) => t * 2, // Sneaking: Bell XP gain speed
            BellEXPreq: (t) => t / 2, // Sneaking: Bell XP requirements. (lower is better)
            HarpNewNote_Cost: (t) => t / 2, // Sneaking: New harp note costs. (lower is better)
            HarpNoteProduced: (t) => t * 2, // Sneaking: Harp note production
            HarpPOWperHR: (t) => t * 10, // Sneaking: Harp power gain speed
            LampWishCost: (t) => t / 2, // Sneaking: Lamp wish costs. (lower is better)
            LampWishPerDay: (t) => t * 2, // Sneaking: Daily lamp wish limit
            MushKillsLeft: (t) => 0, // Sneaking: Remaining mushroom kills required for boss. (lower is better)
            J_StartCoins: (t) => t * 5, // Justice: Starting coins
            J_Happiness: (t) => t * 5, // Justice: Starting happiness
            J_Dismissals: (t) => t * 5, // Justice: Starting dismissals
            J_StartHealth: (t) => t * 5, // Justice: Starting health
            Justice_BlueChestChanceDEC: (t) => 0.5, // Justice: Probability of blue chest spawn. (lower is better)
            BolaiaStudyRate: (t) => t * 2, // Sneaking: Bolaia study speed
            JarProductionPerHR: (t) => t * 2, // Sneaking: Jar production speed
            TempleTorchCost: (t) => t / 2, // Sneaking: Temple torch costs. (lower is better)
            JarCollectibleBonus: (t) => t * 2, // Sneaking: Jar collectible bonuses
            JarEnchantChance: (t) => t * 2, // Sneaking: Jar enchantment success chance
            JarNewCollectibleChance: (t) => t * 2, // Sneaking: New jar collectible discovery chance
            Cost_FountainUPG: (t) => t / 2, // Fountain: Upgrade costs. (lower is better)
            Fount_RoyalChance: (t) => t * 2, // Fountain: Royal stack chance
            Fount_RoyalMulti: (t) => t * 2, // Fountain: Royal stack value multiplier
            Fount_MarblePerFill: (t) => t * 2, // Fountain: Marble gained per Yellow Water fill
            Fount_MarbleizeCost: (t) => t / 2, // Fountain: Upgrade marbleization costs. (lower is better)
            // FountainBar_REQ: (t) => t,
            // FountainBar_Speed: (t) => t,
            // CanWeAfford_Fountain: (t) => t,
            // Fountain_OpalCost: (t) => t,
            // Fountain_UpgUnlocked: (t) => t,
            // CanWeAfford_FountainUPG: (t) => t,
            // FountainBar_ActiveSpdMulti: (t) => t,
            // Fount_CurrencyKEEP: (t) => t,
            // HolezBucketGoldOwned: (t) => t,
            // HolezBucketGoldMult: (t) => t,
            // FountainBar_DoWeHave: (t) => t,
            // Fountain_WatersOwned: (t) => t,
            // Fountain_BonTOT: (t) => t,
            // Fount_SpaceXY: (t) => t,
            // SpacesOwned: (t) => t,
            // MaxStackSize: (t) => t,
            // MaxCoinz: (t) => t,
            // Fount_GenerateCoin: (t) => t,
            // Fount_CurrencyALLmulti: (t) => t,
            // Fount_CurrencyBaseValue: (t) => t,
            // Fount_CurrencyTotValue: (t) => t,
            // Fount_DesireMulti: (t) => t,
            // CanWeBUY_Marbleize: (t) => t,
            // CanWeAfford_Marbleize: (t) => t,
            // Fountain_MarbleBonNEXT: (t) => t,
            // Fountain_MarbleBon: (t) => t,
        },
    },
    w6: {
        farming: {
            GrowthReq: (t) => t / 5, // Farming: Plant growth time. (lower is better)
            OGunlocked: (t) => t, // Farming: Overgrowth shop unlock state (0 = locked, 1 = unlocked)
            NextOGchance: (t) => t * 5, // Farming: Next overgrowth discovery chance
            OGmulti: (t) => (t === 1 ? 1 : Math.max(1, t * 2)), // Farming: Overgrowth bonuses
            PlotOwned: (t) => Math.min(36, t + 2), // Farming: Number of plots owned (max 36)
            MarketCostType: (t) => t, // Farming: Plant type ID for market upgrades
            MarketCostQTY: (t) => Math.floor(t / 5), // Farming: Plant quantity for upgrades. (lower is better)
            NextCropChance: (t) => t * 2, // Farming: Next plant evolution discovery chance
            CropsBonusValue: (t) => t * 2, // Farming: Crop value/bonus
            CropsOnVine: (t) => t * 2, // Farming: Crops per plant
            GrowthRate: (t) => t, // Farming: Base growth rate multiplier
            ExoticPurchasesAllowed: (t) => Math.max(t, 8), // Farming: Allowed exotic purchases (max 8)
            ExoticLVQTY: (t) => t * 2, // Farming: Exotic level quantities
            StickerDMGmulti: (t) => t, // Farming: Sticker damage multiplier
            StickersPerRow: (t) => t, // Farming: Stickers per row
            StickerOdds: (t) => t, // Farming: Sticker find chance
            AttemptMegacropGrowth: (t) => t, // Farming: Megacrop growth roll (1 = it grows)
            StickerBonus: (t) => t, // Farming: Sticker bonuses
            // StickerOddsMulti: (t) => t,
            // TotalStickers: (t) => t,
            // NumberOfBigStickers: (t) => t,
        },
        ninja: {
            EmporiumCost: (t) => t / 5, // Ninja: Emporium upgrade costs. (lower is better)
            KOtime: (t) => t / 5, // Ninja: Knockout duration. (lower is better)
            ActionSpd: (t) => t * 2, // Ninja: Action speed
            Stealth: (t) => t * 2, // Ninja: Stealth rating
            DetectionDEC: (t) => t / 5, // Ninja: Detection rate. (lower is better)
            DoorMaxHP: (t) => t, // Ninja: Door max HP
            JadeUpgCost: (t) => t, // Ninja: Jade upgrade costs. (lower is better)
            ItemStat: (t) => t * 2, // Ninja: Item stats
            ItemFindOdds: (t) => t * 2, // Ninja: Item find chance
            PristineBon: (t) => t, // Ninja: Pristine Charm bonuses
        },
        summoning: {
            ManaStart: (t) => t, // Summoning: Starting mana in battles
            ManaRegen: (t) => t * 2, // Summoning: Mana regeneration speed
            UnitSpd: (t) => t, // Summoning: Ally unit movement speed
            UnitHP: (t) => t * 2, // Summoning: Ally unit HP
            UnitDMG: (t) => t * 2, // Summoning: Ally unit damage
            UnitDODGE: (t) => Math.min(1, t * 2), // Summoning: Ally unit dodge probability (max 1)
            EndlessUnlocked: (t) => 1, // Summoning: Unlocks endless mode (1 = yes)
            SummUpgBonus: (t) => t * 2, // Summoning: Summoning upgrade bonuses
            SummRockEssGen: (t) => t * 1.5, // Summoning: Essence generation rate
            UpgCost: (t) => t / 2, // Summoning: Upgrade costs (0 = free). (lower is better)
            UnitCost: (t) => Math.ceil(t / 2), // Summoning: Unit summoning costs. (lower is better)
            RerollCost: (t) => 0, // Summoning: Reroll costs (0 = free). (lower is better)
            SummEXPgain: (t) => t, // Summoning: Summoning XP gain
            EnemyHP: (t) => t / 2, // Summoning: Enemy unit HP. (lower is better)
            EnemyDMG: (t) => t / 2, // Summoning: Enemy unit damage. (lower is better)
            EnemySpd: (t) => t, // Summoning: Enemy unit movement speed
        },
        grimoire: {
            GrimoireBoneQTYbase: (t) => t * 2, // Grimoire: Bone quantity base value
            GrimoireUpgCost: (t) => t / 2, // Grimoire: Upgrade costs. (lower is better)
            Grimoire_HP: (t) => t * 2, // Grimoire: HP
            Grimoire_DMG: (t) => t * 2, // Grimoire: Damage
            Grimoire_ACC: (t) => t * 2, // Grimoire: Accuracy
            Grimoire_DEF: (t) => t * 2, // Grimoire: Defense
            Grimoire_CRITPCT: (t) => t * 2, // Grimoire: Crit Chance
            Grimoire_CRITDMG: (t) => t * 2, // Grimoire: Crit Damage
        },
        windwalker: {
            CompassUpgCost: (t) => t / 2, // Windwalker: Compass upgrade costs. (lower is better)
            Compass_HP: (t) => t * 2, // Windwalker: HP
            Compass_DMG: (t) => t * 2, // Windwalker: Damage
            Compass_ACC: (t) => t * 2, // Windwalker: Accuracy
            Compass_DEF: (t) => t * 2, // Windwalker: Defense
            Compass_CRITPCT: (t) => t * 2, // Windwalker: Crit Chance
            Compass_CRITDMG: (t) => t * 2, // Windwalker: Crit Damage
            Compass_MoveSpeed: (t) => Math.max(t, 300), // Windwalker: Movement speed bonus
            TempestMultishotPCT: (t) => t * 2, // Windwalker: Tempest multishot chance
            CompassDustQTYbase: (t) => t * 2, // Windwalker: Dust quantity base value
            TempestWepDropChance: (t) => Math.max(t, 0.1), // Windwalker: Probability of Tempest weapon drops
            TempestRingDropChance: (t) => Math.max(t, 0.1), // Windwalker: Probability of Tempest ring drops
            TempestStoneDropChance: (t) => Math.max(t, 0.1), // Windwalker: Probability of Tempest stone drops
            TempestMedallionDropChance: (t) => 1, // Windwalker: Probability of Tempest medallion drops
            PortalCostQTY: (t) => 1, // Windwalker: Items required for portal access. (lower is better)
            // PortalCostType: (t) => t,
            // CompassBonus: (t) => t,
            // StampDoubler: (t) => t,
            // StampDoublersLeft: (t) => t,
            // Compass_AttackSpdPCT: (t) => t,
            // Compass_InvulnSec: (t) => t,
            // Compass_Range: (t) => t,
            // CompassUpgTotal: (t) => t,
            // TotBreedzWWz: (t) => t,
            // TotalTitanKills: (t) => t,
            // CompassDustType: (t) => t,
            // TempestWepDrop: (t) => t,
            // TempestRingDrop: (t) => t,
            // TempestWeaponXtraPowerChance: (t) => t,
            // TempestAllDropBonus: (t) => t,
            // TempestNovadustChance: (t) => t,
            // StoneChancePCT: (t) => t,
            // ExtraDust: (t) => t,
            // CompassUpgXY: (t) => t,
            // CompassTempest: (t) => t,
            // Compass_MASTERY: (t) => t,
            // TitanWeakness: (t) => t,
            // MobWeakness: (t) => t,
            // EffectAmount: (t) => t,
            // CurrentEffect: (t) => t,
            // TotalTitansKilled: (t) => t,
            // InitializeTitanHP: (t) => t,
            // TitanKillReqTown: (t) => t,
            // CanWeEnterPortal: (t) => t,
        },
        arcane: {
            ArcaneUpgCost: (t) => t / 2, // Arcane: Arcane upgrade costs. (lower is better)
            Arcane_HP: (t) => t * 2, // Arcane: HP
            Arcane_DMG: (t) => t * 2, // Arcane: Damage
            Arcane_ACC: (t) => t * 2, // Arcane: Accuracy
            Arcane_DEF: (t) => t * 2, // Arcane: Defense
            Arcane_CRITPCT: (t) => t * 2, // Arcane: Crit Chance
            Arcane_CRITDMG: (t) => t * 2, // Arcane: Crit Damage
            Arcane_AttackSpdPCT: (t) => t * 2, // Arcane: Attack Speed
            ArcaneMultishotPCT: (t) => t * 2, // Arcane: Arcane multishot chance
            TenteyeclePCT: (t) => Math.max(t, 100), // Arcane: Tenteyecle proc chance
            PrismaBubDropChance: (t) => t * 2, // Arcane: Probability of Prisma Bubble drops
            WepDropChance: (t) => t * 2, // Arcane: Probability of weapon drops
            // WepDropQuality: (t) => t,
            RingDropChance: (t) => t * 2, // Arcane: Probability of ring drops
            // RingDropQuality: (t) => t,
            DoubleItemDropz: (t) => Math.max(t, 100), // Arcane: Probability of double item drops
            ExtraTachyon: (t) => t * 2, // Arcane: Extra tachyon gain
            ExtraTachyonMulti: (t) => t * 2, // Arcane: Extra tachyon bonuses
            ArcaneTachyonQTYbase: (t) => t * 2, // Arcane: Tachyon quantity base value
            ArcaneMobSpawnQTY: (t) => t, // Arcane: Mobs spawned by Arcane Crystal ability
            TimeLeft: (t) => t, // Arcane: Remaining time for the Arcane Barrier encounter
            CrystalChargeReq: (t) => t, // Arcane: Kill requirement to spawn Arcane mobs. (lower is better)
            // TesseractArcanist: (t) => t,
            // ArcaneUpgUNLOCKED: (t) => t,
            // ArcaneUpgTotal: (t) => t,
            // ArcaneUpgBonus: (t) => t,
            // ArcaneMapMulti: (t) => t,
            // ArcaneMapMulti_bon: (t) => t,
            // ArcaneMapMulti_bonMAX: (t) => t,
            // Arcane_MASTERY: (t) => t,
            // KillsReq: (t) => t,
            // is_NBLB_on: (t) => t,
            // NBLB_bubbleQTY: (t) => t,
            // NBLB_bubbleLVrangeDisp: (t) => t,
            // ArcaneTachyonType: (t) => t,
        },
        sneaksymbol: {
            SneakSymbolChanceBase: (t) => 1, // Sneaking: Base chance for Sneak Symbol procs
        },
        royal: {
            StatueUpgOdds: (t) => t * 2, // Royal Guardian: Statue upgrade odds
            Statue_CanAfford: (t) => 1, // Royal Guardian: Statue affordability check
            StatueBon: (t) => t * 2, // Royal Guardian: Statue bonus multiplier
            ArmoryUpgCost: (t) => t / 2, // Royal Guardian: Armory upgrade costs. (lower is better)
            RatDMG: (t) => t * 2, // Royal Guardian: Damage dealt to Verminous rats
            ParchmentDrop: (t) => t * 2, // Royal Guardian: Parchment of Enchantment drop rate
            MarbleDrop: (t) => t * 2, // Royal Guardian: Marble drop rate
            OutpostKillsReq: (t) => t / 2, // Kingdom: Outpost kills requirement. (lower is better)
            SupportEXP: (t) => t * 2, // Kingdom: Support units EXP gain
            OutpostRange: (t) => t * 2, // Kingdom: Outpost connection range
            OutpostResourceRate: (t) => t * 2, // Kingdom: Resource collection rate
            // Statue_Cost: (t) => t, // Royal Guardian: Statue upgrade cost. (lower is better)
            // SF_unlocked: (t) => t, // Royal Guardian: Statue flair unlock state
            // SF_maxLV: (t) => t, // Royal Guardian: Statue flair max level
            // SF_costo: (t) => t, // Royal Guardian: Statue flair upgrade cost. (lower is better)
            // SF_weOwn: (t) => t, // Royal Guardian: Statue flair owned shards
            // SF_bonus: (t) => t, // Royal Guardian: Statue flair bonus
            // StatueEXPmulti: (t) => t, // Royal Guardian: Statue EXP multiplier
            // ArmoryUpgUNLOCKED: (t) => t, // Royal Guardian: Armory upgrades unlocked count
            // ArmoryUpgTotal: (t) => t, // Royal Guardian: Total armory upgrades count
            // ArmoryUpgBonus: (t) => t, // Royal Guardian: Armory upgrade bonus value
            // RatResp: (t) => t, // Royal Guardian: Verminous rat respawn rate
            // ParchmentDouble: (t) => t, // Royal Guardian: Parchment double drop chance
            // ParchmentRecycle: (t) => t, // Royal Guardian: Parchment recycle value
            // GuardianRoyalRadius: (t) => t, // Royal Guardian: Royal aura radius
            // RI_chance: (t) => t, // Royal Guardian: Regal Intervention proc chance
            // RI_mobs: (t) => t, // Royal Guardian: Regal Intervention mobs count
            // OrbletMultiDrop: (t) => t, // Royal Guardian: Orblet drop multiplier
            // KingdomEnabled: (t) => t, // Kingdom: Kingdom enabled check
            // Yi_OutpostInfo: (t) => t, // Kingdom: Outpost info query
            // HasOutpost: (t) => t, // Kingdom: Check if outpost exists on map
            // OutpostTypesUnlocked: (t) => t, // Kingdom: Outpost types unlocked
            // OutpostTypesAllowed: (t) => t, // Kingdom: Outpost types allowed
            // OutpostROGbon: (t) => t, // Kingdom: Outpost rank bonuses
            // SupportCollection: (t) => t, // Kingdom: Support units collection bonus
            // SavageCollection: (t) => t, // Kingdom: Savage collection bonus
            // XtraClearKillz: (t) => t, // Kingdom: Extra clear kills per kill
            // BarExpRate_Base: (t) => t, // Kingdom: Base bar EXP rate
            // BarExpRate: (t) => t, // Kingdom: Total bar EXP rate
            // MapOutpostBarUnlockedTot: (t) => t, // Kingdom: Total outpost bars unlocked
            // OutpostEXPformula: (t) => t, // Kingdom: Outpost EXP formula value
            // OutpostEXPreq: (t) => t, // Kingdom: Outpost EXP requirement. (lower is better)
            // OutpostEXPreqPREV: (t) => t, // Kingdom: Previous rank outpost EXP requirement
            // OutpostEXPrank: (t) => t, // Kingdom: Outpost EXP rank
            // OutpostPTSleft: (t) => t, // Kingdom: Outpost specialty points remaining
            // OutpostCost: (t) => t, // Kingdom: Outpost upgrade cost. (lower is better)
            // OutpostLV_Bonuses: (t) => t, // Kingdom: Outpost level bonuses
            // UnitSpecEffect: (t) => t, // Kingdom: Unit specialty effect value
            // isMapPurified: (t) => t, // Kingdom: Map purification status
            // OutpostPurifyBonus: (t) => t, // Kingdom: Outpost purification bonus
            // MapOutpostBarUnlocked: (t) => t, // Kingdom: Outpost bar unlocked on map
            // MapWorldsUnlocked: (t) => t, // Kingdom: Worlds unlocked for outpost expansion
            // MapButtonsUnlock: (t) => t, // Kingdom: Map buttons unlock status
            // CanWeDoubleConnect: (t) => t, // Kingdom: Double connection capability
            // UnitsUnlocked: (t) => t, // Kingdom: Number of units unlocked
            // GEDunlocked: (t) => t, // Kingdom: GED unlock status
            // ActiveKillClear: (t) => t, // Kingdom: Active kill clear rate
            // OutpostUnitSlots: (t) => t, // Kingdom: Outpost unit slots available
            // ResNodeQTYmax: (t) => t, // Kingdom: Resource node max capacity
            // ResNodes_LVUP: (t) => t, // Kingdom: Resource node level up
            // ResNodes_LVUPbon: (t) => t, // Kingdom: Resource node level up bonus
            // PassiveUnitsz: (t) => t, // Kingdom: Passive units calculation
            // TotalSupports: (t) => t, // Kingdom: Total support units
            // TotalUnitsz: (t) => t, // Kingdom: Total units count
            // TotalStatz: (t) => t, // Kingdom: Total stats calculation
        },
    },
    w7: {
        menagerie: {
            LumiGainRate: (t) => t * 2, // Menagerie: Lumi generated per hour
            ScurgeEXPgain: (t) => t * 2, // Menagerie: Scurge EXP gained per kill
            PinkJellyCosts: (t) => t / 2, // Menagerie: Purple Jellyfish purchase costs
            SilverJellyCosts: (t) => t / 2, // Menagerie: Silver Jelly Costs
            ScurgeEXP_Req: (t) => t / 2, // Menagerie: Scurge EXP Req
            // UpgUnlocked: (t) => t, // Menagerie: Available mission, unlock, or upgrade count
            // ShellEXPreq: (t) => t, // Menagerie: Shell EXPreq
            // LilTownJellyUnlocked: (t) => t, // Menagerie: Lil Town Jelly Unlocked
            // Cost: (t) => t, // Menagerie: Mission progress target or Lumi price, selected by the first argument
            // CostExponent: (t) => t, // Menagerie: Cost Exponent
            // CanClaim: (t) => t, // Menagerie: Mission completion or purchase eligibility
            // BlackStarsOwned: (t) => t, // Menagerie: Black Stars Owned
            // OrganicLabelOwned: (t) => t, // Menagerie: Organic Label Owned
            // MineheadDoublersOwned: (t) => t, // Menagerie: Minehead Doublers Owned
            // MineheadDoublersLEFT: (t) => t, // Menagerie: Minehead Doublers LEFT
            // SushiDoublersOwned: (t) => t, // Menagerie: Sushi Doublers Owned
            // SushiDoublersLEFT: (t) => t, // Menagerie: Sushi Doublers LEFT
            // JellyOpDoublersOwned: (t) => t, // Menagerie: Jelly Op Doublers Owned
            // JellyOpDoublersLEFT: (t) => t, // Menagerie: Jelly Op Doublers LEFT
            // ClickerCheapenerAoE: (t) => t, // Menagerie: Clicker Cheapener Ao E
            // OrionCheapener: (t) => t, // Menagerie: Orion Cheapener
            // PoppyCheapener: (t) => t, // Menagerie: Poppy Cheapener
            // BubbaCheapener: (t) => t, // Menagerie: Bubba Cheapener
            // TotalOrbs: (t) => t, // Menagerie: Total Orbs
            // OrbX: (t) => t, // Menagerie: Orb X
            // OrbY: (t) => t, // Menagerie: Orb Y
            // UnlockOwned: (t) => t, // Menagerie: Calculated unlock ownership
            // BoostQTY: (t) => t, // Menagerie: Boost QTY
            // SumCostReduxMena: (t) => t, // Menagerie: Sum Cost Redux Mena
            // CK_tValue: (t) => t,
            // CK_KillMulti: (t) => t, // Menagerie: CK Kill Multi
            // CK_TimeMulti: (t) => t, // Menagerie: CK Time Multi
            // CK_TotalValue: (t) => t, // Menagerie: CK Total Value
            // CK_NonDivHourTime: (t) => t, // Menagerie: CK Non Div Hour Time
            // NightmarinerTotLV: (t) => t, // Menagerie: Nightmariner Tot LV
            // NightmarinerBon: (t) => t, // Menagerie: Nightmariner Bon
            // PinkJellyBonus: (t) => t, // Menagerie: Purple Jellyfish Lumi bonus
            // RedJellyReadingMulti: (t) => t, // Menagerie: Red Jellyfish reading multiplier
            // ObolMISCmulti: (t) => t, // Menagerie: Obol MISCmulti
            // ObolAutoTrashRate: (t) => t, // Menagerie: Obol Auto Trash Rate
            // ConstBuildREQ: (t) => t, // Menagerie: Const Build REQ
            // ConstBuildBONUSES: (t) => t, // Menagerie: Const Build BONUSES
            // SideJellyUnlocked: (t) => t, // Menagerie: Side Jelly Unlocked
            // ScurgeUnlocked: (t) => t, // Menagerie: Scurge Unlocked
            // ScurgePTS_Left: (t) => t, // Menagerie: Unspent Scurge upgrade points
            // ScurgeUpg_LvREQ: (t) => t, // Menagerie: Scurge Upg Lv REQ
            // ScurgeStartingEXP: (t) => t, // Menagerie: Scurge Starting EXP
            // OmegaArcBallChance: (t) => t, // Menagerie: Omega Arc Ball Chance
            // OmniJadeLeft: (t) => t, // Menagerie: Unspent Omni Jade nodes
            // MissionProg: (t) => t, // Menagerie: Mission Prog
        },
        jelly: {
            UpgCost: (t) => t / 2, // Jelly Operator: Upgrade cost
            UpgLvREQ: (t) => 0, // Jelly Operator: Upgrade level requirement
            CellExpREQ: (t) => t / 2, // Jelly Operator: Cell EXP requirement
            DailyTries: (t) => t * 2, // Jelly Operator: Daily operation attempts
            BloodcellDaily: (t) => t * 2, // Jelly Operator: Daily Bloodcells
            CellDMG: (t) => t * 2, // Jelly Operator: Cell damage
            CellSPD: (t) => t * 2, // Jelly Operator: Cell speed
            EXPMulti: (t) => t * 2, // Jelly Operator: Cell EXP multiplier
            // SlotUnlocked: (t) => t, // Jelly Operator: Slot availability
            // SlotPurchasesLeft: (t) => t, // Jelly Operator: Remaining slot purchases
            // UpgradeQTY: (t) => t, // Jelly Operator: Upgrade effect quantity
            // CanWeBuyUpg: (t) => t, // Jelly Operator: Upgrade purchase eligibility
            // RoG_BonusQTY: (t) => t, // Jelly Operator: Obstruction reward bonus
            // UnitsOwned: (t) => t, // Jelly Operator: Owned cells
            // BossHP: (t) => t, // Jelly Operator: Obstruction HP
            // BossTime: (t) => t, // Jelly Operator: Obstruction timing
            // BossAtkCD: (t) => t, // Jelly Operator: Obstruction attack cooldown
            // CurrencyMulti: (t) => t, // Jelly Operator: Bloodcell gain multiplier
            // DPSmulti: (t) => t, // Jelly Operator: DPS multiplier
            // MainAtkCD: (t) => t, // Jelly Operator: Main attack cooldown
            // UnitSumAtkCD: (t) => t, // Jelly Operator: Cell attack cooldown
            // MainAtkDMG: (t) => t, // Jelly Operator: Main attack damage
            // UnitSumAtk: (t) => t, // Jelly Operator: Total cell attack
            // UnitOffset: (t) => t, // Jelly Operator: Cell position offset
            // CanBuySlots: (t) => t, // Jelly Operator: Slot purchase eligibility
            // CanLvUpUnits: (t) => t, // Jelly Operator: Cell level-up eligibility
            // CritConditionUnlocked: (t) => t, // Jelly Operator: Critical Condition unlock
            // DPSunlocked: (t) => t, // Jelly Operator: DPS Biometer unlock
            // FEVERunlocked: (t) => t, // Jelly Operator: Fever unlock
            // OrganelleSPD: (t) => t, // Jelly Operator: Organelle speed
            // ObstAdj: (t) => t, // Jelly Operator: Obstruction adjacency
            // FeverBonus: (t) => t, // Jelly Operator: Fever bonus
            // ROIDunlocked: (t) => t, // Jelly Operator: Steroid unlock
            // RevivesTotal: (t) => t, // Jelly Operator: Available revives
            // SteroidTimeTOT: (t) => t, // Jelly Operator: Steroid duration
            // RoidMulti: (t) => t, // Jelly Operator: Steroid multiplier
            // VirusesAllowed: (t) => t, // Jelly Operator: Allowed virus cells
            // CellLV_tot: (t) => t, // Jelly Operator: Total cell levels
            // leftright: (t) => t, // Jelly Operator: Horizontal position helper
            // updown: (t) => t, // Jelly Operator: Vertical position helper
        },
        bubba: {
            MeatsliceRate: (t) => t * 2, // Bubba: Meat slicing speed
            UpgCost: (t) => t / 2, // Bubba: Upgrade costs. (lower is better)
            DoubleLVchancePCT: (t) => t, // Bubba: Double level chance on upgrade
            DailyPetting: (t) => t * 2, // Bubba: Daily petting limit
            DailyPet_HappinessQTY: (t) => t * 2, // Bubba: Happiness gained from petting
            DailyPet_HappinessFromUpg: (t) => t * 2, // Bubba: Happiness gained from upgrades
            HappinessLoss: (t) => t / 2, // Bubba: Happiness decay rate. (lower is better)
            CharismaTraitSPD: (t) => t * 2, // Bubba: Charisma trait speed
            CharismaTraitREQ: (t) => t / 2, // Bubba: Charisma trait requirements. (lower is better)
            CharismaBonus: (t) => t * 2, // Bubba: Charisma bonuses
            GiftPassiveBonus: (t) => t * 2, // Bubba: Gift-provided passive bonuses
            Dice_Result: (t) => t * 2, // Bubba: Modifier for dice roll results
            SmokeMeat_Multi: (t) => t * 2, // Bubba: Smoked Meat gain
            SpareCoins_Multi: (t) => t * 2, // Bubba: Spare Coins gain
            // HappinessRank: (t) => t,
            // HappinessBonus: (t) => t,
            // TotalUpgTypesAvailable: (t) => t,
            // TotalQTYofLVs: (t) => t,
            // MeatProdREQ: (t) => t,
            // Xupg: (t) => t,
            // Yupg: (t) => t,
            // RealLV: (t) => t,
            // DoWeNeedToSelectGift: (t) => t,
            // GiftSelectionOptions: (t) => t,
            // Dice_Rolled: (t) => t,
            // Dice_MaxSides: (t) => t,
            // Dice_Luck: (t) => t,
            // Dice_Multi: (t) => t,
            // SmokeMeat_QTYproduced: (t) => t,
            // SmokeMeat_2xChancePCT: (t) => t,
            // SmokeMeat_10xChancePCT: (t) => t,
            // SpareCoins_FindChance: (t) => t,
            // SpareCoins_QTYfound: (t) => t,
            // SpareCoins_FoundOne: (t) => t,
            // BubbaRoG_Bonuses: (t) => t,
            // MegafleshOwned: (t) => t,
            // TotUpgBonus: (t) => t,
            // T_FeatureUnlocked: (t) => t,
            // BubbaUnlocked: (t) => t,
        },
        spelunk: {
            POW: (t) => t * 2, // Spelunking: Spelunking power
            StaminaMax: (t) => t * 2, // Spelunking: Maximum stamina
            StaminaRegenRate: (t) => t * 2, // Spelunking: Stamina regeneration speed
            OverstimFillRate: (t) => t * 2, // Spelunking: Overstim fill speed
            AmberGain: (t) => t * 2, // Spelunking: Amber gain
            AmberDropChance: (t) => t * 2, // Spelunking: Probability of primary amber drops
            AmberDropChance2nd: (t) => t * 2, // Spelunking: Probability of secondary amber drops
            EscapeRopeChance: (t) => Math.max(t, 1), // Spelunking: Escape rope find chance
            TollExitTax: (t) => 1, // Spelunking: Toll exit tax. (lower is better)
            SpelunkingEfficiency: (t) => t * 2, // Spelunking: Spelunking efficiency
            SpelunkingSpeed: (t) => t / 2, // Spelunking: Spelunking speed. (lower is better)
            ExaltDropChance: (t) => t * 2, // Spelunking: Probability of exalt drops
            PrismaDropChance: (t) => t * 2, // Spelunking: Probability of prisma drops
            MiscDropChance: (t) => t * 2, // Spelunking: Probability of miscellaneous item drops
            GoldPieceDropChance: (t) => t * 2, // Spelunking: Probability of gold piece drops
            w7itemDropChance: (t) => t * 2, // Spelunking: Probability of World 7 item drops
            blingbagDropChance: (t) => t * 2, // Spelunking: Probability of bling bag drops
            ShadowStrikeChance: (t) => t * 2, // Spelunking: Probability of Shadow Strike procs
            GrandDiscoveries_FindChance: (t) => t * 2, // Spelunking: Grand Discovery find chance
            RockPOWreq: (t) => t / 2, // Spelunking: Rock power requirements. (lower is better)
            RockHP: (t) => t / 2, // Spelunking: Rock HP. (lower is better)
            MaxDailyPageReads: (t) => t, // Spelunking: Maximum page reads per day
            PageReadingLVgains: (t) => t, // Spelunking: Levels gained from reading a page
            // POW_base: (t) => t * 2,
            // POW_multi: (t) => t * 2,
            // SpelunkingMultiOre: (t) => t,
            // SpelunkingOreValue: (t) => t,
            // SpelunkingExpMulti: (t) => t,
            // SpelunkingAFKgains_PCTofALL: (t) => t,
            // ShadowStrikeQTY: (t) => t,
            // GrandDiscoveries_Total: (t) => t,
            // CavesUnlocked: (t) => t,
            // QuickRefUnlocked: (t) => t,
            // ElixirsUnlocked: (t) => t,
            // "4thtabUnlocked": (t) => t,
            // "6starCards": (t) => t,
            // DuperBits: (t) => t,
            // CanWeOveruseStamina: (t) => t,
            // DoWeHaveLoreN1: (t) => t,
            // CanWeUseAUTO: (t) => t,
            // AutoFullClearNECESSARY: (t) => t,
            // ToolkitUnlocked: (t) => t,
            // BestToolUnlocked: (t) => t,
            // ToolUnlocked: (t) => t,
            // PlayerSelectSlots: (t) => t,
            // BiggestHaulUnlocked: (t) => t,
            // BonusDMG: (t) => t,
            // RockTypeCreated: (t) => t,
            // RockAmber: (t) => t,
            // StaminaBarWidth: (t) => t,
            // ShopUpgVisible: (t) => t,
            // ShopUpgMaxLV: (t) => t,
            // ShopUpgCost: (t) => t,
            // ShopUpgBuyable: (t) => t,
            // ShopUpgBonus: (t) => t,
            // ElixirsOwned: (t) => t,
            // ElixirMaxDupes: (t) => t,
            // ElixirSlotsOwned: (t) => t,
            // ElixirNotUsed: (t) => t,
            // ElixirEffectQTY: (t) => t,
            // CanWeUseElixir: (t) => t,
            // ElixirEquippedStatus: (t) => t,
            // AmberDenominator: (t) => t,
            // AmberIndex: (t) => t,
            // AmberDailyHaul: (t) => t,
            // GridCoord: (t) => t,
            // HolesToNextFloor: (t) => t,
            // OmnipotentArtifactsUnlocked: (t) => t,
            // OverstimUnlocked: (t) => t,
            // OverstimBonus_PerLV: (t) => t,
            // OverstimBonus: (t) => t,
            // OverstimQtyREQ: (t) => t,
            // NovaBlastHitChance: (t) => t,
            // SampleRedux: (t) => t,
            // ChapterBonus: (t) => t,
            // BigFishBonuses: (t) => t,
            // BigFishCost: (t) => t,
            // isBigFishUpgUnlocked: (t) => t,
            // BigFishUpgLVREQ: (t) => t,
        },
        gallery: {
            GalleryBonusMulti: (t) => t * 2, // Gallery: All gallery-provided bonuses
            HatrackBonusMulti: (t) => t * 2, // Gallery: Premium Hat Rack bonus multiplier
            InitializeTrophyBonuses: (t) => t, // Gallery: Logic for initializing trophy bonuses
            InitializeNametagBonuses: (t) => t, // Gallery: Logic for initializing nametag bonuses
            // PodiumsOwned: (t) => t,
            // PodiumsOwned_Lv2: (t) => t,
            // PodiumsOwned_Lv3: (t) => t,
            PodiumsOwned_Lv4: (t) => 19, // Gallery: Level 4 podiums owned (max 19)
            // GalleryBonusSystemON: (t) => t,
            // PodiumX_inGallery: (t) => t,
            // PodiumY_inGallery: (t) => t,
            // PodiumX_inTown: (t) => t,
            // PodiumY_inTown: (t) => t,
            // NametagX_inTown: (t) => t,
            // NametagY_inTown: (t) => t,
        },
        sushi: {
            UpgLvREQ: (t) => t / 2, // Sushi: Upgrade level requirements. (lower is better)
            UpgCost: (t) => t / 2, // Sushi: Upgrade costs. (lower is better)
            FuelCost: (t) => t / 2, // Sushi: Sushi fuel costs. (lower is better)
            FuelGen: (t) => t * 2, // Sushi: Fuel generation rate
            FuelCap: (t) => t * 2, // Sushi: Maximum fuel capacity
            CurrencyperHR: (t) => t * 2, // Sushi: Money generation per hour
            KnowledgeXP_req: (t) => t / 2, // Sushi: Knowledge XP requirements per level. (lower is better)
            KnowledgeXP_multi: (t) => t * 2, // Sushi: Knowledge XP gain multiplier
            // UpgradeQTY: (t) => t,
            // CanWeBuyUpg: (t) => t,
            // SlotsOwned: (t) => t,
            // MaxCookTier: (t) => t,
            // BonusCookTierPCT: (t) => t,
            // MaxTier: (t) => t,
            // OvertunedMulti: (t) => t,
            // CurrencyMulti: (t) => t,
            // CurrencyPerTier: (t) => t,
            // CurrencyPerSlot: (t) => t,
            // OrangeFireSum: (t) => t,
            // CurrencyGain: (t) => t,
            // KnowledgeXP_base: (t) => t,
            // KnowledgeBonusSpecific: (t) => t,
            // KnowledgeBonusTOT: (t) => t,
            // FreeShaker: (t) => t,
            // PerfectOdds: (t) => t,
            // SaffronHRS: (t) => t,
            // NewSushiInstaMoney: (t) => t,
            // SlotEffect: (t) => t,
            // FireTypesUnlocked: (t) => t,
            // FireplaceSparkMulti: (t) => t,
            // FireplaceEffect: (t) => t,
            // isButtonUnlocked: (t) => t,
            // MoneyHRdispUnlocked: (t) => t,
            // ViewTiersUnlocked: (t) => t,
            // KnowledgeLVunlocked: (t) => t,
            // UniqueSushi: (t) => t,
            // RoG_BonusQTY: (t) => t,
        },
        sushitools: {
            ingameButtons: false, // Sushi tools: Show native Start/Stop and Sort buttons on the in-game board tab.
            tier: 1, // Sushi tools: Unlocked purchase tier, starting at 1.
            targetCount: 40, // Sushi tools: Stop at this quantity of target-tier sushi or higher. Must fit the working slots.
            targetTier: 64, // Sushi tools: Keep this tier and higher; never merge them. Tiers start at 1.
            reserveSlots: 2, // Sushi tools: Empty slots to reserve after sorting and refilling, from 0 to 119.
            extendChain: false, // Sushi tools: Remove the East Wind 25-tile chain limit. Requires East Wind.
            higherTier: false, // Sushi tools: Allow East Wind up to one tier below the game maximum. Requires East Wind.
        },
        reef: {
            ReefCost: (t) => 0, // Reef: Costs. (lower is better)
        },
        clam: {
            ClamPromochance: (t) => t * 2, // Clams: Probability of clam promotion
            ClamBonuses: (t) => t * 2, // Clams: Clam-provided bonuses
            ClamPearlValue: (t) => t * 2, // Clams: Pearl value
            // ClamPearl10x: (t) => t * 2,
            Clam_BlackPearlValue: (t) => t * 2, // Clams: Black pearl value
            Clam_Cost: (t) => t / 2, // Clams: Clam costs. (lower is better)
            Clam_PearlUpgReq: (t) => t, // Clams: Pearl upgrade requirements. (lower is better)
            Clam_Mobs: (t) => t * 2, // Clams: Mob spawns
            // Clam_Respawn: (t) => t,
            // ClamWorkBonus: (t) => t,
            // Clamz_HP: (t) => t,
        },
        coralkid: {
            CoralKidUpgCost: (t) => 0, // Coral Kid: Standard and Singularity upgrade costs. (lower is better)
        },
        bigfish: {
            BigFishCost: (t) => 0, // Big Fish: Costs. (lower is better)
        },
        zenith: {
            ZenithMarketCost: (t) => t / 2, // Zenith: Market upgrade costs. (lower is better)
            ZenithMarketBonus: (t) => t * 2, // Zenith: Market-provided bonuses
        },
        spelunkmana: {
            StaminaCostMulti: (t) => 0, // Spelunking: No stamina cost in spelunking
        },
        minehead: {
            Button_BonusMULTI: (t) => t * 2, // The Button: Bonus multiplier
            UpgCost: (t) => t / 2, // Minehead: Upgrade costs. (lower is better)
            DailyTries: (t) => t * 2, // Minehead: Daily tries
            MaxHP_You: (t) => t * 2, // Minehead: Max HP
            BaseDMG: (t) => t * 2, // Minehead: Base damage
            CurrentOutgoingDMG: (t) => t * 2, // Minehead: Outgoing damage
            CurrencyGain: (t) => t * 2, // Minehead: Currency gain
            BluecrownOdds: (t) => t * 2, // Minehead: Blue crown odds
            JackpotOdds: (t) => t * 2, // Minehead: Jackpot odds
            JackpotTiles: (t) => t * 2, // Minehead: Jackpot tiles
            InstaRevealsTotal: (t) => t * 2, // Minehead: Total insta reveals
            // BonusQTY: (t) => t,
            // WepPowDmgPCT: (t) => t,
            // CanWeBuyUpg: (t) => t,
            // BonusDMGperTilePCT: (t) => t,
            // MineheadID: (t) => t,
            // MaxHP_Opp: (t) => t,
            // Mines_Opp: (t) => t,
            // UpgradeQTY: (t) => t,
            // BluecrownMulti: (t) => t,
            // Tiles_RowCol: (t) => t,
            // Tiles_XY: (t) => t,
            // TotalTiles: (t) => t,
            // GoldTilesTotal: (t) => t,
            // BlocksTotal: (t) => t,
            // FlagsTotal: (t) => t,
        },
        glimbo: {
            Glimbo_Cost: (t) => t / 2, // Glimbo: Glimbo cost. (lower is better)
            GlimboDRmulti: (t) => t * 2, // Glimbo: Drop rate multiplier
            // Glimbo_CanAfford: (t) => t,
            // GlimboTotalTrades: (t) => t,
        },
        research: {
            AFKgainsRatePCT: (t) => t * 2, // Research: AFK gains rate
            MaxRoll: (t) => t * 2, // Research: Max roll
            RollsPerDay: (t) => t * 2, // Research: Rolls per day
            MagnifiersOwned: (t) => t, // Research: Magnifiers owned
            KaleidoscopeOwned: (t) => t, // Research: Kaleidoscopes owned
            OpticalMonocleOwned: (t) => t, // Research: Optical monocles owned
            ResearchEXPrateObj: (t) => t * 2, // Research: EXP rate object
            ObservationInsightExpRate: (t) => t * 2, // Research: Insight EXP rate
            Kalei_MultiBase: (t) => t * 2, // Research: Kaleidoscope base multi
            TinyCogsPerDay: (t) => t * 2, // Research: Tiny cogs per day
            MSA_BonusRewards: (t) => t * 2, // Research: MSA bonus rewards
            SmallCogBonus: (t) => t * 2, // Research: Small cog bonuses
            SmallCogBonusTOTAL: (t) => t * 2, // Research: Total small cog bonuses
            // TotalOccurrencesFound: (t) => t,
            // MagnifiersPerSlot: (t) => t,
            // ObservationInsightExpREQ: (t) => t,
            // ResearchEXPrateTOT: (t) => t,
            // ResearchEXPmulti: (t) => t,
            // Kalei_MultiTot: (t) => t,
            // Grid_MaxLV: (t) => t,
            // CanRotateShapes: (t) => t,
            // Grid_PTSearned: (t) => t,
            // Grid_PTSspent: (t) => t,
            // Grid_PTSavailable: (t) => t,
            // Grid_Bonus: (t) => t,
            // Grid_CanWeUseButton: (t) => t,
            // Grid_CanWeUpgrade: (t) => t,
            // TranscendentArtifactsUnlocked: (t) => t,
            // GreenSigilsUnlocked: (t) => t,
            // GreenSigilTrueDMG: (t) => t,
            // RefineryTab3Unlocked: (t) => t,
            // RefineryTabsOwned: (t) => t,
            // TinyCogsUnlocked: (t) => t,
            // FarmingStickersUnlocked: (t) => t,
            // FarmingStickerDMG_unlocked: (t) => t,
            // KingRatUnlocked: (t) => t,
            // ZuperBitsUnlocked: (t) => t,
            // SmallCogSlotsUnlocked: (t) => t,
            // CanWeLevelUpObservations: (t) => t,
            // OccurrencesToBeFound: (t) => t,
            // OccurrenceYspacing: (t) => t,
            // ShapesOwned: (t) => t,
            // PostyNotesOwned: (t) => t,
            // Grid_ShapeVertices: (t) => t,
            // Grid_CanWeSelect: (t) => t,
        },
    },
};

exports.injectorConfig = {
    logLevel: "info", // Log verbosity level: debug, info, warn, or error
    injreg: "\\w+\\.ApplicationMain\\s*?=", // Regex pattern used to find the injection point in the game code
    interceptPattern: "*N.js", // Script filename pattern to intercept (N.js)
    enableUI: true, // Enable/disable the webui
    webPort: 8080, // Port for the webui
    onLinuxTimeout: 60000, // Timeout in milliseconds for Linux-specific operations
    target: "web", // Injection target platform (steam or web)
    webUrl: "https://www.legendsofidleon.com/ytGl5oc/", // Idleon web URL when using browser injection
    browserPath: "", // Browser executable path for web injection (auto if empty)
    browserUserDataDir: "", // Browser user data dir for web injection (optional)
    // gameExePath: "C:/Path/To/LegendsOfIdleon.exe", // Optional: set this to override EXE search on Windows
};
