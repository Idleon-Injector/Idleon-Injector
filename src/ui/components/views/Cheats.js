import van from "../../vendor/van-1.6.0.js";
import vanX from "../../vendor/van-x-0.6.3.js";
import store from "../../state/store.js";
import { Loader } from "../Loader.js";
import { EmptyState } from "../EmptyState.js";
import { SearchBar } from "../SearchBar.js";
import { Icons } from "../../assets/icons.js";
import { CATEGORY_ORDER } from "../../state/constants.js";
import { CheatItem } from "../CheatItem.js";
import { LazyCategory } from "../LazyCategory.js";
import { revealFound } from "../../utils/index.js";
import { isPageCheat } from "../../menu/pageCheats.js";
import { VALUE_COMMANDS, valueCommandOf } from "../../menu/valueCommands.js";
import { Said, plainReason, replay, useSaid } from "../inPlace.js";

const { div, button, h3, p, span } = van.tags;

const QuickAccessSection = () => {
    /**
     * Find a cheat object by its value, handling parameterized commands.
     * @param {string} val - The cheat value to find
     * @returns {object|null} The cheat object or a reconstructed one for parameterized commands
     */
    const getCheatByValue = (val) => {
        const allCheats = store.data.cheats;
        // Direct match
        const found = allCheats.find((c) => c.value === val);
        if (found) return found;

        // Handle parameterized commands, whose value can be several words: the longest listed command it starts
        // with ("w7 sushitools knowledge 3 500" -> "w7 sushitools knowledge", with "3 500").
        const words = val.split(" ");
        for (let i = words.length - 1; i > 0; i--) {
            const paramFound = allCheats.find((c) => c.value === words.slice(0, i).join(" "));
            if (paramFound) {
                return {
                    value: val,
                    message: `${paramFound.message} (${words.slice(i).join(" ")})`,
                    category: paramFound.category,
                };
            }
        }
        return null;
    };

    // A chip moves when it runs (Recent puts it first), so each group says the result in its header.
    const favoritesSaid = useSaid();
    const recentSaid = useSaid();

    const run = async (e, cheat, { say }) => {
        const chip = e.currentTarget;
        const result = await store.executeCheat(cheat.value);
        if (!result.ok) return say("failed", `${cheat.value}: ${plainReason(result.message)}`);
        replay(chip, "confirmed");
        say("done", `${cheat.value}: ${result.message}`);
    };

    const QuickAccessBtn = (cheatValue, isFavorite = false) => {
        const cheat = getCheatByValue(cheatValue);
        if (!cheat) return null;

        return div(
            { class: "quick-access-item" },
            button(
                {
                    class: () => `quick-access-btn ${isFavorite ? "is-favorite-btn" : ""}`,
                    onclick: (e) => run(e, cheat, isFavorite ? favoritesSaid : recentSaid),
                    title: cheat.message,
                },
                span({ class: "quick-access-btn-text" }, cheat.value),
                isFavorite
                    ? span(
                          {
                              class: "quick-access-remove-icon",
                              onclick: (e) => {
                                  e.stopPropagation();
                                  store.toggleFavorite(cheatValue);
                              },
                              title: "Remove from favorites",
                          },
                          Icons.Close()
                      )
                    : null
            )
        );
    };

    return div(
        { class: "quick-access-section" },
        div(
            { class: "quick-access-group" },
            div({ class: "quick-access-header" }, span("Favorites"), Said({ said: favoritesSaid.said })),
            () => {
            const favorites = [...store.data.favoriteCheats];
            if (favorites.length === 0) {
                return div({ class: "quick-access-empty" }, "No favorites yet");
            }
            return div({ class: "quick-access-items" }, ...favorites.map((val) => QuickAccessBtn(val, true)));
            }
        ),

        div(
            { class: "quick-access-group" },
            div({ class: "quick-access-header" }, span("Recent"), Said({ said: recentSaid.said })),
            () => {
            const recent = [...store.data.recentCheats];
            if (recent.length === 0) {
                return div({ class: "quick-access-empty" }, "No recent cheats");
            }
            return div({ class: "quick-access-items" }, ...recent.slice(0, 5).map((val) => QuickAccessBtn(val, false)));
            }
        )
    );
};

/**
 * Groups cheats by category, filtering by search term.
 * Moved outside component to avoid re-creation and allow use in handlers.
 */
const getGroupedCheats = (list, term) => {
    const groups = {};
    const searchTerm = term.toLowerCase();
    const shownValueCommands = new Set();

    for (let i = 0; i < list.length; i++) {
        const cheat = list[i];
        // A system's own cheats are on its page.
        if (isPageCheat(cheat.value)) continue;

        // Filter: match term against value or message
        if (searchTerm) {
            const msg = (cheat.message || "").toLowerCase();
            const val = (cheat.value || "").toLowerCase();
            if (!msg.includes(searchTerm) && !val.includes(searchTerm)) continue;
        }

        const category = cheat.category || "general";
        if (!groups[category]) groups[category] = [];
        // Each value of a command that takes one from a list ("spawn rift2") is one row for the command, which
        // suggests its values (#23); a value the search found shows that row.
        const command = valueCommandOf(cheat.value);
        if (command) {
            if (shownValueCommands.has(command)) continue;
            shownValueCommands.add(command);
            groups[category].push({
                value: command,
                message: VALUE_COMMANDS[command].label,
                category,
                valueCommand: true,
                ...(cheat.dangerous && { dangerous: true }),
            });
            continue;
        }
        groups[category].push(cheat);
    }

    // Return sorted by category name with specific order
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        const indexA = CATEGORY_ORDER.indexOf(a);
        const indexB = CATEGORY_ORDER.indexOf(b);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        return a.localeCompare(b);
    });

    const result = {};
    for (const key of sortedKeys) {
        result[key] = groups[key];
    }
    return result;
};

export const Cheats = () => {
    const ui = vanX.reactive({
        filter: "",
        shouldOpen: false,
        activeCategory: null,
    });

    if (store.data.cheats.length === 0) {
        store.loadCheats();
    }

    // Pagination state
    const pagination = vanX.reactive({
        limit: 50,
    });

    const resetPagination = () => {
        pagination.limit = 50;
    };

    const validateActiveCategory = (filter) => {
        const groupedData = getGroupedCheats(store.data.cheats, filter);
        const categories = Object.keys(groupedData);

        if (categories.length > 0) {
            if (!ui.activeCategory || !categories.includes(ui.activeCategory)) {
                ui.activeCategory = categories[0];
            }
        } else {
            ui.activeCategory = null;
        }
    };

    const handleSearch = (val) => {
        ui.filter = val;
        ui.shouldOpen = val.length > 0;
        validateActiveCategory(val);
        resetPagination();
    };

    const handleCategorySwitch = (cat) => {
        ui.activeCategory = cat;
        resetPagination();
    };

    // The menu search sent the player to a cheat: clear this page's filter, open its category and show the row.
    // It only shows the row; the player runs the cheat from it.
    const searchBar = SearchBar({ placeholder: "Search cheats", onInput: handleSearch });
    let shownFocus = 0;
    van.derive(() => {
        const { cheat: value, setting, focus, fill, n } = store.app.cheatFocus;
        const cheats = store.data.cheats;
        if (!n || n === shownFocus || !cheats.length || isPageCheat(value)) return;
        shownFocus = n;
        // A value command's row has no entry of its own in the list: its values carry its group.
        const category =
            (cheats.find((cheat) => cheat.value === value) ?? cheats.find((cheat) => valueCommandOf(cheat.value) === value))
                ?.category || "general";
        const inCategory = getGroupedCheats(cheats, "")[category] ?? [];
        searchBar.querySelector("input").value = "";
        handleSearch("");
        ui.activeCategory = category;
        pagination.limit = Math.max(50, Math.ceil((inCategory.findIndex((c) => c.value === value) + 1) / 50) * 50);
        const page = document.getElementById("cheats-tab") || document;
        revealFound(() => {
            const details = page.querySelector(`details[data-category="${CSS.escape(category)}"]`);
            if (details && !details.open) details.open = true;
            const row = page.querySelector(`[data-cheat="${CSS.escape(value)}"] .cheat-button`);
            if (row) page.querySelector(".tabs-bar .tab-btn.active")?.scrollIntoView({ block: "nearest", inline: "center" });
            // A value search found ("Rift Slug"): its command's row with the value in its field, focused to run.
            const field = fill && row?.parentElement.querySelector(".value-fields__choice");
            if (field) {
                field.value = fill;
                field.dispatchEvent(new Event("input"));
                return field;
            }
            return row;
        }, focus && !setting);
        if (setting) revealFound(() => document.querySelector(`[data-config-key="${CSS.escape(setting)}"]`), focus);
    });

    const handleConfigDrawerToggle = () => {
        store.clearForcedConfigPath();

        if (store.app.configDrawerOpen) {
            store.closeConfigDrawer();
            return;
        }

        store.openConfigDrawer();
    };

    // The category chips (tab view) sit with the search, under the title.
    const categoryChips = () => {
        if (store.app.cheatsViewMode !== "tabs") return div();
        const categories = Object.keys(getGroupedCheats(store.data.cheats, ui.filter));
        if (!categories.length) return div();
        return div(
            { class: "tabs-bar" },
            categories.map((cat) =>
                button(
                    {
                        type: "button",
                        class: () =>
                            `tab-btn ${cat === "Dangerous" ? "is-dangerous" : ""} ${ui.activeCategory === cat ? "active" : ""}`,
                        onclick: () => handleCategorySwitch(cat),
                    },
                    cat === "Dangerous" ? [Icons.Warning(), cat] : cat
                )
            )
        );
    };

    return div(
        { id: "cheats-tab", class: "tab-pane" },

        // The page top (#26): the title and its buttons, then search and the category chips.
        div(
            { class: "account-page-top cheats-page-top" },
            div(
                { class: "account-header account-tab-header" },
                div(
                    { class: "account-tab-header__main" },
                    h3({ class: "account-tab-header__title" }, "Cheats"),
                    p(
                        { class: "account-tab-header__desc" },
                        "Click a cheat to run it in the game. A cheat with a field takes its value first; the star keeps it under Favorites."
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
                            onclick: handleConfigDrawerToggle,
                            title: "Toggle config drawer",
                        },
                        "Config"
                    ),
                    button(
                        {
                            type: "button",
                            class: "btn-quiet btn-sm view-mode-toggle",
                            onclick: store.toggleCheatsViewMode,
                            title: "Switch between the list and the tabs",
                        },
                        () => (store.app.cheatsViewMode === "tabs" ? "List view" : "Tab view")
                    )
                )
            ),
            div({ class: "account-page-toolbar" }, searchBar, categoryChips)
        ),

        div(
            { class: "scroll-container" },

            QuickAccessSection(),

            () => {
                if (store.app.isLoading && store.data.cheats.length === 0) {
                    return Loader({ text: "Loading cheats" });
                }

                // Get fresh snapshot of cheats and filter term
                const filterTerm = ui.filter;
                const groupedData = getGroupedCheats(store.data.cheats, filterTerm);
                const categories = Object.keys(groupedData);

                if (categories.length === 0 && store.app.cheatsError) {
                    return EmptyState({
                        failed: true,
                        title: "THE CHEAT LIST DIDN'T LOAD",
                        subtitle: store.app.cheatsError,
                    });
                }

                if (categories.length === 0) {
                    return EmptyState({
                        title: "No cheats found",
                        subtitle: filterTerm ? "Try a different search term" : "Cheats list is empty",
                    });
                }

                // Initialize active category if null or invalid (subscription-free peek)
                const rawUi = vanX.raw(ui);
                if (!rawUi.activeCategory || !categories.includes(rawUi.activeCategory)) {
                    ui.activeCategory = categories[0];
                }

                const isTabsMode = store.app.cheatsViewMode === "tabs";

                if (isTabsMode) {
                    return div(
                        // Tab Content - wrapped in reactive function to respond to category/pagination changes
                        () => {
                            const activeCheats = groupedData[ui.activeCategory] || [];
                            const visibleCheats = activeCheats.slice(0, pagination.limit);
                            const hasMore = activeCheats.length > pagination.limit;
                            return div(
                                { class: "tab-content" },
                                visibleCheats.map((cheat) => CheatItem(cheat)),
                                hasMore
                                    ? button(
                                          {
                                              type: "button",
                                              class: "btn-quiet load-more-btn",
                                              onclick: () => (pagination.limit += 50),
                                          },
                                          `Load more (${activeCheats.length - pagination.limit} remaining)`
                                      )
                                    : null
                            );
                        }
                    );
                }

                // List View (Accordion) with Lazy Loading
                return div(
                    { id: "cheat-buttons", class: "grid-layout" },
                    categories.map((cat) => {
                        return LazyCategory({
                            category: cat,
                            isOpen: ui.shouldOpen, // Force open if searching
                            cheats: groupedData[cat],
                        });
                    })
                );
            }
        )
    );
};
