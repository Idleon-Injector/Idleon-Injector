/**
 * ActorEvents_189 hooks (its 1-second trap timer is in trapping.js)
 *
 * - AnvilProduceStats (anvil cost nullification, production speed; storagecap quick deposits)
 * - CauldronStats (alchemy cheats)
 * - chipBonuses (chip bonus modifications)
 * - MealBonus (meal bonus modifications)
 * - MenagerieStuff (Luminous Menagerie dispatch overrides)
 * - JellyOperation (Jelly Operator dispatch overrides)
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { configLookup } from "../utils/configLookup.js";
import { withStorageCapScope } from "../helpers/storageCap.js";

// Anvil production stats (cost nullification, production speed)
defineHook({ id: "w1.anvil", target: () => events(189), method: "_customBlock_AnvilProduceStats" }, (base, key) => {
    if (cheatState.w1.anvil) {
        if (key === "Costs1" || key === "Costs2") return 0;
        if (key === "ProductionSpeed") return cheatConfig.w1.anvil.productionspeed(base);
    }
    return base;
});

// Around: the quick deposit runs as a storagecap deposit, which watches the chest writes the game makes while it runs.
// It wraps the anvil hook above.
defineHook(
    { id: "wide.storagecap", target: () => events(189), method: "_customBlock_AnvilProduceStats", around: true },
    (callOriginal, key) => {
        if (!cheatState.wide.storagecap || (key !== "QuickDespositALL" && key !== "QuickDespositALLautoALL")) {
            return callOriginal();
        }
        const sources =
            key === "QuickDespositALL"
                ? [gga.AnvilPA]
                : Object.values(gga.PlayerDATABASE.h).map((player) => player.h.AnvilPA);
        return withStorageCapScope(callOriginal, {
            giveAtoms: () => false,
            setQuantity(target, slot, value) {
                if (Number(value) !== 2e9 || Number(slot) !== Number(gga.DNSM.h.AnvilPAqd2)) return value;
                // The base clears each source row after its quantity write and experience award.
                const production = Number(gga.DNSM.h.AnvilPAqd3);
                const source = sources.find((rows) => rows[production] && Number(rows[production][0]) > 0);
                const incoming = Number(source[production][0]);
                return Number.isFinite(incoming) ? Number(target[slot]) + incoming : value;
            },
        });
    }
);

// Cauldron stats (alchemy cheats)
defineHook(
    { id: "w2.alchemy", target: () => events(189), method: "_customBlock_CauldronStats" },
    configLookup([{ state: "w2.alchemy" }])
);

// Chip bonuses
defineHook(
    { id: "w4.chipbonuses", target: () => events(189), method: "_customBlock_chipBonuses" },
    configLookup([{ state: "w4.chipbonuses" }])
);

// Meal bonuses
defineHook(
    { id: "w4.meals", target: () => events(189), method: "_customBlock_MealBonus" },
    configLookup([{ state: "w4.meals" }])
);

// Menagerie dispatch; identity defaults preserve every game result.
defineHook(
    { id: "w7.menagerie", target: () => events(189), method: "_customBlock_MenagerieStuff" },
    configLookup([{ state: "w7.menagerie" }])
);

// Jelly Operator dispatch; the original method must run before any configured override.
defineHook(
    { id: "w7.jelly", target: () => events(189), method: "_customBlock_JellyOperation" },
    configLookup([{ state: "w7.jelly" }])
);
