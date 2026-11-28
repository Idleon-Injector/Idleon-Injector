/**
 * Wardrobe planner (VoidKitten's #2, #101): what applying a loadout would change, worked out without changing
 * anything. Each change is a write of a game path (`EquipmentOrder[0][3]`, `PlayerDATABASE.h[name].h.Prayers[2]`),
 * so the Wardrobe page saves the plan through writeManyVerified and the change log can undo it.
 */
import { parsePath } from "../../utils/pathResolver.js";
import { perfectObolStats } from "../obolRolling.js";
import { planPerfectEquipment, planFoodStacks } from "./perfect.js";
import { equipmentWorld } from "./stones.js";
import { wardrobeClass, primaryStats } from "./presets.js";

const clean = (name) => String(name).replace(/[_|]/g, " ");
// The path resolver splits names at dots and brackets, so such a character's saved copy can't be addressed.
const ADDRESSABLE = /^[^.[\]]+$/;
// The item kind (typeGen) each slot takes, as the game's item definitions have them; null: a slot loadouts keep.
const TOOL_TYPES = ["aPick", "aHatchet", "aFishingRod", "aBugNet", "aTrap", "aSkull", "aDNAgun"];
const SLOT_TYPES = [
    // Helmet, weapon, shirt, pendant, pants, ring, shoes, ring, premium hat, keychain, trophy, keychain, cape,
    // chat ring, nametag, outfit.
    [
        "aHelmet",
        "aWeapon",
        "aShirt",
        "aPendant",
        "aPants",
        "aRing",
        "aShoes",
        "aRing",
        null,
        "aKeychain",
        null,
        "aKeychain",
        null,
        "aChatRingMTX",
        null,
        "aGown",
    ],
    TOOL_TYPES,
    Array(16).fill("cFood"),
];

/** Explicit Wardrobe preferences, stored as modifiers. Fixed Spiritlord stats stay in definitions. */
export function keychainRoll(item, primaryStat) {
    const roll = (text, first, second = first) => ({ UQ1txt: text, UQ1val: first, UQ2txt: text, UQ2val: second });
    if (item === "EquipmentKeychain11") return roll("%_DROP_CHANCE", 15, 10);
    if (item === "EquipmentKeychain22") return roll("%_MOB_RESPAWN", 6);
    if (item === "EquipmentKeychain19") return roll("%_ALL_AFK_GAIN", 5);
    if (item === "EquipmentKeychain16") return roll("%_MULTIKILL", 12);
    if (item === "EquipmentKeychain18" && ["STR", "AGI"].includes(primaryStat)) return roll("%_" + primaryStat, 6);
    if (item === "EquipmentKeychain29") return {};
    throw new Error("No preferred keychain rolls are configured for this class and item.");
}

/**
 * The plan for one loadout on the character in play: `writes` ({ path, value } in the order the page saves them),
 * the preview's `sections`, and `notes` on the picks that aren't available.
 */
export function planWardrobe(
    a,
    definitions,
    lists,
    preset,
    craftingBonus,
    cardLevel,
    specialRolls = {},
    prayerCheat = false
) {
    const baseClass = wardrobeClass(Number(a.CharacterClass));
    if (preset.classIds && !preset.classIds.includes(Number(a.CharacterClass)))
        throw new Error("This loadout is not valid for this subclass.");
    if (!preset.classes.includes(baseClass)) throw new Error("This loadout is not valid for the active class.");
    if (preset.characterClass !== undefined && Number(a.CharacterClass) !== preset.characterClass)
        throw new Error("This saved loadout requires its original character class.");
    const character = a.UserInfo[0];
    if (!ADDRESSABLE.test(character)) throw new Error("This character's name can't be changed from the Wardrobe.");
    const savedPath = `PlayerDATABASE.h[${character}].h.`;
    const world = equipmentWorld(a),
        primaryStat = primaryStats[baseClass];
    const writes = [],
        sections = [],
        notes = [];
    const put = (path, value) => {
        const keys = parsePath(path);
        const parent = keys.slice(0, -1).reduce((node, key) => node?.[key], a);
        if (!parent || typeof parent !== "object" || !(keys[keys.length - 1] in parent))
            throw new Error("Loadout destination is unavailable. Nothing changed.");
        writes.push({ path, value });
    };
    const definition = (id) => {
        const d = definitions[id]?.h;
        if (!d) throw new Error("Unknown loadout item: " + id + ". Nothing changed.");
        return d;
    };
    const generated = {
        ...a,
        EquipmentOrder: a.EquipmentOrder.map((r) => r.map(() => "Blank")),
        EquipmentMap: a.EquipmentMap.map((r) => r.map(() => ({ h: {} }))),
    };
    const names = ["Equipment & specials", "Tools", "Food"];
    const requested = [
        preset.equipment.map((id, slot) =>
            slot === 12
                ? "Keep"
                : id === "Weapon"
                  ? preset.weapons[baseClass]
                  : id === "PortalRing"
                    ? portalRing(a)
                    : id
        ),
        preset.tools.map((id, slot) => (id === "BestTool" ? bestWardrobeTool(a, definitions, slot) : id)),
        preset.food,
    ];
    if (!Number.isInteger(Number(a.FoodSlotsOwned))) throw new Error("Food slot data is unavailable.");
    // The upgrades of each slot that gets an item, filled in from the rebuilt gear below.
    const upgrades = new Map();
    requested.forEach((items, group) => {
        const rows = [];
        items.forEach((id, slot) => {
            if (group === 0 && [8, 10, 12, 14].includes(slot) && id !== "Keep")
                throw new Error("Protected cosmetic slot in loadout.");
            if (id === "Keep") {
                rows.push("Keep current item");
                return;
            }
            // Empty template food beyond the player's unlocked slots does not unlock or clear them.
            if (group === 2 && slot >= Number(a.FoodSlotsOwned)) {
                if (id !== "Blank")
                    notes.push(clean(definition(id).displayName) + ": food slot " + (slot + 1) + " is locked.");
                rows.push("Locked - unchanged");
                return;
            }
            if (id !== "Blank") {
                const d = definition(id);
                // A hand-edited saved loadout could put a shirt in the weapon slot; the game never would.
                if (d.typeGen !== SLOT_TYPES[group][slot])
                    throw new Error(
                        `${clean(d.displayName)} doesn't go in ${names[group]} slot ${slot + 1}. Nothing changed.`
                    );
                if (group < 2) {
                    if (
                        (d.Class && d.Class !== "ALL" && d.Class !== baseClass.toUpperCase()) ||
                        (/Arc0$|Tempest[0-8]$/.test(id) && !specialRolls[id])
                    ) {
                        notes.push(
                            clean(d.displayName) +
                                ": class or special-equipment requirement not met; kept current item."
                        );
                        rows.push("Keep current item");
                        return;
                    }
                    // Native equipment eligibility uses the tool's skill, otherwise character level.
                    const skills = {
                        aPick: [1, "Mining"],
                        aHatchet: [3, "Chopping"],
                        aFishingRod: [4, "Fishing"],
                        aBugNet: [6, "Catching"],
                        aTrap: [7, "Trapping"],
                        aSkull: [9, "Worship"],
                    };
                    const [index, label] = skills[d.typeGen] || [0, "Character"];
                    const required = Number(d.lvReqToEquip),
                        current = Number(a.Lv0[index]);
                    if (!Number.isFinite(required) || required < 0 || !Number.isFinite(current))
                        throw new Error(
                            "Equipment level requirement is unavailable for " +
                                clean(d.displayName) +
                                ". Nothing changed."
                        );
                    if (current < required) {
                        const reason =
                            clean(d.displayName) +
                            " requires " +
                            label +
                            " level " +
                            required +
                            "; current level is " +
                            current;
                        const fallback = group === 1 ? bestWardrobeTool(a, definitions, slot) : "Blank";
                        if (fallback === "Blank") {
                            notes.push(reason + ". Kept current item.");
                            rows.push("Keep current item");
                            return;
                        }
                        id = fallback;
                        notes.push(reason + ". Equipping " + clean(definition(id).displayName) + " instead.");
                    }
                }
            }
            const row =
                id === "Blank"
                    ? group === 1 && preset.tools[slot] === "BestTool"
                        ? "No eligible tool at your current skill level"
                        : "Empty"
                    : clean(definition(id).displayName);
            // An item already in its slot stays as it is, rolls and all: only a different one is rebuilt.
            if (a.EquipmentOrder[group][slot] === id) {
                rows.push(row);
                return;
            }
            generated.EquipmentOrder[group][slot] = id;
            put(`EquipmentOrder[${group}][${slot}]`, id);
            put(`EquipmentMap[${group}][${slot}].h`, {});
            upgrades.set(`${group}.${slot}`, writes[writes.length - 1]);
            const quantity =
                id === "Blank"
                    ? 0
                    : group === 2 && a.EquipmentOrder[group][slot] === id
                      ? Number(a.EquipmentQuantity[group][slot])
                      : 1;
            if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Invalid equipped quantity.");
            put(`EquipmentQuantity[${group}][${slot}]`, quantity);
            rows.push(row);
        });
        sections.push({ title: names[group], items: rows });
    });
    const gear = planPerfectEquipment(generated, definitions, lists, craftingBonus, 0, specialRolls, world);
    for (const { group, slot, stats } of gear.equipment) {
        const write = upgrades.get(`${group}.${slot}`);
        if (write) write.value = stats;
    }
    for (const slot of [9, 11]) {
        const id = requested[0][slot];
        if (id === "Keep" || id === "Blank") continue;
        const write = upgrades.get(`0.${slot}`);
        if (write)
            write.value = preset.keychainStats?.[slot] || keychainRoll(id, preset.keychainPrimaryStat || primaryStat);
    }
    const playerIndex = a.GetPlayersUsernames.indexOf(character);
    const saved = a.PlayerDATABASE.h[character]?.h;
    if (playerIndex < 0 || !saved) throw new Error("Active character record is unavailable.");
    const wizardLevel = Math.max(
        0,
        ...a.GetPlayersUsernames.map((name) => {
            const player = name === character ? a : a.PlayerDATABASE.h[name]?.h;
            return player && [32, 34, 35].includes(Number(player.CharacterClass)) ? Number(player.Lv0[0]) : 0;
        })
    );
    const prayerSlots = Math.min(
        12,
        lists.RANDOlist[9].slice(0, 8).filter((t) => wizardLevel >= Number(t)).length + Number(a.GemItemsPurchased[114])
    );
    const availablePrayers = (requested, report) => {
        const result = [];
        for (const id of requested) {
            if (id < 0) continue;
            if (!(Number(a.PrayersUnlocked[id]) > 0) || result.length >= prayerSlots) {
                if (report)
                    notes.push(
                        clean(lists.PrayerInfo[id]?.[0] || "Prayer " + id) + ": prayer or prayer slot not unlocked."
                    );
            } else result.push(id);
        }
        return result.concat(Array(12 - result.length).fill(-1));
    };
    const withCheat = prayerCheat && preset.prayersWithCheat;
    const activePrayers = availablePrayers(withCheat ? preset.prayersWithCheat : preset.prayers, true);
    if (a.PrayersActive.length !== 12 || saved.Prayers.length !== 12) throw new Error("Prayer layout is unavailable.");
    activePrayers.forEach((id, slot) => {
        put(`PrayersActive[${slot}]`, id);
        put(`${savedPath}Prayers[${slot}]`, id);
    });
    sections.push({
        title: withCheat ? "Prayers · prayer cheat on" : "Prayers",
        items: activePrayers.map((id) => (id < 0 ? "Empty" : clean(lists.PrayerInfo[id][0]))),
    });
    const chipThresholds = [5, 10, 15, 25, 35, 50, 75];
    if (!a.Lab[playerIndex + 1] || a.Lab[playerIndex + 1].length !== 7)
        throw new Error("Lab chip slots are unavailable.");
    const chips = a.Lab[playerIndex + 1].slice();
    for (const [slot, id] of preset.chips.entries()) {
        if (Number(a.Lv0[12]) < chipThresholds[slot] || (id !== -1 && !(Number(a.Lab[15][id]) > 0))) {
            if (id !== -1)
                notes.push(
                    clean(lists.ChipDesc[id]?.[0] || "Chip " + id) +
                        ": chip or lab slot not unlocked; kept current chip."
                );
            continue;
        }
        chips[slot] = id;
        put(`Lab[${playerIndex + 1}][${slot}]`, id);
    }
    sections.push({
        title: "Lab chips",
        items: chips.map((id) => (id === -1 ? "Empty" : clean(lists.ChipDesc[id][0]))),
    });
    const knownCards = new Set(lists.CardStuff.flat().map((row) => row[0]));
    const cards = a.Cards[2].slice(),
        retained = [];
    const cardSlots = Math.min(8, 4 + Number(a.GemItemsPurchased[63]));
    for (let slot = 0; slot < 8; slot++) {
        const id = preset.cards[slot] || "B";
        if (slot >= cardSlots || (id !== "B" && (!knownCards.has(id) || !(Number(a.Cards[0].h[id]) > 0)))) {
            if (id !== "B")
                notes.push(clean(a.MonsterDefinitionsGET.h[id]?.h.Name || id) + ": card or card slot not unlocked.");
            retained.push(slot);
            cards[slot] = "B";
        } else cards[slot] = id;
    }
    for (const slot of retained) if (!cards.includes(a.Cards[2][slot])) cards[slot] = a.Cards[2][slot];
    if (cards.length < 8) throw new Error("Equipped card layout is unavailable.");
    // Slot by slot on both copies, as the prayers: the game saves CardEquip from Cards[2], so Undo puts both back
    // through the same slots.
    cards.forEach((id, slot) => {
        put(`Cards[2][${slot}]`, id);
        put(`${savedPath}CardEquip[${slot}]`, id);
    });
    const presetIndex = Number(a.PlayerStuff[2]);
    put(`CardPreset[${presetIndex}]`, cards.slice());
    put(`${savedPath}CardPreset[${presetIndex}]`, cards.slice());
    let setMap = {};
    if (preset.cardSet !== -1) {
        const setCards = lists.CardStuff[preset.cardSet].filter((row) => row[0] !== "Blank");
        const levels = setCards.map((row) => Number(cardLevel(row[0])));
        if (!levels.length || levels.some((l) => !Number.isFinite(l) || l < 0))
            throw new Error("Card set level is unavailable.");
        const set = lists.CardSets[preset.cardSet];
        const value = Math.round(Math.floor(levels.reduce((s, v) => s + v, 0) / levels.length) * Number(set[1]));
        if (!(value > 0)) {
            notes.push("Card set bonus is not unlocked; kept current set.");
            setMap = { ...a.Cards[3].h };
        } else setMap = { [set[0]]: value };
    }
    put("Cards[3].h", setMap);
    put(`${savedPath}CSetEq.h`, { ...setMap });
    sections.push({
        title: "Cards",
        set: preset.cardSetName || (preset.cardSet === -1 ? "None" : "Saved set"),
        items: cards.slice(0, 8).map((id) => (id === "B" ? "Empty" : clean(a.MonsterDefinitionsGET.h[id].h.Name))),
    });
    for (let group = 0; group < 2; group++) {
        if (preset.obolSlots && preset.obolSlots[group].length !== a.ObolEquippedOrder[group].length)
            throw new Error("Saved obol layout does not match this character.");
        a.ObolEquippedOrder[group].forEach((current, slot) => {
            if (/Locked/.test(current)) return;
            const shape = lists.ObolShapes[Number(lists.ObolXYcoords[group]?.[slot]?.[2])];
            const id = preset.obolSlots ? preset.obolSlots[group][slot] : preset.obols[shape];
            if (id === "Keep" || id === current) return;
            if (id === "Blank") {
                put(`ObolEquippedOrder[${group}][${slot}]`, id);
                put(`ObolEquippedMap[${group}][${slot}].h`, {});
                return;
            }
            const d = definition(id);
            if (d.typeGen !== "aObol" + shape) throw new Error("Obol shape does not match its destination.");
            put(`ObolEquippedOrder[${group}][${slot}]`, id);
            put(`ObolEquippedMap[${group}][${slot}].h`, perfectObolStats(d, primaryStat));
        });
    }
    sections.push({
        title: "Personal & family obols · unlocked slots",
        labels: preset.obolSlots
            ? preset.obolSlots.flatMap((row, group) =>
                  row.map(
                      (_, slot) =>
                          (group === 0 ? "Personal " : "Family ") +
                          lists.ObolShapes[Number(lists.ObolXYcoords[group]?.[slot]?.[2])] +
                          " obol"
                  )
              )
            : Object.keys(preset.obols).map((shape) => shape + " obol"),
        items: (preset.obolSlots ? preset.obolSlots.flat() : Object.values(preset.obols)).map((id) =>
            id === "Keep" ? "Keep" : id === "Blank" ? "Empty" : clean(definition(id).displayName)
        ),
    });
    // Only what differs from the game is written: a loadout that matches what's worn writes nothing.
    const now = (path) => parsePath(path).reduce((node, key) => node?.[key], a);
    const changed = writes.filter(({ path, value }) => JSON.stringify(now(path)) !== JSON.stringify(value));
    // The slots that change: an item, prayer, chip or card, or the card set. Their copies (the saved character, the
    // card preset) aren't slots, and the game's own save brings them up to date when no slot changes.
    const changes = changed.filter(({ path }) =>
        /^(EquipmentOrder|PrayersActive|Lab|Cards\[2\]|ObolEquippedOrder)\[|^Cards\[3\]/.test(path)
    ).length;
    return {
        writes: changes ? changed : [],
        changes,
        sections,
        world,
        baseClass,
        primaryStat,
        notes,
        presetId: preset.id,
        name: preset.name,
        character,
    };
}

/** The stack sizes a loadout's food gets: golden food keeps the largest golden stack seen, other food the capacity. */
export function foodStackLimits(attributes, capacity, goldenMaximum = 0) {
    planFoodStacks(attributes, 0);
    if (!Number.isSafeInteger(capacity) || capacity < 0 || !Number.isSafeInteger(goldenMaximum) || goldenMaximum < 0)
        throw new Error("Invalid food capacity.");
    let golden = Math.max(capacity, goldenMaximum);
    for (let slot = 0; slot < Number(attributes.FoodSlotsOwned); slot++) {
        if (/^FoodG[0-9]+$/.test(attributes.EquipmentOrder[2][slot]))
            golden = Math.max(golden, Number(attributes.EquipmentQuantity[2][slot]));
    }
    return { golden, regular: capacity };
}

/** After a loadout landed and the stats were worked out again: each equipped food stack set to its limit. */
export function foodStackWrites(attributes, limits) {
    const writes = [];
    for (let slot = 0; slot < Number(attributes.FoodSlotsOwned); slot++) {
        const id = attributes.EquipmentOrder[2][slot];
        if (id !== "Blank")
            writes.push({
                path: `EquipmentQuantity[2][${slot}]`,
                value: /^FoodG[0-9]+$/.test(id) ? limits.golden : limits.regular,
            });
    }
    return writes;
}

export function bestWardrobeTool(a, definitions, slot) {
    const skill = [1, 3, 4, 6, 7, 9, 0][slot];
    const level = Number(a.Lv0[skill]);
    if (!Number.isFinite(level)) throw new Error("Tool skill level is unavailable.");
    const candidates = Object.entries(definitions).filter(
        ([, { h: d }]) =>
            d.typeGen === TOOL_TYPES[slot] &&
            Number.isFinite(Number(d.lvReqToEquip)) &&
            Number(d.lvReqToEquip) <= level &&
            (d.Class === "ALL" || d.Class === wardrobeClass(Number(a.CharacterClass)).toUpperCase())
    );
    candidates.sort(
        ([, x], [, y]) =>
            Number(y.h.lvReqToEquip) - Number(x.h.lvReqToEquip) || Number(y.h.Weapon_Power) - Number(x.h.Weapon_Power)
    );
    return candidates[0]?.[0] || "Blank";
}

function portalRing(a) {
    const map = Number(a.CurrentMap);
    if (!Number.isInteger(map) || map < 0) throw new Error("Current world is unavailable for portal rings.");
    return (
        {
            1: "EquipmentRings33",
            2: "EquipmentRings31",
            3: "EquipmentRings32",
            4: "EquipmentRings34",
            5: "EquipmentRings37",
        }[Math.floor(map / 50)] || "Keep"
    );
}
