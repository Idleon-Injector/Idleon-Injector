import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { test } from "node:test";
import { KNOWN_BUGS, captureLogger, loadCommonJs, loadGame, request, useInstallDir } from "./index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { setupApiRoutes } = require("../../src/modules/server/apiRoutes");

test(
    "settings a cheat changes inside the game reach the injector's config",
    { todo: KNOWN_BUGS.gameConfigNeverFlowsBack },
    async (t) => {
        useInstallDir(t, { cheatConfig: { godlike: { speed: 9 }, nomore: { items: [] } } });
        const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": captureLogger() });
        config.loadConfiguration();
        const game = await loadGame();
        game.state.updateCheatConfig(structuredClone(config.getCheatConfig())); // injected at startup as a copy
        game.gga.ItemDefinitionsGET.h.Copper = { h: { Type: "Ore" } };

        const router = new TinyRouter();
        setupApiRoutes(router, "context", Object.assign(new EventEmitter(), { Runtime: game.runtime }), {
            cheatConfig: config.getCheatConfig(),
            startupCheats: config.getStartupCheats(),
            injectorConfig: config.getInjectorConfig(),
        });
        // The Cheats list runs cheats in the game through this route; the CLI uses the same game bridge.
        await request(router, "POST", "/api/toggle", { action: "godlike speed 5" });
        await request(router, "POST", "/api/toggle", { action: "nomore Copper" });
        assert.equal(game.state.cheatConfig.godlike.speed, 5, "the game took the new value");
        assert.equal(String(game.state.cheatConfig.nomore.items), "/Copper/", "the game took the pattern");

        const saved = config.getCheatConfig(); // what the WebUI shows and the next Save writes
        assert.equal(saved.godlike.speed, 5, "'godlike speed 5' must reach the injector's config");
        assert.ok(
            saved.nomore.items.some((item) => String(item).includes("Copper")),
            "'nomore Copper' must reach the injector's config"
        );
    }
);
