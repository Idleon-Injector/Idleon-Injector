import van from "../../../vendor/van-1.6.0.js";
import { NumberInput, setNumberInputValue } from "../../NumberInput.js";
import {
    adjustFormattedIntInput,
    joinClasses,
    largeFormatter,
    largeParser,
    resolveFormattedIntInput,
    resolveValue,
    toInt,
    toNodes,
    writeManyVerified,
} from "./accountShared.js";
import { SaveState, saveStateClass } from "./autoSave.js";
import { useFieldEditor } from "./useFieldEditor.js";
import { AccountRow } from "./components/AccountRow.js";
import { StepPicker } from "./components/StepPicker.js";

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

/**
 * The head of a table in a list: the thing's column name, then each value's ("Liquid", "Amount", "Cap", "Rate"). It
 * stays at the top of the list while it scrolls; on a phone, where each line folds, the fields say their names instead.
 */
export const ValueTableHead = ({ name, columns }) =>
    div(
        { class: "account-row account-row--head value-head" },
        div({ class: "account-row__info" }, span({ class: "value-head__label" }, name)),
        div(
            { class: "account-row__controls" },
            div({ class: "value-cells" }, ...columns.map((column) => span({ class: "value-head__label" }, column)))
        )
    );

/**
 * One thing on one line of a table (a liquid: Amount, Cap, Rate), its values in the head's columns. A value saves on
 * Enter or on leaving the line, and − / + at once, like any row; only the values the player changed are written, each
 * to all of its `paths` in one request, and the line then shows what `read()` finds in the game (also after a failed
 * save, when the read works). A field's `max` (a number or a function) is its cap: nothing goes up past it, and a value
 * the game holds above it may still come down.
 *
 * @param {object} opts
 * @param {string} opts.name the thing, for the fields' names read out ("Water Droplets amount")
 * @param {*} opts.info the row's title (RowTitles, or a name)
 * A `formatted` field shows a big number short ("1.2M") and takes one typed that way; left as shown, it keeps the
 * game's exact value. A `quiet` field is a value that only supports the line's main one: a step smaller and muted.
 * A `steps` field is a pick out of a few (a palette colour's Black Stars: None, ★, ★★) in its own column, a step picker
 * that saves on the pick.
 *
 * @param {{key: string, label: string, valueState: {val: number}, paths: string[], max?: number|Function,
 *   formatted?: boolean, quiet?: boolean, steps?: {value: number, label: string}[]}[]} opts.fields
 * @param {() => Promise<Record<string, number>>} opts.read every field's value as the game holds it now
 * @param {object} [opts.writeOptions] passed to writeManyVerified ({ character })
 * @param {*} [opts.badge] the line's state in a plain word ("Polymer"), before its values
 * @param {(changed: string[]) => *} [opts.afterWrite] runs once a save is read back, with the keys it changed (a cache
 *   the game rebuilds from them)
 * @param {*} [opts.action] the line's own button after its values (Ninja Knowledge's Omni Jade), in the table's last
 *   column (the head names it with ""), so the columns before it line up with the head
 * A `blank` field (`{ key, blank: true }`) keeps its column empty on a line that hasn't that value, so the columns after
 * it stay in line.
 */
export const ValueTableRow = ({
    name,
    info,
    fields: allFields,
    read,
    writeOptions = {},
    badge = null,
    afterWrite = null,
    action = null,
}) => {
    const fields = allFields.filter((field) => !field.blank);
    const maxOf = (field) => {
        const max = Number(resolveValue(field.max));
        return max > 0 ? max : Infinity;
    };
    const showRead = async () => {
        const now = await read();
        fields.forEach((field) => (field.valueState.val = now[field.key]));
        return now;
    };
    return EditableFieldsRow({
        fields: fields.map(({ key, valueState, formatted }) => ({ key, valueState, formatted })),
        normalize: (drafts) => {
            const next = {};
            for (const field of fields) {
                const draft = String(drafts[field.key] ?? "").trim();
                const stored = field.valueState.val;
                // A big number left as it shows ("1.2M") keeps the game's exact value.
                if (field.formatted && [String(stored), largeFormatter(stored)].includes(draft)) {
                    next[field.key] = stored;
                    continue;
                }
                const typed = field.formatted ? resolveFormattedIntInput(draft, null) : Number(draft);
                if (typed === null || !Number.isFinite(Number(typed))) return null;
                const value = toInt(typed, { min: 0 });
                // Above the cap only when it comes down from a value the game holds above it.
                next[field.key] =
                    value > maxOf(field) && value < Number(field.valueState.val)
                        ? value
                        : Math.min(value, maxOf(field));
            }
            return next;
        },
        write: async (next) => {
            const changed = fields.filter((field) => next[field.key] !== field.valueState.val);
            const writes = changed.flatMap((field) => field.paths.map((path) => ({ path, value: next[field.key] })));
            try {
                await writeManyVerified(writes, writeOptions);
            } catch (error) {
                await showRead().catch(() => {});
                throw error;
            }
            // The write was read back, so it saved: a read after it that fails leaves the line on the saved values.
            if (afterWrite && changed.length) await afterWrite(changed.map((field) => field.key));
            return read().catch(() => next);
        },
        rowClass: "value-row",
        info,
        badge,
        renderControls: ({ draftStates, getDraftValue, setFieldFocused, applyValue }) =>
            div(
                { class: "value-cells" },
                ...allFields.map((field) =>
                    field.blank
                        ? div({ class: "value-cell value-cell--empty", "aria-hidden": "true" })
                        : field.steps
                          ? // A pick saves on the press, like − / +.
                            div(
                                { class: "value-cell value-cell--steps" },
                                span({ class: "value-cell__label" }, field.label),
                                StepPicker({
                                    name: `${name} ${field.label.toLowerCase()}`,
                                    steps: field.steps,
                                    picked: () => toInt(draftStates[field.key].val, { min: 0 }),
                                    onPick: (value) => void applyValue({ [field.key]: value }),
                                })
                            )
                          : StackedNumberField({
                                field: {
                                    key: field.key,
                                    label: field.label,
                                    rootClass: field.quiet ? "value-cell value-cell--quiet" : "value-cell",
                                    labelClass: "value-cell__label",
                                    formatted: field.formatted,
                                    // + leaves a value the game holds above the cap; − takes one off it.
                                    adjustDraft: (raw, delta) => {
                                        if (field.formatted) return adjustFormattedIntInput(raw, delta, 0, { min: 0 });
                                        const value = toInt(raw, { min: 0 });
                                        if (value > maxOf(field)) return delta > 0 ? value : value - 1;
                                        return Math.max(0, Math.min(maxOf(field), value + delta));
                                    },
                                    inputProps: {
                                        "aria-label": `${name} ${field.label.toLowerCase()}`,
                                        ...(field.max !== undefined
                                            ? { cap: () => (maxOf(field) < Infinity ? maxOf(field) : null) }
                                            : {}),
                                    },
                                },
                                draftStates,
                                getDraftValue,
                                setFieldFocused,
                            })
                ),
                action ? div({ class: "value-cell value-cell--action" }, action) : null
            ),
    });
};
