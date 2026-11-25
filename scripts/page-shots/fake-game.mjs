/**
 * A fake game for the page screenshots: the real game-side WebUI API (src/cheats/api, the path resolver,
 * the cheat list) running in Node over game data from fake-game-data.mjs, behind a fake CDP Runtime that the
 * server's real routes evaluate against. Same data every run, so the screenshots only change when the UI does.
 */
import { createRequire } from "node:module";
import vm from "node:vm";
import { importRepo } from "../known-bugs/index.mjs";
import { fakeGameData } from "./fake-game-data.mjs";

/**
 * Build the fake game from the data. Returns the CDP-shaped `runtime` and `misses`, the reads the
 * data couldn't answer (path -> error), so a page that shows little can be given more data.
 */
export async function createFakeGame(fixture = fakeGameData()) {
    // The resolver falls back to `window` for paths that don't start with gga.
    globalThis.window ??= {};
    const rollup = await importRepo("rollup.config.mjs");
    for (const file of rollup.cheatFiles()) await importRepo(`src/cheats/cheats/${file}`);
    for (const file of rollup.automationFiles()) await importRepo(`src/cheats/automations/${file}`);
    const globals = await importRepo("src/cheats/core/globals.js");
    // The game's live config: its own copy of config.js's defaults (the server keeps another), then what the WebUI
    // sends. Automations read it while they run; the server reads it back as the real game's.
    const require = createRequire(import.meta.url);
    const { deepClone } = require("../../src/modules/utils/objectUtils.js");
    const state = await importRepo("src/cheats/core/state.js");
    state.setCheatConfig(deepClone(require("../../config.js").cheatConfig));
    const paths = await importRepo("src/cheats/utils/pathResolver.js");
    const accessors = await importRepo("src/cheats/api/stateAccessors.js");
    const { getAutoCompleteSuggestions } = await importRepo("src/cheats/api/suggestions.js");
    const { getGgaKeys, searchGga } = await importRepo("src/cheats/api/search.js");
    const { getBundleCatalog } = await importRepo("src/cheats/helpers/bundles.js");
    const { getHookFailures } = await importRepo("src/cheats/core/hooks.js");
    const { readSave, takeSaveCopy } = await importRepo("src/cheats/core/saveCopy.js");
    const { runCheat } = await importRepo("src/cheats/core/registration.js");

    const gga = fixture.gga;
    const computed = fixture.computed ?? {};
    // Every events(N) method answers from `computed` (a value, or a function of the call's other arguments),
    // 0 when the fixture has nothing.
    const answer = (method, name, ...args) => {
        const value = computed[method]?.[name];
        return (typeof value === "function" ? value(...args) : value) ?? 0;
    };
    const actorEvents = new Proxy({}, { get: (_, method) => answer.bind(null, method) });
    const context = new Proxy(
        {
            // The scene a character plays in; automations buy only there.
            "com.stencyl.Engine": { engine: { gameAttributes: { h: gga }, scene: { name: fixture.scene ?? "" } } },
            // As in the game, the scene name is the engine scene's (getScene().name).
            "com.stencyl.behavior.Script": {
                getCurrentSceneName: () => context["com.stencyl.Engine"].engine.scene.name,
            },
            "scripts.CustomMapsREAL": { GemPopupBundleMessages: () => ({ h: fixture.bundleMessages ?? {} }) },
            // The pets the account owns, as the game's server copy lists them ("id,x,y,z,plus").
            FirebaseStorage: { getCompanionInfoMe: () => structuredClone(fixture.companions ?? []) },
        },
        {
            get: (target, key) =>
                target[key] ?? (String(key).startsWith("scripts.ActorEvents_") ? actorEvents : undefined),
        }
    );
    globals.registerCommonVariables(context);

    const misses = new Map();
    // A read that fails, or finds nothing where the game would have a value.
    const noteMiss = (path, result) => {
        if (result?.error || result?.value === undefined) misses.set(path, result?.error ?? "no value");
        return result;
    };
    const page = {
        ctx: {},
        readGamePath: (path) => noteMiss(path, paths.readPath(path)),
        readGamePaths: (list) => {
            const result = paths.readPaths(list);
            for (const entry of result.results ?? []) {
                if (!entry.ok || entry.value === undefined) misses.set(entry.path, entry.error ?? "no value");
            }
            return result;
        },
        readGameEntries: (rootPath, keys, fields) => noteMiss(rootPath, paths.readEntries(rootPath, keys, fields)),
        readComputedValue: (ns, name, args) => noteMiss(`${ns}.${name}`, accessors.readComputed(ns, name, args)),
        readComputedValues: (ns, name, argSets) =>
            noteMiss(`${ns}.${name}`, accessors.readComputedMany(ns, name, argSets)),
        writeGamePath: paths.writePath,
        writeGamePaths: accessors.writePaths,
        deleteGamePath: paths.deletePath,
        getAutoCompleteSuggestions,
        getBundleCatalog,
        getGgaKeys,
        searchGga,
        getHookFailures,
        readSave,
        takeSaveCopy,
        cheatStateList: () => structuredClone(fixture.cheatStates ?? {}),
        // Cheats answer without running, but for the ones that only read, which a page shows: Sushi's status says its
        // board is closed, as the game would.
        cheat: (action) =>
            action === "w7 sushitools status" ? runCheat(action, {}) : { ok: true, message: `${action} (fake game)` },
        readCheatConfig: state.readCheatConfig,
        updateCheatConfig: state.updateCheatConfig,
        monitorWrap: () => ({ ok: true }),
        monitorUnwrap: () => ({ ok: true }),
        monitorUnwrapAll: () => ({ ok: true }),
    };
    page.window = page;
    const sandbox = vm.createContext(page);

    // The game bridge sends `name(args)` / `name.call(ctx, args)` with awaitPromise and returnByValue.
    const runtime = {
        async evaluate({ expression }) {
            try {
                const value = await vm.runInContext(expression, sandbox);
                return { result: { value: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) } };
            } catch (error) {
                return { result: {}, exceptionDetails: { text: String(error) } };
            }
        },
    };
    // `page` holds what the game exposes, so a test can make one of them fail.
    return { runtime, misses, gga, page };
}
