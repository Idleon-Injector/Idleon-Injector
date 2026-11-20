import van from "../../../../vendor/van-1.6.0.js";
import { captureGesture } from "../../../../services/changeLog.js";
import { saveFailureReason } from "../autoSave.js";
import { joinClasses, resolveValue } from "../accountShared.js";

const { input, label, span } = van.tags;

/**
 * The one on/off control: a switch with the game's own word for the state beside it (Owned / Not owned,
 * Unlocked / Locked). It saves on flip; when the save is done, refused or failed, it shows what the game holds.
 *
 * It stays enabled while a save runs, so focus stays where the player put it. A flip made while it saves is kept:
 * once the save ends, the switch saves the newest flip if the game doesn't already hold it.
 *
 * A failed save says why in place of the words (the reason is read out too) until the next flip; `onFlip` reports
 * one by throwing or by returning `{ ok: false, error }` (what `useWriteStatus().run` and `useAutoSave` return).
 *
 * @param {object} opts
 * @param {() => boolean|*} opts.checked whether the thing is on, as the game holds it
 * @param {[string, string]|(() => string)} opts.words the word for on and for off, or a function for more states
 * @param {string|(() => string)} opts.name what the switch is for, read out by assistive technology (the row's name)
 * @param {(next: boolean) => *} opts.onFlip saves the new state
 * @param {*} [opts.disabled] when the game can't be written at all (still loading, failed to read); not while saving
 * @param {*} [opts.title] tooltip
 * @param {string} [opts.className]
 * @returns {HTMLElement}
 */
export const StateSwitch = ({ checked, words, name, onFlip, disabled = false, title = null, className = "" }) => {
    const isOn = () => Boolean(resolveValue(checked));
    const failure = van.state("");
    let saving = false;
    let wanted = null;
    const box = input({
        type: "checkbox",
        role: "switch",
        "aria-label": name,
        checked: isOn,
        disabled: () => Boolean(resolveValue(disabled)),
        onchange: async (e) => {
            // The newest flip, with the click that made it (so its save is named after this switch even when it waits).
            wanted = { on: e.target.checked, inGesture: captureGesture() };
            if (saving) return; // the save running now picks up the newest flip when it ends
            saving = true;
            try {
                while (wanted !== null && wanted.on !== isOn()) {
                    const { on, inGesture } = wanted;
                    wanted = null;
                    failure.val = "";
                    let outcome;
                    try {
                        outcome = await inGesture(() => onFlip(on));
                    } catch (error) {
                        outcome = { ok: false, error };
                    }
                    if (outcome?.ok === false && outcome.error) failure.val = saveFailureReason(outcome.error);
                }
            } finally {
                saving = false;
                wanted = null;
                box.checked = isOn();
            }
        },
    });
    return label(
        {
            class: () =>
                joinClasses(
                    "toggle-switch state-switch",
                    isOn() ? "is-on" : "",
                    failure.val ? "is-failed" : "",
                    className
                ),
            title: () => failure.val || resolveValue(title) || "",
        },
        span({ class: "state-switch__words" }, () =>
            failure.val ? failure.val : typeof words === "function" ? words() : words[isOn() ? 0 : 1]
        ),
        span({ class: "account-write-feedback", role: "status" }, () =>
            failure.val ? `Not saved: ${failure.val}` : ""
        ),
        box,
        span({ class: "slider" })
    );
};
