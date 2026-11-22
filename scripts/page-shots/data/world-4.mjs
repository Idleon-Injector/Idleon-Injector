/** World 4: cooking (tables, meals, mastery, spices), breeding, lab (chips, jewels), rift, tome, cape vine. */
import { fakeName, h, level, list, upgradeDefs, upgradeLevels } from "./helpers.mjs";
import { MONSTERS } from "./shared.mjs";

const MEALS = 28;
const KITCHENS = 6;
const PETS_PER_WORLD = 6;
const PET_UPGRADES = 10;
const CHIPS = 16;
const JEWELS = 12;
const TOME = 40;
const CAPES = list(8, (i) => `EquipmentCape${i + 2}`);

const capeItem = (i) =>
    h({ displayName: `${fakeName(i + 30)}_Cape`, Type: "CAPE", typeGen: "aCape", lvReqToCraft: 10 * (i + 1) });

// Shared by every fakeGameData() call, so two calls compare equal.
const computed = {
    _customBlock_Summoning2: {
        isMasteryUnlocked: 1,
        PtsLeftCook_P: 4,
        PtsLeftCook_Y: 11,
        RankREQcook: (i) => i * 2,
        BonusMultiCook: 1.1,
    },
    _customBlock_Breeding: { TotalEggCapacity: 8, PetUpgMaxLV: (_, i) => [5, 10, 25, 50, 100][(i + 2) % 5] },
    // Cooking › Automation: kitchen k's slot s pays with spice 2k + s; meals share one max level.
    _customBlock_CookingR: {
        CookingUpgSpiceCostType: (k, s) => 2 * k + s,
        CookingUpgSpiceCostQty: (k, s) => 120 * (k + 1) + 35 * s + 0.4,
        CookingSPEED: (k) => 1500 * (k + 1),
        CookingFIRE: (k) => 2400 * (k + 1),
        CookingLUCK: (k) => 1 + k / 4,
        CookingMealMaxLVlol: 90,
        CookingMenuMealCosts: (i) => 150 * (i + 1) ** 2,
        CookingMealBonusMultioo: 1.5,
    },
    _customBlock_Summoning: { RibbonBonus: 1.2 },
};

export default () => ({
    gga: {
        // Per kitchen: [?, ?, ?, ?, ?, ?, speed, fire, luck] levels.
        Cooking: list(KITCHENS, (k) => [
            k < 4 ? 1 : 0,
            0,
            0,
            0,
            0,
            0,
            level(k, 80),
            level(k + 2, 80),
            level(k + 4, 80),
        ]),
        // [0] meal levels, [2] meal amounts, [3] spice amounts.
        Meals: [list(MEALS, (i) => level(i, 90)), [], list(MEALS, (i) => i * 1234), list(20, (i) => i * 55.5)],
        // Ribbons from [28] on, one per meal.
        Ribbon: list(MEALS * 2, (i) => (i < MEALS ? 0 : (i * 3) % 15)),
        // [0] meal mastery levels, [1] [rank, exp, daily respec, ladles], [2] purple upgrades.
        CookMaster: [list(MEALS, (i) => i % 4), [6, 1234.5, 0, 88000], [3, 1, 0, 2, 0, 1]],
        // [0] eggs, [2] upgrades, [3][8] dead cells, [4..7] DNA levels, [13..16] breedability, [22..25] shiny days.
        Breeding: list(26, (i) => {
            if (i === 0) return list(8, (e) => (e % 3) + 1);
            if (i === 2) return upgradeLevels(PET_UPGRADES, 2);
            if (i === 3) return list(10, (j) => (j === 8 ? 45000 : 0));
            if (i >= 4 && i <= 7) return list(PETS_PER_WORLD, (p) => level(p + i, 40));
            if (i >= 13 && i <= 16) return list(PETS_PER_WORLD, (p) => 1000 * (p + 1) * (i - 12));
            if (i >= 22 && i <= 25) return list(PETS_PER_WORLD, (p) => (p % 3) * 15);
            return [];
        }),
        // [0..2] chips slotted per character, [14] jewels unlocked, [15] chips owned.
        Lab: list(16, (i) => {
            if (i < 3) return [i, -1, 3 + i, -1, -1, -1, -1];
            if (i === 14) return list(JEWELS, (j) => (j % 3 ? 1 : 0));
            if (i === 15) return list(CHIPS, (c) => c % 4);
            return [];
        }),
        Rift: [23, 0],
        // [11]: Equinox Food Lust's level, which caps the meal discount stacks (OptionsListAccount[193]); world-3.mjs
        // holds the rest of the equinox.
        Dream: { 11: 2 },
        Spelunk: { 54: CAPES.slice(0, 5) },
        ItemDefinitionsGET: { h: Object.fromEntries(CAPES.map((id, i) => [id, capeItem(i)])) },
        BundlesReceived: { h: { ban_o: 1 } },
        DNSM: { h: { TomeQTY: list(TOME, (i) => (i * 791) % 50000) } },
        OptionsListAccount: { 85: 4, 89: 70, 100: 3, 628: 12, 669: 2 },
        CustomLists: {
            h: {
                MealINFO: list(MEALS, (i) => [`${fakeName(i)}_Pie`, "5", "1.1", `+{%_${fakeName(i + 2)}`, "0"]),
                // Cooking mastery purple upgrades: [8] coefficients, [9] names.
                RandoListo2: { 8: ["2", "1", "3", "0", "5", "4"], 9: list(6, (i) => `${fakeName(i + 7)}_Mastery`) },
                PetUpgradeINFO: [["No_Upgrade_Selected"], ...upgradeDefs(PET_UPGRADES - 1, 4)],
                // Per world: [monster, ...stats]
                PetStats: list(4, (w) =>
                    list(PETS_PER_WORLD, (p) => [MONSTERS[w * PETS_PER_WORLD + p], "10", "5", "1"])
                ),
                ChipDesc: upgradeDefs(CHIPS, 6),
                // [11]: jewel name.
                JewelDesc: list(JEWELS, (i) => [...list(11, () => "0"), `${fakeName(i + 11)}_Jewel`]),
                Tome: list(TOME, (i) => [`${fakeName(i + 15)}_Record`, "1", "100", "0"]),
                NinjaInfo: { 32: list(TOME, (i) => (i * 7) % TOME) },
            },
        },
    },
    computed,
});
