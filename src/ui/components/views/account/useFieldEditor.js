import van from "../../../vendor/van-1.6.0.js";
import { getNumberInputLiveRaw, setNumberInputValue } from "../../NumberInput.js";
import { largeFormatter, resolveValue } from "./accountShared.js";
import { useAutoSave } from "./autoSave.js";
import { formatNumber, parseNumber } from "../../../utils/numberFormat.js";

const defaultToDraft = (value) => String(value ?? 0);

/**
 * A field still showing the stored value (as typed back, or as its rounded display, like "1.03K") is
 * untouched: it keeps the stored value exactly, so tabbing through a field never saves a rounded copy.
 */
const isUntouched = (field, raw) => {
    const stored = field.valueState.val;
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
    const focusByKey = new Map();

    const resetDraft = (key) => {
        const field = fieldByKey.get(key);
        if (!field) return;
        setNumberInputValue(draftStates[key], (field.toDraft ?? defaultToDraft)(field.valueState.val));
    };

    const getDraftValue = (key) => getNumberInputLiveRaw(draftStates[key]) ?? draftStates[key].val;
    const getDrafts = () => Object.fromEntries(fields.map((field) => [field.key, getDraftValue(field.key)]));
    const isDisabled = () => Boolean(resolveValue(disabled));

    const autoSave = useAutoSave({
        prepare: () => {
            if (isDisabled()) return { unchanged: true };
            const submitted = getDrafts();
            const touched = fields.filter((field) => !isUntouched(field, submitted[field.key]));
            if (!touched.length) {
                fields.forEach((field) => resetDraft(field.key));
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
                fields.forEach((field) => resetDraft(field.key));
                return { unchanged: true };
            }
            return {
                write: async () => {
                    const verified = await write(next);
                    if (verified?.cancelled) {
                        fields.forEach((field) => resetDraft(field.key));
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
                        // A draft typed while this save ran is the next save; leave it.
                        if (getDraftValue(field.key) === submitted[field.key]) resetDraft(field.key);
                    });
                    if (typeof onApplied === "function") await onApplied(verified);
                    return verified;
                },
            };
        },
        revert: () => fields.forEach((field) => resetDraft(field.key)),
    });

    fields.forEach((field) => {
        draftStates[field.key] = van.state((field.toDraft ?? defaultToDraft)(field.valueState.val));
        focusByKey.set(field.key, false);
        // A reload shows the new value, unless the field is being edited or saved.
        van.derive(() => {
            field.valueState.val;
            if (!focusByKey.get(field.key) && !autoSave.isBusy() && autoSave.status.val !== "error")
                resetDraft(field.key);
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
        setFieldFocused: (key, isFocused) => focusByKey.set(key, isFocused),
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
