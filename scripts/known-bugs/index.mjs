/**
 * Known bugs (issue #9) and the small harness their tests share.
 *
 * Every bug below has a test in this folder that asserts the correct behaviour, so it fails until the
 * bug is fixed. The test passes its entry here as its `todo`, which reports the failure without
 * failing `npm test`. When you fix a bug, delete its entry: the test then has to pass like any other.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

export const KNOWN_BUGS = {
    configEscaping:
        "Quotes and backslashes in text settings aren't escaped when the config is written, and null becomes {}",
    brokenCustomConfig:
        "A broken config.custom.js is ignored with a false 'not found' message, then overwritten on the next save",
    setupStopsAtMissingObject:
        "One missing game object stops every game hook after it from installing, setup never retries, and the console still says 'Cheats ready!'",
    cheatErrorShowsSuccess: "A cheat that throws an error shows a green success toast",
    updaterUnsafe: "The updater has no timeout and doesn't verify downloads",
    reloadInjectsStartupConfig: "After the game reloads, it runs the startup config instead of the current one",
    destructiveOneClick: "Destructive cheats like wipe run on one click from the Cheats list",
    toggleOnlyApi: "The API can only toggle a cheat, not set it, so two 'turn on' requests turn it back off",
    partialSaveWipes:
        "Saving rewrites the whole override file from whatever it's sent, so a partial save wipes other settings",
    gameConfigNeverFlowsBack: "Config changes made inside the game never flow back, so they are lost on restart",
    unbanNeverRuns: "The unban check reads a cheat that's never registered, so it never runs",
    activeListDrifts:
        "The active-cheats list drops a trailing 's', misses cheats nested three deep, and stays online after the game closes",
    cheatBeforeSetup: "A cheat can run before setup has finished",
};

const root = fileURLToPath(new URL("../../", import.meta.url));
export const importRepo = (path) => import(pathToFileURL(join(root, path)).href);

// src/cheats and src/ui are ES modules in a package without "type": "module"; Node warns once per file.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
    rest[0]?.code === "MODULE_TYPELESS_PACKAGE_JSON" ? undefined : emitWarning.call(process, warning, ...rest);

/** Load a fresh copy of a CommonJS file from the repo, with some of its require() calls answered by fakes. */
export function loadCommonJs(path, fakes = {}) {
    const filename = join(root, path);
    const realRequire = createRequire(filename);
    const module = { exports: {} };
    const source = readFileSync(filename, "utf8");
    const wrapper = vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {${source}\n})`, {
        filename,
    });
    wrapper(
        module.exports,
        (name) => (name in fakes ? fakes[name] : realRequire(name)),
        module,
        filename,
        dirname(filename)
    );
    return module.exports;
}

/** A stand-in for utils/logger.js that keeps every line as "level: message". */
export function captureLogger() {
    const lines = [];
    const write =
        (level) =>
        (message, ...rest) =>
            lines.push(`${level}: ${[message, ...rest].join(" ")}`);
    const log = { debug: write("debug"), info: write("info"), warn: write("warn"), error: write("error") };
    return { lines, createLogger: () => log };
}

/**
 * Make a temporary install folder the working directory, as the config code reads config.js and
 * config.custom.js from there. Returns the folder; it is removed after the test.
 */
export function useInstallDir(t, { cheatConfig = {}, injectorConfig = { webPort: 8080 }, custom } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "known-bugs-"));
    const defaults = { startupCheats: [], cheatConfig, injectorConfig };
    writeFileSync(
        join(dir, "config.js"),
        Object.entries(defaults)
            .map(([key, value]) => `exports.${key} = ${JSON.stringify(value)};`)
            .join("\n")
    );
    if (custom !== undefined) writeFileSync(join(dir, "config.custom.js"), custom);
    const previous = process.cwd();
    process.chdir(dir);
    t.after(() => {
        process.chdir(previous);
        rmSync(dir, { recursive: true, force: true });
    });
    return dir;
}

/** Require a file that was just written, bypassing the require cache. */
export function requireFresh(file) {
    const require = createRequire(file);
    delete require.cache[file];
    return require(file);
}

/** Call a route the way TinyRouter would, and return the response. */
export async function request(router, method, url, body = {}) {
    const response = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = JSON.parse(JSON.stringify(value));
            return this;
        },
    };
    const handler = router.routes[method].get(url.split("?")[0]);
    if (typeof handler !== "function") throw new Error(`${method} ${url} is not registered`);
    await handler({ url, headers: { host: "localhost" }, json: async () => body }, response);
    return response;
}

/**
 * A fake game window: every property read finds another fake, so any code can walk it, and every
 * function the cheat code assigns onto it (a hook) is recorded in `installed` by its path.
 */
function fakeGame({ ready = true } = {}) {
    const installed = [];
    const fake = (path) =>
        new Proxy(function () {}, {
            get(target, key) {
                if (typeof key === "symbol" || Object.prototype.hasOwnProperty.call(target, key)) return target[key];
                if (key in Function.prototype && key !== "constructor") return target[key];
                return (target[key] = fake(`${path}.${key}`));
            },
            set(target, key, value) {
                if (typeof value === "function") installed.push(`${path}.${key}`);
                target[key] = value;
                return true;
            },
            apply: () => fake(`${path}()`),
            construct: () => fake(`new ${path}`),
        });
    const context = fake("window");
    const engine = context["com.stencyl.Engine"].engine;
    void engine.scene;
    engine.sceneInitialized = ready;
    engine.behaviors.behaviors[0].script._CloudLoadComplete = 1;
    const gga = engine.gameAttributes.h;
    gga.PixelHelperActor = Array(28).fill(0); // 0 is the game's "UI actor not created yet"
    return { context, gga, installed };
}

/**
 * Import the real in-game cheat code (each test file runs in its own process, so it is fresh), with the
 * default config.js settings and a fake game. `ready: false` is a game still loading; `setupDone: false`
 * leaves setup to the first cheat, as in the game.
 */
export async function loadGame({ ready = true, setupDone = ready } = {}) {
    // wide.js starts a timer on import and setup opens a WebSocket to the injector; neither may keep the test alive.
    const setIntervalReal = globalThis.setInterval;
    globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
    globalThis.WebSocket = class {
        send() {}
    };
    // The game's console only reaches the injector's debug log; keep it out of the test output.
    console.log = console.error = () => {};
    const state = await importRepo("src/cheats/core/state.js");
    state.setCheatConfig({ ...loadCommonJs("config.js").cheatConfig, ingameUI: false });
    await importRepo("src/cheats/cheats/register.js");
    const { cheat, registerCheat, registerCheats } = await importRepo("src/cheats/core/registration.js");
    const game = fakeGame({ ready });
    if (ready) (await importRepo("src/cheats/core/globals.js")).registerCommonVariables(game.context);
    if (setupDone) state.markSetupDone();
    // The part of what cheats/main.js puts on the game window that these tests call over (fake) CDP.
    const window = {
        context: game.context,
        cheat: (action) => cheat(action, game.context),
        cheatStateList: () => state.cheatState,
        updateCheatConfig: state.updateCheatConfig,
    };
    const runtime = {
        async evaluate({ expression }) {
            try {
                return { result: { value: vm.runInNewContext(expression, window) } };
            } catch (error) {
                return { result: {}, exceptionDetails: { text: String(error) } };
            }
        },
    };
    return { ...game, state, registerCheat, registerCheats, cheat: window.cheat, runtime };
}

/**
 * Import WebUI modules in Node: a minimal DOM for VanJS, an in-memory localStorage, and fetch answered
 * by the given API router.
 */
export async function loadUi(router) {
    class Element {
        nodeType = 1;
        isConnected = true;
        childNodes = [];
        attributes = {};
        listeners = {};
        constructor(name) {
            this.nodeName = name;
        }
        append(...children) {
            this.childNodes.push(...children);
        }
        setAttribute(name, value) {
            this.attributes[name] = value;
        }
        addEventListener(type, listener) {
            this.listeners[type] = listener;
        }
        removeEventListener(type) {
            delete this.listeners[type];
        }
        replaceWith() {}
        remove() {}
    }
    globalThis.document = {
        nodeType: 9,
        createElement: (name) => new Element(name),
        createElementNS: (_, name) => new Element(name),
    };
    globalThis.Text = class {
        nodeType = 3;
        constructor(text) {
            this.data = String(text);
        }
    };
    const storage = new Map();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key),
        },
    });
    const requests = [];
    globalThis.fetch = async (url, options = {}) => {
        const method = options.method ?? "GET";
        requests.push(`${method} ${url}`);
        const response = await request(router, method, url, options.body ? JSON.parse(options.body) : {});
        return new Response(JSON.stringify(response.body), {
            status: response.statusCode,
            headers: { "content-type": "application/json" },
        });
    };
    const store = (await importRepo("src/ui/state/store.js")).default;
    return { store, requests };
}
