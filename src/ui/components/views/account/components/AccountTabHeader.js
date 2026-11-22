import van from "../../../../vendor/van-1.6.0.js";
import { Icons } from "../../../../assets/icons.js";
import { toNodes } from "../accountShared.js";

const { div, h3, p, span } = van.tags;

/**
 * Shared header shell for account tabs. `total` (an `AmountLeft`) sits beside the title. A system with a drawing
 * (the sidebar's) shows it before the title, so the page and its entry in the list read as one place.
 */
export const AccountTabHeader = ({ title, description = null, actions = null, wrapActions = true, total = null }) =>
    div(
        { class: "account-header account-tab-header" },
        (() => {
            const icon = typeof title === "string" ? Icons.System({ name: title }) : null;
            return icon ? span({ class: "account-tab-header__icon", "aria-hidden": "true" }, icon) : null;
        })(),
        div(
            { class: "account-tab-header__main" },
            total
                ? div({ class: "account-tab-header__line" }, h3({ class: "account-tab-header__title" }, title), total)
                : h3({ class: "account-tab-header__title" }, title),
            description ? p({ class: "account-tab-header__desc" }, description) : null
        ),
        actions
            ? wrapActions
                ? div({ class: "account-header__actions account-tab-header__actions" }, ...toNodes(actions))
                : actions
            : null
    );
