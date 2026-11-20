import van from "../../../vendor/van-1.6.0.js";
import { Icons } from "../../../assets/icons.js";
import { labelOf, withAction } from "../../../services/changeLog.js";
import { undoAction } from "./undo.js";

const { span, button } = van.tags;

/** How long Undo stays beside a saved field (longer while the pointer or focus is on it). */
export const UNDO_MS = 10000;
/** The row's confirm-in-place wash after an undo (Luminate's menu spec: 800 ms). */
const WASH_MS = 800;

/** Short reason for a failed save, shown next to the field. */
export const saveFailureReason = (error) => {
    const message = String(error?.message ?? error ?? "");
    if (/^Write mismatch/.test(message)) return "game kept old value";
    return message || "not saved";
};

const isEditField = (node) => /^(INPUT|SELECT|TEXTAREA)$/.test(String(node?.nodeName ?? "").toUpperCase());

/**
 * Save on commit, for one field or a row of fields that save together: Enter saves and keeps focus,
 * leaving the row's fields saves, Escape puts the stored value back.
 *
 * `prepare()` reads the drafts when the save starts and returns `{ unchanged: true }` (nothing to save) or
 * `{ write: async () => result }`; it throws an Error whose message is the reason a draft can't be saved.
 * A save asked for while one is running runs once that one ends, so the last value is the one saved.
 *
 * Status: null, "loading" (saving…), "success" (read back from the game) or "error" (with `reason`).
 *
 * After a save, `undo.offer` holds its logged action for UNDO_MS: SaveState shows "↶ Undo" beside the ✓. Undo puts
 * the old values back (on the character they were saved on) with the same saving…/✓ states, then the page reads
 * the game again, so the row shows what the game now holds. When the fields edit one of several things (the selected
 * tile, say), `subject()` names it: Undo stays with the thing it saved, so it goes when the fields move on.
 */
export const useAutoSave = ({ prepare, revert = null, successMs = 2400, subject = null }) => {
    const status = van.state(null);
    const reason = van.state("");
    const offer = van.state(null);
    const washed = van.state(false);
    const refused = van.state(false);
    let running = null;
    let again = false;
    let clearTimer = null;
    let offerTimer = null;
    let label = "";
    // The error shown is prepare()'s reason a draft can't be saved, not a failed write or undo.
    let draftRefused = false;
    // The pointer and focus each keep Undo; it goes only once neither is on it.
    const holds = { pointer: false, focus: false };

    const endOffer = () => {
        clearTimeout(offerTimer);
        offer.val = null;
        if (status.rawVal === "success" && successMs > 0) status.val = null;
    };
    const startOffer = (action) => {
        offer.val = action;
        clearTimeout(clearTimer);
        clearTimeout(offerTimer);
        if (!holds.pointer && !holds.focus) offerTimer = setTimeout(endOffer, UNDO_MS);
    };

    const settle = (next, why = "") => {
        clearTimeout(clearTimer);
        status.val = next;
        reason.val = why;
        refused.val = false;
        draftRefused = false;
        if (next !== "success") endOffer();
        if (next === "success" && successMs > 0)
            clearTimer = setTimeout(() => {
                if (status.val === "success" && !offer.val) status.val = null;
            }, successMs);
    };

    const saveOnce = async () => {
        let plan;
        try {
            plan = prepare();
        } catch (error) {
            settle("error", saveFailureReason(error));
            draftRefused = true;
            return { ok: false, error };
        }
        if (!plan || plan.unchanged) {
            if (status.val === "error") settle(null);
            return { ok: false, cancelled: true };
        }
        return run(plan.write);
    };

    /** Run any write (a row's toggle button, say) with this save state, as one action Undo can put back. */
    const run = (task) => {
        const savedFor = subject?.();
        return withAction({ label, kind: "row" }, async (action) => {
            const outcome = await track(task);
            if (outcome.ok && action.entries > 0 && subject?.() === savedFor) startOffer(action);
            return outcome;
        });
    };

    const track = async (task) => {
        settle("loading");
        try {
            const result = await task();
            if (result?.cancelled) {
                settle(null);
                return { ok: false, cancelled: true, result };
            }
            settle("success");
            return { ok: true, result };
        } catch (error) {
            settle("error", saveFailureReason(error));
            return { ok: false, error };
        }
    };

    const save = () => {
        if (running) {
            again = true;
            return running;
        }
        running = (async () => {
            let outcome;
            do {
                again = false;
                outcome = await saveOnce();
            } while (again);
            return outcome;
        })().finally(() => (running = null));
        return running;
    };

    /** Put back what the offered save changed; a refusal says why where the ✓ was, and pulses. */
    const undo = async () => {
        const action = offer.val;
        if (!action) return;
        holds.pointer = holds.focus = false;
        endOffer();
        const outcome = await track(() => undoAction(action.id));
        if (!outcome.ok) {
            refused.val = true;
            return;
        }
        washed.val = true;
        setTimeout(() => (washed.val = false), WASH_MS);
    };

    /** Pointer or focus on Undo keeps it (`by` is "pointer" or "focus"); once both left, a few more seconds. */
    const hold = (by, on) => {
        holds[by] = on;
        clearTimeout(offerTimer);
        if (!holds.pointer && !holds.focus && offer.val) offerTimer = setTimeout(endOffer, UNDO_MS / 2);
    };

    const cancel = () => {
        if (typeof revert === "function") revert();
        if (status.val === "error") settle(null);
    };

    if (subject)
        van.derive(() => {
            subject();
            endOffer();
        });

    /** Put these on the element around the row's fields. */
    const handlers = {
        onkeydown: (e) => {
            if (!isEditField(e.target)) return;
            label = labelOf(e.target) || label;
            if (e.key === "Enter") {
                e.preventDefault();
                void save();
            } else if (e.key === "Escape") {
                cancel();
            }
        },
        // −/+ beside a field save at once (their own click handler has changed the draft by now).
        onclick: (e) => {
            if (typeof e.target?.closest === "function" && e.target.closest(".number-input-btn")) {
                label = labelOf(e.target) || label;
                void save();
            }
        },
        // Moving between the row's own fields keeps editing, but says at once why the drafts can't be saved (or
        // takes back a reason they no longer have); anything else (Undo too) saves.
        onfocusout: (e) => {
            const next = e.relatedTarget;
            if (next && isEditField(next) && e.currentTarget.contains(next)) {
                if (running || status.val === "loading") return;
                try {
                    prepare();
                    if (draftRefused) settle(null);
                } catch (error) {
                    settle("error", saveFailureReason(error));
                    draftRefused = true;
                }
                return;
            }
            if (isEditField(e.target)) label = labelOf(e.target) || label;
            void save();
        },
    };

    return {
        status,
        reason,
        save,
        run,
        cancel,
        handlers,
        isBusy: () => running !== null,
        undo: { offer, washed, refused, run: undo, hold },
    };
};

const LABEL = { loading: "saving…", success: "saved" };

/**
 * Class for the element around the fields: its badge steps aside for the words (and for Undo), its fields show a
 * failure, and it washes once when an undo lands. Pass the save's `undo` (from useAutoSave) for those last two.
 */
export const saveStateClass = (status, undo = null) =>
    [
        status === "loading" ? "is-saving" : "",
        status === "error" ? (undo?.refused.val ? "is-undo-refused" : "is-save-failed") : "",
        undo?.offer.val && status !== "loading" && status !== "error" ? "is-undo-offered" : "",
        undo?.washed.val ? "is-undone" : "",
    ]
        .filter(Boolean)
        .join(" ");

/**
 * The save state beside a field: "saving…" (or `reason`, when one is given while it saves: a slow save saying it is
 * still waiting), a ✓ once the game reads the value back, or why it failed.
 * Its mark keeps a fixed slot; the words lie over the space to its left, so nothing around it moves.
 */
export const SaveState = ({ status, reason, undo = null, className = "" }) =>
    span(
        {
            class: () =>
                [
                    "save-state",
                    status.val ? `save-state--${status.val}` : "",
                    undo?.refused.val && status.val === "error" ? "save-state--refused" : "",
                    className,
                ]
                    .join(" ")
                    .trim(),
        },
        // The words are the live status; Undo sits beside them so its name isn't read out as one.
        span(
            { class: "save-state__label", role: "status", title: () => (status.val === "error" ? reason.val : "") },
            () =>
                status.val === "error" || (status.val === "loading" && reason.val)
                    ? reason.val
                    : (LABEL[status.val] ?? "")
        ),
        undo
            ? button(
                  {
                      type: "button",
                      class: "btn-quiet btn-sm save-state__undo",
                      hidden: () => !undo.offer.val || status.val === "loading" || status.val === "error",
                      title: "Put back the value from before this save",
                      // The promise is for tests; the browser ignores it.
                      onclick: () => undo.run(),
                      onmouseenter: () => undo.hold("pointer", true),
                      onmouseleave: () => undo.hold("pointer", false),
                      onfocus: () => undo.hold("focus", true),
                      onblur: () => undo.hold("focus", false),
                  },
                  Icons.Undo({ class: "save-state__undo-icon" }),
                  "Undo"
              )
            : null,
        span({ class: "save-state__mark", "aria-hidden": "true" }, () =>
            status.val === "success"
                ? Icons.Check({ class: "save-state__icon" })
                : status.val === "error"
                  ? Icons.Warning({ class: "save-state__icon" })
                  : span()
        )
    );
