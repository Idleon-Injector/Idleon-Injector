/**
 * Feedback said where the player acted (#77): no toasts.
 * - A run's result: a short line at the control (`useSaid` + `Said`), only when the result can't be seen from there.
 * - A refusal pulses the control's own hint and says why; a failure stays until the next try.
 * - A risky click asks in place (`clickAgain`): the button reads "CLICK AGAIN" for a few seconds.
 */

import van from "../vendor/van-1.6.0.js";
import { Icons } from "../assets/icons.js";
import { hideTooltip, showTooltip } from "./Tooltip.js";

const { span } = van.tags;

/** Play a one-shot animation class again, even when it is already on; it comes off when the animation ends. */
export const replay = (el, cls) => {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    const done = (e) => {
        if (e.target !== el) return; // a child's own animation
        el.classList.remove(cls);
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

// The one live region for click-again questions, so a keyboard player hears what the second click will do.
let askRegion = null;
const announce = (text) => {
    if (!askRegion) {
        askRegion = span({ class: "sr-only", role: "status" });
        document.body.appendChild(askRegion);
    }
    askRegion.textContent = text;
};

const armed = new WeakMap();
const disarm = (button) => {
    const state = armed.get(button);
    if (!state) return;
    clearTimeout(state.timer);
    armed.delete(button);
    button.classList.remove("is-armed");
    button.removeAttribute("data-again");
    if (state.label === null) button.removeAttribute("aria-label");
    else button.setAttribute("aria-label", state.label);
    hideTooltip();
};

/**
 * The in-place confirm (#25), where a click used to ask `window.confirm()`. `question` is what the second click
 * does, as words that follow "Click again to" ("disable 12 bribes."). The first click arms `button` and returns
 * false: it reads CLICK AGAIN, the menu's tooltip and screen readers say "Click again to …", and its fill drains
 * over `ms`. A second click within `ms` returns true. If the question changed meanwhile (other targets), the
 * button asks again instead.
 */
export const clickAgain = (button, question, ms = 4000) => {
    const state = armed.get(button);
    if (state && state.question === question) {
        disarm(button);
        return true;
    }
    if (state) disarm(button);
    armed.set(button, {
        question,
        label: button.getAttribute("aria-label"),
        timer: setTimeout(() => disarm(button), ms),
    });
    button.style.setProperty("--again-ms", `${ms}ms`);
    button.setAttribute("data-again", "CLICK AGAIN");
    button.setAttribute("aria-label", `Click again to ${question}`);
    replay(button, "is-armed");
    showTooltip(button, `Click again to ${question}`);
    announce(`Click again to ${question}`);
    return false;
};

/**
 * The in-place confirm for a typed value (#77), where a save used to ask `window.confirm()`. Returns
 * `ask(question)`: the first time it throws an Error ("Enter it again to …") that the field's save state shows
 * beside it, and nothing is written. The same question again within `ms`, while the player is still in the field
 * (`inField()`: Enter, not leaving it), returns true.
 */
export const askAtField = (inField, ms = 6000) => {
    let asked = "";
    let timer = null;
    return (question) => {
        if (asked === question && inField()) {
            asked = "";
            clearTimeout(timer);
            return true;
        }
        asked = question;
        clearTimeout(timer);
        timer = setTimeout(() => (asked = ""), ms);
        throw Object.assign(new Error(`Enter it again to ${question}`), { askAgain: true });
    };
};
