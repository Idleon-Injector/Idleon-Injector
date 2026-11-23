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
    destructiveOneClick: "Destructive cheats like wipe run on one click from the Cheats list",
    unbanNeverRuns: "The unban check reads a cheat that's never registered, so it never runs",
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
    // A bound function has no own `prototype`, so X.prototype is a fake too and its methods exist, as in the game.
    const fake = (path) =>
        new Proxy(function () {}.bind(), {
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
    // The game always has these; hooks go on their entries one by one.
    Object.assign(gga.CustomLists.h, gameLists());
    Object.assign(gga.ItemDefinitionsGET.h, gameItems());
    return { context, gga, installed };
}

/** One entry of each custom list the hooks go on, as deep as the hooks look. */
export const gameLists = () => ({
    MTXinfo: [[[[0, 0, 0, 300, 0, 5, 0, 700]]]],
    RefineryInfo: [Array(12).fill("1")],
    SaltLicks: [Array(3).fill("1")],
    PrayerInfo: [Array(7).fill("1")],
    PostOfficePossibleOrders: [[[Array(2).fill("1")]]],
    GuildGPtasks: [Array(2).fill("1")],
    TaskDescriptions: [[Array(15).fill("1")]],
    SSignInfoUI: [Array(5).fill("1")],
    WorshipBASEinfos: [Array(7).fill("1")],
    AlchemyVialItemsPCT: [5],
    CardStuff: [[[0, 0, 0, "Dmg", "1"]]],
    ArtifactInfo: [[0, 0, 1]],
    ItemToCraftEXP: {},
});

/** One item definition of each kind the hooks go on. */
export const gameItems = () => ({
    Timecandy1: { h: { Type: "TIME_CANDY", ID: 3600 } },
    SwordGame: { h: { Type: "WEAPON", typeGen: "aWeapon", Speed: 4, Class: "WARRIOR", lvReqToEquip: 1 } },
    StoneGame: { h: { Type: "STONE", typeGen: "dStone", Amount: 30, Trigger: 1 } },
});

/**
 * Import the real in-game cheat code (each test file runs in its own process, so it is fresh), with the
 * default config.js settings and a fake game. `ready: false` is a game still loading; `setupDone: false`
 * leaves setup to the first cheat, as in the game.
 */
export async function loadGame({ ready = true, setupDone = ready } = {}) {
    // An automation left on keeps its timer and setup opens a WebSocket to the injector; neither may keep the test alive.
    const setIntervalReal = globalThis.setInterval;
    globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
    globalThis.WebSocket = class {
        send() {}
    };
    // The game's console only reaches the injector's debug log; keep it out of the test output.
    console.log = console.error = () => {};
    const state = await importRepo("src/cheats/core/state.js");
    state.setCheatConfig({ ...loadCommonJs("config.js").cheatConfig, ingameUI: false });
    // The cheat files the build bundles (rollup.config.mjs).
    for (const file of (await importRepo("rollup.config.mjs")).cheatFiles())
        await importRepo(`src/cheats/cheats/${file}`);
    // The hook files the build bundles (rollup.config.mjs), so setup installs them as in the game.
    for (const file of (await importRepo("rollup.config.mjs")).hookFiles())
        await importRepo(`src/cheats/hooks/${file}`);
    // The automation files the build bundles (rollup.config.mjs).
    for (const file of (await importRepo("rollup.config.mjs")).automationFiles())
        await importRepo(`src/cheats/automations/${file}`);
    const { cheat, defineCheat } = await importRepo("src/cheats/core/registration.js");
    const game = fakeGame({ ready });
    if (ready) (await importRepo("src/cheats/core/globals.js")).registerCommonVariables(game.context);
    if (setupDone) state.markSetupDone();
    // The part of what cheats/main.js puts on the game window that these tests call over (fake) CDP.
    const window = {
        context: game.context,
        cheat: (action, on) => cheat(action, game.context, on),
        cheatStateList: (await importRepo("src/cheats/api/stateAccessors.js")).getcheatStateList,
        getHookFailures: (await importRepo("src/cheats/core/hooks.js")).getHookFailures,
        updateCheatConfig: state.updateCheatConfig,
        readCheatConfig: state.readCheatConfig,
    };
    // The bridge evaluates with awaitPromise, so a promise (window.cheat's) comes back as its value.
    const runtime = {
        async evaluate({ expression }) {
            try {
                return { result: { value: await vm.runInNewContext(expression, window) } };
            } catch (error) {
                return { result: {}, exceptionDetails: { text: String(error) } };
            }
        },
    };
    return { ...game, state, defineCheat, cheat: window.cheat, runtime };
}

/**
 * Import WebUI modules in Node: a minimal DOM for VanJS, an in-memory localStorage, and fetch answered
 * by the given API router.
 */
export async function loadUi(router) {
    // Re-renders swap the node in its parent, so a test can read what a page shows after a change.
    class Node {
        isConnected = true;
        replaceWith(next) {
            const siblings = this.parentNode?.childNodes ?? [];
            const index = siblings.indexOf(this);
            if (index < 0) return;
            siblings[index] = next;
            next.parentNode = this.parentNode;
        }
        remove() {
            const siblings = this.parentNode?.childNodes ?? [];
            const index = siblings.indexOf(this);
            if (index >= 0) siblings.splice(index, 1);
        }
    }
    class Element extends Node {
        nodeType = 1;
        childNodes = [];
        attributes = {};
        listeners = {};
        handlers = {};
        constructor(name) {
            super();
            this.nodeName = name;
        }
        append(...children) {
            for (const child of children) if (typeof child === "object") child.parentNode = this;
            this.childNodes.push(...children);
        }
        replaceChildren(...children) {
            this.childNodes = [];
            this.append(...children);
        }
        get firstChild() {
            return this.childNodes[0] ?? null;
        }
        get nextSibling() {
            const siblings = this.parentNode?.childNodes ?? [];
            return siblings[siblings.indexOf(this) + 1] ?? null;
        }
        insertBefore(node, before) {
            node.remove?.();
            node.parentNode = this;
            const index = before ? this.childNodes.indexOf(before) : -1;
            if (index < 0) this.childNodes.push(node);
            else this.childNodes.splice(index, 0, node);
            return node;
        }
        contains(node) {
            for (let at = node; at; at = at.parentNode) if (at === this) return true;
            return false;
        }
        setAttribute(name, value) {
            this.attributes[name] = value;
        }
        getAttribute(name) {
            return this.attributes[name] ?? null;
        }
        removeAttribute(name) {
            delete this.attributes[name];
        }
        style = { setProperty() {} };
        // On the class attribute, where VanJS puts a `class` binding here.
        get classList() {
            const names = () =>
                String(this.attributes.class ?? "")
                    .split(/\s+/)
                    .filter(Boolean);
            return {
                add: (name) => (this.attributes.class = [...new Set([...names(), name])].join(" ")),
                remove: (name) =>
                    (this.attributes.class = names()
                        .filter((other) => other !== name)
                        .join(" ")),
                contains: (name) => names().includes(name),
            };
        }
        // listeners[type](event) runs every listener and returns the first one's result (a click handler's promise).
        addEventListener(type, listener) {
            (this.handlers[type] ??= []).push(listener);
            this.listeners[type] ??= (event) => this.handlers[type].map((handler) => handler(event))[0];
        }
        removeEventListener(type, listener) {
            this.handlers[type] = this.handlers[type]?.filter((handler) => handler !== listener);
        }
        // Nothing scrolls here; the menu's tab rows call it (Pages.js).
        scrollIntoView() {}
        // Focus is only where it went last (the cog board gives it back to the cog its editor was for).
        focus() {
            globalThis.document.activeElement = this;
        }
    }
    // A page always has a body: the UI's one live region (inPlace's announce) goes there.
    const body = new Element("body");
    body.appendChild = (child) => body.append(child);
    globalThis.document = {
        nodeType: 9,
        body,
        createElement: (name) => new Element(name),
        createElementNS: (_, name) => new Element(name),
        // Page-wide keys (a tabbed list's Escape); no test presses one on the document.
        addEventListener() {},
    };
    // Every browser has it; nothing here is laid out, so no frame ever comes (a test that times frames sets its own).
    globalThis.requestAnimationFrame ??= () => 0;
    globalThis.ResizeObserver ??= class {
        observe() {}
        disconnect() {}
    };
    // Every browser has it too; no page here is opened in the top bar's sense, so the page search never watches one.
    globalThis.MutationObserver ??= class {
        observe() {}
        disconnect() {}
    };
    globalThis.Text = class extends Node {
        nodeType = 3;
        constructor(text) {
            super();
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
