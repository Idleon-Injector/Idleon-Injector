import van from "../vendor/van-1.6.0.js";
import { Icons } from "../assets/icons.js";

const { div, input, button, span } = van.tags;
const liveRawByState = new WeakMap();
const focusedValueSetters = new WeakMap();
// −/+ change the value without taking focus from the field being edited.
const keepFocus = (e) => e.preventDefault();

let capIds = 0;

// A cap's text through the field's formatter, or "" for none: null, empty, Infinity and NaN are no cap.
const capText = (cap, formatter) => () => {
    const raw = typeof cap === "function" ? cap() : cap;
    const value = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? (formatter ? formatter(String(value)) : String(value)) : "";
};

/**
 * The cap ("/ 15") sits inside the field's box after the value, muted, and is never part of the typed text: Enter or
 * leaving the field saves only the number. Pressing the cap puts the caret in the field. `cap` is a number, a
 * function returning one, or null for none; it shows through the field's formatter (1.03K / 2.5M). Only a real cap
 * gets the slash: the value Max fills up to. A number that isn't a limit is left out.
 */
const Cap = (cap, formatter, inputRef) => {
    if (cap === null || cap === undefined) return { node: null, describedBy: {}, wrapperClass: "number-input-wrapper" };
    const id = `number-input-cap-${++capIds}`;
    const text = capText(cap, formatter);
    const node = span(
        {
            class: "number-input__cap",
            hidden: () => !text(),
            onmousedown: (e) => {
                e.preventDefault();
                inputRef().focus();
            },
        },
        span({ "aria-hidden": "true" }, () => `/ ${text()}`),
        span({ id, class: "sr-only" }, () => `of ${text()}`)
    );
    const wrapperClass = () => (text() ? "number-input-wrapper number-input-wrapper--capped" : "number-input-wrapper");
    return { node, describedBy: { "aria-describedby": id }, wrapperClass };
};

/**
 * A capped value on a row with no field ("3 / 10"): the field's text without its box, the cap muted the same way.
 * `value` and `cap` are values or functions returning them.
 */
export const CappedValue = ({ value, cap, formatter = null }) => {
    const text = capText(cap, formatter);
    const shown = () => {
        const current = typeof value === "function" ? value() : value;
        return formatter ? formatter(String(current ?? 0)) : String(current ?? 0);
    };
    return span(
        { class: "capped-value" },
        span(shown),
        span(
            { class: "number-input__cap", hidden: () => !text() },
            span({ "aria-hidden": "true" }, () => `/ ${text()}`),
            span({ class: "sr-only" }, () => ` of ${text()}`)
        )
    );
};

export const getNumberInputLiveRaw = (state) => liveRawByState.get(state);

/** Explicit commits and cancellations also replace browser-owned formatted drafts. */
export const setNumberInputValue = (state, nextValue) => {
    state.val = nextValue;
    focusedValueSetters.get(state)?.(nextValue);
};

/**
 * Parse user input to a plain JS number. Handles:
 *   - Shorthand suffixes (case-insensitive): 2b, 1.5k, 10m, 5t
 *   - Caller-supplied parser (K/M/B/T/Q/QQ/QQQ, scientific E-notation, …)
 *   - Plain numbers
 *
 * Returns null if unparseable.
 *
 * @param {string}        raw
 * @param {Function|null} callerParser  - (string) => string|null
 * @returns {number|null}
 */
function parseInput(raw, callerParser = null) {
    if (!raw || raw.trim() === "") return null;
    const s = raw.trim();

    // 1. Shorthand suffixes — lowercase only so callerParser gets uppercase ones
    const suffixMap = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
    const suffixMatch = s.match(/^(-?[\d.]+)([kmbt])$/i);
    if (suffixMatch) {
        const n = parseFloat(suffixMatch[1]);
        const mult = suffixMap[suffixMatch[2].toLowerCase()];
        if (!isNaN(n) && mult) return n * mult;
    }

    // 2. Caller-supplied parser (handles K/M/B/T/Q/QQ/QQQ, 1e27, 1.31E27, …)
    if (callerParser) {
        const p = callerParser(s);
        if (p !== null && p !== undefined) {
            const n = Number(p);
            if (!isNaN(n)) return n;
        }
    }

    // 3. Plain number
    const n = Number(s);
    return isNaN(n) ? null : n;
}

/**
 * Reusable NumberInput component with optional +/- side controls.
 *
 * Props:
 *   value       {State}     VanJS state holding the current numeric value as a string.
 *   mode        {string}    "int" (default) | "float" — whether decimals are allowed.
 *   formatter   {Function}  (rawString) → displayString. Enables formatted mode.
 *   parser      {Function}  (displayString) → rawString | null. Required with formatter.
 *   onDecrement {Function}  Called when the − button is clicked.
 *   onIncrement {Function}  Called when the + button is clicked.
 *   cap         {number|Function|null} The most the value can be, shown muted after it ("2 / 15").
 *
 * Formatted mode behaviour:
 *   • The input shows formatter(value.val).
 *   • While the user is typing the browser owns the field entirely —
 *     no state is mutated, no reactive updates fire, cursor is never disrupted.
 *   • On blur the typed text is parsed; on success value.val is committed and
 *     the formatted display is restored; on failure the typed text stays
 *     (getNumberInputLiveRaw returns it) so the save can say why.
 *   • value.val changes update the DOM when not focused; −/+ and setNumberInputValue also while focused.
 *
 * Standard mode behaviour:
 *   • type="text" with character filtering (digits, optional leading minus,
 *     optional decimal point in float mode).
 *   • Suffix notation (2b, 1.5k) is expanded immediately on each keystroke.
 *   • value.val is kept in sync on every input event.
 */
export const NumberInput = ({
    value,
    mode = "int",
    onDecrement,
    onIncrement,
    formatter,
    parser,
    cap = null,
    ...inputProps
}) => {
    const { oninput: userOninput, onfocus: userOnfocus, onblur: userOnblur, ...restInputProps } = inputProps;

    const allowDecimal = mode === "float";

    const commit = (n) => String(allowDecimal ? n : Math.round(n));

    // ── Formatted mode ────────────────────────────────────────────────────────
    if (formatter) {
        let isFocused = false;
        let shownOnFocus = null;

        const tryParse = (raw) => {
            const n = parseInput(raw, parser);
            return n !== null ? commit(n) : null;
        };

        // Hold a direct DOM reference so we can write inputEl.value ourselves.
        // If we used a reactive `value:` VanJS prop, any state change would let
        // VanJS overwrite input.value mid-keystroke, resetting the cursor.
        const capped = Cap(cap, formatter, () => inputEl);
        const inputEl = input({
            type: "text",
            ...capped.describedBy,
            ...restInputProps,

            onfocus(e) {
                isFocused = true;
                // Text that didn't parse stays for the player to fix.
                if (!liveRawByState.has(value)) inputEl.value = formatter(value.val);
                liveRawByState.set(value, inputEl.value);
                shownOnFocus = inputEl.value;
                if (userOnfocus) userOnfocus(e);
            },

            oninput(e) {
                // Do NOT mutate any VanJS state here. A synchronous state mutation
                // triggers all subscribers immediately, which can cause ancestor
                // reactive closures to rebuild their DOM subtrees — destroying this
                // input element, losing focus, and resetting scroll position.
                liveRawByState.set(value, e.target.value);
                if (userOninput) userOninput(e);
            },

            onblur(e) {
                isFocused = false;
                // Text left as it was shown ("1.03K") keeps the exact value behind it, not a rounded one.
                const parsed = e.target.value === shownOnFocus ? null : tryParse(e.target.value);
                // Text that doesn't parse stays as typed (and as the live draft) so its save can say why.
                if (parsed !== null) {
                    value.val = parsed;
                    inputEl.value = formatter(parsed);
                    liveRawByState.delete(value);
                } else if (e.target.value === shownOnFocus) {
                    liveRawByState.delete(value);
                }
                if (userOnblur) userOnblur(e);
            },
        });

        const show = (nextValue) => {
            inputEl.value = formatter(nextValue);
            if (isFocused) liveRawByState.set(value, inputEl.value);
            else liveRawByState.delete(value);
        };
        show(value.val);
        focusedValueSetters.set(value, show);

        // Outside changes show only when the field isn't focused, so typing is never clobbered;
        // −/+ and setNumberInputValue show theirs while focused too.
        van.derive(() => {
            const v = value.val;
            if (!isFocused) show(v);
        });
        const step = (handler) => () => {
            handler?.();
            if (isFocused) show(value.val);
        };

        return div(
            { class: capped.wrapperClass },
            inputEl,
            capped.node,
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-icon btn-sm number-input-btn",
                    disabled: restInputProps.disabled,
                    onclick: step(onDecrement),
                    tabindex: -1,
                    onmousedown: keepFocus,
                    "aria-label": "Lower",
                },
                Icons.Minus()
            ),
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-icon btn-sm number-input-btn",
                    disabled: restInputProps.disabled,
                    onclick: step(onIncrement),
                    tabindex: -1,
                    onmousedown: keepFocus,
                    "aria-label": "Raise",
                },
                Icons.Plus()
            )
        );
    }

    // ── Standard mode ─────────────────────────────────────────────────────────
    const handleInput = (e) => {
        const raw = e.target.value;

        // Expand suffix notation as soon as the suffix letter is typed.
        const n = parseInput(raw);
        if (n !== null && raw.match(/[kmbt]$/i)) {
            const committed = commit(n);
            e.target.value = committed;
            value.val = committed;
            if (userOninput) userOninput(e);
            return;
        }

        // Strip characters that aren't valid for this mode.
        const cleaned = allowDecimal
            ? raw
                  .replace(/[^0-9.-]/g, "")
                  .replace(/(?!^)-/g, "")
                  .replace(/(\..*)\./g, "$1")
            : raw.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "");

        if (e.target.value !== cleaned) e.target.value = cleaned;
        value.val = e.target.value;
        if (userOninput) userOninput(e);
    };

    const capped = Cap(cap, null, () => inputEl);
    const inputEl = input({
        type: "text",
        value,
        oninput: handleInput,
        onfocus: userOnfocus,
        onblur: userOnblur,
        ...capped.describedBy,
        ...restInputProps,
    });

    return div(
        { class: capped.wrapperClass },
        inputEl,
        capped.node,
        button(
            {
                type: "button",
                class: "btn-quiet btn-icon btn-sm number-input-btn",
                disabled: restInputProps.disabled,
                onclick: onDecrement,
                tabindex: -1,
                onmousedown: keepFocus,
                "aria-label": "Lower",
            },
            Icons.Minus()
        ),
        button(
            {
                type: "button",
                class: "btn-quiet btn-icon btn-sm number-input-btn",
                disabled: restInputProps.disabled,
                onclick: onIncrement,
                tabindex: -1,
                onmousedown: keepFocus,
                "aria-label": "Raise",
            },
            Icons.Plus()
        )
    );
};
