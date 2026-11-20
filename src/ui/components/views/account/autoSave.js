import van from "../../../vendor/van-1.6.0.js";
import { Icons } from "../../../assets/icons.js";
import { captureGesture, labelOf, releaseAction, withAction } from "../../../services/changeLog.js";
import { undoAction } from "./undo.js";

const { span, button } = van.tags;

/** How long a ✓ stays once nothing (Undo) keeps it. */
export const SUCCESS_MS = 2400;
/** How long Undo stays beside a saved field (longer while the pointer or focus is on it). */
export const UNDO_MS = 10000;
/** The row's confirm-in-place wash after an undo (Luminate's menu spec: 800 ms). */
const WASH_MS = 800;

/** Short reason for a failed save, shown next to the field. */
export const saveFailureReason = (error) => {
    const message = String(error?.message ?? error ?? "");
    // A save of several values that failed part-way: say so, not that nothing changed (the page reads the game again).
    if (/^Some changes may have applied/.test(message)) return "some changes may have applied";
    if (/^Write mismatch/.test(message)) return "game kept old value";
    return message || "not saved";
};

const isEditField = (node) => /^(INPUT|SELECT|TEXTAREA)$/.test(String(node?.nodeName ?? "").toUpperCase());
// One of the row's own fields, for leaving a field: a switch that saves by itself isn't, so leaving a level for it
// saves the level; a switch that edits the row's draft (marked `data-row-field`) is.
const isRowField = (node) =>
    isEditField(node) &&
    (!/^(checkbox|radio)$/i.test(String(node?.type ?? node?.attributes?.type ?? "")) ||
        (node?.getAttribute?.("data-row-field") ?? null) !== null);

/**
 * Save on commit, for one field or a row of fields that save together: Enter saves and keeps focus,
 * leaving the row's fields saves, Escape puts the stored value back.
 *
 * `prepare(drafts)` returns `{ unchanged: true }` (nothing to save) or `{ write: async () => result }`; it throws an
 * Error whose message is the reason a draft can't be saved. `capture()`, when given, takes the drafts at the commit
 * (Enter, leaving the field) and `prepare` gets them; without it `prepare` reads them when the save starts.
 * A save asked for while one is running runs once that one ends, so the last value is the one saved.
 *
 * Status: null, "loading" (saving…), "success" (read back from the game) or "error" (with `reason`). A failure of the
 * field stays until the field saves (or no longer needs to): a switch's ✓ beside it doesn't take it away.
 *
 * After a save, `undo.offer` holds its logged action for UNDO_MS: SaveState shows "↶ Undo" beside the ✓. Undo puts
 * the old values back (on the character they were saved on) with the same saving…/✓ states, then the page reads
 * the game again, so the row shows what the game now holds. When the fields edit one of several things (the selected
 * tile, say), `subject()` names it: Undo stays with the thing it saved, so it goes when the fields move on.
 */
export const useAutoSave = ({ prepare, capture = null, revert = null, successMs = SUCCESS_MS, subject = null }) => {
    const status = van.state(null);
    const reason = van.state("");
    const offer = van.state(null);
    const washed = van.state(false);
    const refused = van.state(false);
    // The newest thing in the row's queue while it's a save ({ again, turn }): a save asked for then joins it.
    let lastSave = null;
    // Goes up on Escape: a commit made before it no longer saves (one already writing still ends).
    let commits = 0;
    let saveLoops = 0;
    let clearTimer = null;
    let offerTimer = null;
    let label = "";
    // The field's failure ({ why, kind }; kind "draft" is prepare()'s reason a draft can't be saved). Only the field
    // saving takes it back, or its draft no longer needing a save (Escape, or the game holds it); other writes say
    // saving… and then this again, so a ✓ never hides a value left unsaved.
    let held = null;
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

    /**
     * `by`: "save" (the field's save), "button" (run(): a button writing the field's own value, like Reset), "switch"
     * (run(): a StateSwitch with `ownStatus`, which says saving…, saved and its failure itself, so the row says none of
     * them), "toggle" (run(): an on/off switch beside the field with no status of its own: the row says its saving…,
     * ✓ and failure, and a failure of the field stays over its ✓) or "undo" (whose refusal is said here once, not
     * held).
     * A cancelled write leaves a failure alone, except the field's save: its drafts were reset.
     */
    const settle = (next, why = "", by = "save", kind = null) => {
        if (by === "switch") return;
        const fieldWrite = by === "save" || by === "button";
        if (next === "error" && fieldWrite) held = { why, kind, by };
        else if ((next === "success" && fieldWrite) || (next === null && by === "save")) held = null;
        let shown = { next, why, kind };
        if (next !== "loading" && held) shown = { ...held, next: "error" };
        clearTimeout(clearTimer);
        status.val = shown.next;
        reason.val = shown.why;
        refused.val = shown.kind === "undo";
        draftRefused = shown.kind === "draft";
        if (shown.next !== "success") endOffer();
        if (shown.next === "success" && successMs > 0)
            clearTimer = setTimeout(() => {
                if (status.val === "success" && !offer.val) status.val = null;
            }, successMs);
    };

    const saveOnce = async (drafts) => {
        let plan;
        try {
            plan = prepare(drafts);
        } catch (error) {
            settle("error", saveFailureReason(error), "save", "draft");
            return { ok: false, error };
        }
        if (!plan || plan.unchanged) {
            // Nothing to save takes back only the field's own failure: a button's (Clear) or a switch's still stands.
            if (status.val === "error" && held?.by === "save") settle(null);
            return { ok: false, cancelled: true };
        }
        return runNow(plan.write, "save");
    };

    const runNow = (task, by, savedFor = subject?.(), named = label) =>
        withAction({ label: named, kind: "row" }, async (action) => {
            const outcome = await track(task, by);
            // No Undo beside the field's failure: it would offer to put back another write.
            if (outcome.ok && !held && action.entries > 0 && subject?.() === savedFor) startOffer(action);
            return outcome;
        });

    // The row's saves, its buttons' writes and Undo share one save state, so they take turns: each starts once the
    // one before it has said how it went, and two writes never run side by side.
    // Unlike oneAtATime(), a write with nothing ahead of it starts at once, so a save reads the drafts and the
    // subject as they are when it's asked for.
    let tail = null;
    const inTurn = (task) => {
        const inGesture = captureGesture();
        const start = () => inGesture(task);
        const next = tail ? tail.then(start) : start();
        const done = Promise.resolve(next)
            .catch(() => {})
            .then(() => {
                if (tail === done) tail = null;
            });
        tail = done;
        return next;
    };

    /**
     * Run any write (a row's toggle button, say) with this save state, as one action Undo can put back. It waits for
     * the row's save, or another of its writes, that is running. A button that writes the field's own value (Reset,
     * Clear) leaves `by` as "button": its failure is said here, and its ✓ answers the field's. A StateSwitch passes
     * "switch" and gets the outcome back to say a failure itself; the row says only saving… and ✓ for it.
     */
    const run = (task, by = "button") => {
        const savedFor = subject?.();
        let named = label;
        // A write that waits its turn doesn't keep its click's action open meanwhile (the running save's writes would
        // then be logged apart, with no Undo); it opens its own when its turn comes, named after the same click.
        if (tail) {
            releaseAction();
            named = "";
        }
        lastSave = null; // a save asked for after this runs after it
        return inTurn(() => runNow(task, by, savedFor, named));
    };

    const track = async (task, by, failKind = null) => {
        settle("loading", "", by);
        try {
            const result = await task();
            if (result?.cancelled) {
                settle(null, "", by);
                return { ok: false, cancelled: true, result };
            }
            settle("success", "", by);
            return { ok: true, result };
        } catch (error) {
            settle("error", saveFailureReason(error), by, failKind);
            return { ok: false, error };
        }
    };

    // A save asked for while the newest thing queued is a save joins it (it saves once more when that one ends, so
    // the last value is the one saved); after a switch, a button or Undo, it waits its own turn behind them. Each
    // keeps the drafts and the click of its own last commit, so a commit made after a switch never saves before
    // that switch, and its save is named and logged after its own click.
    const save = () => {
        const commit = { drafts: capture?.(), inGesture: captureGesture(), after: commits };
        if (lastSave) {
            lastSave.again = true;
            lastSave.commit = commit;
            return lastSave.turn;
        }
        const loop = { again: false, commit };
        saveLoops++;
        loop.turn = inTurn(async () => {
            let outcome = { ok: false, cancelled: true };
            do {
                loop.again = false;
                const { drafts, inGesture, after } = loop.commit;
                if (after === commits) outcome = await inGesture(() => saveOnce(drafts));
            } while (loop.again);
            return outcome;
        }).finally(() => {
            saveLoops--;
            if (lastSave === loop) lastSave = null;
        });
        lastSave = loop;
        return loop.turn;
    };

    /** Put back what the offered save changed; a refusal says why where the ✓ was, and pulses. */
    const undo = async () => {
        const action = offer.val;
        if (!action) return;
        holds.pointer = holds.focus = false;
        endOffer();
        // It takes its turn too, so a switch flipped before it answers doesn't run beside it.
        lastSave = null;
        const outcome = await inTurn(() => track(() => undoAction(action.id), "undo", "undo"));
        if (!outcome.ok) return;
        washed.val = true;
        setTimeout(() => (washed.val = false), WASH_MS);
    };

    /** Pointer or focus on Undo keeps it (`by` is "pointer" or "focus"); once both left, a few more seconds. */
    const hold = (by, on) => {
        holds[by] = on;
        clearTimeout(offerTimer);
        if (!holds.pointer && !holds.focus && offer.val) offerTimer = setTimeout(endOffer, UNDO_MS / 2);
    };

    // Escape: the draft is put back, so its failure goes, even while another write says saving…, and a commit
    // still waiting doesn't save it after all.
    const cancel = () => {
        if (typeof revert === "function") revert();
        commits++;
        held = null;
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
            if (next && isRowField(next) && e.currentTarget.contains(next)) {
                if (saveLoops > 0 || status.val === "loading") return;
                try {
                    prepare();
                    if (draftRefused) settle(null);
                } catch (error) {
                    settle("error", saveFailureReason(error), "save", "draft");
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
        isBusy: () => saveLoops > 0,
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
export const SaveState = ({ status, reason, undo = null, className = "" }) => {
    // Words that say why (a failure's reason, or a slow save's notice) are clamped beside the field; the title has all.
    const said = () => status.val === "error" || (status.val === "loading" && Boolean(reason.val));
    return span(
        {
            class: () =>
                [
                    "save-state",
                    status.val ? `save-state--${status.val}` : "",
                    said() ? "save-state--said" : "",
                    undo?.refused.val && status.val === "error" ? "save-state--refused" : "",
                    className,
                ]
                    .join(" ")
                    .trim(),
        },
        // The words are the live status; Undo sits beside them so its name isn't read out as one.
        span({ class: "save-state__label", role: "status", title: () => (said() ? reason.val : "") }, () =>
            said() ? reason.val : (LABEL[status.val] ?? "")
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
};
