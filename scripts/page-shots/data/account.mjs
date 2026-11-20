/**
 * General pages: tasks, achievements, merit shop, cards, upgrade vault, bubba, event shop, masterclasses, attire rack,
 * wardrobe.
 */
import { wardrobeComputed, wardrobeDefinitions } from "../../wardrobe-fixture.mjs";
import { fakeName, h, level, list, upgradeDefs, upgradeLevels } from "./helpers.mjs";
import { MAPS, MONSTERS, PLAYERS } from "./shared.mjs";

const WORLDS = 7;
const TASKS = 8;
const MERITS = 6;
const ACHIEVEMENTS = 70;
const CARD_REGIONS = 13;
const VAULT = 30;
const EVENT_SHOP = 20;
const ARMORY = 70;

const vaultMax = (index) => 10 + (index % 5) * 10;
// World 7 › Bubba › Automation: costs climb by upgrade, the last few unlock with more meat made.
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
    list(4 + (shop % 3), (i) => (i === 3 ? `EquipmentHatsPrem${shop + 1}` : `item${(shop * 3 + i) % 30}`));

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
            Object.fromEntries(PLAYERS.map((name, i) => [name, h({ ...attireSlot(WORN[i]), ...wardrobePlayer() })]))
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
        OptionsListAccount: { 311: "_bcf" },
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
                BubbaUpg: upgradeDefs(28, 5),
                GrimoireUpg: upgradeDefs(30, 1),
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
        _customBlock_Summoning: { VaultUpgMaxLV: vaultMax },
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
