import van from "../../../../vendor/van-1.6.0.js";
import { joinClasses, resolveValue } from "../accountShared.js";

const { input, label, span } = van.tags;

/**
 * The one on/off control: a switch with the game's own word for the state beside it (Owned / Not owned,
 * Unlocked / Locked). It saves on flip; when the save is done, refused or failed, it shows what the game holds. It stays
 * enabled while a save runs, so focus stays where the player put it; a flip during a save is ignored.
 *
 * @param {object} opts
 * @param {() => boolean|*} opts.checked whether the thing is on, as the game holds it
 * @param {[string, string]|(() => string)} opts.words the word for on and for off, or a function for more states
 * @param {string} opts.name what the switch is for, read out by assistive technology (the row's name)
 * @param {(next: boolean) => *} opts.onFlip saves the new state
 * @param {*} [opts.disabled] when the game can't be written at all (still loading, failed to read); not while saving
 * @param {*} [opts.title] tooltip
 * @param {string} [opts.className]
 * @returns {HTMLElement}
 */
export const StateSwitch = ({ checked, words, name, onFlip, disabled = false, title = null, className = "" }) => {
    const isOn = () => Boolean(resolveValue(checked));
    let saving = false;
    const box = input({
        type: "checkbox",
        role: "switch",
        "aria-label": name,
        checked: isOn,
        disabled: () => Boolean(resolveValue(disabled)),
        onchange: async (e) => {
            if (saving) {
                box.checked = isOn();
                return;
            }
            saving = true;
            try {
                await onFlip(e.target.checked);
            } finally {
                saving = false;
                box.checked = isOn();
            }
        },
    });
    return label(
        { class: () => joinClasses("toggle-switch state-switch", isOn() ? "is-on" : "", className), title },
        span({ class: "state-switch__words" }, () => (typeof words === "function" ? words() : words[isOn() ? 0 : 1])),
        box,
        span({ class: "slider" })
    );
};
