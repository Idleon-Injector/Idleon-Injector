/**
 * The menu's one search: systems, pages, worlds and areas, including their old injector names, then every cheat
 * and cheat setting. Picking a cheat shows its row on the Cheats page; it never runs it.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { Icons } from "../assets/icons.js";
import { menuSearchEntries } from "../menu/pageRegistry.js";
import { cheatSearchEntries, searchMenu } from "../menu/menuModel.js";
import { configDescriptions } from "../config/configDescriptions.js";

const { div, input, span, button, kbd } = van.tags;

export const MenuSearch = () => {
    const query = van.state("");
    const open = van.state(false);
    const highlight = van.state(0);
    // ponytail: the Cheats page's own list (loaded at start), so a cheat the game adds is found without a list here.
    const cheatEntries = van.derive(() => cheatSearchEntries(store.data.cheats, configDescriptions));
    const entries = van.derive(() => [...menuSearchEntries.val, ...cheatEntries.val]);
    const results = van.derive(() => searchMenu(entries.val, query.val));

    const close = () => {
        open.val = false;
        highlight.val = 0;
    };
    const go = (result, byKeyboard = false) => {
        store.openMenu({ ...result.target, focus: byKeyboard });
        query.val = "";
        close();
        field.blur();
    };

    const field = input({
        type: "text",
        class: "menu-search-input",
        placeholder: "SEARCH PAGES AND CHEATS",
        autocomplete: "off",
        spellcheck: "false",
        role: "combobox",
        "aria-label": "Search the menu",
        "aria-autocomplete": "list",
        "aria-controls": "menu-search-results",
        "aria-expanded": () => String(open.val && query.val.trim() !== ""),
        "aria-activedescendant": () => (open.val && results.val.length ? `menu-search-${highlight.val}` : ""),
        value: query,
        oninput: (e) => {
            query.val = e.target.value;
            highlight.val = 0;
            open.val = true;
        },
        onfocus: () => (open.val = true),
        onblur: close,
        onkeydown: (e) => {
            const count = results.val.length;
            if (e.key === "ArrowDown" && count) {
                e.preventDefault();
                open.val = true;
                highlight.val = (highlight.val + 1) % count;
            } else if (e.key === "ArrowUp" && count) {
                e.preventDefault();
                highlight.val = (highlight.val - 1 + count) % count;
            } else if (e.key === "Enter" && count) {
                e.preventDefault();
                go(results.val[Math.min(highlight.val, count - 1)], true);
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (query.val) query.val = "";
                else field.blur();
                close();
            }
        },
    });

    const showWord = (result) => result.matched && !result.label.toLowerCase().includes(result.matched.toLowerCase());

    return div(
        { class: "control-bar menu-bar" },
        div({ class: "search-wrapper" }, span({ class: "search-icon" }, Icons.Search()), field, () =>
            open.val && query.val.trim()
                ? div(
                      // mousedown, not click: the result must win before the field's blur closes the list.
                      { id: "menu-search-results", class: "menu-search-results", role: "listbox" },
                      results.val.length
                          ? div(
                                ...results.val.map((result, i) =>
                                    button(
                                        {
                                            type: "button",
                                            id: `menu-search-${i}`,
                                            role: "option",
                                            tabindex: "-1",
                                            class: () => `menu-search-result ${i === highlight.val ? "is-hi" : ""}`,
                                            "aria-selected": () => String(i === highlight.val),
                                            onmousedown: (e) => {
                                                e.preventDefault();
                                                go(result);
                                            },
                                            onmouseenter: () => (highlight.val = i),
                                        },
                                        span(
                                            {
                                                class: `menu-search-result__label${
                                                    result.kind ? " menu-search-result__label--command" : ""
                                                }`,
                                            },
                                            result.label,
                                            showWord(result)
                                                ? span(
                                                      { class: "menu-search-result__matched" },
                                                      `matches "${result.matched}"`
                                                  )
                                                : null
                                        ),
                                        result.where ? span({ class: "menu-search-result__where" }, result.where) : null
                                    )
                                )
                            )
                          : div({ class: "menu-search-none" }, `Nothing in the menu matches "${query.val.trim()}".`)
                  )
                : span()
        ),
        kbd({ class: "menu-bar__kbd" }, "CTRL K")
    );
};
