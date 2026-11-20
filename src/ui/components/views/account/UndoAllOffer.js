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

let shown = null; // { node, timer }

const isPainted = (color) => color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color);

/** The first painted background at or behind an element, so the offer lies on the surface it covers. */
const surfaceOf = (element) => {
    for (let at = element; at; at = at.parentElement) {
        const color = getComputedStyle(at).backgroundColor;
        if (isPainted(color)) return color;
    }
    return "";
};

/**
 * Out of the layout (absolutely placed), after the control in tab order. With a neighbour on the control's left on
 * the same line (a SET ALL value, another bulk button, a badge), it takes that neighbour's box whole, so nothing
 * shows half; with none, it takes the space to the control's left, or its right when there is no room.
 */
const middle = (element) => element.offsetTop + element.offsetHeight / 2;
const onLineWith = (anchor, element) =>
    element &&
    element.offsetParent === anchor.offsetParent &&
    Math.abs(middle(element) - middle(anchor)) < 8 &&
    !element.classList.contains("undo-all");

/**
 * Out of the layout (absolutely placed), after the control in tab order. It takes, in this order: the box of the
 * control's left neighbour on the same line (a SET ALL value, another bulk button), whole, so nothing shows half;
 * free space on the left; the right neighbour's box; free space on the right. Returns whether it covers a box.
 */
const place = (node, anchor) => {
    const natural = node.offsetWidth;
    const container = node.offsetParent.clientWidth;
    const right = anchor.offsetLeft - GAP;
    const cover = (box, left, width) => {
        node.style.setProperty("--undo-all-bg", surfaceOf(box.tagName === "BUTTON" ? anchor.parentElement : box));
        node.style.height = `${box.offsetHeight}px`;
        node.style.left = `${left}px`;
        node.style.width = `${width}px`;
        return true;
    };
    node.style.top = `${middle(anchor)}px`;
    const before = anchor.previousElementSibling;
    if (onLineWith(anchor, before)) {
        const width = Math.min(Math.max(natural, right - before.offsetLeft), right);
        if (width >= natural * 0.8) return cover(before, right - width, width);
    }
    if (right >= natural) {
        node.style.setProperty("--undo-all-bg", "transparent");
        node.style.left = `${right - natural}px`;
        node.style.width = `${natural}px`;
        return false;
    }
    let after = anchor.nextElementSibling;
    if (after === node) after = node.nextElementSibling;
    if (onLineWith(anchor, after)) {
        const width = Math.min(Math.max(natural, after.offsetWidth), container - after.offsetLeft);
        return cover(after, after.offsetLeft, width);
    }
    node.style.setProperty("--undo-all-bg", "transparent");
    node.style.left = `${Math.max(0, Math.min(anchor.offsetLeft + anchor.offsetWidth + GAP, container - natural))}px`;
    return false;
};

const offer = (action, anchor) => {
    const state = van.state("offer"); // "offer" | "loading" | "done" | "refused"
    const reason = van.state("");
    const count = action.entries;
    const over = van.state(false);
    let held = false;
    const self = { node: null, timer: null };

    const hide = () => {
        clearTimeout(self.timer);
        self.node.remove();
        if (shown === self) shown = null;
    };
    const hideIn = (ms) => {
        clearTimeout(self.timer);
        self.timer = setTimeout(hide, ms);
    };
    const hold = (on) => {
        held = on;
        if (on) clearTimeout(self.timer);
        else if (state.val === "offer" || state.val === "refused") hideIn(UNDO_MS / 2);
    };
    const undo = async () => {
        if (state.val !== "offer") return;
        state.val = "loading";
        clearTimeout(self.timer);
        try {
            await undoAction(action.id);
            state.val = "done";
            reloadAfterUndo(action);
            hideIn(DONE_MS);
        } catch (error) {
            reason.val = error?.message || "not undone";
            state.val = "refused";
            if (!held) hideIn(UNDO_MS);
        }
    };

    self.node = span(
        {
            class: () => `undo-all undo-all--${state.val} ${over.val ? "undo-all--over" : ""}`,
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
                title: `Put back the ${count === 1 ? "value" : `${count} values`} this changed`,
                onclick: () => void undo(),
            },
            Icons.Undo({ class: "undo-all__icon" }),
            span({ class: "undo-all__offer" }, count === 1 ? "Undo" : "Undo all"),
            span({ class: "undo-all__saving" }, "saving…")
        ),
        span(
            { class: "undo-all__status", role: "status", title: () => (state.val === "refused" ? reason.val : "") },
            () => (state.val === "refused" ? reason.val : state.val === "done" ? "undone" : "")
        ),
        span({ class: "undo-all__mark", "aria-hidden": "true" }, () =>
            state.val === "done"
                ? Icons.Check({ class: "undo-all__icon" })
                : state.val === "refused"
                  ? Icons.Warning({ class: "undo-all__icon" })
                  : span()
        )
    );
    // In the page before VanJS next draws, so it keeps its bindings (VanJS drops those of detached nodes).
    anchor.after(self.node);
    over.val = place(self.node, anchor);
    hideIn(UNDO_MS);
    return self;
};

van.derive(() => {
    const action = lastBulkAction.val?.action;
    const anchor = action?.anchor;
    if (!anchor || !anchor.isConnected || !anchor.parentElement) return;
    // An action made by a click or key logs as its writes land: the newest count replaces the offer.
    if (shown) {
        clearTimeout(shown.timer);
        shown.node.remove();
    }
    shown = offer(action, anchor);
});
