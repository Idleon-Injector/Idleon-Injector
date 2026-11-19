/**
 * ActorEvents_481 hooks (the storage timers on init are an early hook in storage.js)
 *
 * - anotherThing (printer storage deposits)
 * - WorkbenchStuff2 (better cogs RNG)
 */

import { cheatState } from "../core/state.js";
import { events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { withStorageCapScope } from "../helpers/storageCap.js";

// Around: the deposit runs as a storagecap deposit, watching the printed amount and chest writes while it runs.
defineHook(
    { id: "wide.storagecap", target: () => events(481).prototype, method: "_customEvent_anotherThing", around: true },
    function (callOriginal) {
        if (!cheatState.wide.storagecap || !this._TRIGGEREDtext.includes("d")) {
            return callOriginal();
        }
        const descriptor = Object.getOwnPropertyDescriptor(this, "_DNprint");
        let printValue = this._DNprint;
        let produced = null;
        return withStorageCapScope(
            () => {
                // ponytail: this actor's field is watched for this one call only, like the chest in the scope.
                Object.defineProperty(this, "_DNprint", {
                    configurable: true,
                    enumerable: descriptor ? descriptor.enumerable : true,
                    get: () => printValue,
                    set(value) {
                        printValue = value;
                        if (produced === null) produced = value;
                    },
                });
                try {
                    return callOriginal();
                } finally {
                    if (descriptor?.get || descriptor?.set) {
                        Object.defineProperty(this, "_DNprint", descriptor);
                        if (descriptor.set) descriptor.set.call(this, printValue);
                    } else if (descriptor) {
                        Object.defineProperty(this, "_DNprint", { ...descriptor, value: printValue });
                    } else {
                        delete this._DNprint;
                        if (printValue !== undefined) {
                            this._DNprint = printValue;
                        }
                    }
                }
            },
            {
                giveAtoms() {
                    return produced !== null;
                },
                setQuantity(target, key, value) {
                    if (produced !== null && Number(value) === 105e7) return target[key];
                    return value;
                },
                giveItem(args, callBase) {
                    if (
                        produced === null ||
                        !Number.isFinite(produced) ||
                        produced <= 0 ||
                        gga.DummyText2 !== "YESputInChest8910nocap"
                    ) {
                        produced = null;
                        return callBase();
                    }
                    args[1] = Math.round(produced);
                    try {
                        return callBase();
                    } finally {
                        produced = null;
                    }
                },
            }
        );
    }
);

// Around: the cog's roll is forced by setting RNG before the game rolls, and freed after.
defineHook(
    { id: "w3.bettercog", target: () => events(481).prototype, method: "_customEvent_WorkbenchStuff2", around: true },
    function (callOriginal) {
        if (cheatState.w3.bettercog && this._TRIGGEREDtext.includes("k")) {
            cheatState.rng = "high";
            const base = callOriginal();
            cheatState.rng = false;
            return base;
        }

        return callOriginal();
    }
);
