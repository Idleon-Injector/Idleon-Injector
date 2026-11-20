import van from "../../../vendor/van-1.6.0.js";
import { NumberInput, setNumberInputValue } from "../../NumberInput.js";
import { adjustFormattedIntInput, joinClasses, largeFormatter, largeParser, toInt, toNodes } from "./accountShared.js";
import { SaveState, saveStateClass } from "./autoSave.js";
import { useFieldEditor } from "./useFieldEditor.js";
import { AccountRow } from "./components/AccountRow.js";

const { div, span } = van.tags;

const defaultStackedAdjust = (field, rawValue, delta) => {
    if (typeof field.adjustDraft === "function") return field.adjustDraft(rawValue, delta);
    const min = field.min ?? 0;
    const max = field.max ?? Infinity;
    if (field.formatted) return adjustFormattedIntInput(rawValue, delta, 0, { min, max });
    const currentValue = toInt(rawValue);
    return Math.max(min, Math.min(max, currentValue + delta));
};

/** Shared staged numeric field for EditableFieldsRow controls. */
export const StackedNumberField = ({ field, draftStates, getDraftValue = null, setFieldFocused }) => {
    const inputProps = field.inputProps ?? {};
    const formatter = field.formatter ?? (field.formatted ? largeFormatter : undefined);
    const parser = field.parser ?? (field.formatted ? largeParser : undefined);
    const getRawDraft = () =>
        typeof getDraftValue === "function" ? getDraftValue(field.key) : draftStates[field.key].val;

    return div(
        { class: field.rootClass ?? "account-stacked-field" },
        span({ class: field.labelClass ?? "account-stacked-field__label" }, field.label),
        NumberInput({
            mode: field.inputMode ?? (field.float ? "float" : "int"),
            value: draftStates[field.key],
            formatter,
            parser,
            ...inputProps,
            onfocus: () => {
                setFieldFocused(field.key, true);
                if (typeof inputProps.onfocus === "function") inputProps.onfocus();
            },
            onblur: () => {
                setFieldFocused(field.key, false);
                if (typeof inputProps.onblur === "function") inputProps.onblur();
            },
            onDecrement: () => {
                setNumberInputValue(draftStates[field.key], String(defaultStackedAdjust(field, getRawDraft(), -1)));
                if (typeof inputProps.onDecrement === "function") inputProps.onDecrement();
            },
            onIncrement: () => {
                setNumberInputValue(draftStates[field.key], String(defaultStackedAdjust(field, getRawDraft(), 1)));
                if (typeof inputProps.onIncrement === "function") inputProps.onIncrement();
            },
        })
    );
};

/**
 * Shared editable row for fields that save together: one write with every field's value when you press
 * Enter or leave the row's fields (moving between them keeps editing), −/+ save at once, Escape puts the
 * stored values back.
 */
export const EditableFieldsRow = ({
    fields,
    normalize,
    write,
    info,
    badge = null,
    rowClass = "",
    badgeClass = "",
    controlsClass = "",
    renderControls,
    renderExtraActions = null,
}) => {
    const editor = useFieldEditor({ fields, normalize, write });
    const { status, reason, undo, handlers } = editor;
    // The row's buttons stay enabled while it saves, so Tab onto one never loses focus (a save during a save
    // runs after it); the save state beside the fields shows how it went.
    const actions = { ...editor, status: null };
    const extraActions = typeof renderExtraActions === "function" ? toNodes(renderExtraActions(actions)) : [];

    return AccountRow({
        info,
        badge,
        rowClass: () =>
            joinClasses(typeof rowClass === "function" ? rowClass() : rowClass, saveStateClass(status.val, undo)),
        badgeClass,
        controlsClass,
        rowProps: handlers,
        controls: [SaveState({ status, reason, undo }), ...toNodes(renderControls(actions)), ...extraActions],
    });
};
