import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { test } from "node:test";
import { loadGame, loadUi, request } from "./index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { setupApiRoutes } = require("../../src/modules/server/apiRoutes");

test("the active-cheats list names real cheats, shows nested ones, and notices the game closing", async () => {
    const game = await loadGame();
    // No cheat registered today is three levels deep, so the test registers one the way the game code would.
    game.defineCheat({
        name: "fixture",
        message: "fixture",
        subcheats: [{ name: "nested", message: "nested", subcheats: [{ name: "deep", message: "deep" }] }],
    });
    const client = Object.assign(new EventEmitter(), { Runtime: game.runtime });
    const router = new TinyRouter();
    setupApiRoutes(router, "context", client, { cheatConfig: {}, startupCheats: [], injectorConfig: {} });
    const { store } = await loadUi(router);

    for (const action of ["upstones rng", "fixture nested deep"]) game.cheat(action);
    await store.loadCheatStates();
    // Each entry is clicked to turn that cheat off, so it must be the cheat's own name.
    assert.deepEqual(store.getActiveCheats().sort(), ["fixture nested deep", "upstones rng"]);

    const heartbeat = async () => ({ ...(await request(router, "GET", "/api/heartbeat")).body, timestamp: 0 });
    const whileRunning = await heartbeat();
    client.emit("disconnect"); // the game closed
    assert.notDeepEqual(await heartbeat(), whileRunning, "the status must change when the game closes");
});
