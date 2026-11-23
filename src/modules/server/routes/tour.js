/**
 * The first-start tour (#200): whether the player finished or skipped it. Kept in a file next to the injector, so the
 * browser menu and the in-game overlay agree (they don't share the browser's storage: the overlay runs in the game's
 * own browser, often with a fresh profile each start), and it lasts across restarts.
 */
const fs = require("fs/promises");
const { getRuntimePath } = require("../../utils/runtimePaths");
const { createLogger } = require("../../utils/logger");

const log = createLogger("API");

/**
 * @param {object} app - TinyRouter
 * @param {string} [file] - where the answer is kept (the injector's folder by default)
 */
function setupTourRoutes(app, file = getRuntimePath("tour.json")) {
    /** { done }: true once the tour was finished or skipped. A missing or unreadable file means it wasn't. */
    app.get("/api/tour", async (req, res) => {
        const done = await fs
            .readFile(file, "utf8")
            .then((text) => JSON.parse(text).done === true)
            .catch(() => false);
        res.json({ done });
    });

    /** { done: boolean }: finished or skipped (true), or "Show the tour again" (false). */
    app.post("/api/tour", async (req, res) => {
        const body = await req.json().catch(() => null);
        if (typeof body?.done !== "boolean") return res.status(400).json({ error: "Expected { done: true | false }" });
        try {
            await fs.writeFile(file, JSON.stringify({ done: body.done }));
            res.json({ done: body.done });
        } catch (error) {
            log.error("Error in /api/tour:", error);
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { setupTourRoutes };
