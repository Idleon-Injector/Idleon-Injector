import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { KNOWN_BUGS, loadGame, loadUi } from "./index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { createGameBridge } = require("../../src/modules/game/gameBridge");
const { setupCheatRoutes } = require("../../src/modules/server/routes/cheats");

test("a cheat that throws shows an error, not a success", { todo: KNOWN_BUGS.cheatErrorShowsSuccess }, async () => {
    const game = await loadGame();
    game.registerCheat({
        name: "fixture broken",
        message: "a cheat that throws",
        fn: () => {
            throw new TypeError("game value missing");
        },
    });
    const router = new TinyRouter();
    setupCheatRoutes(router, createGameBridge(game.runtime, "context"));
    const { store } = await loadUi(router);

    await store.executeCheat("fixture broken", "a cheat that throws");

    const { type, message } = store.app.toast;
    assert.equal(type, "error", `the toast was ${type}: ${message.split("\n")[0]}`);
});
