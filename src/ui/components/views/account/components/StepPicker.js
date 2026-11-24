import van from "../../../../vendor/van-1.6.0.js";
import { joinClasses } from "../accountShared.js";

const { div, button } = van.tags;

/**
 * One choice out of a few steps (a tier: Stone, Gold, Onyx, Zenith) as one joined shape: a press picks a step and the
 * picked one is lit, in its own `tone` colour when it has one. No dropdown. Read out as radio buttons; Left, Right, Home
 * and End move to a step and pick it, and Tab reaches only the picked one.
 *
 * @param {object} opts
 * @param {string} opts.name what is picked, read out by assistive technology ("Power tier")
 * @param {{value: *, label: string, tone?: string}[]} opts.steps
 * @param {() => *} opts.picked the picked step's value (reactive)
 * @param {(value: *) => *} opts.onPick
 * @param {string} [opts.className]
 * @returns {HTMLElement}
 */
export const StepPicker = ({ name, steps, picked, onPick, className = "" }) => {
    const isPicked = (step) => picked() === step.value;
    const buttons = steps.map((step, index) =>
        button(
            {
                type: "button",
                role: "radio",
                class: () =>
                    joinClasses(
                        "step-picker__step",
                        step.tone && `step-picker__step--${step.tone}`,
                        isPicked(step) && "is-picked"
                    ),
                "aria-checked": () => String(isPicked(step)),
                // The picked word's bold width, kept by every step, so picking one never moves its neighbours.
                "data-label": step.label,
                tabindex: () => (isPicked(step) || (index === 0 && !steps.some(isPicked)) ? "0" : "-1"),
                onclick: () => {
                    if (!isPicked(step)) onPick(step.value);
                },
            },
            step.label
        )
    );
    const onkeydown = (e) => {
        const at = steps.findIndex(isPicked);
        const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: steps.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const next = Math.max(0, Math.min(steps.length - 1, to));
        if (next !== at) onPick(steps[next].value);
        buttons[next].focus();
    };
    return div(
        { class: joinClasses("step-picker", className), role: "radiogroup", "aria-label": name, onkeydown },
        ...buttons
    );
};
