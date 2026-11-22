/** Shared hooks and helpers for account feature tabs. */

import van from "../../../vendor/van-1.6.0.js";
import { gga, ggaMany, matchesVerifiedValue, readCList, readComputed, readGgaMany } from "../../../services/api.js";
import { Loader } from "../../Loader.js";
import { EmptyState } from "../../EmptyState.js";
import { formatNumber, formattedStep, parseNumber } from "../../../utils/numberFormat.js";
import { toIndexedArray } from "../../../utils/index.js";
import { captureGesture, finishChange, startChange, withAction } from "../../../services/changeLog.js";

const { div } = van.tags;

/** Unwrap a plain value, van.state, or zero-arg function. */
export const resolveValue = (valueOrState) => {
    if (typeof valueOrState === "function") return valueOrState();
    if (valueOrState && typeof valueOrState === "object" && "val" in valueOrState) return valueOrState.val;
    return valueOrState;
};

/** Normalize nullable/single/array content into an array of renderable nodes. */
export const toNodes = (content) => {
    if (content === null || content === undefined) return [];
    return Array.isArray(content) ? content : [content];
};

export const joinClasses = (...parts) => parts.filter(Boolean).join(" ");

/** Reuse a keyed van.state instance across refreshes. */
export const getOrCreateState = (map, key, initial = 0) => {
    if (!map.has(key)) map.set(key, van.state(initial));
    return map.get(key);
};

/** Create a lazy indexed van.state getter for sparse numeric/list indexes. */
export const createIndexedStateGetter = (initial = 0) => {
    const states = [];
    return (index) => {
        if (!states[index]) states[index] = van.state(typeof initial === "function" ? initial(index) : initial);
        return states[index];
    };
};

/** Rebuild a static row container only when the caller-provided signature changes. */
export const createStaticRowReconciler = (container) => {
    let currentSignature = null;

    return (signature, rows) => {
        if (signature === currentSignature) return false;

        currentSignature = signature;
        container.replaceChildren(...toNodes(typeof rows === "function" ? rows() : rows));
        return true;
    };
};

/**
 * Build row nodes with `build(row)`, reusing the node of a row whose data is unchanged, so a redraw keeps that row's
 * button state (a failure stays red on the row that asked). Rows are compared by their JSON, index included.
 */
export const createKeptRows = (build) => {
    let kept = new Map();
    return (rows) => {
        const next = new Map();
        const nodes = rows.map((row) => {
            const key = JSON.stringify(row);
            const node = kept.get(key) ?? build(row);
            next.set(key, node);
            return node;
        });
        kept = next;
        return nodes;
    };
};

/** Coerce a value to a finite number, or return `fallback` for NaN/Infinity. */
export const toNum = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

/** Unwrap Idleon-style wrapper objects that store payload in `.h`. */
export const unwrapH = (value) => (value && typeof value === "object" && "h" in value ? value.h : value);

/**
 * Safely coerce a value to a finite integer with configurable behavior.
 * - Default: round to nearest integer.
 * - mode: "floor" for floor behavior.
 * - min: clamp lower bound (e.g. 0 for non-negative ints).
 *
 * Backward compatible call style is supported:
 *   toInt(value, fallbackNumber)
 */
export const toInt = (value, opts = 0) => {
    const hasConfig = opts !== null && typeof opts === "object" && !Array.isArray(opts);
    const fallback = hasConfig ? (opts.fallback ?? 0) : opts;
    const mode = hasConfig ? (opts.mode ?? "round") : "round";
    const min = hasConfig ? (opts.min ?? -Infinity) : -Infinity;

    const n = toNum(value, toNum(fallback, 0));
    const asInt = mode === "floor" ? Math.floor(n) : Math.round(n);
    return Math.max(min, asInt);
};

/**
 * Normalize raw NumberInput text into a finite numeric value.
 * Supports formatted strings (e.g. "1.2M", "12,345"), float/int output,
 * optional clamping (or, with `strict`, an Error naming the bound), and a nullable fallback for invalid input.
 */
export const resolveNumberInput = (
    raw,
    { formatted = false, float = false, min = -Infinity, max = Infinity, fallback = null, strict = false } = {}
) => {
    if (typeof raw === "string" && raw.trim() === "") return fallback;

    let next = null;

    if (formatted) {
        next = parseNumber(String(raw));
    }

    if (next === null) {
        const coerced = Number(raw);
        if (!Number.isFinite(coerced)) return fallback;
        next = coerced;
    }

    const normalized = float ? next : Math.round(next);
    // strict: a typed value out of range is refused with the reason instead of clamped.
    if (strict && normalized > max) throw new Error(`max ${formatNumber(max)}`);
    if (strict && normalized < min) throw new Error(`min ${formatNumber(min)}`);
    return Math.max(min, Math.min(max, normalized));
};

export const resolveFormattedIntInput = (raw, fallback = null, { min = 0, max = Infinity } = {}) =>
    resolveNumberInput(raw, {
        formatted: true,
        min,
        max,
        fallback,
    });

/** Increment or decrement formatted integer input text by the least significant displayed digit. */
export const adjustFormattedIntInput = (raw, delta, fallback = 0, { min = 0, max = Infinity } = {}) => {
    const base = resolveFormattedIntInput(raw, fallback, { min, max });
    const current = base ?? fallback ?? min;
    return Math.max(min, Math.min(max, current + delta * formattedStep(current)));
};

export const largeFormatter = (raw) => {
    const n = parseNumber(String(raw));
    return n !== null ? formatNumber(n) : String(raw);
};

export const largeParser = (display) => {
    const n = parseNumber(display);
    return n !== null ? String(n) : null;
};

export const cleanName = (raw, fallback = "", { stripMarker = false } = {}) => {
    const base = String(raw ?? fallback);
    const normalized = stripMarker ? base.replace(/製.*$/, "") : base;
    return normalized.replace(/[|_]/g, " ").trim();
};

export const cleanNameEffect = (raw, fallback = "") =>
    cleanName(
        String(raw ?? fallback)
            .replace(/^\+\{[%\s]*/, "")
            .replace(/\}x[|_\s]*/g, "")
            .replace(/[@$_^{}]/g, " ")
            .replace(/\s+/g, " "),
        fallback
    );

/** A name the game writes in capitals (ROID_RAGIN) in normal case ("Roid Ragin"), keeping EXP as the game writes it. */
export const normalCase = (text) =>
    cleanName(text)
        .toLowerCase()
        .replace(/(^|\s)\S/g, (start) => start.toUpperCase())
        .replace(/\bExp\b/g, "EXP");

// The number's place in a game description: "+{", "{%", "+{%", "-{%", "}x".
const BONUS_NUMBER = /[+-]?\{%?\}?%?/g;

/**
 * A bonus in the game's own words, from its description ("+{%_Mining_EXP_gain.", "Boosts_base_STR_by_+{"): the
 * number's place goes, since the game works the number out with many multipliers, and only the sentence holding it
 * shows (the others are the game's jokes, before it or after it). A short bonus whose number leads or ends it as a
 * percent ends in "%": "Mining EXP gain %", "Boosts base STR".
 */
export const bonusText = (template = "") => {
    const sentences = String(template ?? "")
        .replace(/_/g, " ")
        .trim()
        .split(/(?<=[.!?:])\s+/);
    const raw = sentences.find((sentence) => /[{}]/.test(sentence)) ?? sentences[0];
    // A multiplier ("}x_Sushi_Bucks") leads with the number's closing mark.
    const lead = /^(?:[+-]?\{%?\}?%?|\}x)/;
    const tail = /(?:\s+by)?\s*[+-]?\{%?\}?%?\s*$/i;
    const percent = (raw.match(lead) ?? raw.match(tail) ?? [""])[0].includes("%");
    const words = raw
        .replace(lead, "")
        .replace(tail, "")
        .replace(BONUS_NUMBER, "")
        .replace(/[|@$^]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?:])\s/)[0]
        .replace(/\s+by\s*[+-]?\s*(?=[.,]|$)/g, "")
        .replace(/\s+([.,!?])/g, "$1")
        .replace(/[.:]$/, "");
    const text = words.charAt(0).toUpperCase() + words.slice(1);
    return percent && text && text.split(" ").length <= 5 ? `${text} %` : text;
};

/**
 * Read GGA levels plus a definition table and map both by index.
 *
 * @param {{levelsPath: string, definitionsPath?: string, readDefinitions?: function, selectLevels?: function, selectDefinitions?: function, mapEntry: function}} opts
 * @returns {Promise<Array>}
 */
export const readLevelDefinitions = async ({
    levelsPath,
    definitionsPath = null,
    readDefinitions = () => readCList(definitionsPath),
    selectLevels = (_, levels) => levels,
    selectDefinitions = (_, definitions) => definitions,
    mapEntry,
}) => {
    const [rawLevels, rawDefinitions] = await Promise.all([gga(levelsPath), readDefinitions()]);
    const indexedRawLevels = toIndexedArray(rawLevels ?? []);
    const indexedRawDefinitions = toIndexedArray(rawDefinitions ?? []);
    const levels = toIndexedArray(selectLevels(rawLevels, indexedRawLevels) ?? []);

    return toIndexedArray(selectDefinitions(rawDefinitions, indexedRawDefinitions) ?? [])
        .map((rawDefinition, index) =>
            mapEntry({
                index,
                rawDefinition,
                definition: toIndexedArray(rawDefinition ?? []),
                rawLevel: levels[index],
                levels,
            })
        )
        .filter(Boolean);
};

export const sortPrefixedNumericCodes = (a, b) => {
    const keyDelta = a.charCodeAt(0) - b.charCodeAt(0);
    if (keyDelta !== 0) return keyDelta;
    return Number(a.slice(1)) - Number(b.slice(1));
};

export const renderAccountLoading = () => div({ class: "account-loader" }, Loader());

export const renderAccountError = (message) => EmptyState({ failed: true, title: "LOAD FAILED", subtitle: message });

/**
 * Write a value through gga (or a compatible writer) and fail if verification
 * reports a mismatch. A value that lands goes in the change log (History, Undo).
 * With `character`, the game writes it only while that character is in play (as writeManyVerified, so a lost answer
 * isn't read back: a read can't tell whose value it is).
 * A game write whose answer failed reads the value again (`readBack`, on by default): one the game holds counts as
 * landed (and is logged once); otherwise, or unread, the write's own error stands. A custom writer reads nothing back:
 * the page's own writeVerified inside it does.
 */
export const writeVerified = (path, value, { write = gga, character, readBack = write === gga } = {}) => {
    if (character !== undefined) return writeManyVerified([{ path, value }], { character }).then(() => value);
    // Claimed now, while the caller's code runs, so the save joins the user action that made it. A custom writer
    // (a row handing the write to its page) saves through writeVerified itself, so only the game write logs.
    const change = write === gga ? startChange([path]) : null;
    return (async () => {
        const before = change && (await change);
        let ok;
        try {
            ok = await write(path, value);
        } catch (error) {
            if (!readBack) throw error;
            const now = await gga(path).catch(() => {
                throw error;
            });
            if (!matchesVerifiedValue(value, now)) throw error;
            ok = true;
        }
        if (!ok) throw new Error(`Write mismatch at ${path}`);
        if (before) await finishChange(before, [value]);
        return value;
    })();
};

const normalizeGgaPath = (path) => String(path ?? "").replace(/^gga\./, "");

/**
 * What a page says when the game has another character in play than the one it shows, so it refuses the save. Every
 * page says these words; the game's own refusal (characterInPlay in src/cheats) says the same, pinned by a test.
 */
export const CHARACTER_CHANGED = "Character changed. Refresh.";

/**
 * What a page says when no character is in play, such as at character select: there the per-character values are
 * placeholders the game drops on PLAY, so a page shows this instead of them and refuses the save. Every page says
 * these words; the game's own refusal (characterInPlay in src/cheats) says the same, pinned by a test.
 */
export const NO_CHARACTER = "No character in play.";

/**
 * The character in play, by the game's own check (characterInPlay). Rejects with NO_CHARACTER when none is, and with
 * CHARACTER_CHANGED when `expected` (the one the page shows) is no longer the one in play.
 * @param {string} [expected]
 * @returns {Promise<string>}
 */
export const readCharacterInPlay = (expected) =>
    readComputed("player", "inPlay", expected === undefined ? [] : [expected]);

/**
 * Write many GGA paths and throw a consistent error for the first failed write.
 * Failed writes expose the original batch response on `error.results`.
 * The values that land go in the change log as one action, unless `log` is false (an undo's own writes).
 * `character`, the one the writes were planned for: when another one is in play by the time the game writes, nothing
 * is written and it rejects saying who is in play.
 * A lost answer isn't read back: callers read each entry's own result (`error.results`), which a read can't give.
 *
 * @param {Array<{ path: string, value: any }>} writes
 * @param {{ log?: boolean, character?: string }} [options]
 * @returns {Promise<any>}
 */
export const writeManyVerified = (writes, { log = true, character } = {}) => {
    if (!writes.length) return Promise.resolve({ ok: true, results: [] });
    const change = log ? startChange(writes.map((entry) => entry.path)) : null;
    return writeManyLogged(writes, change, character);
};

const writeManyLogged = async (writes, change, character) => {
    if (change) await change;
    const result = await ggaMany(writes, { character });
    if (change)
        await finishChange(
            await change,
            writes.map((entry) => entry.value),
            result.results.map((entry) => entry.ok)
        );
    const failed = result.results.find((entry) => !entry.ok);
    if (!failed) return result;

    const failedPath = normalizeGgaPath(failed.path);
    const failedWrite = writes.find((entry) => normalizeGgaPath(entry.path) === failedPath);
    const expected = failedWrite?.value ?? "unknown";

    // An entry that never reached its slot keeps its own reason; only a value the game didn't keep is a mismatch.
    const error = new Error(
        failed.error === "Write mismatch" ? `Write mismatch at ${failedPath}: expected ${expected}` : failed.error
    );
    error.results = result.results;
    throw error;
};

/**
 * A row's save: write only the fields that changed (the game moves the rest on while the page is open), then
 * read the rest back, so the row shows what the game holds beside its ✓. Each field's `fromGame(raw)` turns a
 * read into the value the page shows, as its load does.
 */
export const writeChangedFields = async (fields, nextValues) => {
    const changed = fields.filter((field) => nextValues[field.key] !== field.valueState.val);
    await writeManyVerified(changed.map((field) => ({ path: field.path, value: nextValues[field.key] })));
    const rest = fields.filter((field) => !changed.includes(field));
    if (!rest.length) return nextValues;
    // The save landed, so a failed read keeps the values shown instead of calling the save failed.
    const reads = await readGgaMany(rest.map((field) => field.path)).catch(() => []);
    const values = { ...nextValues };
    rest.forEach((field, i) => {
        if (reads[i]?.ok) values[field.key] = field.fromGame(reads[i].value);
    });
    return values;
};

const toWriteEntries = (writeOrWrites) => {
    if (writeOrWrites === null || writeOrWrites === undefined) return [];
    return Array.isArray(writeOrWrites) ? writeOrWrites.filter(Boolean) : [writeOrWrites];
};

/**
 * Shared bulk setter for account rows that write target values then update local state.
 *
 * @param {object} opts
 * @param {Array|function} opts.entries
 * @param {function} opts.getTargetValue
 * @param {function} opts.getValueState
 * @param {function} [opts.getPath]
 * @param {function} [opts.getWrites]
 * @param {function} [opts.shouldWrite]
 * @param {function} [opts.applyLocal]
 * @param {string} [opts.character] - when set, the game writes only while this character is in play
 * @param {function} [opts.shownCharacter] - the character the page's rows show now, for rows every character shares:
 *   once it isn't `character` (a Refresh read another meanwhile), the rows are that one's and keep what it read
 * @returns {Promise<void>}
 */
export const runBulkSet = async ({
    character,
    shownCharacter = null,
    entries,
    getTargetValue,
    getValueState,
    getPath = null,
    getWrites = null,
    shouldWrite = ({ currentValue, targetValue }) => Number(currentValue ?? 0) !== targetValue,
    applyLocal = null,
}) => {
    const resolvedEntries = typeof entries === "function" ? entries() : (entries ?? []);
    // Only the entries written take the target afterwards: a skipped row saved meanwhile keeps what it saved.
    const targets = new Map();
    const writes = [];

    resolvedEntries.forEach((entry, index) => {
        const targetValue = getTargetValue(entry, index);
        const valueState = getValueState(entry, index);
        const currentValue = resolveValue(valueState);

        if (typeof getWrites === "function") {
            const entryWrites = toWriteEntries(getWrites({ entry, index, currentValue, targetValue, valueState }));
            if (entryWrites.length) targets.set(index, targetValue);
            writes.push(...entryWrites);
            return;
        }

        if (!shouldWrite({ entry, index, currentValue, targetValue, valueState })) return;
        targets.set(index, targetValue);
        writes.push({ path: getPath(entry, index, targetValue), value: targetValue });
    });

    await writeManyVerified(writes, { character });
    if (shownCharacter && shownCharacter() !== character) return;

    resolvedEntries.forEach((entry, index) => {
        if (!targets.has(index)) return;
        const targetValue = targets.get(index);
        if (typeof applyLocal === "function") {
            applyLocal(entry, index, targetValue);
            return;
        }

        getValueState(entry, index).val = targetValue;
    });
};

/**
 * Runs a page's writes one after another: a write asked for while another runs waits its turn instead of being
 * dropped, so a switch flipped on one row while another row saves still saves. Each task reads the game again
 * when its turn comes.
 */
export const oneAtATime = () => {
    let last = Promise.resolve();
    return (task) => {
        // The write is named after, and offers Undo beside, the control that asked for it, even when it waits.
        const inGesture = captureGesture();
        const run = () => inGesture(task);
        const next = last.then(run, run);
        last = next.catch(() => {});
        return next;
    };
};

/**
 * Hook that wraps an async write operation with status tracking and automatic
 * status-clear timers.
 *
 * `run()` accepts per-call status labels and success/error callbacks.
 * `clearStatus()` cancels pending auto-clear timers for teardown paths that keep
 * long-lived row state outside the active pane.
 */
export const useWriteStatus = ({ successMs = 1200, errorMs = 1200 } = {}) => {
    const status = van.state(null);
    // How each run ended and which button press started it (`pressedBy`, set by ActionButton): a press says its own
    // run's result, though the colour cleared already or another press's run ended first.
    status.ended = [];
    let clearTimer = null;

    const clearStatus = () => {
        if (clearTimer) {
            clearTimeout(clearTimer);
            clearTimer = null;
        }
        status.val = null;
    };

    const scheduleClear = (ms) => {
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
            status.val = null;
            clearTimer = null;
        }, ms);
    };

    // Everything one run saves is one action (Undo all puts it back together).
    const run = (task, options) => withAction({}, () => runTracked(task, options));

    const runTracked = async (
        task,
        {
            loadingState = "loading",
            successState = "success",
            errorState = "error",
            onSuccess = null,
            onError = null,
        } = {}
    ) => {
        if (clearTimer) {
            clearTimeout(clearTimer);
            clearTimer = null;
        }

        status.val = loadingState;
        // A press's announcement (ActionButton) tells its own run from an earlier one's result by this count.
        const id = (status.runs = (status.runs ?? 0) + 1);
        const by = status.pressedBy;
        const end = (outcome) => (status.ended = [...status.ended, { id, by, outcome }].slice(-10));

        try {
            const result = await task();
            if (result?.cancelled) {
                end("cancelled");
                // A run started since says how it went (or still runs): a cancelled older one leaves its status.
                if (id === status.runs) status.val = null;
                return { ok: false, cancelled: true, result };
            }
            // Done only once onSuccess finished: if it throws, the run failed and is said so, not done as well.
            if (typeof onSuccess === "function") onSuccess(result);
            end("success");
            status.val = successState;
            if (successMs > 0) scheduleClear(successMs);
            return { ok: true, result };
        } catch (error) {
            end("error");
            status.val = errorState;
            if (typeof onError === "function") onError(error);
            if (errorMs > 0) scheduleClear(errorMs);
            return { ok: false, error };
        }
    };

    return { status, run, clearStatus };
};
