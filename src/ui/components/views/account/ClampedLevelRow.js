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
            // A level the game holds above the max may come down step by step (−); Max all brings it to the max.
            const raw = Number(rawValue);
            if (Number.isInteger(raw) && raw > toBound(resolveValue(max), Infinity) && raw < toNum(valueState.val, 0))
                return raw;
            const nextValue = clamp(rawValue, invalidFallback, { strict: true });
            return Number.isNaN(nextValue) ? null : nextValue;
        },
        write: async (nextLevel) => {
            if (typeof write === "function") return write(nextLevel);

            const path = resolveValue(writePath);
            return writeVerified(path, nextLevel);
        },
        renderInfo: renderInfo ?? defaultInfo,
        renderBadge: renderBadge ?? ((currentValue) => `LV ${currentValue ?? 0} / ${resolveValue(max)}`),
        rowClass,
        badgeClass,
        controlsClass,
        inputMode,
        adjustInput: (rawValue, delta, currentValue) => {
            const value = toNum(rawValue, toNum(currentValue, 0));
            // Above the max (the game counts it): + leaves it, − takes one off. Max all is what lowers it to the max.
            if (value >= toBound(resolveValue(max), Infinity))
                return delta > 0 ? value : Math.max(toBound(resolveValue(min), 0), value + delta);
            return clamp(value + delta, toNum(currentValue, 0));
        },
        maxAction: resolvedMaxAction,
        renderExtraActions,
    });
};
