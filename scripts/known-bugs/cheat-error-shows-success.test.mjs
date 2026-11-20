import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { loadGame, loadUi } from "./index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { createGameBridge } = require("../../src/modules/game/gameBridge");
const { setupCheatRoutes } = require("../../src/modules/server/routes/cheats");

test("a cheat that throws shows an error, not a success", async () => {
    const game = await loadGame();
    game.defineCheat({
        name: "fixture broken",
        message: "a cheat that throws",
        fn: () => {
            throw new TypeError("game value missing");
        },
    });
    const router = new TinyRouter();
    setupCheatRoutes(router, createGameBridge(game.runtime, "context"));
    const { store } = await loadUi(router);

    const { ok, message } = await store.executeCheat("fixture broken");
    assert.equal(ok, false, `it said: ${message.split("\n")[0]}`);
});
