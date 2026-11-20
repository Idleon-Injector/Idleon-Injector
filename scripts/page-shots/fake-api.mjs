/**
 * The injector's real web server and API routes, attached to the fake game instead of a CDP client.
 * Routes that reach outside the process (update check and apply, open a URL, save config.custom.js) answer
 * without doing it.
 */
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createFakeGame } from "./fake-game.mjs";

const require = createRequire(import.meta.url);
const { createWebServer, startServer } = require("../../src/modules/server/webServer");
const { setupApiRoutes } = require("../../src/modules/server/apiRoutes");
const { version } = require("../../package.json");
const { deepClone } = require("../../src/modules/utils/objectUtils.js");

/** Build the router with every API route on the fake game; `game.misses` lists reads the fixture lacked. */
export async function createFakeApi(fixture) {
    const game = await createFakeGame(fixture);
    const config = require("../../config.js");
    const client = {
        Runtime: game.runtime,
        Target: { getTargetInfo: async () => ({ targetInfo: { targetId: "fake-game" } }) },
        on() {},
    };
    const router = createWebServer({ enableUI: true });
    setupApiRoutes(router, "ctx", client, {
        // The server's session config is its own copy: saves change it, and config.js's defaults stay as they are.
        cheatConfig: deepClone(config.cheatConfig),
        defaultConfig: config.cheatConfig,
        startupCheats: [...config.startupCheats],
        injectorConfig: { ...config.injectorConfig },
        cdpPort: 0,
        // Not the repo's folder; nothing is written there unless the fake game cloud-saves.
        saveCopiesDir: path.join(os.tmpdir(), `idleon-fake-save-copies-${process.pid}`),
    });
    // Later registrations replace earlier ones (TinyRouter keeps one handler per path).
    router.get("/api/update/check", (req, res) =>
        res.json({
            currentVersion: version,
            canApplyUpdate: false,
            checkedAt: 0,
            updateAvailable: false,
            latestVersion: version,
            url: null,
            error: null,
        })
    );
    router.post("/api/update/apply", (req, res) => res.status(400).json({ error: "Not in the fake game" }));
    router.post("/api/open-url", (req, res) => res.json({ message: "URL opened successfully" }));
    // The server's own session update, kept for saveToSession even when a test replaces the route.
    sessionUpdates.set(router, router.routes.POST.get("/api/config/update"));
    // The real save writes config.custom.js, then takes the settings into the session and sends them to the game; the
    // fake skips the file.
    router.post("/api/config/save", async (req, res) => res.json(await saveToSession(router, await req.json())));
    return { router, game };
}

const sessionUpdates = new WeakMap();
/**
 * What the server's save does after writing the file: take `body` into the session and send it to the game. Answers as
 * the save does, so a test's own save route can call it once its file part is done.
 */
export async function saveToSession(router, body) {
    let answer = null;
    const capture = { status: () => capture, json: (data) => (answer = data) };
    await sessionUpdates.get(router)({ json: async () => body }, capture);
    const gameKeptOld = answer.message?.endsWith("failed to apply in game");
    return {
        message: gameKeptOld
            ? `Configuration saved to config.custom.js. The running game kept its old settings (${answer.details})`
            : "Configuration successfully saved to config.custom.js",
    };
}

/** Serve the WebUI on the fake API (port 0 picks a free one). */
export async function startFakeApi({ port = 0, fixture } = {}) {
    const { router, game } = await createFakeApi(fixture);
    const server = await startServer(router, port, { runtime: game.runtime, context: "ctx" });
    return { url: `http://localhost:${server.address().port}/`, server, game };
}
