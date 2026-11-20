import van from "../../../vendor/van-1.6.0.js";
import { getNumberInputLiveRaw, setNumberInputValue } from "../../NumberInput.js";
import { largeFormatter, resolveValue } from "./accountShared.js";
import { useAutoSave } from "./autoSave.js";
import { formatNumber, parseNumber } from "../../../utils/numberFormat.js";
import { currentPlace, reloadPlace, withAction } from "../../../services/changeLog.js";

const defaultToDraft = (value) => String(value ?? 0);

/**
 * A field still showing the value its draft was taken from (as typed back, or as its rounded display, like
 * "1.03K") is untouched: it keeps the stored value exactly, so tabbing through a field never saves a rounded
 * copy, and a reload that moves the stored value on doesn't make the old one an edit.
 */
const isUntouched = (field, raw, stored) => {
    const text = String(raw ?? "").trim();
    return [String(stored ?? ""), (field.toDraft ?? defaultToDraft)(stored), largeFormatter(stored ?? 0)].includes(
        text
    );
};
const sameValue = (a, b) => a === b || (a !== null && a !== undefined && String(a) === String(b));

/**
 * A page's normalize may pull a typed value into range; a typed value is refused with the bound instead,
 * so what saves is what was typed. Rounding (less than 1 apart) and text that isn't a number pass through.
 */
const refuseClamped = (raw, value) => {
    const typed = parseNumber(String(raw ?? ""));
    if (typed === null || typeof value !== "number" || !Number.isFinite(value) || Math.abs(typed - value) < 1) return;
    throw new Error(`${typed > value ? "max" : "min"} ${formatNumber(value)}`);
};

/**
 * Drafts for one field or a row of fields that save together, saved on Enter or on leaving the row
 * (see useAutoSave). `normalize(rawValues)` returns the values to write, or throws an Error naming why a
 * draft can't be saved (null means "not a number"). Writers return every field's verified value, or
 * { cancelled: true }; failures throw, and the typed drafts stay for the player to fix.
 */
export const useFieldEditor = ({ fields, normalize, write, disabled = null, onApplied = null }) => {
    const fieldByKey = new Map(fields.map((field) => [field.key, field]));
    const draftStates = {};
    // The page these fields are on, read again after a failed save.
    const place = currentPlace();
    // The stored value each draft was taken from.
    const baseByKey = new Map();
    // The text each draft was last shown, and the fields a commit found changed since: a draft the page showed
    // again (a read-back) is not the player's edit.
    const shownByKey = new Map();
    const edited = new Set();

    const resetDraft = (key) => {
        const field = fieldByKey.get(key);
        if (!field) return;
        baseByKey.set(key, field.valueState.val);
        const text = (field.toDraft ?? defaultToDraft)(field.valueState.val);
        shownByKey.set(key, text);
        edited.delete(key);
        setNumberInputValue(draftStates[key], text);
    };

    const getDraftValue = (key) => getNumberInputLiveRaw(draftStates[key]) ?? draftStates[key].val;
    const getDrafts = () => Object.fromEntries(fields.map((field) => [field.key, getDraftValue(field.key)]));
    const isDisabled = () => Boolean(resolveValue(disabled));

    // Show the stored value again in each field still holding what was submitted, or what the page last showed it
    // (an earlier save's read-back); a draft typed since (while the save waited or ran) is the next save, so it stays.
    const resetSubmitted = (submitted) =>
        fields.forEach((field) => {
            const draft = getDraftValue(field.key);
            if (draft === submitted[field.key] || (!edited.has(field.key) && draft === shownByKey.get(field.key)))
                resetDraft(field.key);
        });

    // The drafts of the newest save that started: a commit made while it runs compares with them too.
    let writing = null;
    const draftText = (drafts, key) => String(drafts[key] ?? "").trim();

    const autoSave = useAutoSave({
        // The drafts as they were at the commit, so a later commit (made after a switch, say) can't save in its place,
        // and the stored values they were taken from: a field untouched then stays untouched (and takes the game's
        // value) when an earlier save read the game back and moved the stored value on meanwhile. A field changed
        // since the save being written is an edit, even back to its stored value (1, save 2, then 1), unless only
        // a read-back changed it.
        capture: () => {
            const drafts = getDrafts();
            fields.forEach((field) => {
                if (draftText(drafts, field.key) !== String(shownByKey.get(field.key)).trim()) edited.add(field.key);
            });
            return {
                drafts,
                bases: new Map(baseByKey),
                writing: autoSave.isBusy() ? writing : null,
                edited: new Set(edited),
            };
        },
        prepare: (
            { drafts: submitted, bases, writing: during = null, edited: editedThen = edited } = {
                drafts: getDrafts(),
                bases: baseByKey,
            }
        ) => {
            if (isDisabled()) return { unchanged: true };
            const touched = fields.filter(
                (field) =>
                    !isUntouched(field, submitted[field.key], bases.get(field.key)) ||
                    (during !== null &&
                        editedThen.has(field.key) &&
                        draftText(during, field.key) !== draftText(submitted, field.key))
            );
            if (!touched.length) {
                resetSubmitted(submitted);
                return { unchanged: true };
            }
            if (touched.some((field) => String(submitted[field.key] ?? "").trim() === ""))
                throw new Error("enter a number");
            const normalized = normalize(submitted);
            if (normalized === null || normalized === undefined || Number.isNaN(normalized))
                throw new Error("not a number");
            touched.forEach((field) => refuseClamped(submitted[field.key], normalized[field.key]));
            const next = { ...normalized };
            fields.forEach((field) => {
                if (!touched.includes(field)) next[field.key] = field.valueState.val;
            });
            if (fields.every((field) => sameValue(next[field.key], field.valueState.val))) {
                resetSubmitted(submitted);
                return { unchanged: true };
            }
            writing = submitted;
            return {
                write: async () => {
                    // This save's action (autoSave runs it in one), which counts the values that landed.
                    const action = withAction({ kind: "row" }, (joined) => joined);
                    let verified;
                    try {
                        verified = await write(next);
                    } catch (error) {
                        // A write in several steps may have saved some fields before it failed: read the game
                        // again, so the fields (and Escape, and the next save) start from what it now holds. A save
                        // that landed nothing reads nothing, so its reason and the typed value stay in place.
                        if (action.landed > 0) reloadPlace.val = { ...place };
                        // A field this save didn't change shows the stored value again, which the page may have
                        // read back from the game (Statues' tier dropdown, with no badge beside it).
                        fields.forEach((field) => {
                            if (!touched.includes(field) && getDraftValue(field.key) === submitted[field.key])
                                resetDraft(field.key);
                        });
                        throw error;
                    }
                    if (verified?.cancelled) {
                        resetSubmitted(submitted);
                        return verified;
                    }
                    if (
                        !verified ||
                        typeof verified !== "object" ||
                        fields.some(
                            (field) =>
                                !Object.prototype.hasOwnProperty.call(verified, field.key) ||
                                verified[field.key] === undefined ||
                                Number.isNaN(verified[field.key])
                        )
                    ) {
                        throw new Error("Writer must return verified values for every field");
                    }
                    fields.forEach((field) => {
                        field.valueState.val = verified[field.key];
                        baseByKey.set(field.key, verified[field.key]);
                    });
                    resetSubmitted(submitted);
                    if (typeof onApplied === "function") await onApplied(verified);
                    return verified;
                },
            };
        },
        revert: () => fields.forEach((field) => resetDraft(field.key)),
    });

    fields.forEach((field) => {
        draftStates[field.key] = van.state((field.toDraft ?? defaultToDraft)(field.valueState.val));
        shownByKey.set(field.key, draftStates[field.key].rawVal);
        baseByKey.set(field.key, field.valueState.val);
        // A reload shows the new value, in a focused field too, unless the field is being saved or holds the
        // player's draft.
        van.derive(() => {
            field.valueState.val;
            const draft = getNumberInputLiveRaw(draftStates[field.key]) ?? draftStates[field.key].rawVal;
            if (!autoSave.isBusy() && isUntouched(field, draft, baseByKey.get(field.key))) resetDraft(field.key);
        });
    });

    /** Save the drafts, or put `rawValues` (MAX, RESET) in them and save those. */
    const applyValue = async (rawValues) => {
        if (isDisabled()) return;
        if (rawValues)
            Object.entries(rawValues).forEach(([key, raw]) => setNumberInputValue(draftStates[key], String(raw)));
        return autoSave.save();
    };

    return {
        draftStates,
        getDraftValue,
        resetDraft,
        // ponytail: kept so the rows that report focus still work; focus no longer changes what a reload shows.
        setFieldFocused: () => {},
        status: autoSave.status,
        reason: autoSave.reason,
        handlers: autoSave.handlers,
        cancel: autoSave.cancel,
        run: autoSave.run,
        undo: autoSave.undo,
        isDisabled,
        applyValue,
    };
};
