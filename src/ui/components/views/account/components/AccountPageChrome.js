import van from "../../../../vendor/van-1.6.0.js";
import { Icons } from "../../../../assets/icons.js";
import { resolveValue, toNodes } from "../accountShared.js";

const { div, button, span } = van.tags;

/**
 * A read-only amount still to spend, as plain words: "12 points left". It sits beside a page's title (the header's
 * `total`) or in a section heading's `meta`. `value` is a function returning the number; it updates with it. Below
 * zero (more spent than owned) it reads "−3 points left", with a real minus sign, in the failed red.
 */
export const AmountLeft = ({ value, one = "point", many = "points" }) => {
    const amount = () => Number(value() ?? 0);
    return span(
        { class: () => (amount() < 0 ? "amount-left amount-left--over" : "amount-left"), "aria-live": "polite" },
        span({ class: "amount-left__value" }, () =>
            amount() < 0 ? `−${Math.abs(amount()).toLocaleString()}` : amount().toLocaleString()
        ),
        () => ` ${Math.abs(amount()) === 1 ? one : many} left`
    );
};

/**
 * Shared quiet refresh button for account tabs.
 */
export const RefreshButton = ({ onRefresh, label = "Refresh", disabled = false } = {}) =>
    button(
        {
            type: "button",
            class: "btn-quiet btn-sm",
            onclick: onRefresh,
            disabled: () => Boolean(resolveValue(disabled)),
        },
        label
    );

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
