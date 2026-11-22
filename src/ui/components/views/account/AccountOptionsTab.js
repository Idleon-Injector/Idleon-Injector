/**
 * Account Options Tab
 * Raw game attribute editor (OptionsListAccount).
 */

import van from "../../../vendor/van-1.6.0.js";
import vanX from "../../../vendor/van-x-0.6.3.js";
import store from "../../../state/store.js";
import { EmptyState } from "../../EmptyState.js";
import { SearchBar } from "../../SearchBar.js";
import { NumberInput } from "../../NumberInput.js";
import { Icons } from "../../../assets/icons.js";
import { withTooltip } from "../../Tooltip.js";
import { RefreshButton } from "./components/AccountPageChrome.js";
import { useAccountLoad } from "./accountLoadPolicy.js";
import { gga } from "../../../services/api.js";
import { createStaticRowReconciler, joinClasses, writeVerified } from "./accountShared.js";
import { SaveState, saveStateClass, useAutoSave } from "./autoSave.js";
import { PersistentAccountListPage } from "./components/PersistentAccountListPage.js";
import { StateSwitch } from "./components/StateSwitch.js";

const { div, input, label, span } = van.tags;

const getOptionType = (rawValue, schema) => schema?.type ?? typeof rawValue;

const valueToDisplay = (type, value) => {
    if (type === "object") return JSON.stringify(value);
    return value;
};

const normalizeForWrite = (type, rawValue) => {
    if (type === "number") {
        const nextValue = Number(rawValue);
        if (String(rawValue).trim() === "") throw new Error("enter a number");
        if (Number.isNaN(nextValue)) throw new Error("not a number");
        return nextValue;
    }
    if (type === "boolean") return rawValue === true;
    if (type === "object") {
        try {
            return JSON.parse(rawValue);
        } catch {
            throw new Error("not valid JSON");
        }
    }
    return rawValue;
};

const createOptionRow = (index, rawValue, schema) => {
    const editorType = van.state(getOptionType(rawValue, schema));
    const currentValue = van.state(valueToDisplay(editorType.val, rawValue));
    const name = van.state(schema?.name ?? "UNDOCUMENTED INDEX");
    const description = van.state(schema?.description ?? null);
    const isAI = van.state(Boolean(schema?.AI));
    const warning = van.state(schema?.warning ?? null);
    let isFocused = false;
    const stored = () => store.data.accountOptions[index];
    const { status, reason, save, handlers, undo } = useAutoSave({
        prepare: () => {
            const nextValue = normalizeForWrite(editorType.val, currentValue.val);
            if (JSON.stringify(nextValue) === JSON.stringify(stored())) return { unchanged: true };
            const path = `OptionsListAccount[${index}]`;
            return {
                write: async () => {
                    try {
                        // An answer can be lost after the game took the value: the read-back says it landed.
                        await writeVerified(path, nextValue, { readBack: true });
                    } catch (error) {
                        // It didn't land: the row shows what the game holds (unread, the last value read) and why.
                        store.data.accountOptions[index] = await gga(path).catch(() => stored());
                        throw error;
                    }
                    store.data.accountOptions[index] = nextValue;
                },
            };
        },
        revert: () => (currentValue.val = valueToDisplay(editorType.val, stored())),
    });

    const syncFromLoadedValue = (nextRawValue, nextSchema) => {
        const nextType = getOptionType(nextRawValue, nextSchema);

        editorType.val = nextType;
        name.val = nextSchema?.name ?? "UNDOCUMENTED INDEX";
        description.val = nextSchema?.description ?? null;
        isAI.val = Boolean(nextSchema?.AI);
        warning.val = nextSchema?.warning ?? null;

        if (!isFocused) {
            currentValue.val = valueToDisplay(nextType, nextRawValue);
        }
    };

    const renderEditor = () => {
        const type = editorType.val;
        if (type === "boolean") {
            return StateSwitch({
                checked: currentValue,
                words: ["On", "Off"],
                name: () => name.val,
                // A save that fails or is refused puts the switch back to what the game holds (the save read it again
                // after a failure). The row's own save state says why, so the switch doesn't.
                onFlip: async (next) => {
                    currentValue.val = next;
                    const outcome = await save();
                    if (!outcome?.ok) currentValue.val = valueToDisplay(editorType.val, stored());
                },
            });
        }

        if (type === "number") {
            return NumberInput({
                class: "option-input",
                value: currentValue,
                oninput: (e) => (currentValue.val = e.target.value),
                onDecrement: () => (currentValue.val = Number(currentValue.val) - 1),
                onIncrement: () => (currentValue.val = Number(currentValue.val) + 1),
            });
        }

        return input({
            type: "text",
            class: "option-input",
            value: currentValue,
            oninput: (e) => (currentValue.val = e.target.value),
        });
    };

    // A value row like the pages' (#26): index and name, its note and warning, then the field at the right edge.
    const node = div(
        {
            class: () =>
                joinClasses(
                    "option-item account-row account-row--value",
                    isAI.val ? "is-ai-option" : "",
                    warning.val ? "has-warning" : "",
                    saveStateClass(status.val, undo)
                ),
            "data-index": index,
            "data-change-label": () => `${name.val} (${index})`,
        },
        div(
            { class: "account-row__info" },
            span({ class: "account-row__index" }, `#${index}`),
            div(
                { class: "account-row__name-group" },
                span(
                    { class: "account-row__name option-label" },
                    () => (isAI.val ? span({ class: "option-ai-label" }, "AI_GEN // ") : span()),
                    () => name.val
                ),
                () => (warning.val ? span({ class: "option-warning" }, Icons.Warning(), ` ${warning.val}`) : span()),
                () => (description.val ? span({ class: "option-description" }, description.val) : span())
            )
        ),
        div(
            {
                class: "account-row__controls option-input-wrapper",
                ...handlers,
                onfocusin: () => {
                    isFocused = true;
                },
                onfocusout: (e) => {
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    isFocused = false;
                    handlers.onfocusout(e);
                },
            },
            SaveState({ status, reason, undo }),
            () => renderEditor()
        )
    );

    syncFromLoadedValue(rawValue, schema);
    return { node, syncFromLoadedValue };
};

export const AccountOptionsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Account options" });
    const ui = vanX.reactive({
        filterText: "",
        hideAI: false,
    });
    const rowCache = new Map();
    const optionsListNode = div({ class: "scrollable-panel" });
    const reconcileOptionRows = createStaticRowReconciler(optionsListNode);

    const getOptionRow = (index, rawValue, schema) => {
        if (!rowCache.has(index)) rowCache.set(index, createOptionRow(index, rawValue, schema));
        const row = rowCache.get(index);
        row.syncFromLoadedValue(rawValue, schema);
        return row;
    };

    const reconcileVisibleRows = () => {
        const data = store.data.accountOptions;
        const schema = store.data.accountSchema;
        const term = ui.filterText.toLowerCase();
        const visibleRows = [];
        const visibleIndexes = [];

        for (let index = 0; index < data.length; index++) {
            const rawValue = data[index];
            const optionSchema = schema[index];

            if (ui.hideAI && optionSchema?.AI) continue;
            if (term) {
                const optionName = (optionSchema?.name ?? `UNDOCUMENTED ${index}`).toLowerCase();
                if (!optionName.includes(term) && !String(index).includes(term)) continue;
            }

            visibleRows.push(getOptionRow(index, rawValue, optionSchema).node);
            visibleIndexes.push(index);
        }

        reconcileOptionRows(
            visibleIndexes.join("|"),
            visibleRows.length
                ? visibleRows
                : [
                      EmptyState({
                          title: "NO OPTIONS MATCH",
                          subtitle: "Adjust your filter or search term",
                      }),
                  ]
        );
    };

    const loadAccountOptions = async () => {
        await run(async () => {
            await store.loadAccountOptions();
            reconcileVisibleRows();
        });
    };

    van.derive(reconcileVisibleRows);
    loadAccountOptions();

    return PersistentAccountListPage({
        rootClass: "tab-container",
        title: "ACCOUNT OPTIONS",
        description: "Raw OptionsListAccount editor. Writes bypass normal in-game safety checks.",
        actions: RefreshButton({
            onRefresh: loadAccountOptions,
            tooltip: "Reload from game memory",
        }),
        toolbar: [
            SearchBar({
                placeholder: "FILTER_INDEX",
                onInput: (val) => (ui.filterText = val),
            }),
            withTooltip(
                label(
                    { class: "toggle-switch account-toggle" },
                    input({
                        type: "checkbox",
                        checked: () => ui.hideAI,
                        onchange: (e) => (ui.hideAI = e.target.checked),
                    }),
                    span({ class: "slider" }),
                    span({ class: "label" }, "HIDE AI")
                ),
                "Hide AI-generated options"
            ),
        ],
        state: { loading, error },
        loadingText: "READING ACCOUNT OPTIONS",
        errorTitle: "ACCOUNT OPTIONS READ FAILED",
        body: optionsListNode,
    });
};
