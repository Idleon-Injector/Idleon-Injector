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
 *   real cap, the value Max fills up to; a number that isn't a limit never gets the slash.
 * - `renderBadge(value)` is a state (Equipped, Locked), a plain muted word just before the field.
 * - `unset` is a stored value that means "not set" (a locked talent's -1); the field shows it empty, and leaving the
 *   empty field untouched saves nothing.
 */
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
    const renderBuiltInAction = (action, fallbackLabel, fallbackValue, variant = "quiet") => {
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

    return div(
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
                formatter,
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
            ...toNodes(renderBuiltInAction(maxAction, "Max")),
            ...toNodes(renderBuiltInAction(resetAction, "Reset", 0, "danger")),
            ...extraActions
        )
    );
};
