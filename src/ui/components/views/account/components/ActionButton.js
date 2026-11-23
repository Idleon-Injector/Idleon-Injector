import van from "../../../../vendor/van-1.6.0.js";
import { withTooltip } from "../../../Tooltip.js";
import { joinClasses, resolveValue } from "../accountShared.js";
import { labelOf, withAction } from "../../../../services/changeLog.js";
import { announce, clickAgain, disarm } from "../../../inPlace.js";

const { button } = van.tags;

// A press's result for screen readers: the button itself only changes colour (#77). It is the result this press
// reached: one that only asked "Click again" says nothing, though the status still holds an earlier press's done
// (`before`), and a failure is said even when the handler goes on re-reading the page after the status cleared.
// A save this press started counts though its result equals `before` (a quick retry that failed again): a
// useWriteStatus status counts its runs (`runs`, `runsBefore` at the press) and keeps how each ended and which press
// started it (`ended`), so a press says its own run's result, not another button's, even once the colour cleared.
// ponytail: a run belongs to the button pressed last when it starts; one whose handler read first, while another
// button sharing the status was pressed, goes to that one (pages have no async context to tell them apart).
const sayResult = async (name, pending, status, before, runsBefore, pressed) => {
    let settled = false;
    const ended = Promise.resolve(pending).then(
        () => (settled = true),
        () => (settled = true)
    );
    let started = false;
    // A failure says why when the run knows (the same words the tray shows).
    const say = (outcome, reason = null) =>
        announce(`${name}: ${outcome === "success" ? "done" : (reason ?? "failed")}`);
    for (let i = 0; i < 1200; i++) {
        const now = resolveValue(status);
        if (Array.isArray(status.ended)) {
            const own = status.ended.find((run) => run.id > (runsBefore ?? 0) && run.by === pressed);
            if (own) return own.outcome === "cancelled" ? undefined : say(own.outcome, own.reason);
        } else {
            if (now === "loading" || status.runs !== runsBefore) started = true;
            if ((now === "success" || now === "error") && (started || now !== before)) return say(now);
        }
        if (settled && now !== "loading") return undefined;
        // Said as soon as the handler ends, as before; a status still saving after that is looked at every 50 ms.
        const tick = new Promise((r) => setTimeout(r, 50));
        await (settled ? tick : Promise.race([ended, tick]));
    }
    return undefined;
};

// The three kinds (DESIGN.md): main is an area's one blue button; quiet is any other action, Max included; danger
// is anything that removes or lowers. A switch (an on/off toggle) keeps its own look until the layout pass.
const VARIANT_CLASS = {
    main: "account-btn btn-main btn-sm",
    quiet: "account-btn btn-quiet btn-sm",
    danger: "account-btn btn-danger btn-sm",
    switch: "account-btn account-btn--switch",
    "switch-filled": "account-btn account-btn--switch account-btn--apply",
};

// Buttons that share one status (a page's bulk actions) show it only on the one pressed last (`status.pressedBy`); the
// rest stay disabled while it runs.

/**
 * Shared action button for account feature tabs. `confirm` (a question, or a function that returns one or null) makes
 * the press ask in place first (#25): the first press reads "Click again" and only a second one runs `onClick`. Bulk
 * removals pass it; additions run on one press. `confirmTargets` (a value, or a function that returns one) is what the
 * change touches that the question doesn't name, such as the world picked: a change to it asks again.
 * `keepEnabled`: a row's button stays enabled while its save runs, so focus stays on it; a press meanwhile does nothing.
 */
export const ActionButton = ({
    label,
    status = null,
    variant = "quiet",
    className = "",
    disabled = false,
    tooltip = null,
    onClick,
    preventMouseDown = true,
    type = "button",
    buttonProps = {},
    confirm = null,
    confirmTargets = null,
    keepEnabled = false,
}) => {
    const shared = Object(status) === status;
    let buttonNode = null;
    const loading = () => resolveValue(status) === "loading";
    const off = () => Boolean(resolveValue(disabled)) || (!keepEnabled && loading());
    // A disabled button drops focus to the page (#247). So the button whose press is running, and one that holds
    // focus, is never disabled: it says so (`aria-disabled`), looks it (_buttons.css), and ignores presses until it
    // loses focus. A row's button (`keepEnabled`) isn't disabled by its own save at all.
    const focused = van.state(false);
    const held = () => focused.val || (shared && status.pressedBy === buttonNode && loading());
    const ownStatus = () => {
        const now = resolveValue(status);
        const by = shared ? status.pressedBy : undefined;
        return by && by !== buttonNode ? null : now;
    };
    buttonNode = button(
        {
            ...buttonProps,
            type,
            onmousedown: preventMouseDown ? (e) => e.preventDefault() : null,
            class: () => {
                const resolvedStatus = ownStatus();
                const kind = resolveValue(variant);
                return joinClasses(
                    VARIANT_CLASS[kind] ?? kind,
                    resolveValue(className),
                    resolvedStatus === "loading" ? "account-btn--loading" : "",
                    resolvedStatus === "success" ? "account-btn--success" : "",
                    resolvedStatus === "error" ? "account-btn--error" : ""
                );
            },
            disabled: () => off() && !held(),
            "aria-disabled": () => String(off()),
            "aria-busy": () => String(ownStatus() === "loading"),
            // One press is one action: everything it saves, now or after its awaits, undoes together.
            onclick: onClick
                ? (e) => {
                      if (off() || loading()) return undefined;
                      if (confirm) {
                          const question = typeof confirm === "function" ? confirm() : confirm;
                          // A question that went away (Set count raised after it asked) takes "Click again" with it.
                          if (!question) disarm(buttonNode);
                          else if (!clickAgain(buttonNode, question, { targets: resolveValue(confirmTargets) }))
                              return undefined;
                      }
                      if (shared) status.pressedBy = buttonNode;
                      const name = String(resolveValue(label)).trim();
                      const before = resolveValue(status);
                      const runsBefore = status?.runs;
                      const result = withAction({ label: labelOf(buttonNode), anchor: buttonNode }, () => onClick(e));
                      if (status) void sayResult(name, result, status, before, runsBefore, buttonNode);
                      return result;
                  }
                : null,
        },
        () => resolveValue(label)
    );

    buttonNode.addEventListener("focus", () => (focused.val = true));
    buttonNode.addEventListener("blur", () => (focused.val = false));

    return tooltip ? withTooltip(buttonNode, tooltip) : buttonNode;
};
