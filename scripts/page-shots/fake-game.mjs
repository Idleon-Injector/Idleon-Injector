/**
 * A fake game for the page screenshots: the real game-side WebUI API (src/cheats/api, the path resolver,
 * the cheat list) running in Node over game data from fake-game-data.mjs, behind a fake CDP Runtime that the
 * server's real routes evaluate against. Same data every run, so the screenshots only change when the UI does.
 */
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
    const globals = await importRepo("src/cheats/core/globals.js");
    const paths = await importRepo("src/cheats/utils/pathResolver.js");
    const accessors = await importRepo("src/cheats/api/stateAccessors.js");
    const { getAutoCompleteSuggestions } = await importRepo("src/cheats/api/suggestions.js");
    const { getGgaKeys, searchGga } = await importRepo("src/cheats/api/search.js");
    const { getBundleCatalog } = await importRepo("src/cheats/helpers/bundles.js");
    const { getHookFailures } = await importRepo("src/cheats/core/hooks.js");
    const { readSave, takeSaveCopy } = await importRepo("src/cheats/core/saveCopy.js");

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
            "com.stencyl.Engine": { engine: { gameAttributes: { h: gga } } },
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
        cheat: (action) => ({ ok: true, message: `${action} (fake game)` }),
        readCheatConfig: () => "{}",
        updateCheatConfig: () => {},
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
    return { runtime, misses, gga };
}
