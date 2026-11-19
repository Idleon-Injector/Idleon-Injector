/**
 * ActorEvents_38 hooks: inventory item use
 *
 * - Item move (candy use anywhere, divinity pearl unlock)
 * - Item misc (mystery stone stat targeting)
 */

import { cheatState } from "../core/state.js";
import { itemDefs, events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

// Around: candy changes the map the game reads while it runs; the divinity pearl skips the game's use.
defineHook(
    {
        id: "wide.candy, unlock.divinitypearl",
        target: () => events(38).prototype,
        method: "_event_InvItem4custom",
        around: true,
    },
    function (callOriginal) {
        const actor = this.actor;

        const inventoryOrder = gga.InventoryOrder;
        const dragId = actor.getValue("ActorEvents_38", "_ItemDragID");
        const itemKey = inventoryOrder[dragId];

        if (cheatState.wide.candy) {
            const itemType = itemDefs[itemKey].h.Type;
            if (itemType === "TIME_CANDY") {
                const originalMap = gga.CurrentMap;
                const originalTarget = gga.AFKtarget;
                const pixelHelper = gga.PixelHelperActor;
                const genInfo = pixelHelper[23].getValue("ActorEvents_577", "_GenINFO");
                if (Array.isArray(genInfo)) {
                    genInfo[86] = 1;
                }
                if (originalTarget === "Cooking" || originalTarget === "Laboratory") {
                    const newTarget = {
                        calls: 0,
                        [Symbol.toPrimitive](_hint) {
                            if (this.calls < 2) {
                                this.calls++;
                                return "mushG";
                            }
                            gga.AFKtarget = originalTarget;
                            return originalTarget;
                        },
                    };

                    gga.AFKtarget = newTarget;
                }
                gga.CurrentMap = 1;
                const base = callOriginal();
                gga.CurrentMap = originalMap;
                gga.AFKtarget = originalTarget;
                return base;
            }
        }

        // cheat for divinitypearl, we skip the ingame and just set the exp to the skill
        if (cheatState.unlock.divinitypearl && itemKey === "Pearl6") {
            if (this._PixelType === 2 && this._DummyType2Dead === 7) {
                const expType = gga.ExpType;
                const exp0 = gga.Exp0;
                const expReq0 = gga.ExpReq0;
                const currentMap = gga.CurrentMap;

                let targetSkill;
                if (currentMap === 0) targetSkill = 2;
                else if (currentMap === 50) targetSkill = 5;
                else if (currentMap === 100) targetSkill = 8;
                else targetSkill = expType;

                // Add 40% XP to current skill
                exp0[targetSkill] = Number(exp0[targetSkill]) + 0.4 * Number(expReq0[targetSkill]);

                return; // Skip original function entirely
            }
        }

        return callOriginal();
    }
);

// Around: the stone's roll is forced by setting RNG before the game rolls, and freed after.
defineHook(
    { id: "upstones.misc", target: () => events(38).prototype, method: "_event_InventoryItem", around: true },
    function (callOriginal) {
        if (!cheatState.upstones.misc) return callOriginal();

        const dragId = this.actor.getValue("ActorEvents_38", "_ItemDragID");
        const inventory = gga.InventoryOrder;
        const item = itemDefs[inventory[dragId]].h;

        const isMysteryStone = item.typeGen === "dStone" && item.Effect.startsWith("Mystery_Stat");

        if (isMysteryStone) {
            cheatState.rng = 0.85; // First random roll for Misc stat
            cheatState.rngInt = "high"; // 2nd random roll for positive value

            const base = callOriginal();

            cheatState.rng = false;
            cheatState.rngInt = false;
            return base;
        }

        return callOriginal();
    }
);
