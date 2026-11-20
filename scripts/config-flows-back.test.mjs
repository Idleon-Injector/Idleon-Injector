/**
 * Settings changed inside the game (issue #20) reach the injector, survive a save and a restart, and only
 * real settings come back: not the multiplestacks Map or fix_save's copy of a game value.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { captureLogger, loadCommonJs, loadGame, request, requireFresh, useInstallDir } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const { setupApiRoutes } = require("../src/modules/server/apiRoutes");
const { objToString } = require("../src/modules/utils/helpers");

test("in-game settings are saved and come back after a restart, and runtime-only values stay in the game", async (t) => {
    const dir = useInstallDir(t, { cheatConfig: { godlike: { speed: 9 } } });
    const startConfig = () => {
        const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": captureLogger() });
        config.loadConfiguration();
        return config;
    };
    const config = startConfig();
    const game = await loadGame();
    game.state.updateCheatConfig(structuredClone(config.getCheatConfig()));
    game.gga.ItemDefinitionsGET.h.Copper = { h: { Type: "Ore" } };
    game.gga.Lv0 = [1, 2, 3];

    const router = new TinyRouter();
    setupApiRoutes(router, "context", Object.assign(new EventEmitter(), { Runtime: game.runtime }), {
        cheatConfig: config.getCheatConfig(),
        startupCheats: config.getStartupCheats(),
        injectorConfig: config.getInjectorConfig(),
    });
    for (const action of ["godlike speed 5", "nomore Copper", "multiplestacks Copper 3", "fix_save Lv0"]) {
        const { body } = await request(router, "POST", "/api/toggle", { action });
        assert.equal(body.ok, true, `${action}: ${body.message}`);
    }
    assert.ok(game.state.cheatConfig.multiplestacks.items instanceof Map, "the game keeps its own list");
    assert.deepEqual(game.state.cheatConfig.fixobj, [1, 2, 3]);

    const live = config.getCheatConfig();
    assert.equal(live.godlike.speed, 5);
    assert.deepEqual(live.nomore.items.map(String), ["/Copper/"]);
    assert.equal("multiplestacks" in live, false, "an empty multiplestacks would replace the game's Map on reload");
    assert.equal("fixobj" in live, false, "fix_save's copy is not a setting");

    await config.saveConfiguration({});
    assert.equal("fixobj" in requireFresh(join(dir, "config.custom.js")).cheatConfig, false);

    // Restart: the saved settings load and reach a newly injected game.
    const restarted = startConfig().getCheatConfig();
    assert.equal(restarted.godlike.speed, 5);
    assert.ok(restarted.nomore.items[0] instanceof RegExp);
    const injected = vm.runInThisContext(`(${objToString(restarted)})`);
    assert.ok(injected.nomore.items[0].test("Copper"), "the game gets a working pattern");
});

test("Save settings reaches the game, so the next settings read keeps it and the next save writes it", async (t) => {
    const dir = useInstallDir(t, { cheatConfig: { godlike: { speed: 2 }, skipWhale: true } });
    const config = require("../src/modules/config/configManager");
    config.loadConfiguration();
    const game = await loadGame();
    game.state.updateCheatConfig(structuredClone(config.getCheatConfig()));
    const router = new TinyRouter();
    setupApiRoutes(router, "context", Object.assign(new EventEmitter(), { Runtime: game.runtime }), {
        cheatConfig: config.getCheatConfig(),
        defaultConfig: config.getDefaultConfig(),
        startupCheats: config.getStartupCheats(),
        injectorConfig: config.getInjectorConfig(),
    });
    const fileSpeed = () => requireFresh(join(dir, "config.custom.js")).cheatConfig.godlike?.speed;

    // Config: change speed to 7 and press Save settings, which sends the whole config read just before.
    const toSave = (await request(router, "GET", "/api/config")).body;
    delete toSave.defaultConfig;
    toSave.cheatConfig.godlike.speed = 7;
    const saved = await request(router, "POST", "/api/config/save", toSave);
    assert.equal(saved.body.message, "Configuration successfully saved to config.custom.js");
    assert.equal(fileSpeed(), 7);
    assert.equal(game.state.cheatConfig.godlike.speed, 7, "the game has the saved value");

    // Opening Config again reads the game's settings back; then another setting is saved.
    const reopened = (await request(router, "GET", "/api/config")).body;
    assert.equal(reopened.cheatConfig.godlike.speed, 7, "Config still shows the saved value");
    await request(router, "POST", "/api/config/save", { cheatConfig: { skipWhale: false } });
    assert.equal(fileSpeed(), 7, "the file keeps it");
});
