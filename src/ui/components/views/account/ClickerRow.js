import van from "../../../vendor/van-1.6.0.js";
import { Icons } from "../../../assets/icons.js";
import { formattedStep } from "../../../utils/numberFormat.js";
import { EditableNumberRow } from "./EditableNumberRow.js";
import { joinClasses, largeFormatter, largeParser, resolveNumberInput, writeVerified } from "./accountShared.js";

const { div, span } = van.tags;

/**
 * Shared EditableNumberRow adapter for clicker-style OptionsListAccount fields.
 */
export const ClickerRow = ({ field, fieldState, onWrite, warnBadgeClass, rowClass = "", controlsClass }) => {
    const isFormatted = field.formatted || field.float;
    const isFloat = field.float;
    const parseInputValue = (raw) => resolveNumberInput(raw, { formatted: isFormatted, float: isFloat });

    return EditableNumberRow({
        valueState: fieldState,
        normalize: (rawValue) => parseInputValue(rawValue),
        write: async (nextValue) => {
            return writeVerified(`OptionsListAccount[${field.index}]`, nextValue, {
                write: (_path, value) => onWrite(field.index, value),
            });
        },
        renderInfo: () => [
            // A description sits under the name, as SimpleNumberRow's sub-label.
            field.description
                ? div(
                      { class: "account-row__name-group" },
                      span({ class: "account-row__name" }, field.label),
                      span({ class: "account-row__sub-label" }, field.description)
                  )
                : span({ class: "account-row__name" }, field.label),
            field.warn ? span({ class: warnBadgeClass }, Icons.Warning(), ` ${field.warn}`) : null,
        ],
        rowClass: () => joinClasses(field.warn ? "has-warning" : "", rowClass),
        controlsClass,
        inputMode: isFloat ? "float" : "int",
        inputProps: isFormatted ? { formatter: largeFormatter, parser: largeParser } : {},
        // Set all saves through the row's own write (its page's).
        setAll: {},
        adjustInput: (rawValue, delta) => {
            const cur = parseInputValue(rawValue) ?? 0;
            const step = field.formatted ? formattedStep(cur) : isFloat ? 0.1 : 1;
            return Math.max(0, cur + step * delta);
        },
    });
};
