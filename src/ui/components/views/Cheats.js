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
import { Said, plainReason, replay, useSaid } from "../inPlace.js";

const { div, button, span } = van.tags;

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

        // Handle parameterized commands (e.g., "drop Copper 100" -> base "drop Copper")
        const baseParts = val.split(" ");
        if (baseParts.length > 1) {
            const baseCmd = baseParts.slice(0, -1).join(" ");
            const paramFound = allCheats.find((c) => c.value === baseCmd);
            if (paramFound) {
                return {
                    value: val,
                    message: `${paramFound.message} (${baseParts[baseParts.length - 1]})`,
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
                          Icons.X()
                      )
                    : null
            )
        );
    };

    return div(
        { class: "quick-access-section" },
        div(
            { class: "quick-access-group" },
            div({ class: "quick-access-header" }, span("★ FAVORITES"), Said({ said: favoritesSaid.said })),
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
            div({ class: "quick-access-header" }, span("↻ RECENT"), Said({ said: recentSaid.said })),
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

    for (let i = 0; i < list.length; i++) {
        const cheat = list[i];

        // Filter: match term against value or message
        if (searchTerm) {
            const msg = (cheat.message || "").toLowerCase();
            const val = (cheat.value || "").toLowerCase();
            if (!msg.includes(searchTerm) && !val.includes(searchTerm)) continue;
        }

        const category = cheat.category || "general";
        if (!groups[category]) groups[category] = [];
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
    const searchBar = SearchBar({ placeholder: "SEARCH_COMMANDS", onInput: handleSearch });
    let shownFocus = 0;
    van.derive(() => {
        const { cheat: value, setting, focus, n } = store.app.cheatFocus;
        const cheats = store.data.cheats;
        if (!n || n === shownFocus || !cheats.length) return;
        shownFocus = n;
        const category = cheats.find((cheat) => cheat.value === value)?.category || "general";
        const inCategory = cheats.filter((cheat) => (cheat.category || "general") === category);
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

    return div(
        { id: "cheats-tab", class: "tab-pane" },

        div(
            { class: "scroll-container" },

            div(
                { class: "control-bar" },
                searchBar,
                button(
                    {
                        class: () => `config-drawer-toggle ${store.app.configDrawerOpen ? "active" : ""}`,
                        onclick: handleConfigDrawerToggle,
                        title: "Toggle config drawer",
                    },
                    Icons.Config()
                ),
                button(
                    {
                        class: "view-mode-toggle",
                        onclick: store.toggleCheatsViewMode,
                        title: "Toggle View Mode (List/Tabs)",
                    },
                    () => (store.app.cheatsViewMode === "tabs" ? Icons.List() : Icons.Tabs())
                )
            ),

            QuickAccessSection(),

            () => {
                if (store.app.isLoading && store.data.cheats.length === 0) {
                    return Loader({ text: "INITIALIZING" });
                }

                // Get fresh snapshot of cheats and filter term
                const filterTerm = ui.filter;
                const groupedData = getGroupedCheats(store.data.cheats, filterTerm);
                const categories = Object.keys(groupedData);

                if (categories.length === 0 && store.app.cheatsError) {
                    return EmptyState({
                        icon: Icons.Warning(),
                        title: "THE CHEAT LIST DIDN'T LOAD",
                        subtitle: store.app.cheatsError,
                    });
                }

                if (categories.length === 0) {
                    return EmptyState({
                        icon: Icons.SearchX(),
                        title: "NO CHEATS FOUND",
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
                        // Tabs Bar
                        div(
                            { class: "tabs-bar" },
                            categories.map((cat) =>
                                button(
                                    {
                                        class: () => `tab-btn ${ui.activeCategory === cat ? "active" : ""}`,
                                        onclick: () => handleCategorySwitch(cat),
                                    },
                                    cat
                                )
                            )
                        ),
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
                                          { class: "load-more-btn", onclick: () => (pagination.limit += 50) },
                                          `LOAD MORE (${activeCheats.length - pagination.limit} REMAINING)`
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
