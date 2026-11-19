import { gga } from "../core/globals.js";

/** The handlers of the deposit in progress, which the storagecap hooks in hooks/storagecap.js consult. */
export let activeScope = null;

/**
 * Run a synchronous deposit with its storage handlers active, restoring nested scopes on exit.
 * While it runs, the chest's quantity writes go through `handlers.setQuantity`, an atom award asks
 * `handlers.giveAtoms`, and an item grant goes through the optional `handlers.giveItem`.
 * @param {function} callback - Original game call
 * @param {object} handlers - Atom, quantity-write and optional item-grant handlers
 * @returns {*} Original game result
 */
export function withStorageCapScope(callback, handlers) {
    const quantities = gga.ChestQuantity;
    const previousScope = activeScope;
    activeScope = handlers;
    try {
        // ponytail: swapped for this one call only; a lasting proxy would have to follow every chest the game builds.
        gga.ChestQuantity = new Proxy(quantities, {
            set(target, key, value) {
                if (activeScope === handlers) {
                    value = handlers.setQuantity(target, key, value);
                }
                return Reflect.set(target, key, value);
            },
        });
        return callback();
    } finally {
        gga.ChestQuantity = quantities;
        activeScope = previousScope;
    }
}
