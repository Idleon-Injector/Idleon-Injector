/**
 * Game hooks
 *
 * A hook wraps one game method, or one property of game data. Declare it with defineHook() in a file in
 * src/cheats/hooks/; the build picks up every file there (see rollup.config.mjs), so a new hook is just a new file.
 * Copy hooks/_example.js to start.
 *
 * The core owns the patching: each hook installs on its own, a missing target is reported (getHookFailures) instead
 * of patched, no hook patches the same object twice, every hook is tried again after character select, and early
 * hooks install the moment the game defines their class, before any of its actors exist. Hooks on the same method
 * wrap in the order they are declared (the first is innermost), so keep them in one file.
 */

import { firebase, gameContext, registerCommonVariables } from "./globals.js";

const hooks = [];

/**
 * The game's class registry (window.__idleon_cheats__). Early hooks read classes from it before setup binds the
 * game globals; it is the same object setup gets as its context.
 */
export let game = null;

/**
 * Declare a hook on a game method or property.
 *
 * @param {object} spec
 * @param {string} spec.id - The cheats the hook serves, e.g. "minigame"; failures are reported under it.
 * @param {() => object} [spec.target] - Returns the object that owns the method or property, e.g.
 *   `() => events(229).prototype`. Called at setup and again after character select; game globals are ready by then.
 * @param {() => object[]} [spec.targets] - Property hooks only, instead of `target`: every object to hook, e.g. each
 *   entry of a custom list. An empty list counts as missing.
 * @param {string} [spec.early] - Method hooks only, instead of `target`: a class's registry key, e.g.
 *   "scripts.ActorEvents_116". The hook wraps `method` on that class's prototype as soon as the game defines it,
 *   before setup.
 * @param {string} [spec.method] - The method to wrap.
 * @param {boolean} [spec.around] - The handler decides when the game's method runs (see below). Only for hooks that
 *   can't run base-first: skipping the game's work, changing its arguments, or changing state it reads while it runs.
 * @param {string|number} [spec.property] - Instead of `method`: the property to hook on each target. Reads and writes
 *   go through the handler: a getter `(stored) => value`, with writes dropped, or `{ get(stored), set(value, stored) }`,
 *   where `set` returns what to store. Without `get` a read gets the stored value; without `set` a write is stored.
 *   Both are called with the object read as `this`.
 * @param {boolean} [spec.proxy] - With `property`: replace the object the property holds with a Proxy, `handler` being
 *   its Proxy handler. For game data read by any index or name, e.g. the account options list.
 * @param {Function|object} handler - A method hook's handler is called with the game's `this`. Base-first (default):
 *   `(base, ...args)`, where `base` is what the game's method returned; return the result. Around:
 *   `(callOriginal, ...args)`, where `callOriginal(args?)` runs the game's method with the original arguments, or the
 *   given array, and returns its result.
 */
export function defineHook(spec, handler) {
    hooks.push({ ...spec, handler, wrapped: new WeakSet(), failure: null });
}

/** Every declared hook, in install order; for tests. */
export const listHooks = () => hooks.slice();

const isObject = (value) => Object(value) === value;

function wrapMethod(hook, target) {
    if (hook.wrapped.has(target)) return true;
    const original = target[hook.method];
    if (typeof original !== "function") return false;
    const { handler } = hook;
    target[hook.method] = hook.around
        ? function (...args) {
              return handler.call(this, (replaced = args) => Reflect.apply(original, this, replaced), ...args);
          }
        : function (...args) {
              return handler.call(this, Reflect.apply(original, this, args), ...args);
          };
    hook.wrapped.add(target);
    return true;
}

// A proxy hook is guarded by the object it replaces: the game may put a new one in the same place.
function proxyProperty(hook, target) {
    const value = target[hook.property];
    if (!isObject(value)) return false;
    if (hook.wrapped.has(value)) return true;
    const proxy = new Proxy(value, hook.handler);
    target[hook.property] = proxy;
    hook.wrapped.add(value).add(proxy);
    return true;
}

// An accessor is guarded by its getter, so one the game removed goes on again.
function defineAccessor(hook, target) {
    if (hook.wrapped.has(Object.getOwnPropertyDescriptor(target, hook.property)?.get)) return true;
    const { get, set } =
        typeof hook.handler === "function" ? { get: hook.handler, set: (_, kept) => kept } : hook.handler;
    let stored = target[hook.property];
    const getter = function () {
        return get ? get.call(this, stored) : stored;
    };
    Object.defineProperty(target, hook.property, {
        configurable: true,
        enumerable: true,
        get: getter,
        set(value) {
            stored = set ? set.call(this, value, stored) : value;
        },
    });
    hook.wrapped.add(getter);
    return true;
}

function install(hook) {
    let targets = [];
    try {
        if (hook.early) targets = [game[hook.early].prototype];
        else targets = hook.targets ? [...hook.targets()] : [hook.target()];
    } catch {
        // A class or object a game update removed: reported below like a missing method.
    }
    targets = targets.filter(isObject);
    const patch = hook.method ? wrapMethod : hook.proxy ? proxyProperty : defineAccessor;
    let found = targets.length > 0;
    for (const target of targets) if (!patch(hook, target)) found = false;
    if (found) {
        hook.failure = null;
        return;
    }
    // ponytail: names the target by the getter's source ("events(229).prototype"); the bundle isn't minified.
    const where = hook.early
        ? `${hook.early}.prototype`
        : String(hook.target ?? hook.targets).replace(/^\(\)\s*=>\s*/, "");
    hook.failure = `${hook.id}: ${where}.${hook.method ?? hook.property} not found`;
}

/**
 * Install every hook that isn't installed yet: early ones first, as they would have been already. Hooks whose target
 * is missing, or that throw while installing, are reported and tried again on the next call.
 */
export function installHooks() {
    game ??= gameContext;
    for (const hook of [...hooks.filter((h) => h.early), ...hooks.filter((h) => !h.early)]) {
        try {
            install(hook);
        } catch (error) {
            hook.failure = `${hook.id}: ${error.message}`;
        }
    }
}

/**
 * Every hook that failed to install, as "id: target.method not found" lines.
 * @returns {string[]}
 */
export function getHookFailures() {
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
    installHooks();
    return base;
});
