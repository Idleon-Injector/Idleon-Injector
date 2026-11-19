/**
 * Wide storagecap hooks on the two methods a deposit goes through (the deposits themselves are hooked in
 * events189.js, events481.js and storage.js; helpers/storageCap.js runs them as a scope)
 *
 * - GiveItem: an item grant lands as its real total; a deposit in progress may change the grant
 * - ActionBlock: chest condensing does nothing; a deposit in progress may skip its atom award
 *
 * Each method's second hook wraps its first, so a deposit sees the grant or action before storagecap's own.
 */

import { cheatState } from "../core/state.js";
import { events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { activeScope, withStorageCapScope } from "../helpers/storageCap.js";

// Around: the grant runs as a deposit, which watches the chest writes the game makes while it runs.
defineHook(
    { id: "wide.storagecap", target: () => events(124), method: "_customBlock_GiveItem", around: true },
    (callOriginal, ...args) => {
        if (!cheatState.wide.storagecap) return callOriginal();
        const order = gga.ChestOrder.slice();
        return withStorageCapScope(callOriginal, {
            giveAtoms: () => false,
            setQuantity(target, key, value) {
                if (Number(value) !== 2e9 || order[key] !== args[0]) return value;
                const grant = gga.DummyNumbersStatManager.h;
                // Only lift the merge ceiling; keep regular capacity splits and new-slot writes.
                if (grant.ItemGiverDT22 !== "YESputInChest8910nocap" && Number(grant.ItemGiverMaxCap) <= 2e9) {
                    return value;
                }
                const incoming = Number(grant.ItemGiverAmount);
                return Number.isFinite(incoming) ? Number(target[key]) + incoming : value;
            },
        });
    }
);

// Around: a deposit in progress may change the grant's arguments before the game gives it.
defineHook(
    { id: "wide.storagecap", target: () => events(124), method: "_customBlock_GiveItem", around: true },
    (callOriginal, ...args) =>
        activeScope?.giveItem ? activeScope.giveItem(args, () => callOriginal(args)) : callOriginal()
);

// Around: condensing only awards atoms and destroys overflow, so it must not run at all.
defineHook(
    { id: "wide.storagecap", target: () => events(345), method: "_customBlock_ActionBlock", around: true },
    (callOriginal, key) => {
        if (cheatState.wide.storagecap && key === "CondenseChest2B") return;
        return callOriginal();
    }
);

// Around: an atom award can't be undone by changing its result, so a deposit may skip it.
defineHook(
    { id: "wide.storagecap", target: () => events(345), method: "_customBlock_ActionBlock", around: true },
    (callOriginal, ...args) => {
        if (activeScope && args[0] === "GiveAtoms" && activeScope.giveAtoms(args)) return;
        return callOriginal();
    }
);
