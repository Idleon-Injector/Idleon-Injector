import van from "../../vendor/van-1.6.0.js";
import vanX from "../../vendor/van-x-0.6.3.js";
import store from "../../state/store.js";
import { VIEWS } from "../../state/constants.js";
import { fetchConfig } from "../../services/api.js";
import { applyConfigEdits } from "../../utils/index.js";
import { Loader } from "../Loader.js";
import { EmptyState } from "../EmptyState.js";
import { ConfigNode } from "../config/ConfigNode.js";
import { StartupCheats, AddCheatSearchBar } from "../config/StartupCheats.js";
import { SearchBar } from "../SearchBar.js";
import { Icons } from "../../assets/icons.js";
import { withTooltip } from "../Tooltip.js";
import { Said, replay, useSaid } from "../inPlace.js";

const { div, button, h3, p, select, option, label, span } = van.tags;

const toPlain = (value) => JSON.parse(JSON.stringify(value));

/** The page top (#26) of a settings tab: its title and description, then its search and filters. */
const SettingsTop = ({ title, description, toolbar = null }) =>
    div(
        { class: "account-page-top config-page-top" },
        div(
            { class: "account-header account-tab-header" },
            div(
                { class: "account-tab-header__main" },
                h3({ class: "account-tab-header__title" }, title),
                p({ class: "account-tab-header__desc" }, description)
            )
        ),
        toolbar ? div({ class: "account-page-toolbar" }, toolbar) : null
    );

export const Config = () => {
    const activeSubTab = van.state("cheatconfig");
    const categoryFilter = van.state("all");
    const configSearchTerm = van.state("");
    const isAddingCheat = van.state(false);
    const draftReady = van.state(false);

    // Draft will be a vanX.reactive object, but we store it in a regular variable to avoid reactivity cascade
    let draft = null;
    // Settings the draft was last synced with; what differs from it is the user's unsaved edits
    let baseline = null;
    let addCheatFn = null;

    if (!store.app.config) store.loadConfig();

    van.derive(() => {
        if (store.app.config && !draft) {
            baseline = toPlain(store.app.config);
            draft = vanX.reactive(toPlain(baseline));
            draftReady.val = true;
        }
    });

    // Other tabs save config too, so pull in their changes while keeping unsaved edits
    const syncDraft = async () => {
        const latest = await fetchConfig();
        const merged = applyConfigEdits(toPlain(latest), baseline, toPlain(draft));
        vanX.replace(draft, merged);
        baseline = latest;
        return merged;
    };

    // Run syncs and saves one at a time so an older fetch cannot land after a newer save
    let queue = Promise.resolve();
    const queued = (task) => (queue = queue.then(task, task));

    // What Apply and Save did, said beside them (#77): a ✓ with where it went, or the reason in warm.
    const { said, say } = useSaid(5000);

    van.derive(() => {
        const isOpen = store.app.activeTab === VIEWS.CONFIG.id || store.app.configDrawerOpen;
        if (isOpen && draftReady.val)
            queued(syncDraft).catch((e) => say("failed", `The latest settings didn't load: ${e.message}`));
    });

    // Handle forced config path navigation from Cheats tab
    van.derive(() => {
        const forcedPath = store.app.configForcedPath;
        if (forcedPath && forcedPath.length > 0) {
            activeSubTab.val = "cheatconfig";
            // Reset filters to defaults when navigating to a specific cheat config
            categoryFilter.val = "all";
            configSearchTerm.val = "";
        }
    });

    /**
     * Clear forced path when user manually interacts with filters.
     */
    const handleCategoryChange = (e) => {
        store.clearForcedConfigPath();
        categoryFilter.val = e.target.value;
    };

    const handleSearchInput = (val) => {
        store.clearForcedConfigPath();
        configSearchTerm.val = val;
    };

    /**
     * Clear forced path button handler.
     */
    const handleClearForcedPath = () => {
        store.clearForcedConfigPath();
    };

    const handleCloseDrawer = () => {
        store.closeConfigDrawer();
        store.clearForcedConfigPath();
    };

    // The server's plain successes; anything else it answers (the game didn't take it, a broken file kept aside)
    // is said in warm.
    const SAVED = /^Configuration (successfully saved to config\.custom\.js|updated successfully)$/;

    const save = (isPersistent, e) => {
        if (!draft) return;
        const saveButton = e?.currentTarget;

        return queued(async () => {
            try {
                const merged = await syncDraft();
                const toSave = toPlain(merged);
                delete toSave.defaultConfig;

                const message = await store.saveConfig(toSave, isPersistent);
                baseline = merged;
                if (message && !SAVED.test(message)) return say("failed", message);
                replay(saveButton, "confirmed");
                say("done", isPersistent ? "Saved to config.custom.js" : "Applied until the injector restarts");
            } catch (error) {
                say("failed", error.message);
            }
        });
    };

    const handleAddCheat = (val) => {
        if (addCheatFn) {
            addCheatFn(val);
            isAddingCheat.val = false;
        }
    };

    /**
     * Wraps only the first path level, keeping reactive references intact for edits.
     * @param {object} root - Reactive config object
     * @param {string[]} pathParts - Path segments
     * @returns {object}
     */
    const getForcedPathData = (root, pathParts) => {
        if (!pathParts?.length || !root) return root;
        const first = pathParts[0];
        return first in root ? { [first]: root[first] } : {};
    };

    /**
     * Builds a filtered template with only the specified path for display.
     * @param {object} root - Template object
     * @param {string[]} pathParts - Path segments (e.g., ["w1", "owl"])
     * @returns {object} Filtered structure (e.g., { w1: { owl: {...} } })
     */
    const buildForcedPathTemplate = (root, pathParts) => {
        if (!pathParts?.length || !root) return root;

        let current = root;
        const result = {};
        let node = result;

        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            if (!(part in current)) return {};

            const isLast = i === pathParts.length - 1;
            node[part] = isLast ? current[part] : {};
            node = node[part];
            current = current[part];
        }

        return result;
    };

    const buildContent = () => {
        const config = draft;

        const startupCheatsResult = StartupCheats(config.startupCheats);
        addCheatFn = startupCheatsResult.addItem;

        const root = config.cheatConfig || {};
        const rootTemplate = store.app.config.cheatConfig || {};

        const cheatConfigNode = div({ id: "cheatconfig-options" }, () => {
            const forcedPath = store.app.configForcedPath;
            const filter = categoryFilter.val;
            const search = configSearchTerm.val;

            let data, template;

            if (forcedPath && forcedPath.length > 0) {
                // Forced path mode: show only the specific config entry
                data = getForcedPathData(root, forcedPath);
                template = buildForcedPathTemplate(rootTemplate, forcedPath);
            } else {
                // Normal filtering mode
                data = filter === "all" ? root : { [filter]: root[filter] };
                template = filter === "all" ? rootTemplate : { [filter]: rootTemplate[filter] };
            }

            const nodes = ConfigNode({
                data,
                path: "cheatConfig",
                template,
                searchTerm: forcedPath ? "" : search, // Ignore search term when in forced path mode
                forceOpen: !!forcedPath,
            });

            const hasMatches = nodes.some((node) => node !== null);
            if ((search || forcedPath) && !hasMatches) {
                return EmptyState({
                    title: "NO CONFIG FOUND",
                    subtitle: forcedPath
                        ? `Config path "${forcedPath.join(" ")}" not found`
                        : "Try a different search term or category",
                });
            }

            return div(nodes);
        });

        const injectorConfigNode = div(
            ConfigNode({
                data: config.injectorConfig || {},
                path: "injectorConfig",
                template: store.app.config.injectorConfig || {},
            })
        );

        return div(
            { id: "config-sub-tab-content", class: "scroll-container" },

            div(
                {
                    class: () => `config-drawer-header ${store.app.configDrawerOpen ? "" : "hidden"}`,
                },
                span({ class: "config-drawer-title" }, () =>
                    store.app.configForcedPath?.length
                        ? `EDITING: ${store.app.configForcedPath.join(" ").toUpperCase()}`
                        : "CONFIG DRAWER"
                ),
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-icon config-drawer-close",
                        onclick: handleCloseDrawer,
                        title: "Close config drawer",
                        "aria-label": "Close config drawer",
                    },
                    Icons.Close()
                )
            ),

            div(
                { class: "sub-nav" },
                ["Cheat Config", "Startup", "Injector"].map((name) => {
                    let id = name.toLowerCase().replace(" ", "");
                    if (name === "Startup") id += "cheats";
                    if (name === "Injector") id += "config";

                    return button(
                        {
                            class: () => `config-sub-tab-button ${activeSubTab.val === id ? "active" : ""}`,
                            onclick: () => {
                                activeSubTab.val = id;
                                isAddingCheat.val = false;
                            },
                        },
                        name.toUpperCase()
                    );
                })
            ),

            div(
                {
                    class: () => `config-sub-tab-pane ${activeSubTab.val === "cheatconfig" ? "active" : ""}`,
                },

                SettingsTop({
                    title: "CHEAT CONFIG",
                    description:
                        "Each cheat's own settings. Apply uses them for this session only; Save settings keeps them in your config file and sends them to the running game.",
                    toolbar:
                        // Switch between forced path indicator and normal filters
                        () => {
                            const forcedPath = store.app.configForcedPath;
                            if (forcedPath && forcedPath.length > 0) {
                                return div(
                                    { class: "forced-path-indicator" },
                                    span(
                                        { class: "forced-path-text" },
                                        `SHOWING: ${[...forcedPath].join(" ").toUpperCase()}`
                                    ),
                                    button(
                                        {
                                            type: "button",
                                            class: "btn-quiet btn-icon btn-sm forced-path-clear",
                                            onclick: handleClearForcedPath,
                                            title: "Clear filter and show all",
                                            "aria-label": "Clear filter and show all",
                                        },
                                        Icons.Close()
                                    )
                                );
                            }

                            return div(
                                { class: "config-filter-contents" },
                                div(
                                    { class: "config-filter-group" },
                                    label({ class: "config-filter-label" }, "CATEGORY FILTER"),

                                    select(
                                        {
                                            value: categoryFilter,
                                            onchange: handleCategoryChange,
                                        },
                                        option({ value: "all" }, "ALL SECTORS"),
                                        Object.keys(config.cheatConfig || {})
                                            .sort()
                                            .map((k) => option({ value: k }, k.toUpperCase()))
                                    )
                                ),
                                div(
                                    { class: "config-filter-search" },
                                    SearchBar({
                                        placeholder: "SEARCH_CONFIG",
                                        onInput: handleSearchInput,
                                        debounceMs: 0,
                                        value: configSearchTerm,
                                    })
                                )
                            );
                        },
                }),
                cheatConfigNode
            ),

            div(
                {
                    class: () => `config-sub-tab-pane ${activeSubTab.val === "startupcheats" ? "active" : ""}`,
                },

                SettingsTop({
                    title: "STARTUP CHEATS",
                    description: "Cheats that run by themselves each time the injector attaches to the game.",
                }),
                startupCheatsResult.element
            ),

            div(
                {
                    class: () => `config-sub-tab-pane ${activeSubTab.val === "injectorconfig" ? "active" : ""}`,
                },

                SettingsTop({
                    title: "INJECTOR",
                    description: "How the injector itself runs: where it attaches, its ports, logging and the web UI.",
                }),
                div({ class: "warning-banner mb-20" }, Icons.Warning(), " RESTART REQUIRED FOR CHANGES TO APPLY"),
                injectorConfigNode
            )
        );
    };

    return div(
        { id: "config-tab", class: "tab-pane config-layout" },

        () => {
            if (store.app.configError && !draftReady.val) {
                return EmptyState({
                    failed: true,
                    title: "THE SETTINGS DIDN'T LOAD",
                    subtitle: store.app.configError,
                });
            }
            if (store.app.isLoading || !draftReady.val) {
                return Loader({ text: "LOADING CONFIG" });
            }
            return buildContent();
        },

        div(
            { class: "action-bar" },
            button(
                {
                    type: "button",
                    class: () =>
                        `btn-quiet add-cheat-button ${
                            activeSubTab.val === "startupcheats" && !isAddingCheat.val ? "" : "hidden"
                        }`,
                    onclick: () => (isAddingCheat.val = true),
                },
                "Add cheat"
            ),

            div(
                {
                    class: () =>
                        `add-cheat-search-container ${
                            activeSubTab.val === "startupcheats" && isAddingCheat.val ? "" : "hidden"
                        }`,
                },

                () =>
                    isAddingCheat.val
                        ? AddCheatSearchBar(
                              handleAddCheat,
                              () => (isAddingCheat.val = false),
                              draft?.startupCheats || []
                          )
                        : div()
            ),

            div({ class: () => `spacer ${activeSubTab.val === "startupcheats" && isAddingCheat.val ? "hidden" : ""}` }),
            Said({ said, className: "said--inline said--config" }),

            withTooltip(
                button(
                    { id: "update-config-button", type: "button", class: "btn-quiet", onclick: (e) => save(false, e) },
                    "Apply"
                ),
                "Apply to session only (lost on restart)"
            ),
            withTooltip(
                button(
                    { id: "save-config-button", type: "button", class: "btn-main", onclick: (e) => save(true, e) },
                    "Save settings"
                ),
                "Save to config file and send to the running game"
            )
        )
    );
};
