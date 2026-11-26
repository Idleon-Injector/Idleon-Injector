/**
 * The Cheats area: every cheat that isn't on a system's own page, in the page's own pieces. Its groups are the tabs
 * of one list (`TabbedList`), each row the one a page's cheats panel has (`CheatRow`): the cheat's short name with its
 * command small under it, then its value field and its switch or Run, and its settings in the row it opens. The top
 * bar searches this page like any other ("This page | Everywhere"). Dangerous comes last, says what it can do, and its
 * commands ask "Click again" before they run.
 */

import van from "../../vendor/van-1.6.0.js";
import vanX from "../../vendor/van-x-0.6.3.js";
import store from "../../state/store.js";
import { CATEGORY_ORDER, VIEWS } from "../../state/constants.js";
import { fetchConfig } from "../../services/api.js";
import { Loader } from "../Loader.js";
import { EmptyState } from "../EmptyState.js";
import { CheatRow } from "../SystemCheats.js";
import { TabbedList } from "./account/tabShared.js";
import { AccountTabHeader } from "./account/components/AccountTabHeader.js";
import { balanceFrame } from "./Pages.js";
import { revealFound } from "../../utils/index.js";
import { isPageCheat } from "../../menu/pageCheats.js";
import { cheatName } from "../../menu/cheatNames.js";
import { VALUE_COMMANDS, valueCommandOf } from "../../menu/valueCommands.js";
import { disarm } from "../inPlace.js";

const { button, div, p, span } = van.tags;

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
            group === "Dangerous"
                ? p(
                      { class: "account-row__warning cheats-warning" },
                      "These can wipe parts of your save. Back up first."
                  )
                : null,
            ...rows.map((cheat) => CheatRow(cheat, { openId, config }))
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

    // Another tab or another place drops a "Click again" that waits here.
    van.derive(() => {
        activeId.val;
        store.app.activeTab;
        list.querySelectorAll("[data-again]").forEach(disarm);
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
            { class: "cheats-view" },
            div(
                { class: "account-page-top" },
                AccountTabHeader({
                    title: "Cheats",
                    description: "Cheats not on a page, by kind. On until the injector restarts.",
                    actions: button(
                        {
                            type: "button",
                            class: () =>
                                `btn-quiet btn-sm config-drawer-toggle ${store.app.configDrawerOpen ? "active" : ""}`,
                            "aria-pressed": () => String(Boolean(store.app.configDrawerOpen)),
                            onclick: toggleConfig,
                        },
                        "Config"
                    ),
                })
            ),
            list
        )
    );
    balanceFrame(root);
    return root;
};
