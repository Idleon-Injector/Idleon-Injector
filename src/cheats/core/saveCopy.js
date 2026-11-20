/**
 * Save copies (#32), the game side: turn the save into JSON and keep the newest one until the server takes it.
 *
 * The hook on the game's cloud save (hooks/firebase.js) calls captureSaveCopy() right after each save. The page
 * makes no network calls, so the copy waits here; the injector's server pulls it over CDP with takeSaveCopy() and
 * writes it to disk (src/modules/saveCopies.js). readSave() gives the server the save as it is now, for a compare.
 */

import { gga } from "./globals.js";

// What the game's cloud save (_customBlock_CloudSAVE) reads with getGameAttribute, minus its scratch values (DNSM,
// DummyList, DummyList2, DummyMap, DummyNumber, DummyText, DummyText3) and the two that go in the copy's header
// (UserInfo, GetPlayersUsernames). Other characters are in PlayerDATABASE.
// ponytail: a fixed list from the game version of 2026-11; a key a game update adds is missing from the copies until
// it is added here, and one it removes is skipped.
// prettier-ignore
const SAVE_KEYS = [
    "AFKtarget", "AchieveReg", "AnvilCraftStatus", "AnvilPA", "AnvilPAselect", "AnvilPAstats", "ArcUnclaim",
    "ArcadeUpg", "Arcane", "Atoms", "AttackCooldowns", "AttackLoadout", "BGselected", "BGunlocked", "Boats",
    "BossInfo", "Breeding", "BribeStatus", "Bubba", "BuffsActive", "BugInfo", "BundlesReceived", "Captains",
    "CardPreset", "Cards", "CauldronBubbles", "CauldronInfo", "CauldronJobs", "CauldronP2W", "CharacterClass",
    "ChestMap", "ChestOrder", "ChestQuantity", "CloudsaveTimer", "CogMap", "CogOrder", "Compass", "CookMaster",
    "Cooking", "CurrenciesOwned", "CurrentMap", "Divinity", "DoOnceREAL", "Dream", "DungUpg", "EquipmentMap",
    "EquipmentOrder", "EquipmentQuantity", "Exp0", "ExpReq0", "FamilyValuesMap", "FarmCrop", "FarmPlot", "FarmRank",
    "FarmUpg", "FlagUnlock", "FlagsPlaced", "FoodCooldowns", "FoodSlotsOwned", "ForgeIntervalProgress",
    "ForgeItemOrder", "ForgeItemQuantity", "FurnaceLevels", "Gaming", "GamingSprout", "GemItemsPurchased", "GemsOwned",
    "GemsPacksPurchased", "GreenStacks", "Grimoire", "GuildTasks", "HintStatus", "Holes", "InvBagsUsed",
    "InvStorageUsed", "InventoryOrder", "ItemMap", "ItemQuantity", "Jars", "KRbest", "KillsLeft2Advance", "Lab",
    "LockedSlots", "Lv0", "MapBon", "MaxCarryCap", "Meals", "Menagerie", "Money", "MoneyBANK", "NPCdialogue", "Ninja",
    "ObolEquippedMap", "ObolEquippedOrder", "ObolInventoryMap", "ObolInventoryOrder", "ObolInventorySlotsOwned",
    "OptionsList", "OptionsListAccount", "PersonalValuesMap", "Pets", "PetsStored", "PlacedTraps", "PlayerDATABASE",
    "PlayerStuff", "PostOfficeInfo", "PrayersActive", "PrayersUnlocked", "Printer", "PrinterXtra", "QuestComplete",
    "QuestHelperMenu", "QuestStatus", "Refinery", "Research", "RespawnTime", "Ribbon", "Rift", "RoyalG", "RoyalMaps",
    "SailChests", "Sailing", "SaltLick", "ServerGemsReceived", "ShopStock", "ShrineInfo", "SkillLevels",
    "SkillLevelsMAX", "Spelunk", "StampLevel", "StampLevelMAX", "StarSignProg", "StarSignsUnlocked", "StatueG",
    "StatueLevels", "SteamAchieve", "Summon", "Sushi", "TalPresetATTACKS", "TalPresetLISTS", "Tasks", "Territory",
    "Tess", "TimeAway", "TotemInfo", "TowerInfo", "UpgVault", "WeeklyBoss",
];

// Haxe numbers each map it hands to a closure (__id__) and keeps bound closures on objects (hx__closures__): neither
// is save data. Infinity and NaN become null, as they do in the game's own JSON saves.
const dropHaxeFields = (key, value) => (key === "__id__" || key === "hx__closures__" ? undefined : value);

/**
 * The save as it is now, as JSON: `{ character, players, save }`, `character` being the one in play.
 * @returns {string}
 */
export function readSave() {
    const save = {};
    for (const key of SAVE_KEYS) if (key in gga) save[key] = gga[key];
    return JSON.stringify({ character: gga.UserInfo[0], players: gga.GetPlayersUsernames, save }, dropHaxeFields);
}

let pending = null;

/** Keep the save the game just sent to the cloud until the server takes it; a newer one replaces it. */
export function captureSaveCopy() {
    try {
        pending = { time: Date.now(), json: readSave() };
    } catch (error) {
        // The copy must never break the game's save: the server reports this as a warning.
        pending = { time: Date.now(), error: String(error?.message ?? error) };
    }
}

/**
 * The newest copy the server hasn't taken yet, or null. Taking it clears it.
 * @returns {{ time: number, json?: string, error?: string } | null}
 */
export function takeSaveCopy() {
    const copy = pending;
    pending = null;
    return copy;
}
