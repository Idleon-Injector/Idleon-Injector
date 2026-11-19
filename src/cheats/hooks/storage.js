/**
 * Storage hooks
 *
 * Early hooks: storage chests are built while the game loads, before setup, so these install as soon as the game
 * defines their classes.
 * - ActorEvents_116: counts written out in digits instead of "2e+10" while the storage chest builds its digit images
 * - ActorEvents_203: AFK storage deposits land as their real total with wide storagecap
 * - ActorEvents_481: storage, Atom Collider and condense timers pause with wide storagecap
 */

import { cheatState, startupCheats } from "../core/state.js";
import { gga } from "../core/globals.js";
import { defineHook, game } from "../core/hooks.js";
import { withStorageCapScope } from "../helpers/storageCap.js";

const quantityFormat = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 0 });
const formatCount = (val) => {
    if (typeof val !== "string") return val;
    const match = /^(\d+(?:\.\d+)?e\+?\d+)([A-Za-z]*)$/i.exec(val);
    return match ? quantityFormat.format(Number(match[1])) + match[2] : val;
};

const activeActors = new WeakSet();

for (const method of ["init", "_event_STORAGECHEST", "_event_AttacksPage"]) {
    // Around: the count fields are swapped while the game builds the digit images, and restored once it finishes.
    defineHook({ id: "storage", early: "scripts.ActorEvents_116", method, around: true }, function (callOriginal) {
        if (activeActors.has(this)) {
            return callOriginal();
        }

        // Init creates digit images before binding listeners or shortening the count.
        const fields = ["_dummytext", "_DummyText"].map((key) => {
            const descriptor = Object.getOwnPropertyDescriptor(this, key);
            let value = formatCount(this[key]);
            Object.defineProperty(this, key, {
                configurable: true,
                enumerable: descriptor ? descriptor.enumerable : true,
                get: () => value,
                set(next) {
                    value = formatCount(next);
                },
            });
            return () => {
                if (descriptor) {
                    if (descriptor.get || descriptor.set) {
                        Object.defineProperty(this, key, descriptor);
                        if (descriptor.set) descriptor.set.call(this, value);
                    } else {
                        Object.defineProperty(this, key, { ...descriptor, value });
                    }
                } else {
                    delete this[key];
                    if (value !== undefined) {
                        this[key] = value;
                    }
                }
            };
        });
        activeActors.add(this);
        try {
            return callOriginal();
        } finally {
            fields.forEach((restore) => restore());
            activeActors.delete(this);
        }
    });
}

// AFK storage deposits, preserving claim cleanup and remaining drops.
for (const method of ["_event_Click", "_customEvent_AutoClaimio"]) {
    // Around: the chest quantities are swapped for this one deposit (withStorageCapScope), so the call runs inside it.
    defineHook(
        { id: "wide.storagecap", early: "scripts.ActorEvents_203", method, around: true },
        function (callOriginal) {
            if (!cheatState.wide.storagecap) return callOriginal();
            let destination = -1;
            let total = null;
            return withStorageCapScope(callOriginal, {
                giveAtoms: () => {
                    const item = this._DummyText;
                    const drop = this._ItemsToDROP.find((entry) => entry[0] === item && Number(entry[1]) > 0);
                    if (!drop) return false;
                    const incoming = Number(drop[1]);
                    if (!Number.isFinite(incoming) || incoming <= 0) return false;
                    const order = gga.ChestOrder;
                    destination = order.indexOf(item);
                    if (destination >= 0) {
                        total = Math.round(Number(gga.ChestQuantity[destination]) + incoming);
                    } else {
                        destination = order.indexOf("Blank");
                        if (destination < 0) return false;
                        total = Math.round(incoming);
                    }
                    return true;
                },
                setQuantity(target, key, value) {
                    if (total !== null && Number(key) === destination && Number(value) === 105e7) {
                        value = total;
                        total = null;
                    }
                    return value;
                },
            });
        }
    );
}

// Before gameReady, follow the startup cheats without running or double-toggling them.
function startupStorageCap() {
    let storageCap = false;
    let wide = false;
    for (const command of startupCheats) {
        if (command === "wide") {
            wide = !wide;
            storageCap = wide;
        } else if (command === "wide storagecap") {
            storageCap = !storageCap;
        }
    }
    return storageCap;
}

// Storage and Collider timers, using the registry's Script: the first actors init before setup binds `behavior`.
// Around: runLater and runPeriodically are swapped while init schedules its timers, and restored once it finishes.
defineHook(
    { id: "wide.storagecap", early: "scripts.ActorEvents_481", method: "init", around: true },
    function (callOriginal) {
        const script = game["com.stencyl.behavior.Script"];
        const actor = this.actor;
        const runLater = script.runLater;
        const runPeriodically = script.runPeriodically;
        for (const name of ["runLater", "runPeriodically"]) {
            const Original = script[name];
            script[name] = function (...args) {
                const [delay, callback, target] = args;
                if (target === actor) {
                    const source = Function.prototype.toString.call(callback);
                    const cap =
                        name === "runLater" &&
                        delay === 500 &&
                        /(?:105[eE]7|1050000000)/.test(source) &&
                        source.includes("ChestQuantity") &&
                        source.includes("GiveAtoms");
                    const collider =
                        name === "runLater" &&
                        delay === 6000 &&
                        source.includes("AtomThreshold") &&
                        source.includes("GiveAtoms");
                    const condense = name === "runPeriodically" && delay === 6000 && source.includes("CondenseChest2B");
                    if (cap || collider || condense) {
                        args[1] = function (...args) {
                            if (cheatState.wide.storagecap || (gga === null && startupStorageCap())) return;
                            return Reflect.apply(callback, this, args);
                        };
                    }
                }
                return Reflect.apply(Original, this, args);
            };
        }
        try {
            return callOriginal();
        } finally {
            script.runLater = runLater;
            script.runPeriodically = runPeriodically;
        }
    }
);
