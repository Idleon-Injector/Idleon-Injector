import van from "../../../vendor/van-1.6.0.js";
import { getNumberInputLiveRaw, NumberInput, setNumberInputValue } from "../../NumberInput.js";
import { ActionButton } from "./components/ActionButton.js";
import { joinClasses, resolveValue, toNodes } from "./accountShared.js";
import { SaveState, saveStateClass } from "./autoSave.js";
import { useNumericEditor } from "./useNumericEditor.js";

const { div, span } = van.tags;

/**
 * Shared numeric editor row: the value saves on Enter or on leaving the field, −/+ save at once
 * (see useAutoSave), Escape puts the stored value back.
 *
 * Contract:
 * - `valueState` holds the stored value only; it changes when a save is read back or the page reloads.
 * - `normalize(raw)` returns the value to write, null for "not a number", or throws an Error naming why
 *   the draft can't be saved (shown beside the field; the typed text stays).
 * - `write(next)` must resolve to the verified value; returning `{ cancelled: true }` leaves the stored
 *   value unchanged and resets the draft, without success feedback.
 * - `cap` (a number or a function returning one) shows muted inside the field after the value: "2 / 15". Only a
 *   real cap, the value Max fills up to; a number that isn't a limit never gets the slash. A row with a cap has Max
 *   (DESIGN.md's Page standards), filling up to the cap, unless `maxAction` names its own; a row with no button of
 *   its own keeps Max's room empty in a list of mixed fields (`field-columns`) where some line has Max, so the fields
 *   line up.
 * - `renderBadge(value)` is a state (Equipped, Locked), a plain muted word just before the field.
 * - `unset` is a stored value that means "not set" (a locked talent's -1); the field shows it empty, and leaving the
 *   empty field untouched saves nothing.
 * - `setAll` makes the row a line its list's Set all acts on (`linesIn`): `{ min, path }`, where `path` (the one place
 *   the value lives) lets many lines save in one write; without it each line saves through `write`. Only for a row
 *   whose `write` takes the value as the field shows it. `refuse(value)`, when given, names a value `write` can't take
 *   (Set all then writes nothing).
 */

// The rows a Set all can act on, by row (see `setAll` above). `linesMade` goes up as rows are made, so a tray that
// counts its list's lines counts again once a page shows new rows.
const setAllLines = new WeakMap();
const linesMade = van.state(0);

/**
 * Make `row` a line its list's Set all acts on: `{ row, valueState, cap(), min(), path(), write, unset, disabled(),
 * refuse? }` (see `setAll` above; a table's line registers the one column Set all sets, ValueTableRow's `setAll`, and
 * names it in `column`). A getter is read when Set all takes its lines, so a column picked later doesn't change them.
 */
export const registerSetAllLine = (row, line) => {
    linesMade.val++;
    setAllLines.set(row, line);
};

/**
 * The lines in `container` a Set all acts on: its rows with `setAll` that the top bar's search shows, without the
 * rows another row opens, and the ones not set (`unset`). Each is `{ row, valueState, max, min, path, write }`; `max` is null for a line without one.
 */
export const linesIn = (container, shown = () => true) => {
    void linesMade.val;
    const lines = [];
    const walk = (node) => {
        for (const child of node.childNodes ?? []) {
            if (child.nodeType !== 1 || child.classList.contains("row-detail")) continue;
            const line = setAllLines.get(child);
            // A line that isn't set (a locked talent) is left alone.
            if (line && !line.disabled() && line.valueState.val !== line.unset && shown(child))
                lines.push({ ...line, max: line.cap(), min: line.min(), path: line.path() });
            else walk(child);
        }
    };
    walk(container);
    return lines;
};
export const EditableNumberRow = ({
    valueState,
    normalize,
    write,
    renderInfo,
    renderBadge,
    cap = null,
    adjustInput = (rawValue, delta, currentValue) => {
        const base = Number(rawValue);
        const next = Number.isFinite(base) ? base : Number(currentValue ?? 0);
        return next + delta;
    },
    maxAction = null,
    resetAction = null,
    renderExtraActions = null,
    rowClass = "",
    badgeClass = "",
    controlsClass = "",
    inputMode = "int",
    inputProps = {},
    disabled = null,
    unset = null,
    setAll = null,
}) => {
    const {
        onfocus: userOnfocus,
        onblur: userOnblur,
        onDecrement: userOnDecrement,
        onIncrement: userOnIncrement,
        formatter,
        disabled: inputDisabled,
        ...restInputProps
    } = inputProps;
    const capNow = () => {
        const raw = resolveValue(cap);
        const value = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
        return Number.isFinite(value) ? value : null;
    };
    // A real cap is what Max fills up to, so a capped row has Max; it steps aside while the cap is unknown.
    const max = maxAction ?? (cap === null ? null : { value: capNow, hidden: () => capNow() === null });
    const formatCommittedValue = (value) =>
        unset !== null && value === unset
            ? ""
            : typeof formatter === "function"
              ? formatter(value ?? 0)
              : String(value ?? 0);
    const { inputValue, status, reason, undo, handlers, run, isDisabled, applyValue, focus, blur } = useNumericEditor({
        valueState,
        normalize,
        write,
        format: formatCommittedValue,
        disabled: () => Boolean(resolveValue(disabled)) || Boolean(resolveValue(inputDisabled)),
    });

    // Buttons stay enabled while the row saves, so Tab onto one never loses focus; a click then saves after it.
    const renderBuiltInAction = (action, fallbackLabel, fallbackValue, variant = "quiet", className = "") => {
        if (!action) return null;

        const actionValue = action.value ?? fallbackValue;
        const actionLabel = action.label ?? fallbackLabel;
        const actionDisabled =
            action.disabled !== undefined && action.disabled !== null
                ? () => isDisabled() || Boolean(resolveValue(action.disabled))
                : isDisabled;
        return ActionButton({
            label: () => resolveValue(actionLabel),
            variant,
            className,
            buttonProps: action.hidden ? { hidden: action.hidden } : {},
            tooltip: action.tooltip ?? null,
            disabled: actionDisabled,
            onClick: (e) => {
                e.preventDefault();
                if (actionDisabled()) return;
                void applyValue(resolveValue(actionValue));
            },
        });
    };

    const step = (delta, userHandler) => () => {
        if (isDisabled()) return;
        const raw = getNumberInputLiveRaw(inputValue) ?? inputValue.val;
        setNumberInputValue(inputValue, String(adjustInput(raw, delta, valueState.val ?? 0)));
        if (typeof userHandler === "function") userHandler();
    };

    const extraActions =
        typeof renderExtraActions === "function"
            ? toNodes(renderExtraActions({ status: null, run, inputValue, applyValue }))
            : [];

    const row = div(
        {
            class: () =>
                joinClasses(
                    "account-row account-row--value",
                    typeof rowClass === "function" ? rowClass() : rowClass,
                    saveStateClass(status.val, undo)
                ),
            ...handlers,
        },
        div({ class: "account-row__info" }, ...toNodes(renderInfo())),
        // The badge only adds what the field doesn't say, a state; the value and its cap show once, in the field.
        renderBadge
            ? span(
                  {
                      class: () =>
                          joinClasses(
                              "account-row__badge",
                              typeof badgeClass === "function" ? badgeClass() : badgeClass
                          ),
                  },
                  () => renderBadge(valueState.val)
              )
            : null,
        div(
            {
                class: () =>
                    joinClasses(
                        "account-row__controls",
                        typeof controlsClass === "function" ? controlsClass() : controlsClass
                    ),
            },
            SaveState({ status, reason, undo }),
            NumberInput({
                mode: inputMode,
                value: inputValue,
                // An `unset` value's empty field stays empty.
                formatter: formatter && ((raw) => (raw === "" ? "" : formatter(raw))),
                cap,
                ...restInputProps,
                disabled: isDisabled,
                onfocus: () => {
                    focus();
                    if (typeof userOnfocus === "function") userOnfocus();
                },
                onblur: () => {
                    blur();
                    if (typeof userOnblur === "function") userOnblur();
                },
                onDecrement: step(-1, userOnDecrement),
                onIncrement: step(1, userOnIncrement),
            }),
            // Max's room, kept empty on a row with no button of its own (shown only in `field-columns`).
            !resetAction && !extraActions.length
                ? span({
                      class: "account-row__max-slot",
                      "aria-hidden": "true",
                      hidden: () => Boolean(max) && !max.hidden?.(),
                  })
                : null,
            ...toNodes(renderBuiltInAction(max, "Max", undefined, "quiet", "account-row__max")),
            ...toNodes(renderBuiltInAction(resetAction, "Reset", 0, "danger")),
            ...extraActions
        )
    );
    if (setAll)
        registerSetAllLine(row, {
            row,
            valueState,
            cap: capNow,
            min: () => Number(resolveValue(setAll.min) ?? 0),
            path: () => resolveValue(setAll.path) ?? null,
            write,
            unset,
            disabled: isDisabled,
            refuse: setAll.refuse,
        });
    // Max's room is kept only in a list where some line shows Max: the closest list of mixed fields says so (`has-max`)
    // once this row is laid out, and again whenever its Max comes or goes.
    van.derive(() => {
        max?.hidden?.();
        requestAnimationFrame(() => {
            const list = row.closest?.(".field-columns");
            list?.classList.toggle("has-max", Boolean(list.querySelector(".account-row__max:not([hidden])")));
        });
    });
    return row;
};
