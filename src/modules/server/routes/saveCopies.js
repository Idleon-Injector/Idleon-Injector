const { isDeepStrictEqual } = require("util");
const { createLogger } = require("../../utils/logger");
const { getRuntimePath } = require("../../utils/runtimePaths");
const { diffSave, restoreWrites, writeCopy, listCopies, readCopy, pruneCopies } = require("../../saveCopies");
const { normalizeReadValue, writeGamePaths } = require("./game");

const log = createLogger("Save copies");

// The game keeps the newest copy until it's taken; a save comes every ~4 minutes, so a copy waits at most this long.
const PULL_EVERY_MS = 30 * 1000;

/**
 * Save copies (#32): pull each cloud save's copy from the game and store it, and the routes the History page uses.
 * @param {object} app - TinyRouter
 * @param {object} gameBridge
 * @param {string} [dir] - where the copies go; the injector's folder by default
 * @returns {{ pullSaveCopy: () => Promise<void>, stop: () => void }}
 */
function setupSaveCopyRoutes(app, gameBridge, dir = getRuntimePath("save-copies")) {
    // The last failure to take or store a copy, for the History page; cleared by the next copy stored.
    let warning = null;
    const warn = (message) => {
        warning = message;
        log.warn(message);
    };

    async function pullSaveCopy() {
        let copy;
        try {
            const result = await gameBridge.callHelper("takeSaveCopy");
            if (result.error) return log.debug(`No save copy to take: ${result.error.text}`);
            copy = result.value;
        } catch (error) {
            return log.debug(`No save copy to take: ${error.message}`);
        }
        if (!copy) return;
        if (copy.error) return warn(`The game saved, but its copy couldn't be made: ${copy.error}`);
        try {
            const id = await writeCopy(dir, copy.time, copy.json);
            warning = null;
            log.debug(`Save copy stored: ${id}`);
            const trimmed = await pruneCopies(dir);
            if (trimmed) log.info(`Removed the ${trimmed} oldest save copies: together they were over the size cap`);
        } catch (error) {
            warn(`A save copy couldn't be written to ${dir}: ${error.message}`);
        }
    }

    const timer = setInterval(pullSaveCopy, PULL_EVERY_MS);
    timer.unref();

    /** The save now, as the game's JSON. */
    const readSaveNow = async () => {
        const result = await gameBridge.callHelper("readSave");
        if (result.error) throw new Error(`Couldn't read the save: ${result.error.text}`);
        return result.value;
    };

    /** The copy and the save now, or null when an HTTP error was sent. */
    async function copyAndNow(id, res) {
        if (!id || typeof id !== "string") {
            res.status(400).json({ error: "Missing or invalid id" });
            return null;
        }
        let copy;
        try {
            copy = await readCopy(dir, id);
        } catch (error) {
            res.status(404).json({ error: error.message });
            return null;
        }
        const nowJson = await readSaveNow();
        const now = JSON.parse(nowJson);
        // A character's values sit in the top-level keys only while it's in play, so they only line up then.
        if (copy.character !== now.character) {
            res.status(409).json({
                error: `This copy was taken while playing ${copy.character}. Switch to ${copy.character} to compare or restore it.`,
            });
            return null;
        }
        return { copy, now, nowJson };
    }

    /** Every stored copy, newest first, and the last failure to store one (null when the last copy went fine). */
    app.get("/api/save-copies", async (req, res) => {
        try {
            res.json({ copies: await listCopies(dir), warning });
        } catch (error) {
            // The folder can't be read (a file in its place, no permission): no copies, and say why.
            res.json({ copies: [], warning: warning ?? `The save copies in ${dir} can't be read: ${error.message}` });
        }
    });

    /** { id } -> { id, character, groups: [{ key, changes: [{ path, copy, now, neverRestored, restorable }] }] } */
    app.post("/api/save-copies/compare", async (req, res) => {
        try {
            const { id } = await req.json();
            const both = await copyAndNow(id, res);
            if (!both) return;
            res.json({ id, character: both.copy.character, groups: diffSave(both.copy, both.now) });
        } catch (error) {
            log.error("Error in /api/save-copies/compare:", error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * A restore is a fork: first a copy of the save as it is ("Before restore", the way back), then the copy's values
     * are written through the same game helper as the write-many route, each checked as the game read it back in that
     * same call (#78), then a copy of the save after it ("Restored from <copy> (<what>)"). One restore runs at a time,
     * so two quick ones each get their own before-copy.
     */
    async function restore(req, res) {
        const { id, select } = await req.json();
        if (select !== "all" && !(Array.isArray(select) && select.every((s) => typeof s === "string" && s))) {
            return res.status(400).json({ error: 'select must be "all" or a list of paths' });
        }
        const both = await copyAndNow(id, res);
        if (!both) return;
        const writes = restoreWrites(diffSave(both.copy, both.now), select);
        if (writes.length === 0) return res.json({ ok: true, results: [], before: null, after: null });

        const before = await writeCopy(dir, Date.now(), both.nowJson, { kind: "before" });
        let written;
        try {
            // Only while the copy's character is in play, checked by the game as it writes.
            written = await writeGamePaths(gameBridge, writes, both.copy.character);
        } catch (error) {
            if (error.refused) return res.status(409).json({ error: error.message, before });
            throw error;
        }
        const results = writes.map((write, i) => {
            const wrote = written.results?.[i];
            if (!wrote?.ok) return { path: write.path, ok: false, error: wrote?.error ?? "Write failed" };
            if (!isDeepStrictEqual(normalizeReadValue(wrote.value), write.value)) {
                return { path: write.path, ok: false, error: "Write mismatch" };
            }
            return { path: write.path, ok: true };
        });
        const landed = results.filter((r) => r.ok).length;
        log.info(`Restored ${landed} of ${writes.length} values from save copy ${id}`);
        let after = null;
        if (landed) {
            const keys = [...new Set(writes.map((write) => write.path.slice(4).split(/[.[]/)[0]))];
            const what = select === "all" ? "all" : keys.length === 1 ? keys[0] : `${keys.length} keys`;
            const copyTime = (await listCopies(dir)).find((c) => c.id === id)?.time ?? null;
            after = await writeCopy(dir, Date.now(), await readSaveNow(), { kind: "restored", from: copyTime, what });
        }
        res.json({ ok: landed === writes.length, results, before, after });
    }

    /**
     * { id, select: "all" | paths } -> { ok, results: [{ path, ok, error? }], before, after }: the ids of the copies
     * taken before and after (null when nothing was left to restore, or nothing landed).
     */
    let running = Promise.resolve();
    app.post("/api/save-copies/restore", async (req, res) => {
        const turn = running.then(() => restore(req, res));
        running = turn.catch(() => {});
        try {
            await turn;
        } catch (error) {
            log.error("Error in /api/save-copies/restore:", error);
            res.status(500).json({ error: error.message });
        }
    });

    return { pullSaveCopy, stop: () => clearInterval(timer) };
}

module.exports = { setupSaveCopyRoutes };
