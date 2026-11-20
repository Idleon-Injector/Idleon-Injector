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
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));

test("the WebUI shows failed game hooks in the status line until they install", async (t) => {
    const game = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    const holes = game.context["scripts.ActorEvents_579"]._customBlock_Holes;
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
    globalThis.window = {
        location: { protocol: "http:", host: `127.0.0.1:${server.address().port}` },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
    };
    const { store } = await loadUi(router);
    globalThis.document.addEventListener = () => {};
    const ws = await importRepo("src/ui/services/ws.js");
    const { Sidebar } = await importRepo("src/ui/components/Sidebar.js");
    t.after(() => {
        ws.closeWebSocket();
        wsServer.closeWebSocket();
        server.close();
    });
    const sidebar = Sidebar();
    const label = find(sidebar, (node) => node.attributes?.id === "system-status-text")[0];
    const toggle = find(sidebar, (node) => node.attributes?.["aria-controls"] === "system-status-details")[0];
    const details = () => find(sidebar, (node) => node.attributes?.id === "system-status-details")[0];
    store.initHeartbeat();

    for (let i = 0; !store.app.hookFailures.length && i < 200; i++) await wait(10);
    await wait(20);
    assert.equal(text(label), "HOOK FAILED");
    assert.equal(label.attributes.class, "is-warn", "the line turns warm");
    assert.equal(label.attributes.role, "status", "screen readers hear it");

    // A click opens the details: which hook, and which cheats won't work.
    assert.equal(toggle.disabled ?? toggle.attributes.disabled, false);
    toggle.listeners.click();
    await wait(20);
    assert.equal(toggle.attributes["aria-expanded"], "true");
    assert.equal(
        text(details()),
        "1 game hook didn't installSo these cheats won't work:w5 holesw5.holes: events(579)._customBlock_Holes not found"
    );

    // Every cheat repeats the list; the same list leaves the line as it is.
    game.cheat("upstones rng");
    await wsServer.broadcastCheatStates();
    await wait(50);
    assert.equal(text(label), "HOOK FAILED");

    // Once the hook installs, the line goes back to normal and the details close.
    game.context["scripts.ActorEvents_579"]._customBlock_Holes = holes;
    (await importRepo("src/cheats/core/hooks.js")).installHooks();
    await wsServer.broadcastCheatStates();
    for (let i = 0; store.app.hookFailures.length && i < 200; i++) await wait(10);
    await wait(20);
    assert.notEqual(text(label), "HOOK FAILED");
    assert.notEqual(label.attributes.class, "is-warn");
    assert.equal(toggle.attributes["aria-expanded"], "false");
});
