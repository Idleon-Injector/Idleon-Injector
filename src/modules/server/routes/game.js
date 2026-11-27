const { createLogger } = require("../../utils/logger");

const log = createLogger("API");

// CDP may serialize Haxe arrays as numeric-key objects. Preserve regular object maps.
const normalizeReadValue = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const keys = Object.keys(value);
        if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) return Object.assign([], value);
    }
    return value;
};

/**
 * Write many game paths through the game's writeGamePaths helper: the write-many route, and restoring a save copy.
 * Each written entry's `value` is read back in the game's same call, so a game tick can't change it first.
 * With `character`, the game writes nothing unless that character is in play, checked in that same call.
 * @returns {Promise<{ ok: boolean, results: Array<{ path: string, ok: boolean, value?: any, error?: string }> }>}
 * @throws {Error} when the game couldn't run the writes at all, or refused them (`refused`: another character in play)
 */
async function writeGamePaths(gameBridge, writes, character) {
    const result = await gameBridge.callHelper(
        "writeGamePaths",
        character === undefined ? [writes] : [writes, character]
    );
    if (result.error) throw new Error(`Batch write failed: ${result.error.text}`);
    const data = result.value;
    if (!data || typeof data !== "object") throw new Error("Batch write returned no data");
    if (data.error) throw Object.assign(new Error(data.error), { refused: data.refused === true });
    return data;
}

// The game makes one picture at a time, a frame apart: a page asking for many at once (all 177 at once stalls the
// game for about 0.2 s) costs it a millisecond or two a frame instead.
const PICTURE_GAP_MS = 16;
let pictureTurn = Promise.resolve();

/**
 * A picture from the running game, through one of its picture helpers, or null: no game, no picture.
 * Pictures only ever come from the game on the player's PC; nothing is written to disk.
 */
function readGamePicture(gameBridge, helper, args) {
    const read = pictureTurn.then(async () => {
        try {
            const result = await gameBridge.callHelper(helper, args);
            return result.error ? null : (result.value ?? null);
        } catch {
            return null; // the game closed
        }
    });
    pictureTurn = read.then(() => new Promise((resolve) => setTimeout(resolve, PICTURE_GAP_MS)));
    return read;
}

const queryOf = (req, name) => new URL(req.url, "http://localhost").searchParams.get(name);

/** A pet's picture (see getPetPicture), or null: no game, no picture, or a bad id. */
function readPetPicture(gameBridge, req, idle) {
    const id = Number(queryOf(req, "id"));
    if (!Number.isInteger(id) || id < 0) return Promise.resolve(null);
    return readGamePicture(gameBridge, "getPetPicture", [id, idle]);
}

/** A PNG data URL as an image for <img>; 404 without one, and the menu shows the name instead. */
function sendPicture(res, dataUrl) {
    if (!dataUrl) return res.status(404).json({ error: "No picture" });
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.end(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
}

function setupGameRoutes(app, gameBridge) {
    // Frame 0 as a PNG for <img>. The menu falls back to the pet's name on a 404.
    app.get("/api/game/pet-picture", async (req, res) => {
        sendPicture(res, (await readPetPicture(gameBridge, req, false))?.png);
    });

    // A pack's picture (see getBundlePicture) by its code, bundle-picture?code=bun_a; the game refuses unknown codes.
    app.get("/api/game/bundle-picture", async (req, res) => {
        sendPicture(res, await readGamePicture(gameBridge, "getBundlePicture", [queryOf(req, "code")]));
    });

    // The idle frames in one strip, for the hover animation; null without a game or picture. The menu also asks it
    // whether pictures work at all, which a 404 would log as an error in the browser.
    app.get("/api/game/pet-frames", async (req, res) => {
        res.json(await readPetPicture(gameBridge, req, true));
    });

    app.get("/api/game/bundles", async (req, res) => {
        try {
            const catalogResult = await gameBridge.callHelper("getBundleCatalog");

            if (catalogResult.error) {
                const details = catalogResult.error.details;
                return res.status(500).json({ error: "Failed to read bundle catalog", details });
            }

            const bundles = catalogResult.value;
            if (!Array.isArray(bundles)) {
                return res.status(500).json({ error: "Bundle catalog returned invalid data" });
            }

            log.debug(`Read bundle catalog (${bundles.length} bundles)`);
            res.json({ bundles });
        } catch (apiError) {
            log.error("Error in /api/game/bundles:", apiError);
            res.status(500).json({ error: "Internal server error while reading bundle catalog" });
        }
    });

    app.post("/api/game/gga/read", async (req, res) => {
        const { path } = await req.json();
        if (!path || typeof path !== "string") {
            return res.status(400).json({ error: "Missing or invalid path (must be a non-empty string)" });
        }

        try {
            const result = await gameBridge.callHelper("readGamePath", [path]);

            if (result.error) {
                return res.status(500).json({ error: "Read failed", details: result.error.text });
            }

            const data = result.value;
            if (data.error) return res.status(500).json({ error: data.error });

            log.debug(`Read path: ${path}`);
            res.json({ value: normalizeReadValue(data.value) });
        } catch (err) {
            log.error("Error in /api/game/gga/read:", err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/game/gga/read-many", async (req, res) => {
        const { paths } = await req.json();
        if (!Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({ error: "paths must be a non-empty array" });
        }
        if (!paths.every((path) => typeof path === "string" && path.length > 0)) {
            return res.status(400).json({ error: "paths must contain non-empty strings" });
        }

        try {
            const result = await gameBridge.callHelper("readGamePaths", [paths]);
            if (result.error) {
                const ex = result.error;
                return res.status(500).json({ error: "Batch read failed", details: ex.details });
            }

            const data = result.value;
            if (!data || !Array.isArray(data.results)) {
                return res.status(500).json({ error: data?.error ?? "Batch read returned no results" });
            }
            res.json({
                results: data.results.map((entry) =>
                    entry.ok ? { ...entry, value: normalizeReadValue(entry.value) } : entry
                ),
            });
        } catch (err) {
            log.error("Error in /api/game/gga/read-many:", err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/game/gga/read-entries", async (req, res) => {
        const { rootPath, keys, fields } = await req.json();

        if (!rootPath || typeof rootPath !== "string") {
            return res.status(400).json({ error: "Missing or invalid rootPath (must be a non-empty string)" });
        }
        if (!Array.isArray(keys) || keys.length === 0) {
            return res.status(400).json({ error: "Missing or invalid keys (must be a non-empty array)" });
        }
        if (!keys.every((key) => typeof key === "string" && key.length > 0)) {
            return res.status(400).json({ error: "keys must contain non-empty strings" });
        }
        if (fields !== undefined && fields !== null) {
            if (!Array.isArray(fields)) {
                return res.status(400).json({ error: "fields must be an array of strings when provided" });
            }
            if (!fields.every((field) => typeof field === "string" && field.length > 0)) {
                return res.status(400).json({ error: "fields must contain non-empty strings" });
            }
        }

        try {
            const result = await gameBridge.callHelper("readGameEntries", [rootPath, keys, fields ?? null]);

            if (result.error) {
                return res.status(500).json({ error: "Read entries failed", details: result.error.text });
            }

            const data = result.value;
            if (data.error) return res.status(500).json({ error: data.error });

            log.debug(`Read entries: ${rootPath} (${keys.length} keys)`);
            res.json({ value: data.value || {} });
        } catch (err) {
            log.error("Error in /api/game/gga/read-entries:", err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/game/computed/read", async (req, res) => {
        const { namespace, name, args } = await req.json();

        if (!namespace || typeof namespace !== "string") {
            return res.status(400).json({ error: "Missing or invalid namespace (must be a non-empty string)" });
        }
        if (!name || typeof name !== "string") {
            return res.status(400).json({ error: "Missing or invalid name (must be a non-empty string)" });
        }
        if (args !== undefined && !Array.isArray(args)) {
            return res.status(400).json({ error: "args must be an array when provided" });
        }

        try {
            const result = await gameBridge.callHelper("readComputedValue", [namespace, name, args ?? []]);

            if (result.error) {
                const ex = result.error;
                const details = ex.details;
                return res.status(500).json({ error: "Computed read failed", details });
            }

            const data = result.value;
            if (!data || typeof data !== "object") {
                return res.status(500).json({ error: "Computed read returned no data" });
            }
            if (data.error) return res.status(500).json({ error: data.error });

            log.debug(`Read computed: ${namespace}.${name}`);
            res.json({ value: data.value });
        } catch (err) {
            log.error("Error in /api/game/computed/read:", err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/game/computed/read-many", async (req, res) => {
        const { namespace, name, argSets } = await req.json();

        if (!namespace || typeof namespace !== "string") {
            return res.status(400).json({ error: "Missing or invalid namespace (must be a non-empty string)" });
        }
        if (!name || typeof name !== "string") {
            return res.status(400).json({ error: "Missing or invalid name (must be a non-empty string)" });
        }
        if (!Array.isArray(argSets)) {
            return res.status(400).json({ error: "argSets must be an array" });
        }
        if (!argSets.every(Array.isArray)) {
            return res.status(400).json({ error: "argSets must contain arrays" });
        }

        try {
            const result = await gameBridge.callHelper("readComputedValues", [namespace, name, argSets]);

            if (result.error) {
                const ex = result.error;
                const details = ex.details;
                return res.status(500).json({ error: "Computed batch read failed", details });
            }

            const data = result.value;
            if (!data || typeof data !== "object") {
                return res.status(500).json({ error: "Computed batch read returned no data" });
            }
            if (data.error) return res.status(500).json({ error: data.error });

            log.debug(`Read computed batch: ${namespace}.${name} (${argSets.length} items)`);
            res.json({ value: data.value || [] });
        } catch (err) {
            log.error("Error in /api/game/computed/read-many:", err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/game/gga/write", async (req, res) => {
        const { path, value } = await req.json();
        if (!path || typeof path !== "string") {
            return res.status(400).json({ error: "Missing or invalid path (must be a non-empty string)" });
        }
        if (value === undefined) {
            return res.status(400).json({ error: "Missing value" });
        }

        const serialized = JSON.stringify(value);
        if (serialized === undefined) {
            return res.status(400).json({ error: "value must be JSON-serializable" });
        }

        try {
            const result = await gameBridge.callHelper("writeGamePath", [path, value]);

            if (result.error) {
                return res.status(500).json({ error: "Write failed", details: result.error.text });
            }

            const data = result.value;
            if (!data || typeof data !== "object") {
                return res.status(500).json({ error: "Write returned no data" });
            }
            if (data.error) return res.status(500).json({ error: data.error });

            log.debug(`Write path: ${path} = ${serialized}`);
            // `value` is read back in the game's same call, before any game tick (writePath).
            res.json({ ok: true, value: normalizeReadValue(data.value) });
        } catch (err) {
            log.error("Error in /api/game/gga/write:", err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/game/gga/delete", async (req, res) => {
        const { path } = await req.json();
        if (!path || typeof path !== "string") {
            return res.status(400).json({ error: "Missing or invalid path (must be a non-empty string)" });
        }

        try {
            const result = await gameBridge.callHelper("deleteGamePath", [path]);

            if (result.error) {
                return res.status(500).json({ error: "Delete failed", details: result.error.text });
            }

            const data = result.value;
            if (!data || typeof data !== "object") {
                return res.status(500).json({ error: "Delete returned no data" });
            }
            if (data.error) return res.status(500).json({ error: data.error });

            log.debug(`Deleted path: ${path}`);
            res.json({ ok: true });
        } catch (err) {
            log.error("Error in /api/game/gga/delete:", err);
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/game/gga/write-many", async (req, res) => {
        const { writes, character } = await req.json();
        if (!Array.isArray(writes) || writes.length === 0) {
            return res.status(400).json({ error: "Missing or invalid writes (must be a non-empty array)" });
        }
        if (character !== undefined && (typeof character !== "string" || !character)) {
            return res.status(400).json({ error: "character must be a non-empty string" });
        }

        for (const [index, entry] of writes.entries()) {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                return res.status(400).json({ error: `Invalid write entry at index ${index}` });
            }
            if (!entry.path || typeof entry.path !== "string") {
                return res.status(400).json({ error: `Invalid path at index ${index}` });
            }
            if (!Object.prototype.hasOwnProperty.call(entry, "value")) {
                return res.status(400).json({ error: `Missing value at index ${index}` });
            }
            if (entry.value === undefined) {
                return res.status(400).json({ error: `value must not be undefined at index ${index}` });
            }
        }

        const serialized = JSON.stringify(writes);
        if (serialized === undefined) {
            return res.status(400).json({ error: "writes must be JSON-serializable" });
        }

        try {
            const data = await writeGamePaths(gameBridge, writes, character);
            log.debug(`Batch write: ${writes.length} paths`);
            res.json({
                ...data,
                results: data.results.map((entry) =>
                    entry.ok ? { ...entry, value: normalizeReadValue(entry.value) } : entry
                ),
            });
        } catch (err) {
            // A refusal (another character in play) is an answer, not a fault: 409, and the reason for the page.
            if (err.refused) {
                log.warn(`Batch write refused: ${err.message}`);
                return res.status(409).json({ error: err.message });
            }
            log.error("Error in /api/game/gga/write-many:", err);
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { setupGameRoutes, writeGamePaths, normalizeReadValue };
