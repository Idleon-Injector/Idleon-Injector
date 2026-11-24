/**
 * Configs (#198, #93): the shipped Light and AFK configs beside the player's own, switched by hand. Each config keeps
 * its own cheats and settings through switches and restarts; editing a shipped one makes the player's copy, which
 * Reset puts back; a file from before configs, a broken one and a broken entry still load.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { captureLogger, importRepo, loadCommonJs, request } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const SHIPPED = require("../src/modules/config/shippedConfigs");

/** A temporary install folder with the real generated config.js, as the working directory. */
function useInstall(t, custom) {
    const dir = mkdtempSync(join(tmpdir(), "configs-"));
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

/** A game that records what a switch asks of it. */
function fakeGame() {
    const calls = [];
    return {
        calls,
        callHelper: async () => ({ value: "{}" }),
        isAttached: async () => true,
        updateConfig: async (config, replace) => {
            calls.push(["config", replace]);
            return { value: "Config updated in game." };
        },
        executeCheat: async (command, on) => {
            calls.push([command, on]);
            return { value: { ok: command !== "broken cheat", message: "Not a cheat." } };
        },
    };
}

/** Start the injector as a restart would, with the config routes on `game`. */
function start(game = fakeGame()) {
    const logger = captureLogger();
    const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": logger });
    for (const key of Object.keys(require.cache)) if (/config(\.custom)?\.js$/.test(key)) delete require.cache[key];
    config.loadConfiguration();
    const router = new TinyRouter();
    loadCommonJs("src/modules/server/routes/config.js", {
        "../../config/configManager": config,
        "../wsServer": { broadcastCheatStates: () => {} },
    }).setupConfigRoutes(router, game, {
        cheatConfig: config.getCheatConfig(),
        defaultConfig: config.getDefaultConfig(),
        startupCheats: config.getStartupCheats(),
        injectorConfig: config.getInjectorConfig(),
    });
    const change = (action, name) => request(router, "POST", "/api/configs", { action, name });
    const read = async () => (await request(router, "GET", "/api/config")).body;
    const save = (body) => request(router, "POST", "/api/config/save", body);
    return { config, router, game, change, read, save, lines: logger.lines };
}

const row = (configs, name) => configs.list.find((entry) => entry.name === name);

test("a fresh install has nothing on, in My config, with Light and AFK to pick", async (t) => {
    useInstall(t);
    const { read } = start();
    const { configs, startupCheats } = await read();
    assert.deepEqual(startupCheats, []);
    assert.equal(configs.active, "My config");
    assert.deepEqual(
        configs.list.map(({ name, shipped, changed, cheats }) => ({ name, shipped, changed, cheats })),
        [
            { name: "Light", shipped: true, changed: false, cheats: SHIPPED.Light.startupCheats.length },
            { name: "AFK", shipped: true, changed: false, cheats: SHIPPED.AFK.startupCheats.length },
            { name: "My config", shipped: false, changed: undefined, cheats: 0 },
        ]
    );
});

test("Light is quality of life only, and AFK is Light plus idling help without the risky cheats", () => {
    for (const cheat of ["wide autoloot", "wide nodmg", "wide nogamingpop", "unlock quickref", "unlock presets"])
        assert.ok(SHIPPED.Light.startupCheats.includes(cheat), cheat);
    for (const cheat of ["unlock storagecrafting", "minigame instawheel", "unlock teleports", "wide candy"])
        assert.ok(SHIPPED.Light.startupCheats.includes(cheat), cheat);
    for (const cheat of SHIPPED.Light.startupCheats) assert.ok(SHIPPED.AFK.startupCheats.includes(cheat), cheat);
    const risky = /^(multiply|cloudz|w3$|w3 freeworship|minigame (?!instawheel)|w5 sailing)/;
    for (const cheat of SHIPPED.AFK.startupCheats) assert.doesNotMatch(cheat, risky);
    // Orion's resets stay off: its shipped list has them, switched off.
    const config = require("../config.js");
    assert.ok(config.cheatConfig.automation.orion.every((item) => item.on === false));
});

test("a config.custom.js from 2.5.3 loads as My config and keeps everything through switches", async (t) => {
    const dir = useInstall(
        t,
        `exports.startupCheats = ["godlike reach", "wide autoloot"];
exports.cheatConfig = { godlike: { respawn: (t) => 2 }, w5: { holes: { Bravery_SwordsOwned: (t) => 7 } } };
exports.injectorConfig = { webPort: 8099 };`
    );
    let app = start();
    assert.equal((await app.read()).configs.active, "My config");
    assert.deepEqual(app.config.getStartupCheats(), ["godlike reach", "wide autoloot"]);

    // My config → Light → AFK → own → Light → My config.
    assert.equal((await app.change("use", "Light")).statusCode, 200);
    assert.deepEqual(app.config.getStartupCheats(), SHIPPED.Light.startupCheats);
    assert.equal(app.config.getCheatConfig().godlike.respawn(5), 1, "Light has the shipped respawn");
    assert.equal(app.config.getInjectorConfig().webPort, 8099, "the port is the PC's, not the config's");
    await app.change("use", "AFK");
    assert.deepEqual(app.config.getStartupCheats(), SHIPPED.AFK.startupCheats);
    await app.change("saveAs", "Second account");
    await app.save({ startupCheats: ["w1 companion"] });
    await app.change("use", "Light");
    assert.deepEqual(app.config.getStartupCheats(), SHIPPED.Light.startupCheats);

    // A restart in between reads it all back.
    app = start();
    assert.equal((await app.read()).configs.active, "Light");
    await app.change("use", "My config");
    assert.deepEqual(app.config.getStartupCheats(), ["godlike reach", "wide autoloot"]);
    assert.equal(app.config.getCheatConfig().godlike.respawn(5), 2);
    assert.equal(app.config.getCheatConfig().w5.holes.Bravery_SwordsOwned(3), 7);
    await app.change("use", "Second account");
    assert.deepEqual(app.config.getStartupCheats(), ["w1 companion"]);
    await app.change("use", "AFK");
    assert.deepEqual(app.config.getStartupCheats(), SHIPPED.AFK.startupCheats, "AFK wasn't changed by the copy");

    const { configs } = await app.read();
    assert.deepEqual(
        configs.list.map((entry) => entry.name),
        ["Light", "AFK", "My config", "Second account"]
    );
    assert.equal(row(configs, "Light").changed, false);
    // The file says which config is in use, and keeps the others in it.
    const file = readFileSync(join(dir, "config.custom.js"), "utf8");
    assert.match(file, /exports\.activeConfig = "AFK";/);
    assert.match(file, /"My config": \{/);
});

test("editing a shipped config saves the player's copy, and Reset puts it back", async (t) => {
    useInstall(t);
    let app = start();
    await app.change("use", "Light");
    await app.save({ startupCheats: [...SHIPPED.Light.startupCheats, "godlike reach"] });
    assert.equal(row((await app.read()).configs, "Light").changed, true);

    // The copy is kept when switching away and back, and after a restart.
    await app.change("use", "My config");
    assert.equal(row((await app.read()).configs, "Light").changed, true);
    app = start();
    await app.change("use", "Light");
    assert.ok(app.config.getStartupCheats().includes("godlike reach"));

    // Reset while in use: the shipped cheats again, and the game is switched over.
    app.game.calls.length = 0;
    const reset = await app.change("reset", "Light");
    assert.equal(reset.statusCode, 200);
    assert.deepEqual(app.config.getStartupCheats(), SHIPPED.Light.startupCheats);
    assert.equal(row(reset.body.configs, "Light").changed, false);
    assert.deepEqual(app.game.calls[1], ["godlike reach", false]);

    // Reset while not in use only drops the copy.
    await app.save({ startupCheats: ["wide nodmg"] });
    await app.change("use", "AFK");
    const { body } = await app.change("reset", "Light");
    assert.equal(row(body.configs, "Light").changed, false);
    await app.change("use", "Light");
    assert.deepEqual(app.config.getStartupCheats(), SHIPPED.Light.startupCheats);
});

test("a switch puts the new config into the running game: settings replaced, old cheats off, new on", async (t) => {
    useInstall(t, `exports.startupCheats = ["godlike reach", "wide autoloot"];`);
    const app = start();
    const { body } = await app.change("use", "Light");
    assert.deepEqual(app.game.calls[0], ["config", true]);
    assert.deepEqual(app.game.calls[1], ["godlike reach", false], "only the cheat Light doesn't have goes off");
    assert.deepEqual(
        app.game.calls.slice(2),
        SHIPPED.Light.startupCheats.map((cheat) => [cheat, true])
    );
    assert.deepEqual(body.game, { gameApplied: true, failed: [] });

    // A cheat that doesn't start is named; the switch still happened.
    await app.change("saveAs", "Mine");
    await app.save({ startupCheats: ["broken cheat"] });
    await app.change("use", "AFK");
    const back = await app.change("use", "Mine");
    assert.deepEqual(back.body.game.failed, [{ cheat: "broken cheat", reason: "Not a cheat." }]);
    assert.equal(back.body.configs.active, "Mine");
});

test("a game that isn't there gets the new config when it's injected again", async (t) => {
    useInstall(t);
    const game = { ...fakeGame(), isAttached: async () => false };
    const app = start(game);
    const { body } = await app.change("use", "AFK");
    assert.equal(body.game.contextLost, true);
    assert.deepEqual(app.config.getStartupCheats(), SHIPPED.AFK.startupCheats);
});

test("Save current as and Delete check the name and what's in use", async (t) => {
    useInstall(t);
    const app = start();
    for (const [name, words] of [
        ["", "Type a name."],
        ["   ", "Type a name."],
        ["light", "That name is taken."],
        ["my CONFIG", "That name is taken."],
        ["x".repeat(41), "Use 40 letters or fewer."],
        ["__proto__", "Pick another name."],
    ]) {
        const answer = await app.change("saveAs", name);
        assert.equal(answer.statusCode, 400, name);
        assert.equal(answer.body.error, words);
    }
    assert.equal((await app.change("saveAs", "  Main  ")).body.configs.active, "Main");
    assert.equal((await app.change("remove", "Main")).body.error, "Switch to another config first.");
    assert.equal((await app.change("remove", "Light")).body.error, "Shipped configs stay. Reset it instead.");
    assert.equal((await app.change("remove", "Nope")).body.error, "That config is gone. Refresh.");
    assert.equal((await app.change("use", "Nope")).body.error, "That config is gone. Refresh.");
    assert.equal((await app.change("use", "constructor")).body.error, "That config is gone. Refresh.");
    // A name every object has is still just a name.
    assert.equal((await app.change("saveAs", "constructor")).body.configs.active, "constructor");
    await app.change("use", "Main");
    const { body } = await app.change("remove", "My config");
    assert.deepEqual(
        body.configs.list.map((entry) => entry.name),
        ["Light", "AFK", "constructor", "Main"]
    );
});

test("a broken configs entry is left out with an error; the rest still loads", async (t) => {
    useInstall(
        t,
        `exports.activeConfig = 42;
exports.startupCheats = ["godlike reach"];
exports.configs = {
    Good: { startupCheats: ["wide nodmg"], cheatConfig: { godlike: { respawn: (t) => 3 } } },
    "Bad list": { startupCheats: "wide nodmg" },
    "Bad settings": { startupCheats: [], cheatConfig: [] },
    Typo: { startupCheats: [], cheatConfig: { godlike: { respawn: 5 } } },
};`
    );
    const app = start();
    const { configs } = await app.read();
    assert.equal(configs.active, "My config");
    assert.deepEqual(
        configs.list.map((entry) => entry.name),
        ["Light", "AFK", "Good", "My config", "Typo"]
    );
    assert.ok(app.lines.some((line) => line.includes("activeConfig must be a name")));
    assert.ok(app.lines.some((line) => line.includes('configs["Bad list"]')));
    assert.ok(app.lines.some((line) => line.includes('configs["Bad settings"]')));
    // A wrong type falls back to the default, as at the top of the file.
    await app.change("use", "Typo");
    assert.equal(app.config.getCheatConfig().godlike.respawn(5), 1);
    await app.change("use", "Good");
    assert.equal(app.config.getCheatConfig().godlike.respawn(5), 3);
});

test("configs that isn't an object loads none of them, and the config in use still loads", async (t) => {
    useInstall(t, `exports.activeConfig = "Main";\nexports.startupCheats = ["godlike reach"];\nexports.configs = [];`);
    const app = start();
    const { configs } = await app.read();
    assert.equal(configs.active, "Main");
    assert.deepEqual(app.config.getStartupCheats(), ["godlike reach"]);
    assert.ok(app.lines.some((line) => line.includes("configs must be an object")));
});

test("a config.custom.js that doesn't load is kept aside by the first switch", async (t) => {
    const dir = useInstall(t, "exports.startupCheats = [;");
    const app = start();
    assert.equal((await app.read()).configs.active, "My config");
    await app.change("use", "Light");
    const kept = readdirSync(dir).filter((name) => name.startsWith("config.custom.broken-"));
    assert.equal(kept.length, 1);
    assert.equal(readFileSync(join(dir, kept[0]), "utf8"), "exports.startupCheats = [;");
    assert.match(readFileSync(join(dir, "config.custom.js"), "utf8"), /exports\.activeConfig = "Light";/);
});

test("the game takes a switched config in place: keys only the old config had go, game-only values stay", async () => {
    const state = await importRepo("src/cheats/core/state.js");
    const keep = new Map([["a", 1]]);
    const command = () => 9;
    const automation = { shops: [] };
    state.setCheatConfig({
        wardrobe: { goldenfood: { Old: 5 } },
        automation,
        multiplestacks: { items: keep },
        misc: { keychain: command },
        fixobj: [1],
    });
    state.updateCheatConfig({ wardrobe: { goldenfood: { New: 2 } }, automation: { shops: [{ id: "1" }] } }, true);
    assert.deepEqual(state.cheatConfig.wardrobe.goldenfood, { New: 2 });
    assert.equal(state.cheatConfig.automation, automation, "cheats keep the objects they read");
    assert.deepEqual(automation.shops, [{ id: "1" }]);
    assert.equal(state.cheatConfig.multiplestacks.items, keep);
    assert.equal(state.cheatConfig.misc.keychain, command);
    assert.deepEqual(state.cheatConfig.fixobj, [1]);
    // A plain update still merges.
    state.updateCheatConfig({ wardrobe: { goldenfood: { Other: 1 } } });
    assert.deepEqual(state.cheatConfig.wardrobe.goldenfood, { New: 2, Other: 1 });
});

test("a config whose automation is null still loads, and so does the file", async (t) => {
    useInstall(t, `exports.configs = { Odd: { startupCheats: [], cheatConfig: { automation: null } } };`);
    const app = start();
    assert.ok(row((await app.read()).configs, "Odd"));
});

test("after a switch the game refused, the game's old settings don't come back; the retry also switches the cheats", async (t) => {
    useInstall(
        t,
        `exports.startupCheats = ["godlike reach"];
exports.cheatConfig = { automation: { shops: [{ id: "0:1", on: true }] } };`
    );
    const game = fakeGame();
    let takes = false;
    // The game keeps the old config's shop list until it takes the new config.
    game.callHelper = async () => ({ value: JSON.stringify({ automation: { shops: [{ id: "0:1", on: true }] } }) });
    game.updateConfig = async (config, replace) => {
        game.calls.push(["config", replace]);
        if (!takes) return { error: { text: "busy" } };
        game.callHelper = async () => ({ value: JSON.stringify({ automation: { shops: config.automation.shops } }) });
        return { value: "Config updated in game." };
    };
    const app = start(game);
    const { body } = await app.change("use", "Light");
    assert.equal(body.game.gameApplied, false);
    await app.read();
    await app.change("saveAs", "Copy");
    assert.deepEqual(app.config.getCheatConfig().automation.shops, [], "Light's empty list stays");

    assert.ok(!app.game.calls.some(([cheat]) => cheat === "godlike reach"), "no cheat switched while refused");

    // Once the game takes it, the old config's cheats go off and Light's on, and the game is read again.
    takes = true;
    game.calls.length = 0;
    await app.read();
    assert.deepEqual(game.calls, [
        ["config", true],
        ["godlike reach", false],
        ...SHIPPED.Light.startupCheats.map((cheat) => [cheat, true]),
    ]);
    assert.deepEqual(app.config.getCheatConfig().automation.shops, []);
    game.calls.length = 0;
    await app.read();
    assert.deepEqual(game.calls, [], "in step again: a read only reads");
});

test("a switch whose game update throws, or answers with an Error text, counts as not taken", async (t) => {
    useInstall(t, `exports.cheatConfig = { automation: { shops: [{ id: "0:1", on: true }] } };`);
    const game = fakeGame();
    let answer = "throw";
    game.callHelper = async () => ({ value: JSON.stringify({ automation: { shops: [{ id: "0:1", on: true }] } }) });
    game.updateConfig = async (config) => {
        if (answer === "throw") throw new Error("Execution context was destroyed.");
        if (answer === "text") return { value: "Error: updateCheatConfig function not found in game context." };
        game.callHelper = async () => ({ value: JSON.stringify({ automation: { shops: config.automation.shops } }) });
        return { value: "Config updated in game." };
    };
    const app = start(game);
    await app.change("use", "Light");
    await app.read();
    assert.deepEqual(app.config.getCheatConfig().automation.shops, [], "after a throw");
    answer = "text";
    await app.read();
    await app.change("saveAs", "Copy");
    assert.deepEqual(app.config.getCheatConfig().automation.shops, [], "after an Error text");
    answer = "ok";
    await app.read();
    assert.deepEqual(app.config.getCheatConfig().automation.shops, [], "once taken, the game holds Light's list");
});

test("a cheat command that throws during the catch-up is tried again by the next read", async (t) => {
    useInstall(t, `exports.startupCheats = ["godlike reach"];`);
    const game = fakeGame();
    let refuse = true;
    let throwOnce = true;
    game.updateConfig = async (config, replace) => {
        game.calls.push(["config", replace]);
        return refuse ? { error: { text: "busy" } } : { value: "Config updated in game." };
    };
    const execute = game.executeCheat;
    game.executeCheat = async (command, on) => {
        if (throwOnce && command === "godlike reach") {
            throwOnce = false;
            throw new Error("Execution context was destroyed.");
        }
        return execute(command, on);
    };
    const app = start(game);
    await app.change("use", "Light");
    refuse = false;
    game.calls.length = 0;
    await app.read(); // the catch-up throws on its first command
    await app.read(); // and is tried again
    assert.deepEqual(game.calls.slice(-1 - SHIPPED.Light.startupCheats.length - 1), [
        ["config", true],
        ["godlike reach", false],
        ...SHIPPED.Light.startupCheats.map((cheat) => [cheat, true]),
    ]);
    game.calls.length = 0;
    await app.read();
    assert.deepEqual(game.calls, [], "in step again");
});
