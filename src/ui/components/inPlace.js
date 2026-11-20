/**
 * Feedback said where the player acted (#77): no toasts.
 * - A run's result: a short line at the control (`useSaid` + `Said`), only when the result can't be seen from there.
 * - A refusal pulses the control's own hint and says why; a failure stays until the next try.
 * - A risky click asks in place (`clickAgain`): the button reads "Click again" for a few seconds.
 */

import van from "../vendor/van-1.6.0.js";
import { Icons } from "../assets/icons.js";
import { hideTooltip, showTooltip } from "./Tooltip.js";

const { span } = van.tags;

/**
 * Play a one-shot animation again (`data-confirmed`, `data-refused`), even when it is already on; the attribute
 * comes off when the animation ends. An attribute, not a class, so a VanJS class binding can't wipe it midway.
 */
export const replay = (el, name) => {
    if (!el) return;
    const attribute = `data-${name}`;
    el.removeAttribute(attribute);
    void el.offsetWidth; // restart the animation
    el.setAttribute(attribute, "");
    const done = (e) => {
        if (e.target !== el) return; // a child's own animation
        el.removeAttribute(attribute);
        el.removeEventListener("animationend", done);
    };
    el.addEventListener("animationend", done);
};

/**
 * What a control last said: null, or `{ kind, text }` with kind "done", "refused" or "failed".
 * "done" and "refused" fade after `ms`; "failed" stays until the next `say`.
 */
export const useSaid = (ms = 4000) => {
    const said = van.state(null);
    let timer = null;
    const say = (kind, text) => {
        clearTimeout(timer);
        said.val = { kind, text: String(text).replace(/\s*\n\s*/g, " · "), n: (said.val?.n ?? 0) + 1 };
        if (kind === "failed") return;
        // It fades out (the `leaving` class) before it goes.
        timer = setTimeout(() => {
            said.val = { ...said.val, leaving: true };
            timer = setTimeout(() => (said.val = null), 240);
        }, ms);
    };
    const clear = () => {
        clearTimeout(timer);
        said.val = null;
    };
    return { said, say, clear };
};

/** A cheat's result in plain words: a failure loses the "Failed to execute cheat 'x':" the row already shows. */
export const plainReason = (message) =>
    String(message || "it didn't run").replace(/^Failed to execute cheat '[^']*':\s*/, "");

/**
 * The line itself: a mark (✓, or the warning sign) and the words. It keeps its node, so screen readers hear
 * each new result. `kinds` limits it to some kinds (a row's end shows results, its line under shows failures).
 */
export const Said = ({ said, className = "", kinds = null }) => {
    const shown = () => (said.val && (!kinds || kinds.includes(said.val.kind)) ? said.val : null);
    return span(
        {
            class: () =>
                `said ${className} ${shown() ? `said--${shown().kind}` : "said--empty"}${
                    shown()?.leaving ? " is-leaving" : ""
                }`,
            role: "status",
            title: () => shown()?.text ?? "",
        },
        () =>
            shown()
                ? span(
                      { class: "said__body" },
                      span(
                          { class: "said__mark", "aria-hidden": "true" },
                          shown().kind === "done"
                              ? Icons.Check({ class: "said__icon" })
                              : Icons.Warning({ class: "said__icon" })
                      ),
                      span({ class: "said__text" }, shown().text)
                  )
                : span()
    );
};

// The one live region for what a button says without words on screen: a click-again question (so a keyboard player
// hears what the second click will do) and a press's result (the button only changes colour).
let askRegion = null;
export const announce = (text) => {
    if (!askRegion) {
        askRegion = span({ class: "sr-only", role: "status" });
        document.body.appendChild(askRegion);
    }
    askRegion.textContent = text;
};

const armed = new WeakMap();
/** Forget `button`'s question, if it asked one: the press it was about no longer needs asking. */
export const disarm = (button) => {
    const state = armed.get(button);
    if (!state) return;
    clearTimeout(state.timer);
    armed.delete(button);
    button.removeAttribute("data-again");
    if (state.label === null) button.removeAttribute("aria-label");
    else button.setAttribute("aria-label", state.label);
    hideTooltip(button);
};

/**
 * The in-place confirm (#25), where a click used to open the browser's confirm popup. `question` is what the second click
 * does, as words that follow "Click again to" ("disable 12 bribes."). The first click arms `button` and returns
 * false: it reads "Click again", the menu's tooltip and screen readers say "Click again to …", and its fill drains
 * over `ms`. A second click within `ms` returns true. If the question or `targets` (what the change touches,
 * ids the question doesn't name) changed meanwhile, the button asks again instead.
 */
export const clickAgain = (button, question, { targets = null, ms = 4000 } = {}) => {
    const state = armed.get(button);
    const touches = JSON.stringify(targets);
    if (state && state.question === question && state.touches === touches) {
        disarm(button);
        return true;
    }
    if (state) disarm(button);
    armed.set(button, {
        question,
        touches,
        label: button.getAttribute("aria-label"),
        timer: setTimeout(() => disarm(button), ms),
    });
    button.style.setProperty("--again-ms", `${ms}ms`);
    button.removeAttribute("data-again");
    void button.offsetWidth; // a new question drains from full again
    button.setAttribute("data-again", "Click again");
    button.setAttribute("aria-label", `Click again to ${question}`);
    showTooltip(button, `Click again to ${question}`);
    announce(`Click again to ${question}`);
    return false;
};

/**
 * The in-place confirm for a typed value (#77), where a save used to open the browser's confirm popup. Returns
 * `ask(question)`: the first time it throws an Error ("Re-enter", short enough for the save state beside a field
 * at 400 px), the menu's tooltip and screen readers say "Enter again to …" at the field, and nothing is written. The same
 * question again within `ms`, answered by an Enter pressed in the field after it was asked, returns true.
 * `field()`: the field's element (or the element around it).
 */
export const askAtField = (field, ms = 10000) => {
    let asked = "";
    let askedAt = null;
    let entered = false;
    let timer = null;
    const forget = () => {
        clearTimeout(timer);
        asked = "";
        entered = false;
        if (!askedAt) return;
        askedAt.removeEventListener("focusout", left);
        askedAt.removeEventListener("keydown", enter);
        hideTooltip(askedAt);
        askedAt = null;
    };
    // Leaving the field forgets the question, so the save that leaving starts can't answer it, even when the
    // player is back in the field by the time that save asks.
    const left = (e) => {
        if (!askedAt.contains(e.relatedTarget)) forget();
    };
    // Only an Enter pressed after the question answers it: a save queued before it (the player left and came
    // back while the first save read the game) can't. A held Enter's repeats don't count, nor does an Enter that
    // confirms IME input.
    const enter = (e) => {
        if (e.key === "Enter" && !e.repeat && !e.isComposing && e.keyCode !== 229) entered = true;
    };
    return (question) => {
        const el = field();
        const inField = Boolean(el?.contains(document.activeElement));
        if (asked === question && entered && inField) {
            forget();
            return true;
        }
        // The question is asked where the player is. Leaving the field only leaves "Enter again" beside it, so
        // the next Enter there shows the question before one more Enter answers it.
        forget();
        if (inField) {
            asked = question;
            askedAt = el;
            el.addEventListener("focusout", left);
            el.addEventListener("keydown", enter);
            timer = setTimeout(forget, ms);
            showTooltip(el, `Enter again to ${question}`);
            announce(`Enter again to ${question}`);
        }
        throw Object.assign(new Error("Re-enter"), { askAgain: true });
    };
};
