import van from "../../../vendor/van-1.6.0.js";
import { NumberInput } from "../../NumberInput.js";
import { ActionButton } from "./components/ActionButton.js";
import { RefreshButton } from "./components/AccountPageChrome.js";
import { resolveNumberInput, resolveValue, toNodes } from "./accountShared.js";
import { announce, replay } from "../../inPlace.js";
import { hideTooltip, showTooltip } from "../../Tooltip.js";

const { div, span, select, option } = van.tags;

const SetAllApplyButton = ({ label, status, onApply, confirm = null, disabled = false }) =>
    onApply
        ? ActionButton({
              label,
              status,
              confirm,
              disabled,
              onClick: async (e) => {
                  e.preventDefault();
                  await onApply();
              },
          })
        : null;

/**
 * Shared header action strip for bulk account-page actions.
 */
export const BulkActionBar = ({ leading = null, actions = [], refresh = null }) =>
    div(
        { class: "account-header__actions" },
        ...toNodes(leading),
        ...actions
            .filter((action) => action && typeof action.onClick === "function")
            .map((action) =>
                ActionButton({
                    label: action.label,
                    status: action.status,
                    variant: action.variant ?? "quiet",
                    className: action.extraClass ?? "",
                    disabled: action.disabled ?? false,
                    tooltip: action.tooltip ?? null,
                    onClick: (e) => action.onClick(e),
                    preventMouseDown: action.preventMouseDown !== false,
                    confirm: action.confirm ?? null,
                    confirmTargets: action.confirmTargets ?? null,
                })
            ),
        refresh
            ? RefreshButton({
                  onRefresh: refresh.onClick,
                  tooltip: refresh.tooltip ?? null,
                  disabled: refresh.disabled ?? false,
              })
            : null
    );

// The field each Set all value is typed in, so a press with no number there can point at it (refuseSetAll).
const fieldByValue = new WeakMap();
const isNumber = (value) => resolveNumberInput(value.val, { fallback: null }) !== null;

/** A Set all pressed with no number in its field: nothing is written, and the field pulses and says why. */
export const refuseSetAll = (value) => {
    const why = "Type a number first";
    announce(why);
    const field = fieldByValue.get(value);
    if (!field) return;
    replay(field, "refused");
    showTooltip(field, why);
    setTimeout(() => hideTooltip(field), 4000);
};

/**
 * A typed value every row gets. An empty or invalid value is refused at the field, never written as 0. `confirm`
 * (see ActionButton) asks only while the field holds a number. `placeholder` puts the label inside the empty field
 * instead (pass `label: ""`), so the field and its button are one shape the Undo all offer can cover whole.
 */
export const SetAllNumberControl = ({
    label,
    value,
    status = null,
    applyLabel = "Set all",
    onApply = null,
    confirm = null,
    disabled = false,
    min = 0,
    max = Infinity,
    placeholder = null,
}) => {
    const field = NumberInput({
        ...(placeholder ? { placeholder, "aria-label": placeholder } : {}),
        mode: "int",
        value,
        oninput: (e) => (value.val = e.target.value),
        onDecrement: () => {
            const n = Number(value.val);
            const base = Number.isFinite(n) ? n : min;
            value.val = String(Math.max(min, base - 1));
        },
        onIncrement: () => {
            const n = Number(value.val);
            const base = Number.isFinite(n) ? n : min;
            value.val = String(Math.min(max, base + 1));
        },
    });
    fieldByValue.set(value, field);
    return div(
        { class: "account-setall-row" },
        label ? span({ class: "account-setall-row__label" }, label) : null,
        div({ class: "account-setall-row__input" }, field),
        SetAllApplyButton({
            label: applyLabel,
            status,
            onApply: onApply && (() => (isNumber(value) ? onApply() : refuseSetAll(value))),
            confirm: confirm && (() => (isNumber(value) ? resolveValue(confirm) : null)),
            disabled,
        })
    );
};

export const SetAllSelectControl = ({
    label,
    value,
    options,
    status = null,
    applyLabel = "Set all",
    onApply,
    confirm = null,
}) =>
    div(
        { class: "account-setall-row" },
        span({ class: "account-setall-row__label" }, label),
        select(
            {
                class: "select-base account-setall-row__select",
                onchange: (e) => (value.val = e.target.value),
            },
            ...options.map((entry) =>
                option({ value: entry.value, selected: () => String(value.val) === String(entry.value) }, entry.label)
            )
        ),
        SetAllApplyButton({ label: applyLabel, status, onApply, confirm })
    );
