/**
 * The change log (#31): every value a WebUI page saved this game session, grouped by the action that saved it,
 * so the History page and Undo can put the old values back. It lives here, in memory, so a WebUI reload keeps it;
 * the injector serves one game session (nothing re-attaches after the game closes), so a restart starts it empty.
 */

// ponytail: oldest actions drop past this; the History page shows a session, not an archive.
const MAX_ACTIONS = 300;

const isEntry = (entry) =>
    entry &&
    typeof entry === "object" &&
    typeof entry.path === "string" &&
    entry.path.length > 0 &&
    (entry.character === null || typeof entry.character === "string");

/** @param {object} app - TinyRouter */
function setupChangeRoutes(app) {
    // Oldest first; each { id, page, label, place, time, entries: [{ path, before, hasBefore, after, character, live, undone }] }.
    const actions = [];

    /** Every action this session, newest first. */
    app.get("/api/changes", (req, res) => {
        res.json({ actions: [...actions].reverse() });
    });

    /** { action: { id, page, label, place }, entries } adds the entries to that action (made on its first save). */
    app.post("/api/changes", async (req, res) => {
        const { action, entries } = await req.json();
        if (
            !action ||
            typeof action.id !== "string" ||
            !action.id ||
            !Array.isArray(entries) ||
            !entries.every(isEntry)
        )
            return res.status(400).json({ error: "Expected { action: { id }, entries: [{ path, character }] }" });
        let stored = actions.find((entry) => entry.id === action.id);
        if (!stored) {
            stored = {
                id: action.id,
                page: String(action.page ?? ""),
                label: String(action.label ?? ""),
                // Where it was made ({ view, page }), so an undo can have that page read the game again.
                place: { view: String(action.place?.view ?? ""), page: String(action.place?.page ?? "") },
                time: Date.now(),
                entries: [],
            };
            actions.push(stored);
            if (actions.length > MAX_ACTIONS) actions.shift();
        }
        for (const entry of entries)
            stored.entries.push({
                path: entry.path,
                before: entry.before,
                hasBefore: entry.hasBefore === true,
                after: entry.after,
                character: entry.character,
                live: entry.live === true,
                undone: false,
            });
        res.json({ ok: true });
    });

    /** { id, indexes } marks those entries of the action as undone. */
    app.post("/api/changes/undone", async (req, res) => {
        const { id, indexes } = await req.json();
        const stored = actions.find((entry) => entry.id === id);
        if (!stored || !Array.isArray(indexes)) return res.status(404).json({ error: "No such change" });
        for (const index of indexes) if (stored.entries[index]) stored.entries[index].undone = true;
        stored.undoneAt = Date.now();
        res.json({ ok: true });
    });
}

module.exports = { setupChangeRoutes };
