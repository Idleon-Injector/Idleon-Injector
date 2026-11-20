/**
 * Undo (#31): put back the old values of one logged action, on the character each value belongs to.
 * Its writes go through writeManyVerified (read back and checked) and are not logged again; the action's
 * entries are marked undone instead.
 */
import { fetchChanges, markChangesUndone, matchesVerifiedValue, readGgaMany } from "../../../services/api.js";
import {
    LIVE_TO_SAVED,
    SAVED_TO_LIVE,
    changesVersion,
    parseSavedPath,
    reloadPlace,
    rootKey,
} from "../../../services/changeLog.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { writeManyVerified } from "./accountShared.js";

const shortValue = (value) => {
    if (typeof value === "number") return formatNumber(value);
    const text = value === undefined ? "nothing" : JSON.stringify(value);
    return text.length > 18 ? `${text.slice(0, 17)}…` : text;
};

// The shared path resolver treats dots and brackets as separators, even inside a name.
const ADDRESSABLE = /^[^.[\]]+$/;

/**
 * Where an entry's old value goes now. A character's own value goes to that character: its live copy (the
 * top-level save keys) while it is in play, its PlayerDATABASE entry while another character is.
 * Throws an Error saying why when that place can't be addressed.
 */
const targetPath = async (entry, active) => {
    if (entry.character === null) return entry.path;
    if (!ADDRESSABLE.test(entry.character)) throw new Error(`can't address ${entry.character}`);
    if (entry.live) {
        if (active === entry.character) return entry.path;
        const key = rootKey(entry.path);
        return `PlayerDATABASE.h[${entry.character}].h.${LIVE_TO_SAVED[key] ?? key}${entry.path.slice(key.length)}`;
    }
    const saved = parseSavedPath(entry.path);
    if (active !== saved.name) return entry.path;
    // That character is in play now, so its live copy is the one the game keeps.
    let live = SAVED_TO_LIVE[saved.field] ?? null;
    if (!live) {
        const [read] = await readGgaMany([saved.field]);
        if (read?.ok && read.value !== undefined && read.value !== null) live = saved.field;
    }
    if (!live) throw new Error(`${saved.name} is in play; switch first`);
    return `${live}${saved.rest}`;
};

/**
 * Undo every entry of the action not undone yet. Resolves to the action; rejects with an Error whose message
 * is the reason, short enough to show beside a field. Nothing is written when a value changed since, so a
 * refused undo leaves the game as it was (and the entry in the log).
 */
export const undoAction = async (id) => {
    const { actions } = await fetchChanges();
    const action = actions.find((entry) => entry.id === id);
    if (!action) throw new Error("no longer in History");
    const todo = action.entries.map((entry, index) => ({ ...entry, index })).filter((entry) => !entry.undone);
    if (!todo.length) throw new Error("already undone");
    if (todo.some((entry) => !entry.hasBefore)) throw new Error("old value unknown");

    const [activeRead] = await readGgaMany(["UserInfo[0]"]);
    const active = activeRead?.ok && typeof activeRead.value === "string" ? activeRead.value : null;
    const targets = [];
    for (const entry of todo) targets.push(await targetPath(entry, active));

    const now = await readGgaMany(targets);
    const changed = todo.filter((entry, i) => !now[i]?.ok || !matchesVerifiedValue(entry.after, now[i].value));
    if (changed.length === 1 && todo.length === 1) throw new Error(`changed since: now ${shortValue(now[0].value)}`);
    if (changed.length) throw new Error(`${changed.length} of ${todo.length} changed since`);

    // A value saved to both copies of the character in play goes back once.
    const writes = [];
    targets.forEach((path, i) => {
        if (!writes.some((write) => write.path === path)) writes.push({ path, value: todo[i].before });
    });
    try {
        await writeManyVerified(writes, { log: false });
    } catch (error) {
        const kept = new Set(
            (error.results ?? []).filter((result) => result.ok).map((result) => result.path.replace(/^gga\./, ""))
        );
        const landed = todo.filter((_entry, i) => kept.has(targets[i])).map((entry) => entry.index);
        if (landed.length) await markChangesUndone(id, landed);
        changesVersion.val++;
        const missed = writes.length - kept.size;
        throw new Error(
            error.results
                ? `${missed === writes.length ? "game kept the value" : `${missed} of ${writes.length} not undone`}`
                : error.message || "not undone"
        );
    }
    await markChangesUndone(
        id,
        todo.map((entry) => entry.index)
    );
    changesVersion.val++;
    return action;
};

/** After an undo outside the row that made the change: the page it was made on shows the game's values again. */
export const reloadAfterUndo = (action) => {
    if (action?.place) reloadPlace.val = { ...action.place };
};
