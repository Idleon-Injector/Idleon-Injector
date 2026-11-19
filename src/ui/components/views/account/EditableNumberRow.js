import van from "../../../vendor/van-1.6.0.js";
import { getNumberInputLiveRaw, NumberInput, setNumberInputValue } from "../../NumberInput.js";
import { ActionButton } from "./components/ActionButton.js";
import { joinClasses, resolveValue, toNodes } from "./accountShared.js";
import { SaveState } from "./autoSave.js";
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
 */
export const EditableNumberRow = ({
    valueState,
    normalize,
    write,
    renderInfo,
    renderBadge,
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
        typeof formatter === "function" ? formatter(value ?? 0) : String(value ?? 0);
    const { inputValue, status, reason, handlers, run, isDisabled, applyValue, focus, blur } = useNumericEditor({
        valueState,
        normalize,
        write,
        format: formatCommittedValue,
        disabled: () => Boolean(resolveValue(disabled)) || Boolean(resolveValue(inputDisabled)),
    });

    // The row's buttons wait while it saves; the save state beside the field shows how it went.
    const busy = () => (status.val === "loading" ? "loading" : null);

    const renderBuiltInAction = (action, fallbackLabel, fallbackValue) => {
        if (!action) return null;

        const actionValue = action.value ?? fallbackValue;
        const actionLabel = action.label ?? fallbackLabel;
        const actionDisabled =
            action.disabled !== undefined && action.disabled !== null
                ? () => isDisabled() || Boolean(resolveValue(action.disabled))
                : isDisabled;
        return ActionButton({
            label: () => resolveValue(actionLabel),
            status: busy,
            variant: "max-reset",
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
            ? toNodes(renderExtraActions({ status: busy, run, inputValue, applyValue }))
            : [];

    return div(
        {
            class: () => joinClasses("account-row", typeof rowClass === "function" ? rowClass() : rowClass),
            ...handlers,
        },
        div({ class: "account-row__info" }, ...toNodes(renderInfo())),
        span(
            {
                class: () =>
                    joinClasses("account-row__badge", typeof badgeClass === "function" ? badgeClass() : badgeClass),
            },
            () => renderBadge(valueState.val)
        ),
        div(
            {
                class: () =>
                    joinClasses(
                        "account-row__controls",
                        typeof controlsClass === "function" ? controlsClass() : controlsClass,
                        status.val === "error" ? "is-save-failed" : ""
                    ),
            },
            SaveState({ status, reason }),
            NumberInput({
                mode: inputMode,
                value: inputValue,
                formatter,
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
            ...toNodes(renderBuiltInAction(maxAction, "MAX")),
            ...toNodes(renderBuiltInAction(resetAction, "RESET", 0)),
            ...extraActions
        )
    );
};
