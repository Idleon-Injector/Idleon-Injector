/**
 * Game hooks
 *
 * A hook wraps one game method. Declare it with defineHook() in a file in src/cheats/hooks/; the build picks up
 * every file there (see rollup.config.mjs), so a new hook is just a new file. Copy hooks/_example.js to start.
 *
 * The core owns the wrapping: each hook installs on its own, a missing target is reported (getDefinedHookFailures)
 * instead of wrapped, no hook wraps the same object twice, every hook is tried again after character select, and
 * early hooks install the moment the game defines their class, before any of its actors exist.
 */

import { firebase, gameContext, registerCommonVariables } from "./globals.js";
import { setupCListProxy } from "../proxies/clist.js";
import { setupGameAttributeProxies } from "../proxies/gameAttributes.js";
import { setupItemProxies } from "../proxies/items.js";

const hooks = [];

/**
 * The game's class registry (window.__idleon_cheats__). Early hooks read classes from it before setup binds the
 * game globals; it is the same object setup gets as its context.
 */
export let game = null;

/**
 * Declare a hook on a game method.
 *
 * @param {object} spec
 * @param {string} spec.id - The feature the hook belongs to, e.g. "minigame"; failures are reported under it.
 * @param {() => object} [spec.target] - Returns the object that owns the method, e.g. `() => events(229).prototype`.
 *   Called at setup and again after character select; game globals are ready by then.
 * @param {string} [spec.early] - Instead of `target`: a class's registry key, e.g. "scripts.ActorEvents_116". The hook
 *   wraps `method` on that class's prototype as soon as the game defines it, before setup.
 * @param {string} spec.method - The method to wrap.
 * @param {boolean} [spec.around] - The handler decides when the game's method runs (see below). Only for hooks that
 *   can't run base-first: skipping the game's work, or changing state it reads while it runs.
 * @param {Function} handler - Called with the game's `this`. Base-first (default): `(base, ...args)`, where `base` is
 *   what the game's method returned; return the result. Around: `(callOriginal, ...args)`, where `callOriginal()`
 *   runs the game's method with the original arguments and returns its result.
 */
export function defineHook(spec, handler) {
    hooks.push({ ...spec, handler, wrapped: new WeakSet(), failure: null });
}

function install(hook) {
    let target;
    try {
        target = hook.early ? game[hook.early].prototype : hook.target();
    } catch {
        // A class or object a game update removed: reported below like a missing method.
    }
    if (target && hook.wrapped.has(target)) return;
    const original = target?.[hook.method];
    if (typeof original !== "function") {
        // ponytail: names the target by the getter's source ("events(229).prototype"); the bundle isn't minified.
        const where = hook.early ? `${hook.early}.prototype` : String(hook.target).replace(/^\(\)\s*=>\s*/, "");
        hook.failure = `${hook.id}: ${where}.${hook.method} not found`;
        return;
    }
    const { handler } = hook;
    target[hook.method] = hook.around
        ? function (...args) {
              return handler.call(this, () => Reflect.apply(original, this, args), ...args);
          }
        : function (...args) {
              return handler.call(this, Reflect.apply(original, this, args), ...args);
          };
    hook.wrapped.add(target);
    hook.failure = null;
}

/**
 * Install every hook that isn't installed yet: early ones first, as they would have been already. Hooks whose target
 * is missing are reported and tried again on the next call.
 */
export function installHooks() {
    game ??= gameContext;
    for (const hook of hooks) if (hook.early) install(hook);
    for (const hook of hooks) if (!hook.early) install(hook);
}

/**
 * Every hook that failed to install, as "id: target.method not found" lines.
 * @returns {string[]}
 */
export function getDefinedHookFailures() {
    return hooks.filter((hook) => hook.failure).map((hook) => hook.failure);
}

/** Watch one registry key and install its early hooks once the game has given the class its prototype. */
function watchEarlyClass(registry, key) {
    let classRef = registry[key];
    const tryHook = () => {
        // Haxe registers each constructor before assigning its prototype, which holds all its methods at once.
        const early = hooks.filter((hook) => hook.early === key);
        if (!early.some((hook) => typeof classRef?.prototype[hook.method] === "function")) return;
        early.forEach(install);
        Object.defineProperty(registry, key, { value: classRef, writable: true, configurable: true, enumerable: true });
    };
    Object.defineProperty(registry, key, {
        configurable: true,
        enumerable: true,
        get() {
            tryHook();
            return classRef;
        },
        set(cls) {
            classRef = cls;
            tryHook();
        },
    });
    tryHook();
}

/**
 * Install the early hooks before the game's script runs: cheats/main.js calls this as cheats.js loads, and the game's
 * script then assigns window.__idleon_cheats__ (the injector adds that line) and registers its classes.
 */
export function installEarlyHooks() {
    const watch = (registry) => {
        game = registry;
        for (const key of new Set(hooks.filter((hook) => hook.early).map((hook) => hook.early))) {
            watchEarlyClass(registry, key);
        }
    };
    let current = window.__idleon_cheats__;
    if (current) watch(current);
    Object.defineProperty(window, "__idleon_cheats__", {
        configurable: true,
        enumerable: true,
        get: () => current,
        set(registry) {
            current = registry;
            Object.defineProperty(window, "__idleon_cheats__", {
                value: registry,
                writable: true,
                configurable: true,
                enumerable: true,
            });
            watch(registry);
        },
    });
}

// Character select rebuilds some of the game's data, so the hooks on it go on again.
defineHook({ id: "core.reapply", target: () => firebase, method: "playButton" }, (base) => {
    registerCommonVariables(gameContext);
    // ponytail: the game-data hooks still guard themselves with _isPatched; #15 makes them defineHook hooks, which
    // installHooks() re-applies on its own.
    try {
        setupCListProxy();
        setupGameAttributeProxies();
        setupItemProxies();
    } catch (e) {
        console.error("Error re-applying proxies after character selection:", e);
    }
    installHooks();
    return base;
});
