import van from "../../../vendor/van-1.6.0.js";
import { NumberInput } from "../../NumberInput.js";
import { ActionButton } from "./components/ActionButton.js";
import { RefreshButton } from "./components/AccountPageChrome.js";
import {
    CHARACTER_CHANGED,
    resolveNumberInput,
    resolveValue,
    runBulkSet,
    toNodes,
    useWriteStatus,
} from "./accountShared.js";
import { linesIn } from "./EditableNumberRow.js";
import { announce, replay } from "../../inPlace.js";
import { hideTooltip, showTooltip } from "../../Tooltip.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";

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
                    onClick: (e) => action.onClick(e),
                    preventMouseDown: action.preventMouseDown !== false,
                    confirm: action.confirm ?? null,
                    confirmTargets: action.confirmTargets ?? null,
                })
            ),
        refresh
            ? RefreshButton({
                  onRefresh: refresh.onClick,
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

/** What a list's tray says it acts on: "All 30 combat stamps", or "3 matching combat stamps" while the top bar searches. */
export const trayLabel = (n, word) => (isSearching() ? `${n} matching ${word(n)}` : `All ${n} ${word(n)}`);

/** The lines in a list (a tab's pane, a ListPanel's rows) that Set all acts on: the ones the top bar's search shows. */
export const setAllLines = (container) => linesIn(container, shownBySearch);

/**
 * Set all (DESIGN.md's Page standards), the one tool every list with a line without a max has: the number typed in its
 * field goes to every line. A line without a max gets it, and so does a line whose max is that number or more. When a
 * line's max is lower, the tray asks first: "Stop at max" (those lines get their max) or "Go past" (they get the
 * number too). When the number would lower a line, it asks first too; both in one question. Otherwise it runs on one
 * press. An empty field is refused, never written as 0.
 *
 * @param {object} opts
 * @param {Function} opts.ask the tray's question (TabbedList, ListPanel)
 * @param {() => Array} opts.lines the lines it acts on now: `setAllLines(pane)`, or the page's own; a line's
 *   `refuse(value)`, when it has one, names a value its writer can't take, and then nothing is written
 * @param {(n: number) => string} opts.word what the lines are, for the question ("combat stamps")
 * @param {(plan: {line: *, value: number}[]) => Promise} [opts.write] writes the plan; by default each line's
 *   `path` in one write, or its own `write` when it has none
 * @param {object} [opts.bulk] the page's useWriteStatus, when its other tools share it (a bulk write runs alone)
 * @param {(line: *) => {val: *}} [opts.stateOf] a line's value state
 * @param {(line: *) => number|null} [opts.maxOf] a line's max, null for none
 * @param {string|(() => string)} [opts.placeholder] the field's label ("Level"), or what gives it for the open tab
 * @param {(result: object) => void} [opts.onDone] called with how the write went (useWriteStatus' run result)
 * @param {() => *} [opts.askedFor] what else the question is about (the character in play): when it differs at the
 *   answer, the tool asks again
 */
export const SetAllTool = ({
    ask,
    lines,
    word,
    write = null,
    bulk = useWriteStatus(),
    placeholder = "Level",
    disabled = false,
    stateOf = (line) => line.valueState,
    maxOf = (line) => line.max,
    minOf = (line) => line.min ?? 0,
    askedFor = () => null,
    onDone = null,
}) => {
    const typed = van.state("");
    const maxUnder = (line, n) => {
        const max = maxOf(line);
        return max !== null && max !== undefined && Number.isFinite(Number(max)) && Number(max) < n;
    };
    const targetOf = (line, n, stop) => Math.max(minOf(line), stop && maxUnder(line, n) ? Number(maxOf(line)) : n);

    // Each line's path in one write; a line without one saves through its own row's write, one after another, and
    // stops if what was asked about (the character) changes on the way.
    const writeLines = async (plan, asked = askedFor()) => {
        await runBulkSet({
            entries: plan.filter(({ line }) => line.path),
            getTargetValue: (step) => step.value,
            getValueState: (step) => stateOf(step.line),
            getPath: (step) => step.line.path,
        });
        let failed = null;
        for (const { line, value } of plan.filter((step) => !step.line.path)) {
            const state = stateOf(line);
            if (Number(state.val) === value) continue;
            if (askedFor() !== asked) throw new Error(CHARACTER_CHANGED);
            const before = state.val;
            try {
                const verified = await line.write(value);
                // A row saved meanwhile keeps what it saved.
                if (!verified?.cancelled && state.val === before) state.val = verified;
            } catch (error) {
                failed ??= error;
            }
        }
        if (failed) throw failed;
    };
    const run = (all, n, stop) => async () => {
        const result = await bulk.run(() => {
            const plan = all.map((line) => ({ line, value: targetOf(line, n, stop) }));
            // A value one line's writer can't take stops the run before anything is written (Tome's 1 / x at 0).
            const refused = plan.map(({ line, value }) => line.refuse?.(value)).find(Boolean);
            if (refused) throw new Error(refused);
            return (write ?? writeLines)(plan);
        });
        onDone?.(result);
        return result;
    };

    const askOrWrite = (n) => {
        const all = lines();
        const keyOf = (line) => line.row ?? line;
        const over = () => all.filter((line) => maxUnder(line, n));
        // "Stop at max" can lower a line already above its max, so what goes down counts that answer too.
        const lowered = () => all.filter((line) => Number(stateOf(line).val) > targetOf(line, n, true));
        const o = over().length;
        const l = lowered().length;
        if (!o && !l) return run(all, n, false)();
        const number = n.toLocaleString("en-US");
        const asked = {
            from: button(),
            lowers: () => [askedFor(), ...over().map(keyOf), ...lowered().map(keyOf)],
            again: () => askOrWrite(n),
        };
        if (!o)
            return ask({
                ...asked,
                question: `Lower ${l} ${word(l)} to ${resolveValue(placeholder) === "Level" ? `level ${number}` : number}?`,
                confirmLabel: l === 1 ? "Lower it" : "Lower them",
                onConfirm: run(all, n, false),
            });
        // Some lines stop at a lower max: one question says that, and what goes down, and asks which way.
        return ask({
            ...asked,
            question: `${o} ${word(o)} ${o === 1 ? "has" : "have"} a max under ${number}.${
                l ? ` ${l} ${l === 1 ? "goes" : "go"} down.` : ""
            }`,
            confirmLabel: "Stop at max",
            onConfirm: run(all, n, true),
            other: { label: "Go past", onConfirm: run(all, n, false) },
            quiet: !l,
        });
    };

    const control = SetAllNumberControl({
        label: "",
        placeholder,
        value: typed,
        status: bulk.status,
        disabled,
        onApply: () => {
            const n = resolveNumberInput(typed.val, { min: 0, fallback: null });
            return n === null ? refuseSetAll(typed) : askOrWrite(n);
        },
    });
    const button = () => [...control.childNodes].find((node) => node.nodeName?.toLowerCase() === "button");
    return control;
};

/**
 * All to (DESIGN.md's Picks with states), the one tool every list whose lines each have their own pick has: one press
 * gives every line the same step ("All to Off | Normal | Pets+", "All to Materials | Particles"). A step every line
 * already has is off. With `ordered`, the steps go from least to most, and a press that would lower a line asks in
 * the tray first ("Lower 3 pets to Normal?"); without it, every press runs at once.
 *
 * @param {object} opts
 * @param {Function} opts.ask the tray's question (TabbedList, ListPanel)
 * @param {{value: *, label: string}[]} opts.steps the same steps as the lines' pickers
 * @param {() => Array} opts.lines the lines it acts on now (the ones the top bar's search shows)
 * @param {(line: *) => *} opts.pickedOf a line's step now
 * @param {(lines: Array, value: *) => Promise} opts.write gives `lines` the step `value`
 * @param {(n: number) => string} opts.word what the lines are, for the question ("pets")
 * @param {object} [opts.bulk] the page's useWriteStatus, when its other tools share it (a bulk write runs alone)
 * @param {(task: Function) => Promise} [opts.run] runs the write in `bulk` (the page's own, to say a failure its way)
 * @param {boolean} [opts.ordered]
 * @param {() => boolean} [opts.disabled]
 * @param {(step: {value: *, label: string}) => string} [opts.stepName] a step in the question's words, when its label is
 *   short ("1" is "tier 1": "Lower 2 cards to tier 1?")
 * @param {() => boolean} [opts.behind] true while part of a write failed after the lines took the step (the config
 *   file's save, Palette's clean-up): a step every line already has stays pressable then, and its press only redoes
 *   that part
 */
export const AllToTool = ({
    ask,
    steps,
    lines,
    pickedOf,
    write,
    word,
    bulk = useWriteStatus(),
    run = (task) => bulk.run(task),
    ordered = false,
    disabled = () => false,
    behind = () => false,
    stepName = (step) => step.label,
}) => {
    const rank = (value) => steps.findIndex((step) => step.value === value);
    const buttons = steps.map((step) => {
        const changing = () => lines().filter((line) => pickedOf(line) !== step.value);
        // What a press would lower; a line changed while it asks can change that, and then it asks again.
        const lowered = () => (ordered ? changing().filter((line) => rank(pickedOf(line)) > rank(step.value)) : []);
        const press = () => run(() => write(changing(), step.value));
        const askOrRun = () => {
            const n = lowered().length;
            if (!n) return press();
            return ask({
                question: `Lower ${n} ${word(n)} to ${stepName(step)}?`,
                confirmLabel: n === 1 ? "Lower it" : "Lower them",
                from: stepButton,
                lowers: lowered,
                again: askOrRun,
                onConfirm: press,
            });
        };
        const stepButton = ActionButton({
            label: step.label,
            status: bulk.status,
            disabled: () => disabled() || (!changing().length && !behind()),
            onClick: (e) => {
                e.preventDefault();
                return askOrRun();
            },
        });
        return stepButton;
    });
    return div({ class: "tabbed-list__tool-group" }, span({ class: "tabbed-list__tool-label" }, "All to"), ...buttons);
};
