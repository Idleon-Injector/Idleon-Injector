import van from "../../../../vendor/van-1.6.0.js";
import { joinClasses, resolveValue, toNodes } from "../accountShared.js";

const { div, span } = van.tags;

/**
 * Shared non-numeric row shell for account feature tabs.
 */
export const AccountRow = ({
    info,
    badge = null,
    controls = null,
    rowClass = "",
    badgeClass = "",
    controlsClass = "",
    status = null,
    rowProps = {},
}) =>
    div(
        {
            ...rowProps,
            class: () => {
                const resolvedStatus = resolveValue(status);
                return joinClasses(
                    "account-row",
                    typeof rowClass === "function" ? rowClass() : rowClass,
                    resolvedStatus === "success" ? "account-row--success" : "",
                    resolvedStatus === "error" ? "account-row--error" : ""
                );
            },
        },
        div({ class: "account-row__info" }, ...toNodes(info)),
        badge !== null
            ? span(
                  {
                      class: () =>
                          joinClasses(
                              "account-row__badge",
                              typeof badgeClass === "function" ? badgeClass() : badgeClass
                          ),
                  },
                  ...toNodes(badge)
              )
            : null,
        controls !== null
            ? div(
                  {
                      class: () =>
                          joinClasses(
                              "account-row__controls",
                              typeof controlsClass === "function" ? controlsClass() : controlsClass
                          ),
                  },
                  ...toNodes(controls)
              )
            : null
    );

/**
 * A row's label when the thing has a bonus: what it does first, the line a player scans for ("Base HP"), then its name,
 * small and muted ("Heart Stamp"). The name keeps the row's name class, so it still names the row for its controls.
 */
export const RowTitles = ({ bonus, name, warning }) =>
    span(
        { class: "account-row__titles" },
        bonus ? span({ class: "account-row__bonus" }, bonus) : null,
        span({ class: "account-row__name" }, name),
        // A warning shows only while its trouble is real: `warning` returns the text, or nothing.
        warning ? span({ class: "account-row__warning", hidden: () => !warning() }, () => warning() ?? "") : null
    );
