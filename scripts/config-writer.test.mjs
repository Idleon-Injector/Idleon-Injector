/**
 * The config writer (issue #20): config.custom.js written from the WebUI loads back as saved, on top of
 * the generated config.js, and the file is never lost or left half-written.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { captureLogger, loadCommonJs, request } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const { objToString } = require("../src/modules/utils/helpers");

/** A temporary install folder with the real generated config.js, as the working directory. */
function useInstall(t, custom) {
    const dir = mkdtempSync(join(tmpdir(), "config-writer-"));
    copyFileSync(new URL("../config.js", import.meta.url), join(dir, "config.js"));
    if (custom !== undefined) writeFileSync(join(dir, "config.custom.js"), custom);
    const previous = process.cwd();
    process.chdir(dir);
    t.after(() => {
        process.chdir(previous);
        rmSync(dir, { recursive: true, force: true });
    });
    return dir;
}

/** Start the injector's config, as a restart would: a fresh module that reads the files again. */
function start() {
    const logger = captureLogger();
    const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": logger });
    // require caches files by name; a restart is a new process.
    for (const key of Object.keys(require.cache)) if (/config(\.custom)?\.js$/.test(key)) delete require.cache[key];
    config.loadConfiguration();
    return { config, lines: logger.lines };
}

test("the writer writes every kind of value as JavaScript that reads back the same", () => {
    const value = {
        text: 'say "hi" \\ C:\\Games\n',
        empty: "",
        none: null,
        big: 1e21,
        inf: Infinity,
        list: [1, "a", null, { deep: true }],
        patterns: [/Copper/, /a\/b/gi],
        nested: { inner: { "with space": 1, 2: "two" } },
        emptyObject: {},
        emptyList: [],
    };
    const read = vm.runInNewContext(`(${objToString(value)})`);
    assert.deepEqual(JSON.parse(JSON.stringify(read)), JSON.parse(JSON.stringify(value)));
    assert.equal(read.inf, Infinity);
    assert.deepEqual(Array.from(read.patterns, String), ["/Copper/", "/a\\/b/gi"]);
    assert.equal(objToString({ fn: (t) => t * 2 }).includes("fn: (t) => t * 2,"), true);
});

test("a WebUI save loads back after a restart, on top of the generated config.js", async (t) => {
    const dir = useInstall(t);
    const { config } = start();
    const router = new TinyRouter();
    // The route, using this run's config module.
    loadCommonJs("src/modules/server/routes/config.js", { "../../config/configManager": config }).setupConfigRoutes(
        router,
        // A game where `nomore Copper` ran: its patterns come back when the WebUI reads the config.
        { callHelper: async () => ({ value: JSON.stringify({ nomore: { items: ["/Copper/"] } }) }) },
        {
            cheatConfig: config.getCheatConfig(),
            defaultConfig: config.getDefaultConfig(),
            startupCheats: config.getStartupCheats(),
            injectorConfig: config.getInjectorConfig(),
        }
    );
    // As the WebUI does: read the config, change some settings, post it all back.
    const { body } = await request(router, "GET", "/api/config");
    assert.deepEqual(body.cheatConfig.nomore, { items: ["/Copper/"] });
    body.cheatConfig.godlike.respawn = "(t) => 2";
    body.cheatConfig.w1.companion.companions = 'a "b" \\c';
    body.cheatConfig.nomore.items.push("/Iron.*/i"); // typed into the Config view's list
    body.injectorConfig.browserPath = "C:\\Program Files\\Chrome\\chrome.exe";
    delete body.defaultConfig;
    const saved = await request(router, "POST", "/api/config/save", body);
    assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.message, "Configuration successfully saved to config.custom.js");
    const firstFile = readFileSync(join(dir, "config.custom.js"), "utf8");

    const restarted = start().config;
    const cheatConfig = restarted.getCheatConfig();
    assert.equal(cheatConfig.godlike.respawn(5), 2);
    assert.equal(cheatConfig.w1.companion.companions, 'a "b" \\c');
    assert.deepEqual(cheatConfig.nomore.items.map(String), ["/Copper/", "/Iron.*/i"]);
    assert.equal(restarted.getInjectorConfig().browserPath, "C:\\Program Files\\Chrome\\chrome.exe");
    // Settings left alone still come from config.js.
    assert.equal(cheatConfig.unlock.islands, "abcde_");
    assert.equal(typeof cheatConfig.w1.anvil.productionspeed, "function");
    assert.equal(restarted.getInjectorConfig().injreg, "\\w+\\.ApplicationMain\\s*?=");

    // Saving again changes nothing: no setting gains or loses a backslash on each save.
    await restarted.saveConfiguration({});
    assert.equal(readFileSync(join(dir, "config.custom.js"), "utf8"), firstFile);
    assert.deepEqual(readdirSync(dir).sort(), ["config.custom.js", "config.js"], "no temporary file is left");
});

test("a broken config.custom.js is named in the log and kept when the WebUI saves", async (t) => {
    const broken = "exports.cheatConfig = {\n    godlike: { respawn: (t) => 0,, },\n};\n";
    const dir = useInstall(t, broken);
    const { config, lines } = start();
    assert.deepEqual(
        lines.filter((line) => line.startsWith("error")),
        [
            "error: config.custom.js has an error on line 2: Unexpected token ','. Your settings in it are not " +
                "loaded, so the injector is using the default settings. Fix the file and restart the injector. If you " +
                "save settings in the WebUI first, your file is kept as config.custom.broken-<date and time>.js and a " +
                "new config.custom.js is started.",
        ]
    );

    const { brokenFileKeptAs } = await config.saveConfiguration({ cheatConfig: { unlock: { islands: "a" } } });
    assert.match(brokenFileKeptAs, /^config\.custom\.broken-[\dT-]+Z\.js$/);
    assert.equal(readFileSync(join(dir, brokenFileKeptAs), "utf8"), broken);
    assert.equal(start().config.getCheatConfig().unlock.islands, "a", "the new file loads");

    // The new file is good, so the next save just writes it.
    assert.deepEqual(await config.saveConfiguration({}), { brokenFileKeptAs: undefined });
    assert.equal(readdirSync(dir).filter((file) => file.includes("broken")).length, 1);
});

test("a save that can't be written leaves the old file and the loaded settings as they were", async (t) => {
    const custom = 'exports.cheatConfig = { unlock: { islands: "x" } };';
    const dir = useInstall(t, custom);
    const { config } = start();
    mkdirSync(join(dir, "config.custom.js.tmp")); // the temporary file can't be created
    await assert.rejects(config.saveConfiguration({ cheatConfig: { unlock: { islands: "y" } } }));
    assert.equal(readFileSync(join(dir, "config.custom.js"), "utf8"), custom);
    assert.equal(config.getCheatConfig().unlock.islands, "x");
});

test("a missing config.custom.js is reported as missing, and reading a closed game changes nothing", async (t) => {
    useInstall(t);
    const { config, lines } = start();
    assert.ok(lines.includes("info: No config.custom.js found - using defaults"));
    const before = JSON.stringify(config.getCheatConfig());
    await config.pullGameConfig(
        {
            callHelper: async () => {
                throw new Error("Game closed");
            },
        },
        config.getCheatConfig()
    );
    await config.pullGameConfig(
        { callHelper: async () => ({ error: { text: "not defined" } }) },
        config.getCheatConfig()
    );
    assert.equal(JSON.stringify(config.getCheatConfig()), before);
});

test("a save that leaves out the startup cheats keeps them, loaded and in the file", async (t) => {
    useInstall(t, 'exports.startupCheats = ["godlike reach", "automation shops"];');
    const { config } = start();
    const startup = ["godlike reach", "automation shops"];
    assert.deepEqual(config.getStartupCheats(), startup);
    // As an automation tab does: it saves only its picks.
    await config.saveConfiguration({ cheatConfig: {} });
    assert.deepEqual(config.getStartupCheats(), startup, "the loaded list keeps them");
    await config.saveConfiguration({ cheatConfig: {} });
    assert.deepEqual(start().config.getStartupCheats(), startup, "and so does the file after a second save");
});

test("two saves at once write the file one after the other, so it still loads", async (t) => {
    useInstall(t);
    // Every file step the saves take, in the order they take them.
    const steps = [];
    const realFs = require("fs");
    const logged =
        (name) =>
        async (path, ...rest) => {
            steps.push(`${name} ${basename(path)}`);
            return realFs.promises[name](path, ...rest);
        };
    const fs = {
        ...realFs,
        promises: { ...realFs.promises, writeFile: logged("writeFile"), rename: logged("rename") },
    };
    const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": captureLogger(), fs });
    for (const key of Object.keys(require.cache)) if (/config(\.custom)?\.js$/.test(key)) delete require.cache[key];
    config.loadConfiguration();

    // Sushi Tools: a field's blur and the "Show in-game buttons" switch each save the whole config.
    await Promise.all([
        config.saveConfiguration({ cheatConfig: { unlock: { islands: "a" } } }),
        config.saveConfiguration({ cheatConfig: { unlock: { islands: "abc" } } }),
    ]);
    const tmp = "writeFile config.custom.js.tmp";
    const rename = "rename config.custom.js.tmp";
    assert.deepEqual(
        steps,
        [tmp, rename, tmp, rename],
        "a save starts its temporary file after the last one is in place"
    );
    assert.equal(start().config.getCheatConfig().unlock.islands, "abc", "the file loads with the later save");
});
