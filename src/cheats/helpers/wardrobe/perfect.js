/**
 * Perfect Equipped (VoidKitten's #2, #101): the gear in play rebuilt with class-appropriate stats, the stones of the
 * furthest world reached and the crafting bonuses the account has; Premium, Arcane and Tempest gear follow their own
 * rules. `wide perfectequipped` does it at once; the Wardrobe page asks for the same plan as writes
 * (perfectEquippedWrites, then perfectFoodWrites after the stats are worked out again), so it lands in the change log.
 */
import { behavior, cList, events, gga, itemDefs } from "../../core/globals.js";
import { equippedSpecialRolls } from "./special.js";
import { equipmentStones, equipmentWorld } from "./stones.js";

const protectedSlots = new Set([8, 9, 10, 11, 14]);
const modifierKeys = [
    "Weapon_Power",
    "Speed",
    "Reach",
    "Power",
    "Defence",
    "STR",
    "AGI",
    "WIS",
    "LUK",
    "UQ1val",
    "UQ2val",
    "UQ1txt",
    "UQ2txt",
    "Upgrade_Slots_Left",
];

export function craftingBonuses() {
    const chance = Number(events(12)._customBlock_SkillStats("SmithingSpecCraftPCT"));
    const extraSlot = Number(gga.DNSM.h.BoxRewards.h.OneSlot) > 0.4;
    return { extraSlot, statBonus: chance > 0 ? Math.floor(4 + 8 * events(189)._customBlock_GetBribeBonus("28")) : 0 };
}

function nonnegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}. Nothing changed.`);
    return value;
}

/** Build the whole update before writing anything. Equipment maps contain deltas, not base stats. */
export function planPerfectEquipment(
    attributes,
    definitions,
    lists,
    craftingBonuses,
    foodCapacity,
    specialRolls = {},
    world = equipmentWorld(attributes)
) {
    const characterClass = nonnegativeInteger(Number(attributes.CharacterClass), "character class");
    const primaryStat = characterClass < 7 ? "LUK" : characterClass < 19 ? "STR" : characterClass < 31 ? "AGI" : "WIS";
    nonnegativeInteger(craftingBonuses.statBonus, "crafting bonus");
    const stones = equipmentStones(world);
    const craftable = new Set(lists.ItemToCraftNAME.flat());
    const equipment = [];
    const skipped = [];

    for (let group = 0; group < 2; group++) {
        attributes.EquipmentOrder[group].forEach((item, slot) => {
            if (item === "Blank" || (group === 0 && protectedSlots.has(slot))) return;
            const definition = definitions[item]?.h;
            const current = attributes.EquipmentMap[group][slot]?.h;
            if (!definition || !current) throw new Error(`Missing equipment data for ${item}. Nothing changed.`);
            const type = definition.typeGen;
            const special = group === 0 && [1, 5, 7].includes(slot) ? specialRolls[item] : null;
            // These items have separate quality/rune rules, or protected cosmetic properties.
            if (
                (/Tempest|EquipmentWandsArc|EquipmentRingsArc/.test(item) && !special) ||
                Number(current.Premiumified) === 1 ||
                ["aKeychain", "aHelmetMTX", "aTrophy", "aNametag"].includes(type)
            ) {
                skipped.push(item);
                return;
            }
            const stats = { ...current };
            for (const key of modifierKeys) stats[key] = 0;
            if (special) Object.assign(stats, special.stats);
            if (special && !special.stone) {
                equipment.push({ group, slot, item, stats });
                return;
            }
            const stoneId = special
                ? special.stone
                : type === "aChatRingMTX"
                  ? `StonePrem${primaryStat}`
                  : type === "aWeapon"
                    ? stones.weapon
                    : lists.EquiptypeGens[0].includes(type)
                      ? stones.armor
                      : lists.EquiptypeGens[1].includes(type)
                        ? stones.tool
                        : null;
            if (!stoneId || Number(definition.Upgrade_Slots_Left) === 0) {
                skipped.push(item);
                return;
            }
            const baseSlots = nonnegativeInteger(Number(definition.Upgrade_Slots_Left), `${item} slots`);
            const stone = definitions[stoneId]?.h;
            if (!stone || Number(stone.Trigger) !== 1) throw new Error(`Unsupported ${stoneId}. Nothing changed.`);
            const isCraftable = !special && craftable.has(item);
            const uses = baseSlots + (isCraftable && craftingBonuses.extraSlot ? 1 : 0);
            if (isCraftable) stats[primaryStat] = craftingBonuses.statBonus;
            for (const effect of stone.Effect.split(".")) {
                const [effectKey, amountText] = effect.split(",");
                let key = effectKey;
                const amount = Number(amountText);
                if (key === "Main_Stat" || key === "Random_Stat") key = primaryStat;
                if (key === "Misc_Bonus") {
                    if (!Number.isFinite(Number(definition.UQ1val)))
                        throw new Error(`Invalid ${item} unique bonus. Nothing changed.`);
                    key = Number(definition.UQ1val) !== 0 ? "UQ1val" : "Defence";
                }
                if (
                    !["Weapon_Power", "Defence", "STR", "AGI", "WIS", "LUK", "UQ1val"].includes(key) ||
                    !Number.isSafeInteger(amount) ||
                    amount < 0
                )
                    throw new Error(`Unsupported ${stoneId} effect. Nothing changed.`);
                stats[key] += amount * uses;
                nonnegativeInteger(stats[key], `${item} ${key}`);
            }
            // Base + modifier is zero after consuming all base slots and the crafted extra slot.
            stats.Upgrade_Slots_Left = -baseSlots;
            equipment.push({ group, slot, item, stats });
        });
    }

    return { equipment, food: planFoodStacks(attributes, foodCapacity), skipped, primaryStat };
}

export function planFoodStacks(attributes, foodCapacity) {
    const food = [];
    const foodSlots = nonnegativeInteger(Number(attributes.FoodSlotsOwned), "food slot count");
    if (foodSlots > attributes.EquipmentOrder[2].length) throw new Error("Invalid food slots. Nothing changed.");
    for (let slot = 0; slot < foodSlots; slot++) {
        if (attributes.EquipmentOrder[2][slot] === "Blank") continue;
        const quantity = Number(attributes.EquipmentQuantity[2][slot]);
        nonnegativeInteger(quantity, "food quantity");
        nonnegativeInteger(foodCapacity, "food capacity");
        if (quantity < foodCapacity) food.push({ slot, quantity: foodCapacity });
    }
    return food;
}

// The scenes the game itself treats as having no player: its player events skip PlayerSelect, and its chip and
// achievement code skip PlayerSwap with it. There UserInfo[0] can already name the character clicked while the
// per-character values are still placeholders that belong to no one, and the game drops them on PLAY.
const NO_PLAYER_SCENES = new Set(["PlayerSelect", "PlayerSwap"]);

/**
 * The character in play, or an Error saying none is. With `expected` (the character a plan was made for), an
 * Error too when another character is in play now, so nothing meant for one character lands on another.
 */
export function characterInPlay(expected) {
    const character = gga.UserInfo[0];
    if (
        typeof character !== "string" ||
        !gga.GetPlayersUsernames.includes(character) ||
        NO_PLAYER_SCENES.has(behavior.getCurrentSceneName())
    )
        // The WebUI's NO_CHARACTER (the game can't import it); scripts/character-changed.test.mjs keeps them the same.
        throw new Error("No character in play.");
    // The WebUI's CHARACTER_CHANGED (the game can't import it); scripts/character-changed.test.mjs keeps them the same.
    if (expected !== undefined && expected !== character) throw new Error("Character changed. Refresh.");
    return character;
}

/** The page's Perfect Equipped: the same plan, as writes of each rebuilt item's upgrades. */
export function perfectEquippedWrites() {
    const plan = planPerfectEquipment(
        gga,
        itemDefs,
        cList,
        craftingBonuses(),
        0,
        equippedSpecialRolls(),
        equipmentWorld(gga)
    );
    if (!gga.DNSM.h.TotStatMAP?.h) throw new Error("Equipment stat cache is unavailable. Nothing changed.");
    return {
        writes: plan.equipment.map(({ group, slot, stats }) => ({
            path: `EquipmentMap[${group}][${slot}].h`,
            value: stats,
        })),
        items: plan.equipment.map(({ item }) => item),
        skipped: plan.skipped,
        primaryStat: plan.primaryStat,
    };
}

/** After the page's Perfect Equipped and the stat update: the food stacks below the (new) carry capacity, raised to it. */
export function perfectFoodWrites() {
    const capacity = Math.floor(events(12)._customBlock_MaxCapacity("cFood"));
    return planFoodStacks(gga, capacity).map(({ slot, quantity }) => ({
        path: `EquipmentQuantity[2][${slot}]`,
        value: quantity,
    }));
}

/** One-shot action; no toggles, character-change hooks, inventory changes, or forced saves. */
export function perfectEquipped() {
    characterInPlay();
    const actor12 = events(12);
    const plan = planPerfectEquipment(
        gga,
        itemDefs,
        cList,
        craftingBonuses(),
        0,
        equippedSpecialRolls(),
        equipmentWorld(gga)
    );
    if (!gga.DNSM.h.TotStatMAP?.h) throw new Error("Equipment stat cache is unavailable. Nothing changed.");
    const before = plan.equipment.map(({ group, slot }) => gga.EquipmentMap[group][slot].h);
    try {
        for (const { group, slot, stats } of plan.equipment) gga.EquipmentMap[group][slot].h = stats;
        // Match the native equipment update: invalidate totals, then rebuild equipment bonuses.
        gga.DNSM.h.TotStatMAP.h = {};
        actor12._customBlock_TotalStats("calcEtcBonuses");
        // Carry capacity can itself change with the rebuilt equipment.
        plan.food = planFoodStacks(gga, Math.floor(actor12._customBlock_MaxCapacity("cFood")));
    } catch (error) {
        plan.equipment.forEach(({ group, slot }, index) => {
            gga.EquipmentMap[group][slot].h = before[index];
        });
        gga.DNSM.h.TotStatMAP.h = {};
        let rollbackError = "";
        try {
            actor12._customBlock_TotalStats("calcEtcBonuses");
        } catch (caught) {
            rollbackError = " Rollback recalculation failed: " + caught.message;
        }
        throw new Error(`Equipment changes rolled back; food unchanged. ${error.message}${rollbackError}`);
    }
    for (const { slot, quantity } of plan.food) gga.EquipmentQuantity[2][slot] = quantity;
    return (
        `Perfect Equipped: rebuilt ${plan.equipment.length} items for ${plan.primaryStat}; increased ${plan.food.length} food stacks. ` +
        `Protected slots and keychains unchanged; skipped ${plan.skipped.length} ineligible or non-upgradeable items.`
    );
}
