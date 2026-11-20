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
 * A failed save says why in place of the words (the reason is read out too) until the next flip, or until the game
 * first holds something else (a bulk action or a refresh changed it); `onFlip` reports one by throwing or by returning
 * `{ ok: false, error }` (what `useWriteStatus().run` and `useAutoSave` return).
 *
 * While saves run the box shows the newest flip asked for; once they settle, what the game holds. With `status` (the
 * row's save status) it also tells screen readers that it's saving and that the save landed; without it, the page
 * says that itself.
 *
 * @param {object} opts
 * @param {() => boolean|*} opts.checked whether the thing is on, as the game holds it
 * @param {[string, string]|(() => string)} opts.words the word for on and for off, or a function for more states
 * @param {string|(() => string)} opts.name what the switch is for, read out by assistive technology (the row's name)
 * @param {(next: boolean) => *} opts.onFlip saves the new state
 * @param {*} [opts.disabled] when the game can't be written at all (still loading, failed to read); not while saving
 * @param {*} [opts.status] the row's save status ("loading", "success", "error"), to read out saving and saved
 * @param {*} [opts.title] tooltip
 * @param {string} [opts.className]
 * @returns {HTMLElement}
 */
export const StateSwitch = ({
    checked,
    words,
    name,
    onFlip,
    disabled = false,
    status = null,
    title = null,
    className = "",
}) => {
    const isOn = () => Boolean(resolveValue(checked));
    // The last failed save's reason and the state the game held then. It goes for good the first time the game holds
    // something else, so a later change back doesn't bring an old failure back.
    const failed = van.state(null);
    const failure = () => {
        const record = failed.val;
        if (!record || record.gone) return "";
        if (record.on !== isOn()) record.gone = true;
        return record.gone ? "" : record.reason;
    };
    // The newest flip asked for while saves run (null once they settle): the box shows it, not the state in between.
    const pending = van.state(null);
    let saving = false;
    let wanted = null;
    const box = input({
        type: "checkbox",
        role: "switch",
        "aria-label": name,
        checked: () => pending.val ?? isOn(),
        disabled: () => Boolean(resolveValue(disabled)),
        onchange: async (e) => {
            // The newest flip, with the click that made it (so its save is named after this switch even when it waits).
            wanted = { on: e.target.checked, inGesture: captureGesture() };
            pending.val = wanted.on;
            if (saving) return; // the save running now picks up the newest flip when it ends
            saving = true;
            try {
                while (wanted !== null && wanted.on !== isOn()) {
                    const { on, inGesture } = wanted;
                    wanted = null;
                    failed.val = null;
                    let outcome;
                    try {
                        outcome = await inGesture(() => onFlip(on));
                    } catch (error) {
                        outcome = { ok: false, error };
                    }
                    if (outcome?.ok === false && outcome.error)
                        failed.val = { reason: saveFailureReason(outcome.error), on: isOn() };
                }
            } finally {
                saving = false;
                wanted = null;
                pending.val = null;
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
                    failure() ? "is-failed" : "",
                    className
                ),
            title: () => failure() || resolveValue(title) || "",
        },
        span({ class: "state-switch__words" }, () =>
            failure() ? failure() : typeof words === "function" ? words() : words[isOn() ? 0 : 1]
        ),
        span({ class: "account-write-feedback", role: "status" }, () => {
            if (failure()) return `Not saved: ${failure()}`;
            const state = resolveValue(status);
            return state === "loading" ? "Saving…" : state === "success" ? "Saved" : "";
        }),
        box,
        span({ class: "slider" })
    );
};
