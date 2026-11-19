// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadGame, loadUi } from "../known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { setupApiRoutes } = require("../../src/modules/server/apiRoutes");
const wsServer = require("../../src/modules/server/wsServer");

const NodeWebSocket = globalThis.WebSocket; // loadGame() stubs it for the game side
const setTimeoutReal = globalThis.setTimeout;
const wait = (ms) => new Promise((resolve) => setTimeoutReal(resolve, ms));

test("the WebUI shows failed game hooks as a warning that stays on screen", async (t) => {
    const game = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    game.context["scripts.ActorEvents_579"]._customBlock_Holes = undefined;
    await setup.call(game.context);

    // The real WebSocket server, reading the fake game over (fake) CDP.
    const server = createServer();
    wsServer.initWebSocket(server, game.runtime, "context");
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = Object.assign(new EventEmitter(), { Runtime: game.runtime });
    const router = new TinyRouter();
    setupApiRoutes(router, "context", client, { cheatConfig: {}, startupCheats: [], injectorConfig: {} });

    // The real store, connecting with Node's WebSocket. Its 10 s reconnect timer must not keep the test alive.
    globalThis.WebSocket = NodeWebSocket;
    globalThis.setTimeout = (fn, ms, ...args) => {
        const timer = setTimeoutReal(fn, ms, ...args);
        return ms >= 10000 ? timer.unref() : timer;
    };
    globalThis.window = { location: { protocol: "http:", host: `127.0.0.1:${server.address().port}` } };
    const { store } = await loadUi(router);
    const ws = await importRepo("src/ui/services/ws.js");
    t.after(() => {
        ws.closeWebSocket();
        wsServer.closeWebSocket();
        server.close();
    });
    store.initHeartbeat();

    for (let i = 0; !store.app.toast.message && i < 200; i++) await wait(10);
    const { message, type, persistent } = store.app.toast;
    assert.deepEqual(
        { message, type, persistent },
        {
            message:
                "1 game hook failed to install, so the cheats that use it won't work: setupEvents579Proxies: _customBlock_Holes not found",
            type: "error",
            persistent: true,
        }
    );
    assert.equal(store.app.notificationHistory[0].message, store.app.toast.message, "the bell keeps it too");

    // Every cheat repeats the list; the same list must not raise the warning again.
    store.notify("Cheat done");
    game.cheat("upstones rng");
    await wsServer.broadcastCheatStates();
    await wait(50);
    assert.equal(store.app.toast.message, "Cheat done");
});
