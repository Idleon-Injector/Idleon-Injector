/**
 * A character for the Wardrobe tests (#101, from VoidKitten's #2): a level 500 mage ("Lumi", class 34) in world 5,
 * with the item definitions and lists a loadout touches. The real game's names where the item has one.
 * `wardrobeGame()` -> { gga, definitions, lists, computed }: computed answers the game methods the Wardrobe calls.
 */

const list = (length, fill) => Array.from({ length }, (_, i) => fill(i));
const h = (fields) => ({ h: fields });

const item = (displayName, typeGen, { lv = 1, slots = 0, Class = "ALL", ...rest } = {}) =>
    h({
        displayName,
        typeGen,
        Class,
        lvReqToEquip: lv,
        Upgrade_Slots_Left: slots,
        Weapon_Power: 0,
        STR: 0,
        AGI: 0,
        WIS: 0,
        LUK: 0,
        Defence: 0,
        UQ1txt: "0",
        UQ1val: 0,
        UQ2txt: "0",
        UQ2val: 0,
        ID: 1,
        Type: "",
        ...rest,
    });
const stone = (displayName, Effect) => h({ displayName, typeGen: "dStone", Trigger: 1, Effect });
const food = (displayName) => h({ displayName, typeGen: "cFood", Type: "GOLDEN_FOOD" });
const obol = (displayName, shape, ID) =>
    item(displayName, `aObol${shape}`, { ID, Type: `${shape.toUpperCase()}_OBOL`, UQ1txt: "%_DROP_CHANCE" });

export const wardrobeDefinitions = () => ({
    Blank: h({}),
    // Rare Drops, the first predefined loadout, as a mage takes it.
    EquipmentHats123: item("Prehistoric|Battlehair", "aHelmet", { lv: 650, slots: 12 }),
    EquipmentWands9: item("Diabolical|Wand", "aWeapon", { lv: 130, slots: 5, Class: "MAGE" }),
    EquipmentShirts36: item("Serrated_Chest|of_the_Divine", "aShirt", { lv: 280, slots: 9 }),
    EquipmentPendant30: item("The_Divine|Scarf", "aPendant", { lv: 425 }),
    EquipmentPants27: item("Spiked_Leggings|of_the_Divine", "aPants", { lv: 260, slots: 9 }),
    EquipmentRings35: item("Divine_Ring", "aRing", { lv: 250, slots: 4 }),
    EquipmentShoes41: item("Divine_Boots", "aShoes", { lv: 300, slots: 9 }),
    EquipmentKeychain22: item("Negative_7_Chain", "aKeychain"),
    EquipmentRingsChat11: item("Equinox_Ring", "aChatRingMTX", { lv: 15, slots: 1 }),
    EquipmentGown9: item("Celebration_Gown", "aGown"),
    EquipmentTools15: item("Destroyer_of_the|Mollo_Gomme", "aPick", { lv: 100, slots: 7 }),
    EquipmentToolsHatchet10: item("Annihilator_of|the_Yggdrasil", "aHatchet", { lv: 90, slots: 7 }),
    FishingRod12: item("Angler_of_the|Iliunne", "aFishingRod", { lv: 90, slots: 7 }),
    CatchingNet12: item("Wrangler_of_the|Qoxzul", "aBugNet", { lv: 95, slots: 7 }),
    TrapBoxSet11: item("Prehistoric|Traps", "aTrap", { lv: 100, slots: 7 }),
    TrapBoxSet1: item("Cardboard_Traps", "aTrap", { lv: 1, slots: 2 }),
    WorshipSkull12: item("Prehistoric|Skull", "aSkull", { lv: 150 }),
    FoodG2: food("Golden_Kebabs"),
    FoodG9: food("Golden_Grilled|Cheese_Nomwich"),
    FoodG12: food("Golden_Dumpling"),
    FoodG13: food("Golden_Cake"),
    FoodG8: food("Golden_Cheese"),
    FoodG6: food("Golden_Bread"),
    FoodHealth1: h({ displayName: "Nomwich", typeGen: "cFood", Type: "HEALTH_FOOD" }),
    ObolKruk: obol("Molten_Obol_of|Dead_Divine", "Sparkle", 4),
    ObolLava: obol("Magma_Obol_of|Big_Time_Domeo", "Hexagon", 3),
    ObolHyperB0: obol("Hyper_Obol_of|Rare_Drops", "Square", 5),
    ObolHyper0: obol("Hyper_Obol_of|Lucky_Rolls", "Circle", 5),
    ObolBronzePop: obol("Bronze_Obol_of|Pop", "Circle", 0),
    // What the character wears now.
    EquipmentHats1: item("Farmer_Brim", "aHelmet", { slots: 1 }),
    EquipmentSword5: item("Diabolical|Flesh_Ripper", "aWeapon", { lv: 130, slots: 5, Class: "WARRIOR" }),
    EquipmentKeychain11: item("Shmeckle_Chain", "aKeychain"),
    EquipmentCape3: item("Royal_Cape", "aCape"),
    // The town stones of world 5, and the chat ring's stone.
    StoneW5: stone("Weapon_Upgrade|Stone_V", "Weapon_Power,5.Main_Stat,5"),
    StoneA5: stone("Armor_Upgrade|Stone_V", "Defence,10.Main_Stat,6"),
    StoneT5: stone("Tool_Upgrade|Stone_V", "Weapon_Power,6.Main_Stat,6"),
    StonePremWIS: stone("Premium_Stone", "Main_Stat,3"),
});

const CARDS = ["w7b7", "babaMummy", "w7b9", "wolfB", "w6d2", "Boss6A", "mini6a", "w7a12", "frogP"];
const CARD_NAMES = [
    "Ancient_Golem",
    "Baba_Mummy",
    "Domeo_Magmus",
    "Wolf_Boss",
    "Shoji_Spirit",
    "Kattlekruk",
    "Mini_Kruk",
    "Slimey_Scarab",
    "Frog",
];

export const wardrobeLists = () => ({
    EquiptypeGens: [
        ["aHelmet", "aShirt", "aPants", "aShoes", "aPendant", "aRing", "aCape"],
        ["aPick", "aHatchet", "aFishingRod", "aBugNet", "aTrap", "aSkull"],
    ],
    ItemToCraftNAME: [["EquipmentShirts36", "EquipmentPants27"]],
    // [9]: the wizard levels that open each prayer slot.
    RANDOlist: { 9: ["1", "50", "100", "200", "300", "400", "600", "800"] },
    PrayerInfo: list(20, (i) => [`Prayer_${["of_Zeal", "of_Might", "of_Luck", "of_Haste"][i % 4]}_${i}`]),
    ChipDesc: list(25, (i) => [`Chip_${["Grounded", "Silkrode", "Gold", "Omega"][i % 4]}_${i}`]),
    // Set 7 (Smoulderin' Plateau) holds the first cards.
    CardStuff: list(8, (s) => (s === 7 ? CARDS.map((id) => [id, "0", "5"]) : [["Blank", "0", "0"]])),
    CardSets: list(8, (s) => [`{%_Card_Set_${s}`, "6"]),
    ObolShapes: ["Circle", "Square", "Hexagon", "Sparkle"],
    // [group][slot][2]: the shape of each obol slot.
    ObolXYcoords: [list(4, (i) => [0, 0, String(i)]), list(4, (i) => [0, 0, String(i)])],
});

const lv0 = (level) => list(20, (i) => (i === 0 ? level : i === 7 ? 50 : i === 12 ? 80 : 200));

export const wardrobeGga = (name = "Lumi", other = "Lumi_Alt") => {
    const equipment = [
        "EquipmentHats1",
        "EquipmentSword5",
        ...list(7, () => "Blank"),
        "EquipmentKeychain11",
        "Blank",
        "Blank",
        "EquipmentCape3",
        "Blank",
        "Blank",
        "Blank",
    ];
    const cards = ["babaMummy", "frogP", ...list(6, () => "B")];
    return {
        UserInfo: [name],
        GetPlayersUsernames: [name, other],
        CharacterClass: 34,
        Lv0: lv0(500),
        CurrentMap: 0,
        // Every town up to world 5 has its portal open.
        KillsLeft2Advance: list(251, (i) => [i === 200 ? 12 : 0]),
        EquipmentOrder: [equipment, list(8, () => "Blank"), ["FoodG2", "FoodHealth1", ...list(14, () => "Blank")]],
        EquipmentQuantity: [
            equipment.map((id) => (id === "Blank" ? 0 : 1)),
            list(8, () => 0),
            [25000, 800, ...list(14, () => 0)],
        ],
        EquipmentMap: [list(16, () => h({})), list(8, () => h({})), list(16, () => h({}))],
        FoodSlotsOwned: 5,
        GemItemsPurchased: list(150, (i) => (i === 114 ? 1 : i === 63 ? 4 : 0)),
        PrayersUnlocked: list(20, () => 1),
        PrayersActive: [1, 2, ...list(10, () => -1)],
        // [1]: the chips of the first character; [15]: the chips the account owns (chip 10 isn't).
        Lab: list(16, (i) => (i === 1 ? list(7, () => -1) : i === 15 ? list(25, (c) => (c === 10 ? 0 : 1)) : [])),
        Cards: [h(Object.fromEntries(CARDS.map((id) => [id, id === "mini6a" ? 0 : 3]))), [], cards.slice(), h({})],
        CardPreset: [cards.slice(), list(8, () => "B")],
        PlayerStuff: [0, 0, 0],
        MonsterDefinitionsGET: h(Object.fromEntries(CARDS.map((id, i) => [id, h({ Name: CARD_NAMES[i] })]))),
        ObolEquippedOrder: [
            ["ObolBronzePop", "Blank", "Blank", "Blank"],
            ["Blank", "Blank", "LockedHexagon", "LockedSparkle"],
        ],
        ObolEquippedMap: [list(4, () => h({})), list(4, () => h({}))],
        PlayerDATABASE: h({
            [name]: h({
                CharacterClass: 34,
                Lv0: lv0(500),
                Prayers: [1, 2, ...list(10, () => -1)],
                CardEquip: cards.slice(),
                CardPreset: [cards.slice(), list(8, () => "B")],
                CSetEq: h({}),
            }),
            [other]: h({ CharacterClass: 7, Lv0: lv0(100) }),
        }),
        DNSM: h({ TotStatMAP: h({}), BoxRewards: h({ OneSlot: 0.5 }), PrayNonEq: 1 }),
        // The game's stat caches are ready once Cards was opened.
        PixelHelperActor: list(7, (i) =>
            i === 6 ? { behaviors: { getBehavior: () => ({ _GenINFO: { 45: h({}) } }) } } : {}
        ),
    };
};

/** The answers of the game methods the Wardrobe calls, by method and first argument. */
export const wardrobeComputed = () => ({
    _customBlock_MaxCapacity: { cFood: 1500 },
    _customBlock_SkillStats: { SmithingSpecCraftPCT: 1 },
    _customBlock_GetBribeBonus: { 28: 0.5 },
    _customBlock_RunCodeOfTypeXforThingY: { CardLv: 5 },
});

/** A saved loadout for this character, as the page keeps it in cheatConfig.wide.wardrobe.loadouts. */
export const savedLoadout = (fields = {}) => ({
    version: 1,
    id: "saved-test1",
    name: "Drop farm",
    description: "Player-made loadout",
    classes: ["Mage"],
    equipment: [
        "EquipmentHats1",
        "EquipmentWands9",
        "EquipmentShirts36",
        "Blank",
        "EquipmentPants27",
        "EquipmentRings35",
        "Blank",
        "Blank",
        "Keep",
        "EquipmentKeychain22",
        "Keep",
        "Blank",
        "Keep",
        "EquipmentRingsChat11",
        "Keep",
        "Blank",
    ],
    tools: ["EquipmentTools15", "Blank", "Blank", "Blank", "Blank", "Blank", "Blank"],
    food: ["FoodG9", "FoodHealth1", "Blank", "Blank", "Blank", "Blank"],
    chips: [3, 4, -1, -1, -1, -1, -1],
    cards: ["w7b7", "wolfB", "B", "B", "B", "B", "B", "B"],
    cardSet: 7,
    prayers: [0, 3, ...list(10, () => -1)],
    obolSlots: [
        ["ObolHyper0", "ObolHyperB0", "Keep", "ObolKruk"],
        ["Blank", "Keep", "Keep", "Keep"],
    ],
    keychainStats: { 9: {}, 11: {} },
    ...fields,
});

export const wardrobeGame = () => ({
    gga: wardrobeGga(),
    definitions: wardrobeDefinitions(),
    lists: wardrobeLists(),
    computed: wardrobeComputed(),
});
