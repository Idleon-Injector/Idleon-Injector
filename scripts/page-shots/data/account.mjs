/**
 * General pages: tasks, achievements, merit shop, cards, upgrade vault, bubba, event shop, masterclasses, attire rack,
 * wardrobe.
 */
import { wardrobeComputed, wardrobeDefinitions } from "../../wardrobe-fixture.mjs";
import { fakeName, h, level, list, upgradeDefs, upgradeLevels } from "./helpers.mjs";
import { MAPS, MONSTERS, PLAYERS } from "./shared.mjs";
import { PREMIUM_HATS } from "./world-3-game.mjs";

const WORLDS = 7;
const TASKS = 8;
const MERITS = 6;
const ACHIEVEMENTS = 70;
const CARD_REGIONS = 13;
const VAULT = 30;
const EVENT_SHOP = 20;
const ARMORY = 70;

const vaultMax = (index) => 10 + (index % 5) * 10;
// Account › Clickers › Automation › Bubba: costs climb by upgrade, the last few unlock with more meat made.
const bubbaCost = (i) => Math.round(40 * 1.6 ** i);
const bubbaUnlock = (i) => (i < 22 ? 0 : 10 ** (i - 16));

// Attire Rack: outfits (EquipmentGown1..), their stats and bonuses, and the attire slot (row 0, slot 15).
const OUTFITS = 8;
const outfit = (i) =>
    h({
        displayName: `${fakeName(i + 50)}_Robe`,
        Type: "PREMIUM_GOWN",
        typeGen: "aGown",
        STR: i % 3 === 0 ? 0 : i + 2,
        AGI: i % 2 ? 3 : 0,
        WIS: i % 4 === 1 ? 5 : 0,
        LUK: 0,
        Weapon_Power: i % 5 === 4 ? 2 : 0,
        Defence: i % 3 === 0 ? 4 : 0,
        UQ1txt: i % 2 ? "%_DROP_RATE" : "%_ALL_STATS",
        UQ1val: i + 1,
        UQ2txt: i % 3 === 2 ? "%_CLASS_EXP" : "0",
        UQ2val: i % 3 === 2 ? 4 : 0,
    });
const attireSlot = (item) => ({
    EquipmentOrder: [
        [...list(15, (i) => (i < 5 ? `SetPiece${i}` : "Blank")), item],
        list(8, () => "Blank"),
        list(16, () => "Blank"),
    ],
    EquipmentQuantity: [
        [...list(15, (i) => (i < 5 ? 1 : 0)), item === "Blank" ? 0 : 1],
        list(8, () => 0),
        list(16, () => 0),
    ],
    EquipmentMap: [list(16, () => h({})), list(8, () => h({})), list(16, () => h({}))],
});
const WORN = ["EquipmentGown3", "Blank", "EquipmentGown0"];

// Wardrobe: the loadout items (scripts/wardrobe-fixture.mjs), the town stones of world 7, the cards worn and the obol
// slots. Food row 2 is in world-3.mjs, beside the rest of EquipmentOrder.
const WORN_CARDS = [MONSTERS[0], MONSTERS[3], "B", "B", "B", "B", "B", "B"];
const stone = (displayName, Effect) => h({ displayName, typeGen: "dStone", Trigger: 1, Effect });
// One function for every build of the data, so two builds compare equal.
const statCaches = () => ({ _GenINFO: { 45: h({}) } });
const wardrobePlayer = () => ({ CardEquip: WORN_CARDS.slice(), CardPreset: [WORN_CARDS.slice()], CSetEq: h({}) });

const built = (map, i) => [i + 1, i, 2, 40 * i, 12, 3, 0, 0, -1, -1, i % 3, 222211111, i % 2];

// Automation › Shops: nine town shops (two in W1 and W2, one in each later world) selling the shared items.
const SHOP_MAPS = [1, 2, 51, 52, 101, 151, 201, 251, 301];
const shopItems = (shop) =>
    list(4 + (shop % 3), (i) => (i === 3 ? PREMIUM_HATS[shop][0] : `item${(shop * 3 + i) % 30}`));

// Grimoire › Automation: each upgrade's next level costs more bones the later it comes.
const grimoireCost = (i) => Math.round(10 * 1.6 ** i);

// The game's own lines for Bubba's upgrades (BubbaUpg[7]) and the Grimoire's (GrimoireUpg[9]), in order.
const BUBBA_TEXTS = [
    "Produce_+{_Meat_Slices_per_second._@_Click_the_upgrade_again_to_upgrade_it!_@_Or,_Hold_Down_on_an_upgrade_to_upgrade_fast!",
    "Unlocks_the_Happiness_Meter,_multiplying_Meat_Slice_production!_@_You_can_pat_Bubba_$_times_per_hour,_giving_+{_Happiness_each_time._@_Your_next_pats_come_in_~",
    "Boosts_Meat_Slice_production_by_+{%",
    "Gain_a_permanent_bonus_for_the_rest_of_IdleOn!_@_This_upgrade_never_resets,_so_those_bonuses_at_the_bottom_are_permanent!",
    "All_upgrades_are_$%_cheaper",
    "Bubba_gains_+$_Happiness_for_every_upgrade_you_purchase!",
    "Unlocks_the_Charisma_Chart,_boosting_stats_as_you_level_up_attributes!_@_Click_the_(?)_Icon_to_get_started!_@_This_upgrade_boosts_attribute_Lv_Up_speed_by_+{%",
    "Produce_an_extra_+{_Meat_Slices_per_second",
    "Reset_it_all._Get_a_permanent_Megaflesh.",
    "Start_each_run_with_a_new_gift._You_can_choose_from_{_different_options!",
    "Trigger_the_effect_of_your_gifts!_Remember,_each_one_has_a_unique_effect!",
    "Boosts_Meat_Slice_production_by_+{%",
    "Unlocks_the_Frozen_Dice,_which_boost_Meat_Slice_production_by_the_sum_of_their_rolls._Each_upgrade_here_rerolls_dice._@_Price_resets_in_~",
    "All_Attributes_from_Bubba's_Charisma_Chart_give_a_}x_higher_bonus!",
    "Increase_the_number_of_Dice_you_roll_by_+{",
    "Unlock_the_Smoker,_making_Smoked_Meats_that_multiply_Meat_Slice_production!_@_Each_upgrade_makes_a_Smoked_Meat_based_on_how_long_you_wait!_@_Your_smoker_has_been_smoking_for_~",
    "Increase_the_number_of_sides_of_each_Dice_by_+{,_so_your_highest_possible_dice_roll_is_now_$!",
    "The_passive_bonus_of_your_gifts_is_}x_higher!",
    "All_upgrades_are_$%_cheaper",
    "Boosts_Meat_Slice_production_by_+{%",
    "All_happiness_gained_for_Bubba_from_all_sources_is_now_}x_higher!",
    "{%_chance_to_find_a_random_coin_when_upgrading,_each_one_multiplying_Meat_Slice_production._Better_coins_are_rarer...",
    "Your_dice_are_all_{%_luckier._This_will_make_low_rolls_rarer,_and_big_rolls_more_common!",
    "Produce_and_extra_+{_Meat_Slices_per_second",
    "+{%_Meat_Slice_production_per_POW_10_fish_you_own_over_at_Poppy's_Fish_Pond!",
    "You_now_get_double_Smoked_Meat_when_curing!_Not_every_time,_but_{%_of_the_time!",
    "All_upgrades_are_$%_cheaper",
    "{%_chance_to_find_two_coins_instead_of_one_when_finding_Spare_Coins!",
];
const GRIMOIRE_TEXTS = [
    "+{_Base_Damage_in_Wraith_Form",
    "+{_Base_Accuracy_in_Wraith_Form",
    "+{_Base_Defence_in_Wraith_Form",
    "+{_Base_HP_in_Wraith_Form",
    "Unlocks_Ribbons_for_Meals,_found_at_Le_Menu_in_W4",
    "Get_+1_Daily_Ribbon,_+{%_chance_for_rare_quality",
    "+{_Base_Damage_in_Wraith_Form",
    "+{%_Accuracy,_Defence,_and_HP_in_Wraith_Form",
    "+{%_Total_Damage_in_Wraith_Form",
    "+{_Max_LV_for_5th_column_Land_Rank_upgrades",
    "+{%_Crit_Chance_in_Wraith_Form",
    "+{_Opals_to_give_to_your_Villagers_in_World_5",
    "+{_Base_Accuracy_in_Wraith_Form",
    "+{%_Wraith_DMG_per_KO!_Target:$",
    "}x_higher_Crop_Evo_chance",
    "+{_Base_Defence_in_Wraith_Form",
    "+{_Base_Damage_in_Wraith_Form",
    "}x_higher_bonuses_from_the_Tome",
    "+{%_Wraith_DMG_per_POW_10_Femurs_owned",
    "+{_Base_HP_in_Wraith_Form",
    "+{%_Crit_DMG_in_Wraith_Form",
    "+{%_Wraith_DMG_per_elim!_Target:$",
    "}x_higher_bonuses_from_the_Crop_Scientist",
    "+{%_Extra_Bones",
    "+{%_Class_EXP_bonus_for_all_characters,_always!",
    "+{_Base_Accuracy_in_Wraith_Form",
    "+{_Max_LV_for_all_Meals._Go_max_them!",
    "+{%_Wraith_DEF_per_POW_10_Ribcages_owned",
    "+{%_Total_Damage_in_Wraith_Form",
    "}x_Villager_EXP_gain_in_World_5",
];

export default () => ({
    gga: {
        ShopStock: SHOP_MAPS.map((_, shop) => shopItems(shop).map((_, i) => (i === 1 ? 0 : (shop + 1) * (i + 2) * 25))),
        ItemDefinitionsGET: h({
            ...Object.fromEntries(list(OUTFITS + 1, (i) => [`EquipmentGown${i}`, outfit(i)])),
            ...wardrobeDefinitions(),
            // The loadout's outfit, kept off the Attire Rack's cards (an outfit is typeGen aGown) so that page stays as
            // its shots and tests know it.
            EquipmentGown9: h({ ...wardrobeDefinitions().EquipmentGown9.h, typeGen: "aWardrobeOutfit" }),
            StoneW9: stone("Weapon_Upgrade|Stone_IX", "Weapon_Power,9.Main_Stat,9"),
            StoneA8: stone("Armor_Upgrade|Stone_VIII", "Defence,16.Main_Stat,9"),
            StoneT8: stone("Tool_Upgrade|Stone_VIII", "Weapon_Power,9.Main_Stat,9"),
            StonePremSTR: stone("Premium_Stone", "Main_Stat,3"),
        }),
        PlayerDATABASE: h(
            Object.fromEntries(
                PLAYERS.map((name, i) => [name, h({ ...attireSlot(WORN[i] ?? "Blank"), ...wardrobePlayer() })])
            )
        ),
        // The live copy of the character in play (world-3.mjs sets its EquipmentOrder).
        EquipmentQuantity: [...attireSlot(WORN[0]).EquipmentQuantity.slice(0, 2), [25000, 800, ...list(14, () => 0)]],
        EquipmentMap: attireSlot(WORN[0]).EquipmentMap,
        CardPreset: [WORN_CARDS.slice()],
        FoodSlotsOwned: 4,
        CurrentMap: 0,
        ObolEquippedOrder: [
            ["ObolBronzePop", "Blank", "Blank", "LockedSparkle"],
            ["Blank", "Blank", "LockedHexagon", "LockedSparkle"],
        ],
        ObolEquippedMap: [list(4, () => h({})), list(4, () => h({}))],
        // The game's stat caches, ready once Cards was opened.
        PixelHelperActor: list(7, (i) => (i === 6 ? { behaviors: { getBehavior: statCaches } } : {})),
        // [0] progress and [1] stages done per world's tasks, [2] merit shop purchases per world.
        Tasks: [
            list(WORLDS, (w) => list(TASKS, (i) => (i + 1) * (w + 2) * 15)),
            list(WORLDS, (w) => list(TASKS, (i) => (i + w) % 4)),
            list(WORLDS, (w) => list(MERITS, (i) => level(i + w, 5))),
        ],
        // -1: complete, otherwise progress.
        AchieveReg: list(WORLDS * ACHIEVEMENTS, (i) => (i % 3 === 0 ? -1 : (i * 7) % 40)),
        Cards: [
            h(Object.fromEntries(MONSTERS.slice(0, 26).map((id, i) => [id, i % 6 === 5 ? 0 : (i + 1) * 37]))),
            [],
            WORN_CARDS.slice(),
            h({}),
        ],
        UpgVault: upgradeLevels(VAULT, 2),
        // Bubba: [0] run values, [1] upgrades, [2] free upgrade levels, [3] traits, [4] dice, [5] smoked meats.
        Bubba: [
            list(20, (i) => (i < 2 ? 12500 * (i + 1) : i === 6 || i === 15 ? 2 : i % 4)),
            list(28, (i) => i % 6),
            list(28, (i) => (i % 5 === 0 ? 1 : 0)),
            [30, 12, 0, 45, 7, 120],
            [3, 18, 0, 0, 7, 11, 0, 20],
            [100, 40, 0, 6, 2],
        ],
        // Masterclasses: Grimoire, Tesseract (Arcane), Compass, Royal Guard.
        Grimoire: upgradeLevels(30, 1),
        Arcane: upgradeLevels(30, 3),
        Compass: { 0: upgradeLevels(40, 4) },
        // [0] royal statues, [1] resources, [2] armory, [4] node collected, [5] node grades,
        // [6..13] units (types, maps) per world, [23] Lil Orblet shop.
        RoyalG: {
            0: [3, 1, 0, 7, 2, 0, 5],
            1: list(40, (i) => (i * 1777) % 25000),
            2: upgradeLevels(ARMORY, 1),
            4: list(80, (i) => (i % 4 === 0 ? -1 : (i * 97) % 600)),
            5: list(80, (i) => i % 4),
            6: [4, 4, 5],
            7: [1, 1, 2],
            8: [4, 6],
            9: [51, 52],
            10: [4],
            11: [101],
            12: [],
            13: [],
            23: upgradeLevels(20, 2),
        },
        // Per map: a built outpost (13 values), [kills toward one] or nothing.
        RoyalMaps: list(350, (map) =>
            !MAPS.includes(map) ? [] : map % 50 === 1 || map % 50 === 2 ? built(map, map % 50) : [map * 11]
        ),
        MapBon: list(350, (map) => (MAPS.includes(map) ? [map * 1000, map * 500, map % 3 ? 0 : 10000000] : [])),
        CustomMaps: h({ RG_KillReq: h({ 2: 900 }) }),
        // TotStatMAP: the stat cache the Attire Rack empties after an attire change.
        DNSM: h({ ArcMultBon: [75], TotStatMAP: h({}), TotalStatsETCmap: h({}), BoxRewards: h({ OneSlot: 0.5 }) }),
        // 330-333: Grimoire bones (femur, ribcage, cranium, bovinae).
        OptionsListAccount: { 311: "_bcf", 330: 48200, 331: 9100, 332: 650, 333: 0 },
        CustomLists: {
            h: {
                ShopNames: SHOP_MAPS.map((_, shop) => shopItems(shop)),
                ShopLocations: SHOP_MAPS.map(String),
                // Per world: [name, ..., stage targets from [5] on].
                TaskDescriptions: list(WORLDS, (w) =>
                    list(TASKS, (i) => [`${fakeName(i + w)}_Task`, "0", "0", "0", "0", "10", "100", "1000", "5000"])
                ),
                // Per world: [description, more description, ..., [5] max purchases].
                TaskShopDesc: list(WORLDS, (w) =>
                    list(MERITS, (i) => [`+{%_${fakeName(i + w)}`, "for_all_characters", "0", "0", "0", "5"])
                ),
                RegAchieves: list(WORLDS * ACHIEVEMENTS, (i) =>
                    i % ACHIEVEMENTS >= 20 ? ["FILLERZZZ_ACH"] : [`${fakeName(i)}_Hunter`, "Do_the_thing", "1"]
                ),
                AchieveOrderingz: list(WORLDS, () => []),
                // Per region: [monster, ?, base cards needed].
                CardStuff: list(CARD_REGIONS, (r) =>
                    list(2, (i) => [MONSTERS[r * 2 + i] ?? "Blank", "0", String(5 + r * 3)])
                ),
                // Wardrobe: gear and tool kinds, the crafted items, card set bonuses and obol slot shapes.
                EquiptypeGens: [
                    ["aHelmet", "aShirt", "aPants", "aShoes", "aPendant", "aRing"],
                    ["aPick", "aHatchet", "aFishingRod", "aBugNet", "aTrap", "aSkull"],
                ],
                ItemToCraftNAME: [["EquipmentShirts36", "EquipmentPants27"]],
                CardSets: list(CARD_REGIONS, (r) => [`{%_${fakeName(r + 9)}_Set`, "6"]),
                ObolShapes: ["Circle", "Square", "Hexagon", "Sparkle"],
                ObolXYcoords: [list(4, (i) => [0, 0, String(i)]), list(4, (i) => [0, 0, String(i)])],
                UpgradeVault: upgradeDefs(VAULT, 2),
                // Bubba: [7] is the game's own line for each upgrade.
                BubbaUpg: upgradeDefs(28, 5).map((row, i) => [...row, BUBBA_TEXTS[i]]),
                // Grimoire: each upgrade's bone [3], the total level that unlocks it [6] and the game's line [9].
                GrimoireUpg: upgradeDefs(30, 1).map((row, i) => [
                    ...row.slice(0, 3),
                    String(Math.floor(i / 8)),
                    row[4],
                    row[5],
                    String(i * 40),
                    "0",
                    "0",
                    GRIMOIRE_TEXTS[i],
                ]),
                ArcaneUpg: upgradeDefs(30, 3),
                CompassUpg: upgradeDefs(40, 4),
                ArmoryUpg: upgradeDefs(ARMORY, 1),
                OrbletMarket: upgradeDefs(20, 2, 3),
                // [x, y, base amount, resource type] per node, 20 per world.
                RoyalResources: list(80, (i) => [
                    String(100 + i * 10),
                    String(200 + (i % 7) * 15),
                    String(50 + i),
                    String(i % 10),
                ]),
                NinjaInfo: {
                    // Event shop: "name@effect", cost, pairs.
                    39: list(EVENT_SHOP, (i) => [
                        `${fakeName(i)}@+${i + 1}%_${fakeName(i + 4)}`,
                        String(25 * (i + 1)),
                    ]).flat(),
                },
                Research: {
                    40: list(7, (i) => `${fakeName(i)}_Statue`),
                    43: list(ARMORY, (i) => i),
                },
                Spelunky: {
                    34: [5, 10, 15, 20, 25],
                    36: list(6, (i) => fakeName(i + 2)),
                    39: list(6, (i) => `${fakeName(i + 8)}_Gift`),
                },
            },
        },
    },
    computed: {
        _customBlock_Summoning: {
            VaultUpgMaxLV: vaultMax,
            GrimoireUpgUNLOCKED: 24,
            GrimoireUpgCost: grimoireCost,
        },
        _customBlock_Bubbastuff: {
            BubbaUnlocked: 1,
            DoWeNeedToSelectGift: 0,
            UpgCost: bubbaCost,
            MeatProdREQ: bubbaUnlock,
        },
        ...wardrobeComputed(),
    },
    cheatStates: { wide: { attire: true } },
});
