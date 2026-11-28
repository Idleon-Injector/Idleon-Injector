import van from "../../../vendor/van-1.6.0.js";
import { NumberInput, setNumberInputValue } from "../../NumberInput.js";
import {
    adjustFormattedIntInput,
    joinClasses,
    largeFormatter,
    largeParser,
    resolveFormattedIntInput,
    resolveNumberInput,
    resolveValue,
    toInt,
    toNodes,
    writeManyVerified,
} from "./accountShared.js";
import { SaveState, saveStateClass } from "./autoSave.js";
import { registerSetAllLine } from "./EditableNumberRow.js";
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
 *
 * A column's kind (`columnKind`) decides where its name sits: over a column of fields ("field", a name as a string) or
 * of read-only numbers ("number") the name is centred over the numbers; over a pick ("steps") or a switch ("switch") it
 * stays at the left. A column can be given as a ValueTableRow field: one with `steps` is a pick.
 *
 * @param {{name: *, columns: (string|{label: string, column?: string, steps?: *[]})[]}} opts
 */
export const ValueTableHead = ({ name, columns }) =>
    div(
        { class: "account-row account-row--head value-head" },
        div({ class: "account-row__info" }, span({ class: "value-head__label" }, name)),
        div(
            { class: "account-row__controls" },
            div(
                { class: "value-cells" },
                ...columns.map((column) =>
                    span(
                        { class: `value-head__label column--${columnKind(column)}` },
                        typeof column === "string" ? column : column.label
                    )
                )
            )
        )
    );

/** A table column's kind: "field" (a typed number, the default), "number" (read-only), "steps" or "switch". */
export const columnKind = (column) =>
    typeof column === "string" ? "field" : (column.column ?? (column.steps ? "steps" : "field"));

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
 * game's exact value. A `toDraft` field shows a value its own way (a node's -1 as a blank box); left so, it keeps that
 * value, and anything typed in it saves as usual. A `quiet` field is a value that only supports the line's main one: a
 * step smaller and muted.
 * A `steps` field is a pick out of a few (a palette colour's Black Stars: None, ★, ★★) in its own column, a step picker
 * that saves on the pick.
 *
 * @param {{key: string, label: string, valueState: {val: number}, paths: string[], max?: number|Function,
 *   formatted?: boolean, toDraft?: (value: *) => string, quiet?: boolean, steps?: {value: number, label: string}[]}[]}
 *   opts.fields
 * @param {() => Promise<Record<string, number>>} opts.read every field's value as the game holds it now
 * @param {object} [opts.writeOptions] passed to writeManyVerified ({ character })
 * @param {*} [opts.badge] the line's state in a plain word ("Polymer"), before its values
 * @param {(changed: string[]) => *} [opts.afterWrite] runs once a save is read back, with the keys it changed (a cache
 *   the game rebuilds from them)
 * @param {(task: () => Promise) => Promise} [opts.runWrite] runs each save, the line's write and read back (a queue the
 *   line shares with another write to the same record)
 * @param {*} [opts.action] the line's own button after its values (Ninja Knowledge's Omni Jade), in the table's last
 *   column (the head names it with ""), so the columns before it line up with the head
 * A `blank` field (`{ key, blank: true }`) keeps its column empty on a line that hasn't that value, so the columns after
 * it stay in line.
 * @param {string|{val: string}} [opts.setAll] the key of the column its list's Set all sets (Farming's plot Rank), or
 *   the state of the column picked in the tray (Cooking's Speed, Fire, Luck): the line then counts as one of that
 *   list's lines, and saves there like a typed value, through writeManyVerified
 */
export const ValueTableRow = ({
    name,
    info,
    fields: allFields,
    read,
    writeOptions = {},
    badge = null,
    afterWrite = null,
    runWrite = (task) => task(),
    action = null,
    setAll = null,
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
    const write = (next) =>
        runWrite(async () => {
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
        });
    const row = EditableFieldsRow({
        fields: fields.map(({ key, valueState, formatted, toDraft }) => ({ key, valueState, formatted, toDraft })),
        normalize: (drafts) => {
            const next = {};
            for (const field of fields) {
                const draft = String(drafts[field.key] ?? "").trim();
                const stored = field.valueState.val;
                // A big number left as it shows ("1.2M"), or a value its `toDraft` shows (blank), keeps the game's value.
                if (
                    (field.formatted && [String(stored), largeFormatter(stored)].includes(draft)) ||
                    (field.toDraft && draft === field.toDraft(stored))
                ) {
                    next[field.key] = stored;
                    continue;
                }
                // A field's `min` (Sushi's Locked -1) is its lowest, 0 by default; a `float` field keeps its decimals.
                const min = field.min ?? 0;
                const typed = field.float
                    ? resolveNumberInput(draft, { formatted: field.formatted, float: true, min, fallback: null })
                    : field.formatted
                      ? resolveFormattedIntInput(draft, null, { min })
                      : Number(draft);
                if (typed === null || !Number.isFinite(Number(typed))) return null;
                const value = field.float ? typed : toInt(typed, { min });
                // Above the cap only when it comes down from a value the game holds above it.
                next[field.key] =
                    value > maxOf(field) && value < Number(field.valueState.val)
                        ? value
                        : Math.min(value, maxOf(field));
            }
            return next;
        },
        write,
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
                                { class: "value-cell value-cell--steps column--steps" },
                                span({ class: "value-cell__label" }, field.label),
                                StepPicker({
                                    name: `${name} ${field.label.toLowerCase()}`,
                                    steps: field.steps,
                                    picked: () => toInt(draftStates[field.key].val, { min: field.min ?? 0 }),
                                    onPick: (value) => void applyValue({ [field.key]: value }),
                                })
                            )
                          : StackedNumberField({
                                field: {
                                    key: field.key,
                                    label: field.label,
                                    rootClass: field.quiet
                                        ? "value-cell value-cell--quiet column--field"
                                        : "value-cell column--field",
                                    labelClass: "value-cell__label",
                                    formatted: field.formatted,
                                    float: field.float,
                                    // + leaves a value the game holds above the cap; − takes one off it.
                                    adjustDraft: (raw, delta) => {
                                        // A blank `toDraft` box (an Empty node) is already the lowest: − leaves it.
                                        if (field.toDraft && delta < 0 && String(raw ?? "").trim() === "") return "";
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
    // The column Set all sets now: a fixed one, or the one picked in the tray (a state).
    const lineField = () => fields.find((field) => field.key === resolveValue(setAll));
    if (setAll && lineField())
        registerSetAllLine(row, {
            row,
            // Read when Set all takes its lines, so a run keeps the column it was pressed for.
            get column() {
                return lineField().key;
            },
            get valueState() {
                return lineField().valueState;
            },
            cap: () => {
                const line = lineField();
                return line.max !== undefined && maxOf(line) < Infinity ? maxOf(line) : null;
            },
            min: () => lineField().min ?? 0,
            // One place, saved for no one character and with nothing to run after: it goes in Set all's one write.
            path: () => {
                const line = lineField();
                return line.paths.length === 1 && !writeOptions.character && !afterWrite ? line.paths[0] : null;
            },
            get write() {
                const { key } = lineField();
                return async (value) => {
                    const next = Object.fromEntries(fields.map((field) => [field.key, field.valueState.val]));
                    return (await write({ ...next, [key]: value }))[key];
                };
            },
            unset: null,
            // A line without the picked column (a blank cell: an upgrade that gets no free levels) isn't one of its lines.
            disabled: () => !lineField(),
        });
    return row;
};
