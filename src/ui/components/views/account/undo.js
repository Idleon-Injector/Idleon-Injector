/**
 * Undo (#31): put back the old values of one logged action, on the character each value belongs to.
 * Its writes go through writeManyVerified (read back and checked) and are not logged again; the action's
 * entries are marked undone instead.
 */
import {
    deleteGga,
    fetchChanges,
    markChangesUndone,
    matchesVerifiedValue,
    readGgaMany,
} from "../../../services/api.js";
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

// The page the action was made on shows the game's values again (Pages and the area views listen).
const reloadPlaceOf = (action) => (reloadPlace.val = { ...action.place });

// The game's cached totals that a page's save clears, by the values they are built from. Undo clears them here,
// since the page may not be open. ponytail: one row per page that clears a cache; add a row with each new one.
const CACHES = [
    [/^Bubba\[[12]\](\[|$)/, "DNSM.h.Bubba_LVzAll"],
    [/^Research\[16\](\[|$)/, "DNSM.h.CellLV_tot"],
    [/^Research\[17\](\[[89]\])?$/, "DNSM.h.JellySlotz"],
];
// Resolves to false when the game didn't clear one: the values are back by then, so that is a warning, not a failure.
const clearCaches = (paths) =>
    Promise.all(
        CACHES.filter(([pattern]) => paths.some((path) => pattern.test(path))).map(([, cache]) => deleteGga(cache))
    ).then(
        () => true,
        () => false
    );

/** What a row says when its undo landed but the game's cached totals weren't cleared. */
export const TOTALS_NOT_CLEARED = "Undone. Refresh to update totals.";

/**
 * Undo every entry of the action not undone yet. Resolves to the action (with `warning` when the cached totals
 * weren't cleared: its entries are undone, so there is nothing to try again); rejects with an Error whose message
 * is the reason, short enough to show beside a field. Nothing is written when a value changed since, so a
 * refused undo leaves the game as it was (and the entry in the log). Once any old value is back, the page it
 * was made on reads the game again, even when the rest is refused.
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
    // Without who is in play, a character's value could go to its saved copy while the game keeps the live one.
    if (active === null && todo.some((entry) => entry.character !== null)) throw new Error("can't tell who is in play");
    const targets = [];
    for (const entry of todo) targets.push(await targetPath(entry, active));

    // An action can save one value twice (the Wardrobe saves a loadout, then its food stacks): the first old value
    // goes back, and only the last new value is checked.
    const first = new Map();
    const last = new Map();
    todo.forEach((entry, i) => {
        if (!first.has(entry.path)) first.set(entry.path, i);
        last.set(entry.path, i);
    });
    const now = await readGgaMany(targets);
    const changed = todo.filter(
        (entry, i) => last.get(entry.path) === i && (!now[i]?.ok || !matchesVerifiedValue(entry.after, now[i].value))
    );
    // A value that moved on: the page reads the game again, so its rows show what the game holds now.
    if (changed.length) reloadPlaceOf(action);
    if (changed.length === 1 && todo.length === 1) throw new Error(`changed since: now ${shortValue(now[0].value)}`);
    if (changed.length) throw new Error(`${changed.length} of ${todo.length} changed since`);

    // A value saved to both copies of the character in play goes back once, as the live copy had it: the game
    // keeps that one, so the saved copy's old value may be stale. Each write is refused in the game if the value
    // moved on from what was just checked (`expect`).
    const writes = [];
    targets.forEach((path, i) => {
        if (last.get(todo[i].path) !== i) return;
        const { before } = todo[first.get(todo[i].path)];
        const write = writes.find((entry) => entry.path === path);
        if (!write) writes.push({ path, value: before, expect: now[i].value });
        else if (todo[i].live) write.value = before;
    });
    try {
        await writeManyVerified(writes, { log: false });
    } catch (error) {
        const kept = new Set(
            (error.results ?? []).filter((result) => result.ok).map((result) => result.path.replace(/^gga\./, ""))
        );
        const landed = todo.filter((_entry, i) => kept.has(targets[i])).map((entry) => entry.index);
        const moved = (error.results ?? []).some((result) => result.error === "changed since");
        if (kept.size || moved) reloadPlaceOf(action);
        if (landed.length) await markChangesUndone(id, landed);
        changesVersion.val++;
        await clearCaches([...kept]);
        const missed = writes.length - kept.size;
        throw new Error(
            !error.results
                ? error.message || "not undone"
                : missed < writes.length
                  ? `${missed} of ${writes.length} not undone`
                  : moved
                    ? "changed since"
                    : "game kept the value"
        );
    }
    reloadPlaceOf(action);
    await markChangesUndone(
        id,
        todo.map((entry) => entry.index)
    );
    changesVersion.val++;
    if (!(await clearCaches(writes.map((write) => write.path)))) return { ...action, warning: TOTALS_NOT_CLEARED };
    return action;
};
