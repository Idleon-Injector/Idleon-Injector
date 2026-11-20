/**
 * The change log's WebUI side (#31): which user action a save belongs to, and what it changed.
 *
 * writeVerified / writeManyVerified call startChange() before writing (it reads the old values and who is in play)
 * and finishChange() once the game read the new values back; the entries go to the server's log (/api/changes),
 * which outlives a WebUI reload. An action is one field save, one button press, or the writes after one click or key
 * on anything else; Undo puts back all of an action's values at once.
 */
import van from "../vendor/van-1.6.0.js";
import { VIEWS } from "../state/constants.js";
import { AREAS, pageTitle } from "../menu/menuModel.js";
import { menuTree } from "../menu/pageRegistry.js";
import { logChanges, readGgaMany } from "./api.js";

/** The active character's live copy of a PlayerDATABASE field, where the game names them differently. */
export const LIVE_TO_SAVED = { PrayersActive: "Prayers", PlacedTraps: "PldTraps" };
export const SAVED_TO_LIVE = {
    ...Object.fromEntries(Object.entries(LIVE_TO_SAVED).map(([live, saved]) => [saved, live])),
    // The game saves these fields of the character in play from part of a live key (its cloud save code).
    CardEquip: "Cards[2]",
    CSetEq: "Cards[3]",
};
const SAVED_PATH = /^PlayerDATABASE\.h\[([^\]]+)\]\.h\.([^.[]+)(.*)$/;

/** `PlayerDATABASE.h[name].h.Field…` -> { name, field, rest }, else null. */
export const parseSavedPath = (path) => {
    const match = SAVED_PATH.exec(path);
    return match ? { name: match[1], field: match[2], rest: match[3] } : null;
};
export const rootKey = (path) => /^[^.[]*/.exec(path)[0];

// Top-level save keys that are the active character's own data (true) or the account's (false), learned once
// per key by asking whether the active character's PlayerDATABASE entry has the same field.
const perCharacterKey = new Map();
/** True when a top-level save key is the active character's live copy of a PlayerDATABASE field. */
export const isLiveCharacterKey = async (key, active) => {
    if (LIVE_TO_SAVED[key]) return true;
    if (!perCharacterKey.has(key)) {
        const [read] = await readGgaMany([`PlayerDATABASE.h[${active}].h.${key}`]);
        // No answer is not "the account's": this save gets no Undo (startChange), and the next one asks again.
        if (!read?.ok) throw new Error(`can't read ${active}'s saved ${key}`);
        perCharacterKey.set(key, read.value !== undefined && read.value !== null);
    }
    return perCharacterKey.get(key);
};

// The menu's state (store.app), from startChangeLog; pages load without the app in tests.
let app = null;

/** Where the player is: the view, the page id (Pages view) and the name History shows. */
export const currentPlace = () => {
    if (!app) return { view: "", page: "", name: "" };
    const view = app.activeTab;
    if (view !== VIEWS.PAGES.id) {
        const tab = AREAS.flatMap((area) => area.tabs || [area]).find((entry) => VIEWS[entry.view].id === view);
        return { view, page: "", name: tab ? tab.label : "" };
    }
    const world = (menuTree.val || []).find((entry) => entry.id === app.menuWorld);
    const systems = world ? world.systems : [];
    const pages = systems.flatMap((system) => system.pages);
    const page = pages.find((entry) => entry.id === app.menuPage) || pages[0];
    if (!page) return { view, page: "", name: "" };
    const system = systems.find((entry) => entry.pages.includes(page));
    const title = pageTitle(page, system);
    return { view, page: page.id, name: title === system.name ? title : `${system.name} · ${title}` };
};

let actionCount = 0;
const newAction = (label, kind, anchor = null) => {
    const place = currentPlace();
    return {
        id: `${Date.now().toString(36)}-${++actionCount}`,
        label: String(label || "").trim(),
        page: place.name,
        place,
        kind,
        // The control that made it: a bulk action's Undo all sits beside it.
        anchor,
        entries: 0,
    };
};

/** The newest action that saved something outside a field row ({ action }): Undo all is offered beside its control. */
export const lastBulkAction = van.state(null);
/** Goes up whenever the log changes (a save, an undo), so the History page knows to read it again. */
export const changesVersion = van.state(0);

let current = null;
const open = new Set();
let gesture = { count: 0, label: "", target: null };
let gestureAction = null;

/** The words that name what a click or key landed on: its row's name, the button pressed, or a field's label. */
export const labelOf = (node) => {
    if (!node || typeof node.closest !== "function") return "";
    const clean = (text) =>
        String(text || "")
            .replace(/\s+/g, " ")
            .trim();
    const row = node.closest(".account-row, .account-inline-field, [data-change-label]");
    const rowName = clean(
        row?.getAttribute("data-change-label") ||
            row?.querySelector(".account-row__name, .account-inline-field__head > :first-child")?.textContent
    );
    const control = node.closest("button");
    const controlName =
        control && !control.classList.contains("number-input-btn")
            ? clean(control.getAttribute("aria-label") || control.textContent)
            : "";
    const fieldName = rowName || controlName ? "" : clean(node.getAttribute("aria-label"));
    return [rowName, controlName, fieldName].filter(Boolean).join(" · ").slice(0, 80);
};

// Writes that no field or button claimed (a page's own button, say) group by the click or key that led to them.
const noteGesture = (target) => {
    // A switch is one control whether its words, its track or its checkbox took the click or key.
    const control =
        typeof target?.closest === "function"
            ? target.closest(".toggle-switch") || target.closest("button, select, label, input")
            : null;
    gesture = { count: gesture.count + 1, label: labelOf(target), target: control || target };
};

/** The app starts the log: where saves are made (its menu state), and the clicks and keys that make them. */
export const startChangeLog = (appState, root) => {
    app = appState;
    root.addEventListener("pointerdown", (e) => noteGesture(e.target), true);
    root.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Enter" || e.key === " ") noteGesture(e.target);
        },
        true
    );
};

/**
 * Run `fn(action)` as one user action: every save it makes, now or after its awaits, is grouped under it.
 * Inside another action it joins that one. `kind` "row" means a field row offers the undo; "bulk" means the toast.
 */
export const withAction = ({ label = "", kind = "bulk", anchor = null } = {}, fn) => {
    if (current) {
        if (kind === "row") current.kind = "row";
        return fn(current);
    }
    const action = newAction(label || gesture.label, kind, anchor || gesture.target);
    open.add(action);
    current = action;
    let result;
    try {
        result = fn(action);
    } catch (error) {
        open.delete(action);
        throw error;
    } finally {
        current = null;
    }
    // A bulk action's Undo all is offered once all of its writes landed, so it puts back all of them.
    const done = () => {
        open.delete(action);
        if (action.kind !== "row" && action.entries > 0) lastBulkAction.val = { action };
    };
    Promise.resolve(result).then(done, done);
    return result;
};

/*
 * The action a save belongs to: the one whose code is running, else the only one still waiting on the game.
 * ponytail: two actions waiting at once (a quick tab through two fields whose pages read before writing) can't be
 * told apart without async context (not in Chromium 87); the save then gets its own action, so its row shows no Undo
 * but History still lists it.
 */
const actionForWrite = () => {
    if (current) return current;
    if (open.size === 1) return [...open][0];
    if (open.size > 1) return newAction(gesture.label, "bulk");
    if (!gestureAction || gestureAction.gesture !== gesture.count) {
        gestureAction = newAction(gesture.label, "bulk", gesture.target);
        gestureAction.gesture = gesture.count;
    }
    return gestureAction;
};

/**
 * Before a write: claim its action (synchronously, while the caller's code is still running) and read the old
 * values and who is in play. Resolves to what finishChange needs; never rejects, as a log can't stop a save.
 */
export const startChange = (rawPaths) => {
    const action = actionForWrite();
    const paths = rawPaths.map((path) => String(path).replace(/^gga\./, ""));
    return (async () => {
        try {
            const reads = await readGgaMany([...paths, "UserInfo[0]"]);
            const activeRead = reads[paths.length];
            const active = activeRead?.ok && typeof activeRead.value === "string" ? activeRead.value : null;
            const entries = [];
            for (const [index, path] of paths.entries()) {
                const read = reads[index];
                const saved = parseSavedPath(path);
                const live = !saved && active !== null && (await isLiveCharacterKey(rootKey(path), active));
                // Without who is in play, a top-level key may be a character's (Money): its old value is kept as
                // unknown, so no Undo puts it back on whoever is in play then.
                const owned = Boolean(saved) || active !== null;
                entries.push({
                    path,
                    hasBefore: Boolean(owned && read?.ok && read.value !== undefined),
                    before: read?.ok ? read.value : undefined,
                    character: saved ? saved.name : live ? active : null,
                    live,
                });
            }
            return { action, entries };
        } catch (error) {
            console.warn("[changes] Could not read the old values; Undo won't be offered for this save.", error);
            return { action, entries: paths.map((path) => ({ path, hasBefore: false, character: null, live: false })) };
        }
    })();
};

/** After the game read the values back: log the ones that landed (`landed[i]` false skips entry i). */
export const finishChange = async (change, values, landed = null) => {
    const entries = change.entries
        .map((entry, index) => ({ ...entry, after: values[index] }))
        .filter((_entry, index) => !landed || landed[index]);
    if (!entries.length) return;
    const { action } = change;
    try {
        await logChanges({ id: action.id, page: action.page, label: action.label, place: action.place }, entries);
        action.entries += entries.length;
        // An action still running is offered when it ends (withAction); one made by a click or key, as it logs.
        if (action.kind !== "row" && !open.has(action)) lastBulkAction.val = { action };
        changesVersion.val++;
    } catch (error) {
        console.warn("[changes] The change log didn't take this save; it won't be in History.", error);
    }
};

/** Places whose shown values an undo changed: their page re-reads the game (Pages and the area views listen). */
export const reloadPlace = van.state(null);
