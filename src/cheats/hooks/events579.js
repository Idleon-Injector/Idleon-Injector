/**
 * ActorEvents_579 hooks (W5/W6/W7 content)
 *
 * - Summoning (owl, roo, endless, summoning, grimoire), Summoning2 (vote bonus)
 * - Thingies (hoops/darts shop, zenith, clam, reef, coral kid, sneak symbol; global shrines)
 * - Holes (W5 holes)
 * - Sailing (sailing cheats, global shrines, ender captains)
 * - GamingStatType, Divinity, AtomCollider (W5)
 * - Dreamstuff (instant dreams), TalentEnh (plunderous)
 * - FarmingStuffs, Ninja, Windwalker, ArcaneType, RoyalG (W6)
 * - Bubbastuff, Minehead, ResearchStuff, Spelunk, Gallery, SushiStuff (W7)
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { behavior, cList, events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { configLookup } from "../utils/configLookup.js";

const FOUNTAIN_KEYS = new Set([
    "Cost_FountainUPG",
    "Fount_RoyalChance",
    "Fount_RoyalMulti",
    "Fount_MarblePerFill",
    "Fount_MarbleizeCost",
]);

defineHook(
    {
        id: "w1.owl, w2.roo, w6.endless, w6.summoning, w6.sumunit, w6.grimoire",
        target: () => events(579),
        method: "_customBlock_Summoning",
    },
    configLookup([
        { state: "w1.owl" },
        { state: "w2.roo" },
        { state: "w6.endless", fixedKey: "EndlessModifierID", value: 1 },
        { state: "w6.summoning" },
        { state: "w6.sumunit" },
        { state: "w6.grimoire" },
    ])
);

// Summoning2 calculates individual Ballot and Meritocracy bonuses; Summoning supplies their current multiplier.
defineHook(
    { id: "wide.votebonus", target: () => events(579), method: "_customBlock_Summoning2" },
    function (base, key, bonusIndex) {
        if (cheatState.wide.votebonus) {
            const sceneName = behavior.getCurrentSceneName();
            if (sceneName === "GemShop" || sceneName.includes("Tutorial") || sceneName === "PlayerSelect") return base;
        }
        if (cheatState.wide.votebonus && key === "MeritocBonusz") {
            const value = Number(cList.NinjaInfo[41][Math.round(1 + 3 * bonusIndex)]);
            return value * this._customBlock_Summoning("MeritocBonuszMulti", 0, 0);
        }
        if (cheatState.wide.votebonus && key === "VotingBonusz") {
            const value = Number(cList.NinjaInfo[38][Math.round(1 + 3 * bonusIndex)]);
            return value * this._customBlock_Summoning("VotingBonuszMulti", 0, 0);
        }
        return base;
    }
);

defineHook(
    {
        id: "wide.giant, wide.hoopshop, wide.dartshop, w7.zenith, w7.clam, w7.reef, w7.coralkid, w6.sneaksymbol",
        target: () => events(579),
        method: "_customBlock_Thingies",
    },
    configLookup([
        { state: "wide.giant", fixedKey: "GuaranteedCrystalMobs", value: 0 },
        { state: "wide.hoopshop" },
        { state: "wide.dartshop" },
        { state: "w7.zenith" },
        { state: "w7.clam" },
        { state: "w7.reef" },
        { state: "w7.coralkid" },
        { state: "w6.sneaksymbol" },
    ])
);

// Shrine World Order Bill: shrine EXP from every world. Wraps the lookup above.
defineHook(
    { id: "w3.globalshrines", target: () => events(579), method: "_customBlock_Thingies" },
    (base, key, index, bonusValue) => {
        if (cheatState.w3.globalshrines && key === "LegendPTS_bonus" && index === 38 && bonusValue === 0) {
            return Math.max(1, base);
        }
        return base;
    }
);

// Holes (W5)
defineHook({ id: "w5.holes", target: () => events(579), method: "_customBlock_Holes" }, (base, ...args) => {
    const key = args[0];
    if (cheatState.w5.holes && !FOUNTAIN_KEYS.has(key) && cheatConfig.w5.holes[key]) {
        return cheatConfig.w5.holes[key](base, args);
    }
    return base;
});

defineHook({ id: "w5.holes", target: () => events(579), method: "_customBlock_Holes2" }, (base, ...args) => {
    const key = args[0];
    if (cheatState.w5.holes && FOUNTAIN_KEYS.has(key) && cheatConfig.w5.holes[key]) {
        return cheatConfig.w5.holes[key](base, args);
    }
    return base;
});

// Sailing (W5): kept manual due to complex side-effects and context usage in endercaptains
defineHook(
    { id: "w5.sailing, w3.globalshrines, w5.endercaptains", target: () => events(579), method: "_customBlock_Sailing" },
    function (base, key, index, bonusValue) {
        // Moai Head: shrine bonuses from every map
        const globalShrineBonus =
            cheatState.w3.globalshrines && key === "ArtifactBonus" && index === 0 && bonusValue === 0;

        if (cheatState.w5.sailing && cheatConfig.w5.sailing[key]) {
            const configured = cheatConfig.w5.sailing[key](base);
            return globalShrineBonus ? Math.max(1, configured) : configured;
        }

        if (globalShrineBonus) return Math.max(1, base);

        if (cheatState.w5.endercaptains && key === "CaptainPedastalTypeGen") {
            const hasEmporiumBonus = this._customBlock_Ninja("EmporiumBonus", 32, 0) === 1;
            const hasRequiredLevel = Number(gga.Lv0[13]) >= 50;
            if (hasEmporiumBonus && hasRequiredLevel) {
                gga.DNSM.h.SailzDN4 = 6;
                return 6;
            }
        }
        return base;
    }
);

// The remaining config lookups: [method, the cheats it answers for]. Each hook is reported under its cheats.
for (const [method, mappings] of [
    ["_customBlock_GamingStatType", [{ state: "w5.gaming" }]],
    ["_customBlock_Divinity", [{ state: "w5.divinity" }]],
    ["_customBlock_AtomCollider", [{ state: "w5.collider" }]],
    ["_customBlock_Dreamstuff", [{ state: "w3.instantdreams", fixedKey: "BarFillReq", value: 0 }]],
    ["_customBlock_FarmingStuffs", [{ state: "w6.farming" }]],
    ["_customBlock_Ninja", [{ state: "w6.ninja" }]],
    ["_customBlock_Windwalker", [{ state: "w6.windwalker" }]],
    ["_customBlock_ArcaneType", [{ state: "w6.arcane" }]],
    ["_customBlock_RoyalG", [{ state: "w6.royal" }]],
    ["_customBlock_Bubbastuff", [{ state: "w7.bubba" }]],
    ["_customBlock_Minehead", [{ state: "w7.minehead" }, { state: "w7.glimbo" }]],
    ["_customBlock_ResearchStuff", [{ state: "w7.research" }]],
    ["_customBlock_Spelunk", [{ state: "w7.spelunk" }, { state: "w7.bigfish" }, { state: "w7.spelunkmana" }]],
    ["_customBlock_Gallery", [{ state: "w7.gallery" }]],
    ["_customBlock_SushiStuff", [{ state: "w7.sushi" }]],
]) {
    const id = mappings.map((mapping) => mapping.state).join(", ");
    defineHook({ id, target: () => events(579), method }, configLookup(mappings));
}

// Talent enhancement (plunderous mob spawn rate)
defineHook({ id: "wide.plunderous", target: () => events(579), method: "_customBlock_TalentEnh" }, (base, key) => {
    if (cheatState.wide.plunderous && key === 318) return 100;
    return base;
});
