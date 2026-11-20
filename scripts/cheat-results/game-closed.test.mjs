// Each file runs in its own process, so the cheat code and the store here are fresh copies.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadGame, loadUi, request } from "../known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { setupApiRoutes } = require("../../src/modules/server/apiRoutes");
const wsServer = require("../../src/modules/server/wsServer");

const NodeWebSocket = globalThis.WebSocket; // loadGame() stubs it for the game side
const setTimeoutReal = globalThis.setTimeout;
const wait = (ms) => new Promise((resolve) => setTimeoutReal(resolve, ms));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
/** The sidebar's status line (#77): what it says, its tone, and the details its click opens. */
const statusLine = (sidebar) => {
    const label = find(sidebar, (node) => node.attributes?.id === "system-status-text")[0];
    const details = find(sidebar, (node) => node.attributes?.id === "system-status-details")[0];
    return { text: text(label), tone: label.attributes.class, details: text(details) };
};

test("when the game closes, the status line says so until a restart, and the active cheats clear", async (t) => {
    const game = await loadGame();
    await game.cheat("godlike crit", true);

    // The real WebSocket server and routes, reading the fake game over (fake) CDP.
    const server = createServer();
    wsServer.initWebSocket(server, game.runtime, "context");
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = Object.assign(new EventEmitter(), { Runtime: game.runtime });
    const router = new TinyRouter();
    setupApiRoutes(router, "context", client, { cheatConfig: {}, startupCheats: [], injectorConfig: {} });

    // The real store, connecting with Node's WebSocket. Its 10 s timers must not keep the test alive.
    globalThis.WebSocket = NodeWebSocket;
    globalThis.setTimeout = (fn, ms, ...args) => {
        const timer = setTimeoutReal(fn, ms, ...args);
        return ms >= 10000 ? timer.unref() : timer;
    };
    const setIntervalReal = globalThis.setInterval;
    globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
    globalThis.window = {
        location: { protocol: "http:", host: `127.0.0.1:${server.address().port}` },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
    };
    const { store } = await loadUi(router);
    globalThis.document.addEventListener = () => {};
    const { Sidebar } = await importRepo("src/ui/components/Sidebar.js");
    const sidebar = Sidebar();
    const ws = await importRepo("src/ui/services/ws.js");
    t.after(() => {
        ws.closeWebSocket();
        wsServer.closeWebSocket();
        server.close();
    });
    store.initHeartbeat();

    for (let i = 0; !store.getActiveCheats().length && i < 200; i++) await wait(10);
    for (let i = 0; !store.app.heartbeat && i < 200; i++) await wait(10);
    assert.deepEqual(store.getActiveCheats(), ["godlike crit"]);
    assert.equal(store.app.heartbeat, true, "online while the game runs");
    await wait(20);
    assert.deepEqual(statusLine(sidebar), { text: "SYSTEM ONLINE", tone: "is-online", details: "" });
    assert.equal((await request(router, "GET", "/api/heartbeat")).body.status, "online");

    client.emit("disconnect"); // the game closed
    for (let i = 0; store.app.heartbeat && i < 200; i++) await wait(10);

    assert.equal(store.app.heartbeat, false, "the status must stop saying online");
    assert.deepEqual(store.getActiveCheats(), [], "no cheat is on in a game that closed");
    await wait(20);
    assert.deepEqual(statusLine(sidebar), {
        text: "GAME CLOSED",
        tone: "is-warn",
        details: "The game closedRestart the injector to use cheats again.",
    });
    assert.equal((await request(router, "GET", "/api/heartbeat")).body.status, "game closed");

    // A later update (say a cheat from another tab) must neither bring "online" back nor clear the warning.
    await wsServer.broadcastCheatStates();
    await wait(50);
    assert.equal(store.app.heartbeat, false);
    assert.equal(statusLine(sidebar).text, "GAME CLOSED", "it stays until a restart");
});
