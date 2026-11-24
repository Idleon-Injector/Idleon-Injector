import van from "../../../../vendor/van-1.6.0.js";
import { Icons } from "../../../../assets/icons.js";
import { toNodes } from "../accountShared.js";
import { buildingSystem } from "../../../../menu/menuModel.js";

const { button, div, h3, p, span } = van.tags;

/**
 * The quiet way from a system's page to its page in the Automation section (#249), beside the title. One way only:
 * an automation page never links back. `tab` opens it on that tab (the clicker or the kitchens a page is about).
 */
export const AutomationLink = ({ page, tab = null }) =>
    button(
        {
            type: "button",
            class: "btn-quiet btn-sm automation-link",
            // The menu's store on the press: pages also load in Node tests, where the store can't.
            onclick: async () => {
                (await import("../../../../state/store.js")).default.openMenu({ world: "automation", page, tab });
                // This page hides, and focus with it: it goes on to the open page's entry in the sidebar's list, or in
                // the icon rail to the line above the page that opens that list.
                setTimeout(() => {
                    const entry = document.querySelector(".menu-panel:not(.is-leaving) .drill-item.active");
                    (entry?.offsetParent ? entry : document.querySelector(".syslist-toggle"))?.focus();
                }, 50);
            },
        },
        "Automation",
        Icons.Arrow({ class: "automation-link__arrow" })
    );

/**
 * Shared header shell for account tabs. `total` (an `AmountLeft`) sits beside the title, then `automation` (the
 * AutomationLink's { page, tab }) on a page whose automation moved to the Automation section. A system with a drawing
 * (the sidebar's) shows it before the title, so the page and its entry in the list read as one place.
 */
export const AccountTabHeader = ({
    title,
    description = null,
    actions = null,
    wrapActions = true,
    total = null,
    automation = null,
}) =>
    div(
        { class: "account-header account-tab-header" },
        (() => {
            // A menu page shows its system's drawing; a view outside the menu (Save copies) goes by its title.
            const name = buildingSystem ?? (typeof title === "string" ? title : null);
            const icon = name ? Icons.System({ name }) : null;
            return icon ? span({ class: "account-tab-header__icon", "aria-hidden": "true" }, icon) : null;
        })(),
        div(
            { class: "account-tab-header__main" },
            total || automation
                ? div(
                      { class: "account-tab-header__line" },
                      h3({ class: "account-tab-header__title" }, title),
                      total,
                      automation ? AutomationLink(automation) : null
                  )
                : h3({ class: "account-tab-header__title" }, title),
            description ? p({ class: "account-tab-header__desc" }, description) : null
        ),
        actions
            ? wrapActions
                ? div({ class: "account-header__actions account-tab-header__actions" }, ...toNodes(actions))
                : actions
            : null
    );
