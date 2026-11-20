import van from "../../../../vendor/van-1.6.0.js";
import { Icons } from "../../../../assets/icons.js";
import { withTooltip } from "../../../Tooltip.js";
import { resolveValue, toNodes } from "../accountShared.js";

const { div, button } = van.tags;

/**
 * Shared quiet refresh button for account tabs.
 */
export const RefreshButton = ({ onRefresh, tooltip = null, label = "Refresh", disabled = false } = {}) => {
    const refreshButton = button(
        {
            type: "button",
            class: "btn-quiet btn-sm",
            onclick: onRefresh,
            disabled: () => Boolean(resolveValue(disabled)),
        },
        label
    );

    return tooltip ? withTooltip(refreshButton, tooltip) : refreshButton;
};

/**
 * Shared notice banner shell for top-of-page notices.
 */
export const NoticeBanner = ({ icon = null, variant = null } = {}, ...content) =>
    div(
        {
            class: ["warning-banner", variant ? `warning-banner--${variant}` : ""].filter(Boolean).join(" "),
        },
        icon ? div({ class: "warning-banner__icon" }, icon) : null,
        div({ class: "warning-banner__content" }, ...content.flatMap((item) => toNodes(item)))
    );

/**
 * Shared warning banner shell for top-of-page notices.
 */
export const WarningBanner = (...content) => NoticeBanner({ icon: Icons.Warning() }, ...content);
