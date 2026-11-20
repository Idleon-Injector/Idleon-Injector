/**
 * "↶ Undo all" beside the control that made a bulk change (MAX ALL, RESET ALL, SET ALL, a page's own button):
 * one action, many values, one undo. It lies over the space beside that control, out of the layout, so nothing
 * moves; it stays for UNDO_MS (longer while the pointer or focus is on it), then goes. Undoing shows "saving…",
 * then confirms in place (an accent wash and ✓); a refusal says why there and pulses twice.
 */
import van from "../../../vendor/van-1.6.0.js";
import { Icons } from "../../../assets/icons.js";
import { lastBulkAction } from "../../../services/changeLog.js";
import { UNDO_MS } from "./autoSave.js";
import { reloadAfterUndo, undoAction } from "./undo.js";

const { span, button } = van.tags;

const GAP = 6;
const DONE_MS = 1600;

const state = van.state("offer"); // "offer" | "loading" | "done" | "refused"
const reason = van.state("");
const count = van.state(0);
let action = null;
let hideTimer = null;
let held = false;

const hide = () => {
    clearTimeout(hideTimer);
    node.remove();
    action = null;
    held = false;
};
const hideIn = (ms) => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, ms);
};
const hold = (on) => {
    held = on;
    if (on) clearTimeout(hideTimer);
    else if (state.val === "offer" || state.val === "refused") hideIn(UNDO_MS / 2);
};

const undo = async () => {
    if (!action || state.val !== "offer") return;
    const target = action;
    state.val = "loading";
    clearTimeout(hideTimer);
    try {
        await undoAction(target.id);
        state.val = "done";
        reloadAfterUndo(target);
        hideIn(DONE_MS);
    } catch (error) {
        reason.val = error?.message || "not undone";
        state.val = "refused";
        if (!held) hideIn(UNDO_MS);
    }
};

const node = span(
    {
        class: () => `undo-all undo-all--${state.val}`,
        onmouseenter: () => hold(true),
        onmouseleave: () => hold(false),
        onfocusin: () => hold(true),
        onfocusout: () => hold(false),
    },
    button(
        {
            type: "button",
            class: "undo-all__button",
            hidden: () => state.val === "refused" || state.val === "done",
            title: () => `Put back the ${count.val === 1 ? "value" : `${count.val} values`} this changed`,
            onclick: () => void undo(),
        },
        Icons.Undo({ class: "undo-all__icon" }),
        span({ class: "undo-all__offer" }, () => (count.val === 1 ? "Undo" : "Undo all")),
        span({ class: "undo-all__saving" }, "saving…")
    ),
    span({ class: "undo-all__status", role: "status" }, () =>
        state.val === "refused" ? reason.val : state.val === "done" ? "undone" : ""
    ),
    span({ class: "undo-all__mark", "aria-hidden": "true" }, () =>
        state.val === "done"
            ? Icons.Check({ class: "undo-all__icon" })
            : state.val === "refused"
              ? Icons.Warning({ class: "undo-all__icon" })
              : span()
    )
);

/** The first painted background behind the control, so the offer covers what it lies over with the same surface. */
const surfaceOf = (element) => {
    for (let at = element.parentElement; at; at = at.parentElement) {
        const color = getComputedStyle(at).backgroundColor;
        if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
    }
    return "";
};

// Out of the layout (absolutely placed), after the control in tab order. It lies over the control's left neighbour on
// the same line (a SET ALL value, a badge), covering it whole so nothing shows half; with none, it takes the space to
// the control's left, or its right when there is no room.
const place = (anchor) => {
    node.style.setProperty("--undo-all-bg", surfaceOf(anchor));
    node.style.top = `${anchor.offsetTop + anchor.offsetHeight / 2}px`;
    node.style.minWidth = "";
    node.style.height = "";
    const before = anchor.previousElementSibling;
    const sameLine =
        before &&
        before.offsetParent === anchor.offsetParent &&
        Math.abs(before.offsetTop + before.offsetHeight / 2 - (anchor.offsetTop + anchor.offsetHeight / 2)) < 8;
    const right = anchor.offsetLeft - GAP;
    const width = Math.max(node.offsetWidth, sameLine ? right - before.offsetLeft : 0);
    if (right - width >= 0) {
        node.style.minWidth = `${width}px`;
        if (sameLine) node.style.height = `${Math.max(node.offsetHeight, before.offsetHeight + 2)}px`;
        node.style.left = `${right - width}px`;
    } else node.style.left = `${anchor.offsetLeft + anchor.offsetWidth + GAP}px`;
};

van.derive(() => {
    const next = lastBulkAction.val?.action;
    if (!next) return;
    const anchor = next.anchor;
    if (!anchor || !anchor.isConnected || !anchor.parentElement) return;
    action = next;
    count.val = next.entries;
    reason.val = "";
    state.val = "offer";
    anchor.after(node);
    place(anchor);
    if (!held) hideIn(UNDO_MS);
});
