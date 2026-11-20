import van from "../../../vendor/van-1.6.0.js";
import store from "../../../state/store.js";
import { copyToClipboard } from "../../../utils/index.js";
import { Loader } from "../../Loader.js";
import { EmptyState } from "../../EmptyState.js";
import { Sparkline, canGraph } from "../../Sparkline.js";
import { Icons } from "../../../assets/icons.js";
import {
    NEW_SCAN_TYPES,
    NEXT_SCAN_TYPES,
    getScanTypeLabel,
    getScanTypePlaceholder,
    isInputlessScanType,
    requiresSecondaryInput,
} from "./scanUtils.js";
import { formatDisplayValue, getMonitorHistory } from "./valueUtils.js";
import { createStaticRowReconciler } from "../account/accountShared.js";
import { Said, clickAgain, useSaid } from "../../inPlace.js";

const { div, input, button, span, label, details, summary, select, option } = van.tags;

const KeyCheckbox = ({ keyName, selectedKeys, onChange, isFavorite, onToggleFavorite }) => {
    const isChecked = () => selectedKeys.includes(keyName);
    const favorite = () => (typeof isFavorite === "function" ? isFavorite(keyName) : false);

    return label(
        { class: () => `key-checkbox ${isChecked() ? "checked" : ""}`, title: keyName },
        input({
            type: "checkbox",
            checked: isChecked,
            onchange: (e) => onChange(keyName, e.target.checked),
        }),
        span({ class: "key-checkbox-label" }, keyName),
        button(
            {
                type: "button",
                class: () => `key-favorite-btn ${favorite() ? "active" : ""}`,
                "aria-pressed": () => String(favorite()),
                title: () => (favorite() ? "Remove from favorites" : "Add to favorites"),
                onclick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleFavorite(keyName);
                },
            },
            Icons.Star()
        )
    );
};

/**
 * The copy button's feedback (#77): its ✓ and "Copied" beside it, or why it couldn't copy.
 * `copyFeedback` is "success" for the 1.5 s the ✓ shows.
 */
const useCopy = (path) => {
    const copyFeedback = van.state(null);
    const { said, say } = useSaid(1500);
    const handleCopy = (e) => {
        e.stopPropagation();
        const success = copyToClipboard("bEngine.gameAttributes.h." + path);
        copyFeedback.val = success ? "success" : "error";
        say(success ? "done" : "failed", success ? "Copied" : "Couldn't copy");
        setTimeout(() => (copyFeedback.val = null), 1500);
    };
    return { copyFeedback, handleCopy, copySaid: Said({ said, className: "said--bare said--copy" }) };
};

/**
 * Why the value in the field wasn't written, under the field while it's open. `fieldProps` go on the field, so
 * screen readers hear it's invalid and why when they come back to it.
 */
let editErrors = 0;
const EditError = (isEditing, editState) => {
    const line = Said({
        said: van.derive(() => (isEditing() && editState.error ? { kind: "failed", text: editState.error } : null)),
        className: "said--under",
    });
    line.id = `search-edit-error-${++editErrors}`;
    const fieldProps = {
        "aria-invalid": () => String(Boolean(editState.error)),
        "aria-describedby": () => (editState.error ? line.id : ""),
    };
    return { line, fieldProps };
};

/** A list's own warning line (the scan hit its limit, the saved list didn't refresh); empty takes no room. */
const Note = (text) =>
    div({ class: "search-note", role: "status" }, () =>
        text() ? span({ class: "search-note__body" }, Icons.Warning({ class: "said__icon" }), text()) : span()
    );

// Returns { node, sync } like SavedResultItem: a written value reaches the row through sync(result), so an
// editor left open after a write keeps its field (and focus).
const ResultItem = ({ result: initialResult, ui, handlers }) => {
    const resultState = van.state(initialResult);
    const path = initialResult.path;
    const { copyFeedback, handleCopy, copySaid } = useCopy(path);

    const isEditing = () => ui.edit.path === path;
    const editError = EditError(isEditing, ui.edit);
    const isInSavedList = () => ui.savedResults.some((entry) => entry.path === path);

    const handleAddToList = (e) => {
        e.stopPropagation();
        if (e.currentTarget && typeof e.currentTarget.blur === "function") {
            e.currentTarget.blur();
        }

        if (isInSavedList()) {
            handlers.removeSavedResult(path);
            return;
        }

        handlers.addToSavedResults(resultState.val);
    };

    const handleStartEdit = (e) => {
        e.stopPropagation();
        handlers.startEdit(resultState.val);
    };

    const handleCancel = (e) => {
        e.stopPropagation();
        handlers.cancelEdit();
    };

    const handleSave = (e) => {
        e.stopPropagation();
        handlers.saveEdit();
    };

    // The row keeps its height; why a value wasn't written gets a line under it.
    const row = div(
        {
            class: () =>
                "search-result-item " +
                (copyFeedback.val === "success" ? "copied " : "") +
                (ui.writtenPath === path ? "is-confirmed" : ""),
        },
        span({ class: "result-path" }, path),
        span({ class: "result-equals" }, "="),

        () => {
            if (!isEditing()) {
                return span(
                    { class: () => "result-value type-" + resultState.val.type },
                    () => resultState.val.formattedValue
                );
            }

            return input({
                class: "result-edit-input",
                value: () => ui.edit.draft,
                "aria-label": `New value for ${path}`,
                ...editError.fieldProps,
                oninput: (e) => {
                    ui.edit.draft = e.target.value;
                    ui.edit.error = "";
                },
                onclick: (e) => e.stopPropagation(),
                onkeydown: (e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") handlers.saveEdit();
                    if (e.key === "Escape") handlers.cancelEdit();
                },
            });
        },

        copySaid,
        div({ class: "result-actions" }, () => {
            if (isEditing()) {
                return div(
                    { class: "result-action-group" },
                    button(
                        {
                            type: "button",
                            class: "btn-quiet btn-icon btn-sm result-action-btn save-btn",
                            title: "Save",
                            "aria-label": "Save",
                            onclick: handleSave,
                        },
                        Icons.Check()
                    ),
                    button(
                        {
                            type: "button",
                            class: "btn-quiet btn-icon btn-sm result-action-btn cancel-btn",
                            title: "Cancel",
                            "aria-label": "Cancel",
                            onclick: handleCancel,
                        },
                        Icons.Close()
                    )
                );
            }

            return div(
                { class: "result-action-group" },
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm result-action-btn edit-btn",
                        title: "Edit value",
                        onclick: handleStartEdit,
                    },
                    "Edit"
                ),
                button(
                    {
                        type: "button",
                        class: () =>
                            "btn-quiet btn-icon btn-sm result-action-btn copy-btn " +
                            (copyFeedback.val === "success" ? "copied" : ""),
                        title: "Copy full access path",
                        "aria-label": "Copy full access path",
                        onclick: handleCopy,
                    },
                    () => (copyFeedback.val === "success" ? Icons.Check() : Icons.Copy())
                ),
                button(
                    {
                        type: "button",
                        class: () =>
                            "btn-quiet btn-sm result-action-btn save-to-list-btn " + (isInSavedList() ? "active" : ""),
                        "aria-pressed": () => String(isInSavedList()),
                        title: () => (isInSavedList() ? "Remove from saved list" : "Add to saved list"),
                        onclick: handleAddToList,
                    },
                    () => (isInSavedList() ? "Saved" : "Save")
                )
            );
        })
    );
    return {
        node: div({ class: "search-result-entry" }, row, editError.line),
        sync: (nextResult) => (resultState.val = nextResult),
    };
};

const SearchButton = ({
    isSearching,
    disabled,
    onClick,
    label = "Search",
    title = "",
    className = "",
    main = () => true,
}) =>
    button(
        {
            type: "button",
            class: () =>
                `${main() ? "btn-main" : "btn-quiet"} search-btn ${className} ${isSearching() ? "loading" : ""}`.trim(),
            onclick: onClick,
            disabled: () => isSearching() || disabled(),
            title,
        },
        () => (isSearching() ? "Scanning" : typeof label === "function" ? label() : label)
    );

export const KeysSection = ({ ui, handlers }) =>
    div(
        { class: "search-keys-section" },
        div(
            { class: "section-header" },
            span({ class: "section-title" }, "Search in keys"),
            div(
                { class: "section-actions" },
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm",
                        onclick: handlers.toggleAll,
                        title: () => (handlers.areAllSelected() ? "Deselect all keys" : "Select all keys"),
                    },
                    () => (handlers.areAllSelected() ? "None" : "All")
                ),
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm",
                        onclick: () => handlers.selectKeys(handlers.getValidFavorites()),
                        title: "Select all favorites",
                    },
                    "Favorites"
                ),
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm",
                        onclick: handlers.clearSelection,
                        title: "Clear selection",
                    },
                    "Clear"
                )
            )
        ),
        div(
            { class: "keys-content scroll-container" },
            div({ class: "keys-group" }, div({ class: "keys-group-header" }, "Favorites"), () => {
                if (ui.isLoading) {
                    return div({ class: "keys-loading" }, "Loading");
                }
                const validFavorites = handlers.getValidFavorites();
                if (validFavorites.length === 0) {
                    return div({ class: "keys-loading" }, "No keys available");
                }
                return div(
                    { class: "keys-grid" },
                    ...validFavorites.map((key) =>
                        KeyCheckbox({
                            keyName: key,
                            selectedKeys: ui.selectedKeys,
                            onChange: handlers.handleKeyChange,
                            isFavorite: handlers.isFavoriteKey,
                            onToggleFavorite: handlers.toggleFavoriteKey,
                        })
                    )
                );
            }),
            details(
                {
                    class: "keys-group expandable",
                    open: ui.allKeysExpanded,
                    ontoggle: (e) => (ui.allKeysExpanded = e.target.open),
                },
                summary(
                    { class: "keys-group-header" },
                    Icons.Chevron({ dir: "right", class: "group-chevron" }),
                    () => `All keys (${handlers.getOtherKeys().length} more)`
                ),
                div(
                    { class: "keys-expand-content" },
                    div(
                        { class: "keys-filter" },
                        input({
                            type: "text",
                            class: "keys-filter-input",
                            placeholder: "Filter keys",
                            value: () => ui.allKeysFilter,
                            oninput: (e) => (ui.allKeysFilter = e.target.value),
                        })
                    ),
                    () => {
                        const otherKeys = handlers.getOtherKeys();
                        return div(
                            { class: "keys-grid" },
                            ...otherKeys.map((key) =>
                                KeyCheckbox({
                                    keyName: key,
                                    selectedKeys: ui.selectedKeys,
                                    onChange: handlers.handleKeyChange,
                                    isFavorite: handlers.isFavoriteKey,
                                    onToggleFavorite: handlers.toggleFavoriteKey,
                                })
                            )
                        );
                    }
                )
            )
        ),
        div({ class: "keys-footer" }, () =>
            span({ class: "selected-count" }, `${ui.selectedKeys.length} keys selected`)
        )
    );

export const SearchInputSection = ({ ui, handlers }) =>
    div(
        { class: "search-input-section" },
        div({ class: "section-header" }, span({ class: "section-title" }, "Search value")),
        div(
            { class: "search-input-content" },
            div(
                { class: "scan-type-row" },
                div(
                    { class: "scan-type-group" },
                    span({ class: "type-label" }, "New scan type"),
                    select(
                        {
                            class: "scan-type-select",
                            value: () => ui.scanTypeNew,
                            onchange: handlers.handleNewScanTypeChange,
                            disabled: () => ui.scan.active,
                        },
                        ...NEW_SCAN_TYPES.map((scanType) => option({ value: scanType }, getScanTypeLabel(scanType)))
                    )
                ),
                div(
                    { class: "scan-type-group" },
                    span({ class: "type-label" }, "Next scan type"),
                    select(
                        {
                            class: "scan-type-select",
                            value: () => ui.scanTypeNext,
                            onchange: handlers.handleNextScanTypeChange,
                            disabled: () => !ui.scan.active,
                        },
                        ...NEXT_SCAN_TYPES.map((scanType) => option({ value: scanType }, getScanTypeLabel(scanType)))
                    )
                )
            ),
            () => {
                const activeScanType = ui.scan.active ? ui.scanTypeNext : ui.scanTypeNew;
                const showPrimaryInput = !isInputlessScanType(activeScanType);
                const showSecondaryInput = requiresSecondaryInput(activeScanType);

                return div(
                    { class: "search-input-row" },
                    div(
                        {
                            class: () => `scan-value-inputs ${showSecondaryInput ? "has-secondary" : ""}`.trim(),
                        },
                        showPrimaryInput
                            ? input({
                                  type: "text",
                                  class: "search-query-input",
                                  placeholder: getScanTypePlaceholder(activeScanType),
                                  value: () => ui.searchQuery,
                                  oninput: handlers.handleQueryInput,
                                  onkeydown: handlers.handleKeyDown,
                              })
                            : div(
                                  { class: "scan-inputless-note" },
                                  "No input needed for " + getScanTypeLabel(activeScanType).toLowerCase()
                              ),
                        showSecondaryInput
                            ? input({
                                  type: "text",
                                  class: "search-query-input secondary-query-input",
                                  placeholder: "Second value",
                                  value: () => ui.searchQuery2,
                                  oninput: handlers.handleQuery2Input,
                                  onkeydown: handlers.handleKeyDown,
                              })
                            : null
                    ),
                    div(
                        { class: "search-btn-group" },
                        SearchButton({
                            isSearching: () => ui.scan.isSearching,
                            disabled: () => (ui.scan.active ? false : ui.selectedKeys.length === 0),
                            onClick: (e) => {
                                if (!ui.scan.active) return handlers.handleSearch("new");
                                // Starting over drops the results, which a later scan can't narrow back to: it asks
                                // in place first (#25).
                                const count = ui.scan.results.length;
                                const question = `drop ${count} result${count === 1 ? "" : "s"} and start over.`;
                                if (count === 0 || clickAgain(e.currentTarget, question)) handlers.startNewScan();
                            },
                            label: () => (ui.scan.active ? "New scan" : "First scan"),
                            // The area's one blue button: First scan until a scan runs, then Next scan.
                            main: () => !ui.scan.active,
                            title: () =>
                                ui.scan.active
                                    ? "Reset and prepare a fresh first scan"
                                    : "First scan (search all selected keys)",
                        }),
                        SearchButton({
                            isSearching: () => ui.scan.isSearching,
                            disabled: () => !ui.scan.active || ui.scan.scopeCount === 0,
                            onClick: () => handlers.handleSearch("next"),
                            label: "Next scan",
                            className: "next-search-btn",
                            main: () => ui.scan.active,
                            title: () =>
                                ui.scan.scopeCount
                                    ? `Next search (search inside ${ui.scan.scopeCount} current results)`
                                    : "Next search (run a new search first)",
                        })
                    )
                );
            },
            // The scan's hint line: the mode, or why the scan didn't run (it pulses, #77).
            div({ class: "search-type-hint", role: "status" }, () => {
                if (ui.searchRefusal)
                    return span(
                        { class: "search-refusal", "data-refusal": ui.refusals },
                        Icons.Warning({ class: "said__icon" }),
                        ui.searchRefusal
                    );
                const activeScanType = ui.scan.active ? ui.scanTypeNext : ui.scanTypeNew;

                if (isInputlessScanType(activeScanType)) {
                    if (activeScanType === "unknown_initial_value") {
                        return span(
                            { class: "type-label" },
                            "Mode: " + getScanTypeLabel(activeScanType).toLowerCase() + " (searches for any value)"
                        );
                    }

                    const suffix =
                        activeScanType === "changed_value" || activeScanType === "unchanged_value"
                            ? "(compares against the previous results)"
                            : "(numbers only; compares against the previous results)";

                    return span(
                        { class: "type-label" },
                        "Mode: " + getScanTypeLabel(activeScanType).toLowerCase() + " " + suffix
                    );
                }

                if (activeScanType !== "exact_value") {
                    return span(
                        { class: "type-label" },
                        "Mode: " + getScanTypeLabel(activeScanType).toLowerCase() + " (numbers only; text is ignored)"
                    );
                }

                return span(
                    span({ class: "type-label" }, "Detected type: "),
                    span({ class: () => `type-value type-${ui.detectedType}` }, () => ui.detectedType.toUpperCase())
                );
            })
        )
    );

export const ResultsSection = ({ ui, handlers }) =>
    div(
        { class: "search-results-section" },
        div(
            { class: "section-header" },
            span({ class: "section-title" }, "Results"),
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-sm refresh-btn",
                    onclick: () => handlers.handleSearch(ui.scan.lastSearchMode),
                    disabled: () =>
                        ui.scan.isSearching ||
                        !ui.scan.hasSearched ||
                        (ui.scan.lastSearchMode === "next" ? ui.scan.scopeCount === 0 : ui.selectedKeys.length === 0),
                    title: () =>
                        ui.scan.lastSearchMode === "next" ? "Run the next scan again" : "Run the first scan again",
                },
                "Refresh"
            ),
            span({ class: "results-scope-badge" }, () => {
                const filteredCount = handlers.getFilteredResults().length;
                const totalCount = ui.scan.results.length;
                if (!ui.resultsFilterApplied) {
                    return `${totalCount} RESULT${totalCount === 1 ? "" : "S"}`;
                }
                return `${filteredCount} / ${totalCount} SHOWN`;
            })
        ),
        div(
            { class: "results-content scroll-container" },
            Note(() =>
                ui.truncated && !ui.scan.isSearching
                    ? "The scan stopped at its result limit, so some matches are missing. Narrow your keys or value."
                    : ""
            ),
            div(
                { class: "list-filter-row" },
                input({
                    type: "text",
                    class: "list-filter-input",
                    placeholder: "Filter results (path or value)",
                    value: () => ui.resultsFilter,
                    oninput: handlers.handleResultsFilterInput,
                    disabled: () => ui.scan.isSearching || ui.scan.results.length === 0,
                }),
                () =>
                    ui.resultsFilter
                        ? button(
                              {
                                  type: "button",
                                  class: "btn-quiet btn-sm",
                                  onclick: handlers.clearResultsFilter,
                                  title: "Clear results filter",
                              },
                              "Clear"
                          )
                        : null
            ),
            ResultsList({ ui, handlers })
        )
    );

// The list is rebuilt only when the rows shown change; a written value reaches its row through sync(), so the
// rows (and an editor open in one) stay in place.
const ResultsList = ({ ui, handlers }) => {
    let rows = new Map();
    let list = null;
    let listKey = null;
    const forget = () => {
        rows = new Map();
        list = listKey = null;
    };

    return () => {
        if (ui.scan.isSearching) {
            forget();
            return Loader({ text: "Searching" });
        }

        if (ui.scan.error || ui.error) {
            forget();
            return EmptyState({
                failed: true,
                title: "Search error",
                subtitle: ui.scan.error || ui.error,
            });
        }

        if (ui.scan.results.length === 0) {
            forget();
            if (ui.scan.hasSearched) {
                return EmptyState({
                    title: "No results",
                    subtitle: "Try a different search value or select more keys",
                });
            }
            return EmptyState({
                title: "Search GGA",
                subtitle: "Enter a value and press First scan, or use Unknown Initial Value to scan all values",
            });
        }

        const filteredResults = handlers.getFilteredResults();
        const visibleResults = filteredResults.slice(0, ui.displayLimit);
        const hasMore = filteredResults.length > ui.displayLimit;
        const remaining = filteredResults.length - ui.displayLimit;

        // Only the rows shown are kept, so a row is never reused after it left the page.
        const shown = new Map();
        for (const result of visibleResults) {
            const row = rows.get(result.path) ?? ResultItem({ result, ui, handlers });
            row.sync(result);
            shown.set(result.path, row);
        }
        rows = shown;

        const key = [filteredResults.length, remaining, ...shown.keys()].join("|");
        if (key === listKey) return list;
        listKey = key;
        list = div(
            { class: "results-list" },
            filteredResults.length === 0
                ? EmptyState({
                      title: "No filter match",
                      subtitle: "Try a different path/value filter",
                  })
                : null,
            ...[...shown.values()].map((row) => row.node),
            hasMore
                ? button(
                      {
                          type: "button",
                          class: "btn-quiet load-more-btn",
                          onclick: () => (ui.displayLimit += 50),
                      },
                      `Load more (${remaining} remaining)`
                  )
                : null
        );
        return list;
    };
};

// Returns { node, sync }: the node is cached and reused by SavedResultsSection's
// row reconciler, and sync(entry) pushes fresh entry data into the row's state
// so the DOM identity (and per-row copy feedback) survives list rebuilds.
const SavedResultItem = ({ entry: initialEntry, ui, handlers }) => {
    const entryState = van.state(initialEntry);
    const path = initialEntry.path;
    const { copyFeedback, handleCopy, copySaid } = useCopy(path);

    const isEditing = () => ui.savedEdit.path === path;
    const editError = EditError(isEditing, ui.savedEdit);

    const monitorData = () => store.monitors.get(path);
    const isMonitorEnabled = () => entryState.val.monitorEnabled === true;
    const isMonitored = () => isMonitorEnabled() && !!monitorData();
    const monitorError = () => (isMonitorEnabled() ? monitorData()?.error || null : null);
    const liveMonitorHistory = () => (isMonitorEnabled() ? getMonitorHistory(monitorData()) : []);
    const monitorHistory = () => {
        if (!isMonitorEnabled()) return [];

        const liveHistory = liveMonitorHistory();
        if (liveHistory.length > 0) return liveHistory;

        return Array.isArray(entryState.val.lastHistory) ? entryState.val.lastHistory : [];
    };
    const hasLiveValue = () => liveMonitorHistory().length > 0;
    const liveDisplayValue = () => {
        if (hasLiveValue()) return formatDisplayValue(getMonitorHistory(monitorData())[0]?.value);
        return entryState.val.formattedValue;
    };
    const liveStatusClass = () => {
        if (!isMonitorEnabled()) return "live-paused";
        if (monitorError()) return "live-error";
        return hasLiveValue() ? "live-active" : "live-pending";
    };

    const handleMonitor = (e) => {
        e.stopPropagation();
        if (e.currentTarget && typeof e.currentTarget.blur === "function") {
            e.currentTarget.blur();
        }

        handlers.toggleSavedMonitor(path, !isMonitorEnabled());
    };

    const handleStartEdit = (e) => {
        e.stopPropagation();
        handlers.startSavedEdit(entryState.val);
    };

    const handleCancel = (e) => {
        e.stopPropagation();
        handlers.cancelSavedEdit();
    };

    const handleSave = (e) => {
        e.stopPropagation();
        handlers.saveSavedEdit();
    };

    const handleRemove = (e) => {
        e.stopPropagation();
        handlers.removeSavedResult(path);
    };

    const node = div(
        {
            class: () =>
                "search-result-item saved-result-item " +
                (isMonitorEnabled() ? "monitor-enabled " : "") +
                (isMonitored() ? "monitored " : "") +
                (copyFeedback.val === "success" ? "copied " : "") +
                (ui.writtenPath === path ? "is-confirmed " : "") +
                (isEditing() && ui.savedEdit.error ? "has-said" : ""),
        },
        span({ class: "result-path" }, path),
        span({ class: "result-equals" }, "="),

        () => {
            if (!isEditing()) {
                return div(
                    { class: "saved-result-body" },
                    div(
                        { class: "saved-live-wrap" },
                        span(
                            {
                                class: () => "result-value saved-live-value " + liveStatusClass(),
                                title: () => monitorError() || "",
                            },
                            liveDisplayValue
                        )
                    ),
                    div({ class: "saved-history" }, () => {
                        const history = monitorHistory();

                        if (!isMonitorEnabled() || history.length === 0) {
                            return null;
                        }

                        if (canGraph(history)) {
                            return div(
                                { class: "saved-history-content" },
                                Sparkline({ data: history, width: 136, height: 26 })
                            );
                        }

                        return div(
                            { class: "saved-history-list" },
                            ...history.slice(0, 10).map((h) =>
                                span(
                                    {
                                        class: "saved-history-item",
                                        title: new Date(h.ts).toLocaleTimeString(),
                                    },
                                    formatDisplayValue(h.value)
                                )
                            )
                        );
                    })
                );
            }

            return input({
                class: "result-edit-input",
                value: () => ui.savedEdit.draft,
                "aria-label": `New value for ${path}`,
                ...editError.fieldProps,
                oninput: (e) => {
                    ui.savedEdit.draft = e.target.value;
                    ui.savedEdit.error = "";
                },
                onclick: (e) => e.stopPropagation(),
                onkeydown: (e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") handlers.saveSavedEdit();
                    if (e.key === "Escape") handlers.cancelSavedEdit();
                },
            });
        },

        copySaid,
        div({ class: "result-actions" }, () => {
            if (isEditing()) {
                return div(
                    { class: "result-action-group" },
                    button(
                        {
                            type: "button",
                            class: "btn-quiet btn-icon btn-sm result-action-btn save-btn",
                            title: "Save",
                            "aria-label": "Save",
                            onclick: handleSave,
                        },
                        Icons.Check()
                    ),
                    button(
                        {
                            type: "button",
                            class: "btn-quiet btn-icon btn-sm result-action-btn cancel-btn",
                            title: "Cancel",
                            "aria-label": "Cancel",
                            onclick: handleCancel,
                        },
                        Icons.Close()
                    )
                );
            }

            return div(
                { class: "result-action-group" },
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm result-action-btn edit-btn",
                        title: "Edit value",
                        onclick: handleStartEdit,
                    },
                    "Edit"
                ),
                button(
                    {
                        type: "button",
                        class: () =>
                            "btn-quiet btn-sm result-action-btn monitor-btn " + (isMonitorEnabled() ? "active" : ""),
                        "aria-pressed": () => String(isMonitorEnabled()),
                        title: () =>
                            monitorError()
                                ? "Watcher failed: " + monitorError()
                                : isMonitorEnabled()
                                  ? "Stop Watcher"
                                  : "Enable Watcher",
                        onclick: handleMonitor,
                    },
                    () => (isMonitorEnabled() ? "Watching" : "Watch")
                ),
                button(
                    {
                        type: "button",
                        class: () =>
                            "btn-quiet btn-icon btn-sm result-action-btn copy-btn " +
                            (copyFeedback.val === "success" ? "copied" : ""),
                        title: "Copy full access path",
                        "aria-label": "Copy full access path",
                        onclick: handleCopy,
                    },
                    () => (copyFeedback.val === "success" ? Icons.Check() : Icons.Copy())
                ),
                button(
                    {
                        type: "button",
                        class: "btn-danger btn-sm result-action-btn remove-btn",
                        title: "Remove from saved list",
                        onclick: handleRemove,
                    },
                    "Remove"
                )
            );
        }),
        editError.line
    );

    return { node, sync: (nextEntry) => (entryState.val = nextEntry) };
};

export const SavedResultsSection = ({ ui, handlers }) => {
    const rowCache = new Map();
    const listNode = div({ class: "saved-results-list" });
    const reconcile = createStaticRowReconciler(listNode);

    const getRow = (entry) => {
        const cached = rowCache.get(entry.path);
        if (cached) {
            cached.sync(entry);
            return cached;
        }
        const row = SavedResultItem({ entry, ui, handlers });
        rowCache.set(entry.path, row);
        return row;
    };

    const renderRows = () => {
        // Drop cached rows whose path is no longer saved.
        const savedPaths = new Set(ui.savedResults.map((e) => e.path));
        for (const key of [...rowCache.keys()]) {
            if (!savedPaths.has(key)) rowCache.delete(key);
        }

        if (ui.savedResults.length === 0) {
            reconcile("empty", [
                EmptyState({
                    title: "No saved results",
                    subtitle: "Press Save on a search result to keep it here",
                }),
            ]);
            return;
        }

        const filtered = handlers.getFilteredSavedResults();
        if (filtered.length === 0) {
            reconcile("no-match", [
                EmptyState({
                    title: "No filter match",
                    subtitle: "Try a different path/value filter",
                }),
            ]);
            return;
        }

        // Rebuild the DOM only when the visible path set changes; a value-only
        // edit keeps the same signature and updates via each row's sync().
        const rows = filtered.map((entry) => getRow(entry).node);
        reconcile("rows:" + filtered.map((e) => e.path).join("|"), rows);
    };

    van.derive(() => {
        ui.savedResults;
        ui.savedFilterApplied;
        renderRows();
    });

    return div(
        { class: "saved-results-section" },
        div(
            { class: "section-header" },
            span({ class: "section-title" }, "Saved list"),
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-sm refresh-btn",
                    onclick: handlers.refreshSavedResults,
                    disabled: () => ui.isRefreshingSavedResults || ui.savedResults.length === 0,
                    title: "Refresh saved values",
                },
                "Refresh"
            ),
            span({ class: "results-count" }, () => {
                const filteredCount = handlers.getFilteredSavedResults().length;
                const totalCount = ui.savedResults.length;
                if (!ui.savedFilterApplied) {
                    return totalCount + " ITEM" + (totalCount === 1 ? "" : "S");
                }
                return `${filteredCount} / ${totalCount} SHOWN`;
            }),
            div(
                { class: "section-actions" },
                button(
                    {
                        type: "button",
                        class: "btn-danger btn-sm",
                        // Clearing the list is a removal: it asks in place first (#25).
                        onclick: (e) => {
                            const count = ui.savedResults.length;
                            if (
                                !clickAgain(e.currentTarget, `clear all ${count} saved value${count === 1 ? "" : "s"}.`)
                            )
                                return;
                            handlers.clearSavedResults();
                        },
                        disabled: () => ui.savedResults.length === 0,
                        title: "Clear saved list",
                    },
                    "Clear"
                )
            )
        ),
        div(
            { class: "saved-results-content scroll-container" },
            Note(() => ui.savedRefreshError),
            div(
                { class: "list-filter-row" },
                input({
                    type: "text",
                    class: "list-filter-input",
                    placeholder: "Filter saved (path or value)",
                    value: () => ui.savedFilter,
                    oninput: handlers.handleSavedFilterInput,
                    disabled: () => ui.savedResults.length === 0,
                }),
                () =>
                    ui.savedFilter
                        ? button(
                              {
                                  type: "button",
                                  class: "btn-quiet btn-sm",
                                  onclick: handlers.clearSavedFilter,
                                  title: "Clear saved filter",
                              },
                              "Clear"
                          )
                        : null
            ),
            listNode
        )
    );
};
