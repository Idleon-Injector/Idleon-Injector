/**
 * Wardrobe (VoidKitten's #2, #101): what the Wardrobe page reads through readComputed("wardrobe", name, args).
 * Nothing here changes the game: the page saves a plan's writes through writeManyVerified (so the change log can undo
 * them), then runs `wide wardrobestats`, which works the stats out again (recalculateWardrobe).
 */
import { cList, events, gga, itemDefs } from "../../core/globals.js";
import { cheatState } from "../../core/state.js";
import { characterInPlay, craftingBonuses, perfectEquippedWrites, perfectFoodWrites } from "./perfect.js";
import { equippedSpecialRolls } from "./special.js";
import { equipmentWorld } from "./stones.js";
import { planWardrobe, keychainRoll, foodStackLimits, foodStackWrites } from "./planner.js";
import { wardrobeClass, wardrobePresets, primaryStats } from "./presets.js";

const foodCapacity = () => Math.floor(events(12)._customBlock_MaxCapacity("cFood"));

/** The largest golden food stack recorded for the character in play, from the page's saved `goldenFood` map. */
const recorded = (goldenFood, character) => {
    const value = Number(goldenFood?.[character]) || 0;
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
};

function createPlan(loadout) {
    const preset =
        typeof loadout === "string" ? wardrobePresets.find((p) => p.id === loadout) : validateSavedWardrobe(loadout);
    if (!preset) throw new Error("Unknown wardrobe loadout.");
    return planWardrobe(
        gga,
        itemDefs,
        cList,
        preset,
        craftingBonuses(),
        (id) => events(12)._customBlock_RunCodeOfTypeXforThingY("CardLv", id),
        equippedSpecialRolls(
            preset.equipment.map((item) =>
                item === "Weapon" ? preset.weapons[wardrobeClass(Number(gga.CharacterClass))] : item
            ),
            true
        ),
        Boolean(cheatState.w3.prayer)
    );
}

/** Who is in play, the loadouts their class can take, and the food stack sizes a loadout's food gets. */
export function wardrobeStatus({ goldenFood = {} } = {}) {
    const character = characterInPlay();
    const characterClass = Number(gga.CharacterClass);
    const baseClass = wardrobeClass(characterClass);
    return {
        character,
        characterClass,
        baseClass,
        world: equipmentWorld(gga),
        prayerCheat: Boolean(cheatState.w3.prayer),
        foodLimits: foodStackLimits(gga, foodCapacity(), recorded(goldenFood, character)),
        presets: wardrobePresets
            .filter((p) => p.classes.includes(baseClass) && (!p.classIds || p.classIds.includes(characterClass)))
            .map((p) => ({ id: p.id, name: p.name, description: p.description })),
    };
}

/**
 * What applying `loadout` (a predefined loadout's id, or a saved loadout) would change. `fingerprint` changes when
 * anything the plan depends on does, food eaten meanwhile aside: the page applies only a plan whose fingerprint is
 * the one it showed.
 */
export function wardrobePreview({ loadout, goldenFood = {} } = {}) {
    characterInPlay();
    const plan = createPlan(loadout);
    if (!gga.DNSM.h.TotStatMAP?.h || !gga.PixelHelperActor[6].behaviors.getBehavior("ActorEvents_312")._GenINFO[45]?.h)
        throw new Error("Game stat caches are not ready. Open Cards once, close it, and try again.");
    const foodLimits = foodStackLimits(gga, foodCapacity(), recorded(goldenFood, plan.character));
    const food = plan.sections.find((section) => section.title === "Food");
    food.quantities = food.items.map((_, slot) => {
        if (slot >= Number(gga.FoodSlotsOwned)) return null;
        const id =
            plan.writes.find((write) => write.path === `EquipmentOrder[2][${slot}]`)?.value ||
            gga.EquipmentOrder[2][slot];
        return id === "Blank" ? null : /^FoodG[0-9]+$/.test(id) ? foodLimits.golden : foodLimits.regular;
    });
    return {
        character: plan.character,
        name: plan.name,
        baseClass: plan.baseClass,
        world: plan.world,
        sections: plan.sections,
        notes: plan.notes,
        foodLimits,
        writes: plan.writes,
        fingerprint: JSON.stringify([
            plan.character,
            Number(gga.CharacterClass),
            plan.world,
            Boolean(cheatState.w3.prayer),
            plan.writes.filter((write) => !write.path.startsWith("EquipmentQuantity[2]")),
        ]),
    };
}

/**
 * After a loadout landed and `wide wardrobestats` ran: each equipped food stack set to its limit. `character` is the
 * one the loadout was planned for; another one in play gets nothing.
 */
export function wardrobeFood({ goldenMaximum = 0, character } = {}) {
    characterInPlay(character);
    const limits = foodStackLimits(gga, foodCapacity(), goldenMaximum);
    return { limits, writes: foodStackWrites(gga, limits) };
}

/** Work out the stats of the character in play again after a loadout or Perfect Equipped changed its gear. */
export function recalculateWardrobe() {
    delete gga.DNSM.h.PrayNonEq;
    events(345)._customBlock_ActionBlock("RecalcChipBonuses", "0", 0, 0);
    events(124)._customBlock_TalentCalc(-4);
    gga.DNSM.h.TotStatMAP.h = {};
    events(12)._customBlock_TotalStats("calcEtcBonuses");
}

/** The page's Perfect Equipped: its gear writes, then (after the stat update) its food writes. */
// `character`: the one the page asked about; another one in play gets nothing.
export function wardrobePerfect({ character } = {}) {
    characterInPlay(character);
    return perfectEquippedWrites();
}
export function wardrobePerfectFood({ character } = {}) {
    characterInPlay(character);
    return perfectFoodWrites();
}

/** The loadout the character in play wears, as a saved loadout. Applying it rebuilds the gear, never old rolls. */
export function captureWardrobe(a = gga, lists = cList) {
    const player = a.GetPlayersUsernames.indexOf(a.UserInfo[0]);
    if (player < 0) throw new Error("No character in play.");
    const equipment = a.EquipmentOrder[0].slice(0, 16);
    for (const slot of [8, 10, 12, 14]) equipment[slot] = "Keep";
    const setKeys = Object.keys(a.Cards[3].h);
    const cardSet = setKeys.length ? lists.CardSets.findIndex((row) => row[0] === setKeys[0]) : -1;
    if (setKeys.length && cardSet < 0) throw new Error("Current card set is unknown; nothing saved.");
    const baseClass = wardrobeClass(Number(a.CharacterClass));
    const keychainStats = {};
    for (const slot of [9, 11]) {
        if (equipment[slot] === "Blank") continue;
        try {
            keychainStats[slot] = keychainRoll(equipment[slot], primaryStats[baseClass]);
        } catch {
            keychainStats[slot] = { ...a.EquipmentMap[0][slot].h };
        }
    }
    return validateSavedWardrobe({
        version: 1,
        id: "saved-" + Date.now().toString(36) + Math.random().toString(36).slice(2),
        name: "My loadout",
        description: "Saved from " + a.UserInfo[0],
        classes: [baseClass],
        ...(equipment.some((id) => /Arc0$|Tempest[0-8]$/.test(id)) ? { characterClass: Number(a.CharacterClass) } : {}),
        equipment,
        tools: a.EquipmentOrder[1].slice(0, 7),
        food: a.EquipmentOrder[2].slice(0, 6).map((id, slot) => (slot < Number(a.FoodSlotsOwned) ? id : "Blank")),
        chips: a.Lab[player + 1].slice(),
        cards: a.Cards[2].slice(0, 8),
        cardSet,
        prayers: a.PrayersActive.slice(),
        obolSlots: a.ObolEquippedOrder.slice(0, 2).map((row) => row.map((id) => (/Locked/.test(id) ? "Keep" : id))),
        keychainStats,
    });
}

/** A saved loadout as the planner takes it, or an Error when it isn't one (a hand-edited config, say). */
export function validateSavedWardrobe(value) {
    const fail = () => {
        throw new Error("Invalid saved loadout. Save the current loadout again.");
    };
    if (
        !value ||
        value.version !== 1 ||
        typeof value.id !== "string" ||
        !/^saved-[a-z0-9-]{1,80}$/.test(value.id) ||
        typeof value.name !== "string" ||
        !value.name.trim() ||
        value.name.length > 80
    )
        fail();
    const ids = (row, length) =>
        Array.isArray(row) &&
        row.length === length &&
        row.every((id) => typeof id === "string" && /^[A-Za-z0-9_]+$/.test(id));
    const nums = (row, length) =>
        Array.isArray(row) &&
        row.length === length &&
        row.every((id) => Number.isInteger(id) && id >= -1 && id < 10000);
    if (
        !ids(value.equipment, 16) ||
        !ids(value.tools, 7) ||
        !ids(value.food, 6) ||
        !ids(value.cards, 8) ||
        !nums(value.chips, 7) ||
        !nums(value.prayers, 12) ||
        !Number.isInteger(value.cardSet) ||
        value.cardSet < -1 ||
        value.cardSet > 1000
    )
        fail();
    if (![8, 10, 14].every((slot) => value.equipment[slot] === "Keep")) fail();
    if (
        !Array.isArray(value.classes) ||
        value.classes.length !== 1 ||
        !Object.keys(primaryStats).includes(value.classes[0])
    )
        fail();
    if (
        value.characterClass !== undefined &&
        (!Number.isInteger(value.characterClass) || wardrobeClass(value.characterClass) !== value.classes[0])
    )
        fail();
    if (
        !Array.isArray(value.obolSlots) ||
        value.obolSlots.length !== 2 ||
        value.obolSlots.some((row) => !Array.isArray(row) || row.length > 100 || !ids(row, row.length))
    )
        fail();
    const keychainStats = {};
    for (const slot of [9, 11]) {
        const stats = value.keychainStats?.[slot] || {};
        if (!stats || typeof stats !== "object" || Array.isArray(stats)) fail();
        keychainStats[slot] = {};
        for (const [key, val] of Object.entries(stats)) {
            if (["UQ1txt", "UQ2txt"].includes(key)) {
                if (typeof val !== "string" || val.length > 100) fail();
            } else if (
                ![
                    "UQ1val",
                    "UQ2val",
                    "Weapon_Power",
                    "Defence",
                    "STR",
                    "AGI",
                    "WIS",
                    "LUK",
                    "Upgrade_Slots_Left",
                    "AwesomeStats",
                ].includes(key) ||
                typeof val !== "number" ||
                !Number.isFinite(val)
            )
                fail();
            keychainStats[slot][key] = val;
        }
    }
    return JSON.parse(
        JSON.stringify({
            version: 1,
            id: value.id,
            name: value.name.trim(),
            description: "Player-made loadout",
            classes: value.classes,
            ...(value.characterClass === undefined ? {} : { characterClass: value.characterClass }),
            equipment: value.equipment,
            tools: value.tools,
            food: value.food,
            chips: value.chips,
            cards: value.cards,
            cardSet: value.cardSet,
            prayers: value.prayers,
            obolSlots: value.obolSlots,
            keychainStats,
        })
    );
}
