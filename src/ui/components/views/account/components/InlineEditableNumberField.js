import van from "../../../../vendor/van-1.6.0.js";
import { getNumberInputLiveRaw, NumberInput, setNumberInputValue } from "../../../NumberInput.js";
import { SaveState } from "../autoSave.js";
import {
    adjustFormattedIntInput,
    joinClasses,
    largeFormatter,
    largeParser,
    resolveNumberInput,
    writeVerified,
} from "../accountShared.js";
import { useNumericEditor } from "../useNumericEditor.js";

const { div, span } = van.tags;

const defaultInputProps = {
    formatter: largeFormatter,
    parser: largeParser,
};
const defaultNormalize = (raw) => resolveNumberInput(raw, { formatted: true, min: 0, fallback: null });
const defaultAdjust = (raw, delta, current) => adjustFormattedIntInput(raw, delta, current ?? 0, { min: 0 });

/**
 * Inline numeric editor for grouped account rows.
 *
 * This is not a full row; it is a field-level control meant to be composed inside AccountRow controls.
 * It saves on its own, on Enter or on leaving it; its save state sits after its label.
 */
export const InlineEditableNumberField = ({
    label,
    valueState,
    path,
    write = null,
    onApplied = null,
    normalize = defaultNormalize,
    format = largeFormatter,
    adjust = defaultAdjust,
    inputMode = "int",
    inputProps = defaultInputProps,
    statusTarget = null,
    rootClass = "account-field-metric",
    labelClass = "account-field-metric__label",
}) => {
    const { inputValue, status, reason, handlers, isDisabled, focus, blur } = useNumericEditor({
        valueState,
        normalize,
        write: typeof write === "function" ? write : (value) => writeVerified(path, value),
        format,
        disabled: inputProps.disabled,
        onApplied,
    });

    const renderLabel = () => {
        const content = typeof label === "function" ? label() : label;
        return Array.isArray(content) ? span({ class: labelClass }, ...content) : span({ class: labelClass }, content);
    };

    if (statusTarget) {
        van.derive(() => {
            statusTarget.val = status.val;
        });
    }

    const step = (delta, userHandler) => () => {
        if (isDisabled()) return;
        const raw = getNumberInputLiveRaw(inputValue) ?? inputValue.val;
        setNumberInputValue(inputValue, String(adjust(raw, delta, valueState.val)));
        if (typeof userHandler === "function") userHandler();
    };

    return div(
        { class: () => joinClasses(rootClass, status.val === "error" ? "is-save-failed" : ""), ...handlers },
        div({ class: "account-inline-field__head" }, renderLabel(), SaveState({ status, reason })),
        NumberInput({
            mode: inputMode,
            value: inputValue,
            ...inputProps,
            disabled: isDisabled,
            onfocus: () => {
                focus();
                if (typeof inputProps.onfocus === "function") inputProps.onfocus();
            },
            onblur: () => {
                blur();
                if (typeof inputProps.onblur === "function") inputProps.onblur();
            },
            onDecrement: step(-1, inputProps.onDecrement),
            onIncrement: step(1, inputProps.onIncrement),
        })
    );
};
