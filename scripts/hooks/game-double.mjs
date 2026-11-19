/**
 * Game classes and data for the hook behaviour tests (behaviour-*.test.mjs), on top of the fake game of
 * known-bugs/index.mjs. A test sets these up before setup, so the hooks wrap real methods it can call.
 */
import { importRepo, loadGame } from "../known-bugs/index.mjs";

/**
 * Load the fake game and return helpers. `game.base` is what every game method returns unless `game.returns`
 * names the method; either may be a function of the call's arguments. `game.calls` lists each call's method name.
 */
export async function loadHookGame() {
    const loaded = await loadGame({ setupDone: false });
    const { context, gga, state } = loaded;
    const game = { base: 10, returns: {}, calls: [] };
    const method = (name) =>
        function (...args) {
            game.calls.push(name);
            const result = name in game.returns ? game.returns[name] : game.base;
            return typeof result === "function" ? result.apply(this, args) : result;
        };
    // A game object whose every method exists and records its call; .prototype is one too.
    const methods = () =>
        new Proxy(
            {},
            {
                get(target, key, receiver) {
                    if (typeof key === "symbol" || key in target) return Reflect.get(target, key, receiver);
                    return (target[key] = key === "prototype" ? methods() : method(key));
                },
            }
        );
    // Every game class and script the hooks use, before setup reads them.
    for (let number = 0; number < 1000; number++) context[`scripts.ActorEvents_${number}`] = methods();
    for (const key of ["com.stencyl.behavior.Script", "FirebaseStorage", "scripts.CustomLists"]) {
        context[key] = methods();
    }
    context["com.stencyl.models.Actor"] = { prototype: methods() };
    /** The game class scripts.ActorEvents_<number>. */
    const events = (number) => context[`scripts.ActorEvents_${number}`];
    /** An actor of an ActorEvents class, with its own fields. */
    const actor = (number, fields = {}) => Object.assign(Object.create(events(number).prototype), fields);
    /** Turn a cheat on (or set it to `value`) by its path in cheatState, e.g. "w1.forge". */
    const set = (path, value = true) => {
        const keys = path.split(".");
        const last = keys.pop();
        let node = state.cheatState;
        for (const key of keys) node = node[key] ??= {};
        node[last] = value;
    };
    /** Run setup on the fake game. */
    const setup = async () => (await importRepo("src/cheats/core/setup.js")).setup.call(context);
    return { ...loaded, gga, game, methods, events, actor, set, setup };
}
