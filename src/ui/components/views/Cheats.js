/**
 * The Cheats area: every cheat that isn't on a system's own page, in the page's own pieces. Its groups are the tabs
 * of one list (`TabbedList`), each row the one a page's cheats panel has (`CheatRow`): the cheat's short name with its
 * command small under it, then its value field and its switch or Run, and its settings in the row it opens. The top
 * bar searches this page like any other ("This page | Everywhere"). Dangerous comes last, says what it can do, and its
 * commands ask "Click again" before they run.
 *
 * It stands in the same frame as Home: the list is the page column, and the player's quick runs (Favorites, Recent)
 * are the column on the right, built like My cheats; where the window has no room for it, it folds under the title.
 */

import van from "../../vendor/van-1.6.0.js";
import vanX from "../../vendor/van-x-0.6.3.js";
import store from "../../state/store.js";
import { CATEGORY_ORDER, VIEWS } from "../../state/constants.js";
import { fetchConfig } from "../../services/api.js";
import { Loader } from "../Loader.js";
import { EmptyState } from "../EmptyState.js";
import { Icons } from "../../assets/icons.js";
import { CheatRow } from "../SystemCheats.js";
import { TabbedList } from "./account/tabShared.js";
import { WarningBanner } from "./account/components/AccountPageChrome.js";
import { balanceFrame, framed } from "./Pages.js";
import { revealFound } from "../../utils/index.js";
import { isPageCheat } from "../../menu/pageCheats.js";
import { cheatName } from "../../menu/cheatNames.js";
import { VALUE_COMMANDS, valueCommandOf } from "../../menu/valueCommands.js";
import { Said, plainReason, useSaid } from "../inPlace.js";

const { aside, button, div, h3, p, span } = van.tags;

/**
 * The area's rows by group, in the groups' order: [group, rows][]. A system's own cheats are on its page. Each value of
 * a command that takes one from a list ("spawn rift2") is one row for the command, which suggests its values (#23).
 */
export const cheatGroups = (cheats) => {
    const groups = new Map();
    const shown = new Set();
    for (const cheat of cheats) {
        if (isPageCheat(cheat.value)) continue;
        const group = cheat.category || "general";
        const command = valueCommandOf(cheat.value) || cheat.value;
        if (shown.has(command)) continue;
        shown.add(command);
        const valueCommand = command !== cheat.value;
        const { label, hint } = valueCommand ? { label: VALUE_COMMANDS[command].label } : cheatName(cheat);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push({
            cheat: command,
            label,
            ...(cheat.needsParam && !valueCommand && { hint: hint ?? "value" }),
            ...(cheat.dangerous && { dangerous: true }),
        });
    }
    const rank = (group) => (CATEGORY_ORDER.includes(group) ? CATEGORY_ORDER.indexOf(group) : CATEGORY_ORDER.length);
    return [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
};

/**
 * The star at a row's end: keeps what the row would run now (with its value) under Favorites. Shown when touched.
 * `typed` changes as the row's value is typed, which decides the favorite the star is about.
 */
const Star =
    (typed) =>
    ({ command, refuse }) => {
        const action = () => (typed.val, command().action);
        return button(
            {
                type: "button",
                class: () => `cheats-star${action() && store.isFavorite(action()) ? " is-favorite" : ""}`,
                "aria-label": () => `Favorite ${action() ?? "this cheat"}`,
                "aria-pressed": () => String(Boolean(action() && store.isFavorite(action()))),
                onclick: () => {
                    const asked = command();
                    if (!asked.action) return refuse(asked);
                    store.toggleFavorite(asked.action);
                },
            },
            Icons.Star()
        );
    };

/**
 * Favorites and Recent beside the list, built like My cheats: a row is the command, and pressing it runs it again;
 * a favorite shows one faint "remove" while pointed at. What a run did is said under the list.
 */
const QuickAccess = (side) => {
    const { said, say } = useSaid();
    const open = van.state(false);
    const run = async (action) => {
        const result = await store.executeCheat(action);
        say(result.ok ? "done" : "failed", `${action}: ${result.ok ? result.message : plainReason(result.message)}`);
    };
    const Row = (action, favorite) =>
        div(
            { class: "my-cheat", "data-quick": action },
            button({ type: "button", class: "my-cheat__name", onclick: () => run(action) }, action),
            favorite
                ? button(
                      {
                          type: "button",
                          class: "my-cheat__move",
                          "aria-label": `${action}: remove from favorites`,
                          onclick: () => store.toggleFavorite(action),
                      },
                      "remove"
                  )
                : null
        );
    const favorites = () => [...store.data.favoriteCheats];
    const recent = () => [...store.data.recentCheats].slice(0, 5);
    const section = (title, list, favorite) =>
        div(
            { class: "my-cheats__section", hidden: () => !list().length },
            div({ class: "my-cheats__sub" }, title),
            () => div({ class: "my-cheats__list" }, ...list().map((action) => Row(action, favorite)))
        );
    const body = div(
        {
            id: "cheats-quick-rows",
            class: "tabbed-list__body system-cheats__rows my-cheats__body",
            hidden: () => !side.val && !open.val,
        },
        section("Favorites", favorites, true),
        section("Recent", recent, false),
        div(
            { class: "my-cheats__empty", hidden: () => favorites().length + recent().length > 0 },
            "Star a cheat to keep it here."
        ),
        Said({ said, className: "said--line" })
    );
    const title = () => span({ class: "account-section__title" }, "Quick access");
    const panel = aside(
        {
            class: () => `system-cheats my-cheats cheats-quick ${side.val ? "is-side" : "is-folded"}${open.val ? " is-open" : ""}`,
            "aria-label": "Quick access",
            onkeydown: (e) => {
                if (e.key !== "Escape" || side.val || !open.val) return;
                open.val = false;
                panel.querySelector(".system-cheats__toggle")?.focus();
            },
        },
        div(
            { class: "account-section tabbed-list no-tabs" },
            () =>
                side.val
                    ? div({ class: "account-section__header" }, title())
                    : button(
                          {
                              type: "button",
                              class: "account-section__header system-cheats__toggle row-opener",
                              "aria-expanded": () => String(open.val),
                              "aria-controls": "cheats-quick-rows",
                              onclick: () => (open.val = !open.val),
                          },
                          title()
                      ),
            body
        )
    );
    return panel;
};

export const Cheats = () => {
    // The config holds the cheats' settings: read now, and again each time the area is shown (Settings may have
    // changed it). Each save reads its own back.
    const config = van.state(null);
    van.derive(() => {
        if (store.app.activeTab === VIEWS.CHEATS.id) fetchConfig().then((file) => (config.val = file), () => {});
    });
    const openId = van.state(null);
    const activeId = van.state(CATEGORY_ORDER[0]);

    // Built again only when the list of cheats itself changes, so rows keep their state as cheats turn on and off.
    const shape = van.derive(() => {
        if (store.data.cheats.length) return store.data.cheats.map((cheat) => cheat.value).join("\n");
        return store.app.cheatsError ? "failed" : "loading";
    });
    const Pane = (group, rows) =>
        div(
            { class: "system-cheats cheats-rows" },
            group === "Dangerous" ? WarningBanner("These can wipe parts of your save. Back up first.") : null,
            ...rows.map((cheat) => {
                const typed = van.state(0);
                const row = CheatRow(cheat, { openId, config, extra: Star(typed) });
                row.addEventListener("input", () => typed.val++);
                return row;
            })
        );
    const list = div({ class: "cheats-list" }, () => {
        if (shape.val === "loading") return div({ class: "account-loader" }, Loader({ text: "Loading cheats" }));
        if (shape.val === "failed")
            return EmptyState({ failed: true, title: "Couldn't load the cheats", subtitle: store.app.cheatsError });
        const groups = cheatGroups(vanX.raw(store.data).cheats);
        if (!groups.some(([group]) => group === activeId.rawVal)) activeId.val = groups[0][0];
        return TabbedList({
            name: "Cheats",
            wrap: true,
            activeId,
            tabs: groups.map(([group, rows]) => ({
                id: group,
                label: group === "Dangerous" ? span({ class: "cheats-danger-word" }, group) : group,
                content: Pane(group, rows),
            })),
        });
    });

    // The menu search sent the player to a cheat: open its group and show its row (with a value the search found
    // in its field). It only shows the row; the player runs the cheat from it.
    let shownFocus = 0;
    van.derive(() => {
        const { cheat: value, setting, focus, fill, n } = store.app.cheatFocus;
        const cheats = store.data.cheats;
        if (!n || n === shownFocus || !cheats.length || isPageCheat(value)) return;
        shownFocus = n;
        // A value command's row has no entry of its own in the list: its values carry its group.
        const found = cheats.find((cheat) => cheat.value === value) ?? cheats.find((c) => valueCommandOf(c.value) === value);
        activeId.val = found?.category || "general";
        revealFound(() => {
            const row = list.querySelector(`[data-cheat="${CSS.escape(value)}"]`);
            const choice = fill && row?.querySelector(".value-fields__choice");
            if (choice) {
                choice.value = fill;
                choice.dispatchEvent(new Event("input"));
                return choice;
            }
            return row;
        }, focus && !setting);
        if (setting) revealFound(() => document.querySelector(`[data-config-key="${CSS.escape(setting)}"]`), focus);
    });

    const toggleConfig = () => {
        store.clearForcedConfigPath();
        if (store.app.configDrawerOpen) store.closeConfigDrawer();
        else store.openConfigDrawer();
    };

    const root = div(
        { id: "cheats-tab", class: "tab-pane", "data-page": "cheats" },
        div(
            { class: () => `cheats-view ${framed.val ? "is-framed" : ""}` },
            div(
                { class: "account-page-top cheats-page-top" },
                div(
                    { class: "account-header account-tab-header" },
                    div(
                        { class: "account-tab-header__main" },
                        h3({ class: "account-tab-header__title" }, "Cheats"),
                        p(
                            { class: "account-tab-header__desc" },
                            "Cheats not on a page, by kind. On until the injector restarts."
                        )
                    ),
                    div(
                        { class: "account-header__actions account-tab-header__actions" },
                        button(
                            {
                                type: "button",
                                class: () =>
                                    `btn-quiet btn-sm config-drawer-toggle ${store.app.configDrawerOpen ? "active" : ""}`,
                                "aria-pressed": () => String(Boolean(store.app.configDrawerOpen)),
                                onclick: toggleConfig,
                            },
                            "Config"
                        )
                    )
                )
            ),
            div({ class: "cheats-frame" }, list, QuickAccess(framed))
        )
    );
    balanceFrame(root);
    return root;
};
