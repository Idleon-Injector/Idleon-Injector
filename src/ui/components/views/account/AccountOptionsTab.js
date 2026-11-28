/**
 * Account Options Tab
 * Raw game attribute editor (OptionsListAccount).
 */

import van from "../../../vendor/van-1.6.0.js";
import store from "../../../state/store.js";
import { NumberInput } from "../../NumberInput.js";
import { RefreshButton } from "./components/AccountPageChrome.js";
import { RowTitles } from "./components/AccountRow.js";
import { useAccountLoad } from "./accountLoadPolicy.js";
import { gga } from "../../../services/api.js";
import { createStaticRowReconciler, joinClasses, writeVerified } from "./accountShared.js";
import { SaveState, saveStateClass, useAutoSave } from "./autoSave.js";
import { PersistentAccountListPage } from "./components/PersistentAccountListPage.js";
import { StateSwitch } from "./components/StateSwitch.js";
import { ListPanel } from "./tabShared.js";
// The note the menu's search finds a slot by too.
import { optionNote as noteOf } from "../../../menu/menuModel.js";

const { div, input, label, span } = van.tags;

/** The slot the menu's search last opened this page for: it shows even with Hide AI guesses on, until that is flipped. */
export const pickedSlot = van.state(null);

// A slot the list doesn't name yet.
const UNKNOWN = "Unknown option";

const getOptionType = (rawValue, schema) => schema?.type ?? typeof rawValue;

const valueToDisplay = (type, value) => {
    if (type === "object") return JSON.stringify(value);
    return value;
};

const normalizeForWrite = (type, rawValue) => {
    if (type === "number") {
        const nextValue = Number(rawValue);
        if (String(rawValue).trim() === "") throw new Error("enter a number");
        if (!Number.isFinite(nextValue)) throw new Error("not a number");
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
    const name = van.state(schema?.name ?? UNKNOWN);
    const note = van.state(noteOf(schema));
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
                        await writeVerified(path, nextValue);
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
        name.val = nextSchema?.name ?? UNKNOWN;
        note.val = noteOf(nextSchema);
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
                // Big values come in short forms like 5e50; the save checks the typed text.
                mode: "any",
                "aria-label": () => name.val,
                value: currentValue,
                oninput: (e) => (currentValue.val = e.target.value),
                onDecrement: () => (currentValue.val = Number(currentValue.val) - 1),
                onIncrement: () => (currentValue.val = Number(currentValue.val) + 1),
            });
        }

        // Text (a guild name, a list of ids) sits in the number field's shape, without − / +, so it rests the same way.
        return div(
            { class: "number-input-wrapper option-text" },
            input({
                type: "text",
                // Text, not a number: the Fields check lets a text field through by this mark.
                "data-name-field": "",
                "aria-label": () => name.val,
                value: currentValue,
                oninput: (e) => (currentValue.val = e.target.value),
            })
        );
    };

    // A shared value row (#26): its slot quiet before the name, what it does under it, then the field at the right edge.
    const node = div(
        {
            class: () => joinClasses("option-item account-row account-row--value", saveStateClass(status.val, undo)),
            "data-index": index,
            "data-change-label": () => `${name.val} (${index})`,
        },
        div(
            { class: "account-row__info" },
            span({ class: "account-row__index" }, `#${index}`),
            RowTitles({ name: () => name.val, note: () => note.val, warning: () => warning.val })
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
    // Off at start: every slot shows. The top bar's search does the rest.
    const hideAI = van.state(false);
    const rowCache = new Map();
    const optionsListNode = div();
    const reconcileOptionRows = createStaticRowReconciler(optionsListNode);
    const shownCount = van.state(0);

    const getOptionRow = (index, rawValue, schema) => {
        if (!rowCache.has(index)) rowCache.set(index, createOptionRow(index, rawValue, schema));
        const row = rowCache.get(index);
        row.syncFromLoadedValue(rawValue, schema);
        return row;
    };

    const reconcileVisibleRows = () => {
        const data = store.data.accountOptions;
        const schema = store.data.accountSchema;
        const visibleRows = [];
        const visibleIndexes = [];

        for (let index = 0; index < data.length; index++) {
            const rawValue = data[index];
            const optionSchema = schema[index];

            if (hideAI.val && optionSchema?.AI && index !== pickedSlot.val) continue;

            visibleRows.push(getOptionRow(index, rawValue, optionSchema).node);
            visibleIndexes.push(index);
        }

        reconcileOptionRows(visibleIndexes.join("|"), visibleRows);
        shownCount.val = visibleRows.length;
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
        rootClass: "tab-container scroll-container",
        title: "Account Options",
        description: "The game's account options, slot by slot. A value goes in as typed; the game doesn't check it.",
        actions: RefreshButton({ onRefresh: loadAccountOptions }),
        toolbar: [
            label(
                { class: "toggle-switch account-toggle" },
                input({
                    type: "checkbox",
                    checked: hideAI,
                    onchange: (e) => {
                        pickedSlot.val = null;
                        hideAI.val = e.target.checked;
                    },
                }),
                span({ class: "slider" }),
                span({ class: "label" }, "Hide AI guesses")
            ),
        ],
        state: { loading, error },
        loadingText: "Reading account options",
        errorTitle: "Couldn't read account options",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: optionsListNode,
                empty: () => (loading.val || shownCount.val ? null : "No account options found"),
            })
        ),
    });
};
