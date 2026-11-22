/** World 4: cooking (tables, meals, mastery, spices), breeding, lab (chips, jewels), rift, tome, cape vine. */
import { fakeName, h, level, list } from "./helpers.mjs";
import { PLAYERS } from "./shared.mjs";
import {
    CHIPS,
    JEWELS,
    MASTERY_COEFFICIENTS,
    MASTERY_NAMES,
    MEALS,
    PET_NAMES,
    PET_STATS,
    PET_UPGRADES,
    TOME,
    TOME_ORDER,
} from "./world-4-game.mjs";

const KITCHENS = 10;
const SPICES = 26;
const EGGS = 8;
// Lava_Wings (EquipmentCape1) first: the page must never offer it.
const CAPES = list(14, (i) => `EquipmentCape${i + 1}`);

const capeItem = (i) =>
    h({
        displayName: i === 0 ? "Lava_Wings" : `${fakeName(i + 30)}_Cape`,
        Type: "CAPE",
        typeGen: "aCape",
        lvReqToCraft: 10 * (i + 1),
    });

// Shared by every fakeGameData() call, so two calls compare equal.
const computed = {
    _customBlock_Summoning2: {
        isMasteryUnlocked: 1,
        PtsLeftCook_P: 4,
        PtsLeftCook_Y: 11,
        RankREQcook: (i) => i * 2,
        BonusMultiCook: 1.1,
    },
    _customBlock_Breeding: { TotalEggCapacity: EGGS, PetUpgMaxLV: (_, i) => [5, 10, 25, 50, 100][(i + 2) % 5] },
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
        Meals: [
            list(MEALS.length, (i) => level(i, 90)),
            [],
            list(MEALS.length, (i) => (i * 12345.6) ** 1.4),
            list(SPICES, (i) => (i * 5555.5) ** 1.2),
        ],
        // Ribbons from [28] on, one per meal.
        Ribbon: list(28 + MEALS.length, (i) => (i < 28 ? 0 : (i * 3) % 15)),
        // [0] meal mastery levels, [1] [rank, exp, daily respec, ladles], [2] the six mastery upgrades.
        CookMaster: [list(MEALS.length, (i) => i % 4), [6, 1234.5, 0, 88000], [3, 1, 0, 2, 0, 1]],
        // [0] eggs, [2] upgrades, [3][8] dead cells, [4..7] DNA levels, [13..16] breedability, [22..25] shiny days.
        Breeding: list(31, (i) => {
            const world = PET_STATS[(i - 4) % 9];
            if (i === 0) return list(EGGS, (e) => (e % 3) + 1);
            if (i === 2) return list(PET_UPGRADES.length, (u) => level(u, [5, 10, 25, 50, 100][(u + 2) % 5]));
            if (i === 3) return list(10, (j) => (j === 8 ? 45000 : 0));
            if (i >= 4 && i <= 7) return list(world.length, (p) => level(p + i, 40));
            if (i >= 13 && i <= 16) return list(PET_STATS[i - 13].length, (p) => 1000.25 * (p + 1) * (i - 12));
            if (i >= 22 && i <= 25) return list(PET_STATS[i - 22].length, (p) => (p % 3) * 15.5);
            return [];
        }),
        // [1..11] chips slotted per character, [14] jewels unlocked, [15] chips owned.
        Lab: list(16, (i) => {
            if (i >= 1 && i <= PLAYERS.length)
                return list(7, (s) => (s < (i % 4) + 2 ? (i * 3 + s * 5) % CHIPS.length : -1));
            if (i === 14) return list(JEWELS.length, (j) => (j % 3 ? 1 : 0));
            if (i === 15) return list(CHIPS.length, (c) => c % 4);
            return [];
        }),
        Rift: [23, 0],
        // [11]: Equinox Food Lust's level, which caps the meal discount stacks (OptionsListAccount[193]); world-3.mjs
        // holds the rest of the equinox.
        Dream: { 11: 2 },
        Spelunk: { 54: CAPES.slice(1, 6) },
        ItemDefinitionsGET: { h: Object.fromEntries(CAPES.map((id, i) => [id, capeItem(i)])) },
        MonsterDefinitionsGET: h(
            Object.fromEntries(Object.entries(PET_NAMES).map(([key, Name]) => [key, h({ Name })]))
        ),
        BundlesReceived: { h: { ban_o: 1 } },
        DNSM: { h: { TomeQTY: list(TOME.length, (i) => (i * 791) % 50000) } },
        OptionsListAccount: { 85: 4, 89: 70, 100: 3, 628: 12, 669: 2 },
        CustomLists: {
            h: {
                MealINFO: MEALS,
                RandoListo2: { 8: MASTERY_COEFFICIENTS, 9: MASTERY_NAMES },
                PetUpgradeINFO: PET_UPGRADES,
                PetStats: PET_STATS,
                ChipDesc: CHIPS,
                JewelDesc: JEWELS,
                Tome: TOME,
                NinjaInfo: { 32: TOME_ORDER },
            },
        },
    },
    computed,
});
