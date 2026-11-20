import van from "../../../../vendor/van-1.6.0.js";
import { withTooltip } from "../../../Tooltip.js";
import { joinClasses, resolveValue } from "../accountShared.js";
import { labelOf, withAction } from "../../../../services/changeLog.js";
import { announce } from "../../../inPlace.js";

const { button } = van.tags;

// A press's result for screen readers, once its status settles: the button itself only changes colour (#77).
const sayResult = async (name, pending, status) => {
    try {
        await pending;
    } catch {
        // The status says it failed.
    }
    for (let i = 0; i < 600 && resolveValue(status) === "loading"; i++) await new Promise((r) => setTimeout(r, 100));
    const now = resolveValue(status);
    if (now === "success") announce(`${name}: done`);
    else if (now === "error") announce(`${name}: failed`);
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

/**
 * Shared action button for account feature tabs.
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
}) => {
    const buttonNode = button(
        {
            ...buttonProps,
            type,
            onmousedown: preventMouseDown ? (e) => e.preventDefault() : null,
            class: () => {
                const resolvedStatus = resolveValue(status);
                const kind = resolveValue(variant);
                return joinClasses(
                    VARIANT_CLASS[kind] ?? kind,
                    resolveValue(className),
                    resolvedStatus === "loading" ? "account-btn--loading" : "",
                    resolvedStatus === "success" ? "account-btn--success" : "",
                    resolvedStatus === "error" ? "account-btn--error" : ""
                );
            },
            disabled: () => {
                return Boolean(resolveValue(disabled)) || resolveValue(status) === "loading";
            },
            "aria-busy": () => String(resolveValue(status) === "loading"),
            // One press is one action: everything it saves, now or after its awaits, undoes together.
            onclick: onClick
                ? (e) => {
                      const name = String(resolveValue(label)).trim();
                      const result = withAction({ label: labelOf(buttonNode), anchor: buttonNode }, () => onClick(e));
                      if (status) void sayResult(name, result, status);
                      return result;
                  }
                : null,
        },
        () => resolveValue(label)
    );

    return tooltip ? withTooltip(buttonNode, tooltip) : buttonNode;
};
