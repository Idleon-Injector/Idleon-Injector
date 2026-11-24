/**
 * The menu's one search: systems, pages, worlds and areas, including their old injector names, then every cheat
 * and cheat setting, then the commands the terminal suggests (drop an item, spawn a monster, ...).
 * Picking a cheat shows its row on the Cheats page; it never runs it. Picking a command turns the box into a
 * command box holding its text: Enter runs it (a dangerous one asks for a second Enter), Esc goes back.
 * What the command did shows in a short line under the box (#77): it lands in the game, out of sight.
 * On a page with rows, the bar searches that page first (`createPageSearch`): "This page | Everywhere" sits in the bar,
 * the page's rows filter as the player types, and the typed text stays when they switch.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS } from "../state/constants.js";
import { Icons } from "../assets/icons.js";
import { menuSearchEntries, menuTree } from "../menu/pageRegistry.js";
import { cheatSearchEntries, commandHint, isDangerousCommand, searchMenu } from "../menu/menuModel.js";
import { createPageSearch } from "../menu/pageSearch.js";
import { configDescriptions } from "../config/configDescriptions.js";
import { Said, plainReason, useSaid } from "./inPlace.js";
import { StepPicker } from "./views/account/components/StepPicker.js";
import { pageNow, worldNow } from "./views/Pages.js";

const { div, input, span, button, kbd } = van.tags;

export const MenuSearch = () => {
    const query = van.state("");
    const open = van.state(false);
    const highlight = van.state(0);
    // The command being edited ({ command, message } from a Command result), or null while searching.
    const command = van.state(null);
    // A dangerous command waiting for its second Enter.
    const armed = van.state(false);
    // The last command run and what it did, said under the box until the player types again.
    const ran = van.state("");
    const { said, say, clear } = useSaid(6000);
    let runs = 0;
    // ponytail: the Cheats page's own list (loaded at start), so a cheat the game adds is found without a list here.
    const cheatEntries = van.derive(() => cheatSearchEntries(store.data.cheats, configDescriptions, menuTree.val));
    const entries = van.derive(() => [...menuSearchEntries.val, ...cheatEntries.val]);
    // The open page (null off the pages); "page" searches its rows, "everywhere" searches the menu.
    const openPage = van.derive(() =>
        store.app.activeTab === VIEWS.PAGES.id && menuTree.val ? (pageNow(worldNow(menuTree.val)) ?? null) : null
    );
    const pageSearch = createPageSearch();
    const mode = van.state("page");
    const searchingPage = () => pageSearch.hasRows.val && mode.val === "page";
    const results = van.derive(() => (command.val || searchingPage() ? [] : searchMenu(entries.val, query.val)));
    // Another page starts fresh, on its own rows; the page left behind shows all of them again.
    van.derive(() => {
        pageSearch.follow(openPage.val?.id ?? "");
        mode.val = "page";
        query.val = "";
    });
    // The rows follow the bar while "This page" is picked.
    van.derive(() => pageSearch.search(mode.val === "page" ? query.val : ""));

    const close = () => {
        open.val = false;
        highlight.val = 0;
    };
    const startCommand = (target) => {
        const text = `${target.command} `;
        command.val = target;
        armed.val = false;
        query.val = text;
        field.value = text;
        field.focus();
        field.setSelectionRange(text.length, text.length);
        open.val = true;
        highlight.val = 0;
    };
    const leaveCommand = () => {
        command.val = null;
        armed.val = false;
        query.val = "";
        field.value = "";
    };
    const runCommand = async () => {
        const text = query.val.trim().replace(/\s+/g, " ");
        if (!text) return;
        if (!armed.val && isDangerousCommand(text, store.data.cheats)) {
            armed.val = true;
            return;
        }
        leaveCommand();
        // A slower command that started earlier doesn't say its result over a later one's.
        const run = ++runs;
        const result = await store.executeCheat(text);
        if (run !== runs) return;
        ran.val = text;
        say(result.ok ? "done" : "failed", result.ok ? result.message : plainReason(result.message));
    };
    const go = (result, byKeyboard = false) => {
        if (result.kind === "Command") return startCommand(result.target);
        store.openMenu({ ...result.target, focus: byKeyboard });
        query.val = "";
        close();
        field.blur();
    };

    const field = input({
        type: "text",
        class: "menu-search-input",
        placeholder: () =>
            searchingPage() ? `Search ${openPage.val.tab ?? openPage.val.system}` : "Search pages and cheats",
        autocomplete: "off",
        spellcheck: "false",
        role: "combobox",
        "aria-label": () => (command.val ? "Command to run" : searchingPage() ? "Search this page" : "Search the menu"),
        "aria-describedby": () => (command.val ? "menu-command-hint" : ""),
        "aria-autocomplete": "list",
        "aria-controls": "menu-search-results",
        "aria-expanded": () => String(open.val && !searchingPage() && query.val.trim() !== ""),
        "aria-activedescendant": () => (open.val && results.val.length ? `menu-search-${highlight.val}` : ""),
        value: query,
        oninput: (e) => {
            query.val = e.target.value;
            armed.val = false;
            clear();
            if (command.val && !e.target.value.trim()) command.val = null;
            highlight.val = 0;
            open.val = true;
        },
        onfocus: () => {
            open.val = true;
            // The list loads at start; if that failed, opening search tries again (a loaded list isn't reloaded).
            if (!store.data.cheats.length) store.loadCheats();
        },
        onblur: close,
        onkeydown: (e) => {
            // An IME's Enter confirms the typed characters, not the search or the command.
            if (e.isComposing || e.keyCode === 229) return;
            // A held Enter repeats: each pick, arm and run needs its own press, so one held key can't arm a
            // dangerous command and run it.
            if (e.key === "Enter" && e.repeat) {
                e.preventDefault();
                return;
            }
            if (command.val) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    runCommand();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    leaveCommand();
                }
                return;
            }
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

    // The command box's line under the field: what the command does, then what Enter and Esc do.
    const CommandHint = () => {
        const text = query.val.trim().replace(/\s+/g, " ");
        return div(
            { id: "menu-command-hint", class: "menu-search-results menu-command-hint", "aria-live": "polite" },
            span({ class: "menu-search-result__label" }, command.val.message || command.val.command),
            armed.val
                ? span({ class: "menu-command-hint__warning" }, `Press Enter again to run ${text} · Esc cancels`)
                : span(
                      { class: "menu-search-result__where" },
                      [commandHint(text), "Enter runs", "Esc cancels"].filter(Boolean).join(" · ")
                  )
        );
    };

    // Picking a side keeps the typed text and puts the caret back in the box (a press by keyboard stays on the switch).
    const scope = div(
        { class: "menu-search-scope", hidden: () => !pageSearch.hasRows.val || Boolean(command.val) },
        StepPicker({
            name: "Search where",
            steps: [
                { value: "page", label: "This page", tone: "accent" },
                { value: "everywhere", label: "Everywhere", tone: "accent" },
            ],
            picked: () => mode.val,
            onPick: (value) => {
                mode.val = value;
                highlight.val = 0;
                field.focus();
            },
        })
    );

    return div(
        {
            class: () =>
                `control-bar menu-bar${command.val ? " is-command" : ""}${armed.val ? " is-armed" : ""}${
                    pageSearch.hasRows.val && !command.val ? " has-scope" : ""
                }`,
        },
        div(
            { class: "search-wrapper" },
            span({ class: "search-icon" }, Icons.Search()),
            field,
            () =>
                open.val && command.val
                    ? CommandHint()
                    : open.val && query.val.trim() && !searchingPage()
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
                                                  class: () =>
                                                      `menu-search-result ${i === highlight.val ? "is-hi" : ""}`,
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
                                                          result.kind && !result.named
                                                              ? " menu-search-result__label--command"
                                                              : ""
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
                                              result.where
                                                  ? span({ class: "menu-search-result__where" }, result.where)
                                                  : null
                                          )
                                      )
                                  )
                                : div(
                                      { class: "menu-search-none" },
                                      `Nothing in the menu matches "${query.val.trim()}".`
                                  )
                        )
                      : span(),
            // Always in the page, so screen readers hear the result; shown while the box is open and empty.
            div(
                {
                    class: () =>
                        `menu-search-results menu-command-hint menu-command-result ${said.val ? `is-${said.val.kind}` : ""}`,
                    hidden: () => !(open.val && !command.val && !query.val.trim() && said.val),
                },
                span({ class: "menu-search-result__label menu-search-result__label--command" }, ran),
                Said({ said, className: "said--command" })
            )
        ),
        scope,
        kbd({ class: "menu-bar__kbd" }, () => (command.val ? "Enter" : "Ctrl K"))
    );
};
