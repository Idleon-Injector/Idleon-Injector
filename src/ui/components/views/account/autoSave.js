import van from "../../../vendor/van-1.6.0.js";
import { Icons } from "../../../assets/icons.js";

const { span } = van.tags;

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
 */
export const useAutoSave = ({ prepare, revert = null, successMs = 2400 }) => {
    const status = van.state(null);
    const reason = van.state("");
    let running = null;
    let again = false;
    let clearTimer = null;

    const settle = (next, why = "") => {
        clearTimeout(clearTimer);
        status.val = next;
        reason.val = why;
        if (next === "success" && successMs > 0)
            clearTimer = setTimeout(() => {
                if (status.val === "success") status.val = null;
            }, successMs);
    };

    const saveOnce = async () => {
        let plan;
        try {
            plan = prepare();
        } catch (error) {
            settle("error", saveFailureReason(error));
            return { ok: false, error };
        }
        if (!plan || plan.unchanged) {
            if (status.val === "error") settle(null);
            return { ok: false, cancelled: true };
        }
        return run(plan.write);
    };

    /** Run any write (a row's toggle button, say) with this save state. */
    const run = async (task) => {
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

    const cancel = () => {
        if (typeof revert === "function") revert();
        if (status.val === "error") settle(null);
    };

    /** Put these on the element around the row's fields. */
    const handlers = {
        onkeydown: (e) => {
            if (!isEditField(e.target)) return;
            if (e.key === "Enter") {
                e.preventDefault();
                void save();
            } else if (e.key === "Escape") {
                cancel();
            }
        },
        // −/+ beside a field save at once (their own click handler has changed the draft by now).
        onclick: (e) => {
            if (typeof e.target?.closest === "function" && e.target.closest(".number-input-btn")) void save();
        },
        // Moving between the row's own fields keeps editing; anything else saves.
        onfocusout: (e) => {
            const next = e.relatedTarget;
            if (next && isEditField(next) && e.currentTarget.contains(next)) return;
            void save();
        },
    };

    return { status, reason, save, run, cancel, handlers, isBusy: () => running !== null };
};

const LABEL = { loading: "saving…", success: "saved" };

/** Class for the element around the fields: its badge steps aside for the words, its fields show a failure. */
export const saveStateClass = (status) =>
    status === "loading" ? "is-saving" : status === "error" ? "is-save-failed" : "";

/**
 * The save state beside a field: "saving…", a ✓ once the game reads the value back, or why it failed.
 * Its mark keeps a fixed slot; the words lie over the space to its left, so nothing around it moves.
 */
export const SaveState = ({ status, reason, className = "" }) =>
    span(
        {
            class: () => ["save-state", status.val ? `save-state--${status.val}` : "", className].join(" ").trim(),
            role: "status",
        },
        span({ class: "save-state__label", title: () => (status.val === "error" ? reason.val : "") }, () =>
            status.val === "error" ? reason.val : (LABEL[status.val] ?? "")
        ),
        span({ class: "save-state__mark", "aria-hidden": "true" }, () =>
            status.val === "success"
                ? Icons.Check({ class: "save-state__icon" })
                : status.val === "error"
                  ? Icons.Warning({ class: "save-state__icon" })
                  : span()
        )
    );
