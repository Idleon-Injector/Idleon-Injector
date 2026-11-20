import van from "../../../vendor/van-1.6.0.js";
import { EditableNumberRow } from "./EditableNumberRow.js";
import { resolveValue, toNum, writeVerified } from "./accountShared.js";

const { span } = van.tags;

const toBound = (value, fallback) => {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
};

/**
 * Shared row adapter for single-path level fields with a 0..max clamp.
 */
export const ClampedLevelRow = ({
    valueState,
    writePath,
    write = null,
    max,
    min = 0,
    integerMode = null,
    invalidFallback = null,
    renderInfo,
    indexLabel = null,
    name = null,
    renderBadge = null,
    rowClass = "",
    badgeClass = "",
    controlsClass = "",
    inputMode = "int",
    maxAction = null,
    renderExtraActions = null,
}) => {
    const clamp = (value, fallback = null, { strict = false } = {}) => {
        const minValue = toBound(resolveValue(min), 0);
        const maxValue = toBound(resolveValue(max), Infinity);
        const rawValue = Number(value);
        if (!Number.isFinite(rawValue)) return fallback;

        let nextValue = rawValue;
        if (integerMode === "floor") nextValue = Math.floor(rawValue);
        if (integerMode === "round") nextValue = Math.round(rawValue);
        if (integerMode === "trunc") nextValue = Math.trunc(rawValue);
        // A typed value out of range is refused with the reason; −/+ stop at the ends.
        if (strict && nextValue > maxValue) throw new Error(`max ${maxValue}`);
        if (strict && nextValue < minValue) throw new Error(`min ${minValue}`);
        return Math.max(minValue, Math.min(maxValue, nextValue));
    };

    const defaultInfo = () => [
        indexLabel !== null ? span({ class: "account-row__index" }, indexLabel) : null,
        name !== null ? span({ class: "account-row__name" }, name) : null,
    ];

    const resolvedMaxAction =
        maxAction === true
            ? {
                  value: resolveValue(max),
                  tooltip: `Set to max level (${resolveValue(max)})`,
              }
            : maxAction;

    return EditableNumberRow({
        valueState,
        normalize: (rawValue) => {
            const nextValue = clamp(rawValue, invalidFallback, { strict: true });
            return Number.isNaN(nextValue) ? null : nextValue;
        },
        write: async (nextLevel) => {
            if (typeof write === "function") return write(nextLevel);

            const path = resolveValue(writePath);
            return writeVerified(path, nextLevel);
        },
        renderInfo: renderInfo ?? defaultInfo,
        // The cap badge (LV 3 / 10); with no cap the level shows once, in the field.
        renderBadge:
            renderBadge ??
            ((currentValue) =>
                Number.isFinite(Number(resolveValue(max))) ? `LV ${currentValue ?? 0} / ${resolveValue(max)}` : ""),
        rowClass,
        badgeClass,
        controlsClass,
        inputMode,
        adjustInput: (rawValue, delta, currentValue) => {
            const nextValue = toNum(rawValue, toNum(currentValue, 0)) + delta;
            return clamp(nextValue, toNum(currentValue, 0));
        },
        maxAction: resolvedMaxAction,
        renderExtraActions,
    });
};
