import van from "../../../vendor/van-1.6.0.js";
import { getNumberInputLiveRaw, setNumberInputValue } from "../../NumberInput.js";
import { resolveValue } from "./accountShared.js";
import { useAutoSave } from "./autoSave.js";

const defaultToDraft = (value) => String(value ?? 0);
const sameValue = (a, b) => a === b || (a !== null && a !== undefined && String(a) === String(b));

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
            if (Object.values(submitted).some((raw) => String(raw ?? "").trim() === ""))
                throw new Error("enter a number");
            const next = normalize(submitted);
            if (next === null || next === undefined || Number.isNaN(next)) throw new Error("not a number");
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
        isDisabled,
        applyValue,
    };
};
