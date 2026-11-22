import van from "../../../vendor/van-1.6.0.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { cleanName, createStaticRowReconciler, oneAtATime, useWriteStatus, writeVerified } from "./accountShared.js";
import { AccountRow } from "./components/AccountRow.js";
import { ActionButton } from "./components/ActionButton.js";
import { StateSwitch } from "./components/StateSwitch.js";
import { EmptyState } from "../../EmptyState.js";

const { div, input, label: labelTag, span } = van.tags;

/**
 * One of the Slab page's tabs (the Slab's registrations, the Greenstacks): every item of the game's catalogue in its
 * order, each with a switch. The top bar's search finds items by name; "Missing only" (off at the start), its filter,
 * hides the ones already in. Its tools act on the items shown: adding runs on one press, taking away asks.
 *
 * @param {object} opts
 * @param {string} opts.label "Slab" or "Greenstack", for the load's messages
 * @param {string} opts.historyPath the game's list of items in (Cards[1], GreenStacks)
 * @param {() => boolean} opts.pending true while the page reads the game, or after a read that failed
 * @param {() => Promise<*>} opts.reload reads the whole page again
 * @returns {{content: *, filter: *, load: () => Promise<void>, busy: () => boolean, tools: Function,
 *   toolsLabel: () => string}}
 */
export const ItemRegistrationPart = ({ label, historyPath, pending, reload }) => {
    const bulk = useWriteStatus();
    const entries = van.state([]);
    const missingOnly = van.state(false);
    const rowStates = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    // The game's words for an item's state, and for the tools.
    const greenstack = historyPath === "GreenStacks";
    const onWord = greenstack ? "Greenstacked" : "Registered";
    const [addAll, removeAll, removeVerb] = greenstack
        ? ["Greenstack all", "Clear all", "Clear"]
        : ["Register all", "Unregister all", "Unregister"];

    const readPending = () => pending() || !entries.val.length;

    const updateHistory = (history) => {
        const registered = new Set(history);
        for (const itemId of entries.val) {
            const state = rowStates.get(itemId);
            if (state) state.registered.val = registered.has(itemId);
        }
    };

    const readHistory = async () => {
        const raw = await gga(historyPath);
        if (raw === null || raw === undefined) throw new Error(`Couldn't read the ${label} list. Refresh.`);
        if (greenstack && !Array.isArray(raw)) throw new Error("The Greenstack list looks wrong. Refresh.");
        const history = greenstack
            ? raw
            : toIndexedArray(raw)
                  .map((itemId) => String(itemId ?? "").trim())
                  .filter((itemId) => itemId.length > 0);
        updateHistory(history);
        return history;
    };

    const applyHistory = async (history, targets, registered) => {
        const targetIds = new Set(targets);
        const historySet = new Set(history);
        const next = registered
            ? history.concat(targets.filter((itemId) => !historySet.has(itemId)))
            : history.filter((itemId) => !targetIds.has(itemId));
        if (next.length === history.length) return { cancelled: true };
        try {
            await writeVerified(historyPath, next);
            updateHistory(next);
        } catch (caughtError) {
            // One value (the whole history): it landed or it didn't, and reading it again says which.
            const now = new Set(await readHistory().catch(() => Promise.reject(new Error("Not checked. Refresh."))));
            if (targets.every((itemId) => now.has(itemId) === registered)) return undefined;
            throw caughtError;
        }
    };

    // A switch flipped while another write runs waits its turn (and reads the game again then), so it isn't lost.
    const inTurn = oneAtATime();
    const setItem = (itemId, registered) =>
        inTurn(() =>
            rowStates.get(itemId).write.run(async () => applyHistory(await readHistory(), [itemId], registered))
        );

    // What the list shows: every item, or the missing ones with Missing only. The top bar's search does the rest.
    const isShown = (itemId) => !missingOnly.val || !rowStates.get(itemId)?.registered.val;

    const createRow = (itemId, state) => {
        const row = AccountRow({
            rowClass: "item-registration-row",
            status: state.write.status,
            info: span({ class: "account-row__name" }, () => state.name.val),
            controls: [
                // Saving and saved, for screen readers; the switch says why a save failed.
                span({ class: "account-write-feedback", role: "status", "aria-live": "polite" }, () => {
                    const status = state.write.status.val;
                    return status === "loading" ? "Saving" : status === "success" ? "Saved" : "";
                }),
                StateSwitch({
                    checked: state.registered,
                    words: [onWord, ""],
                    name: () => state.name.val,
                    disabled: readPending,
                    onFlip: (registered) => setItem(itemId, registered),
                }),
            ],
        });
        state.row = row;
        // A row saving stays put while Missing only would hide it, so its ✓ and Undo can show.
        return div({ hidden: () => !isShown(itemId) && !state.write.status.val }, row);
    };

    const load = async () => {
        const catalog = toIndexedArray((await readCList("SlabItemSort")) ?? [])
            .map((itemId) => String(itemId ?? "").trim())
            .filter((itemId) => itemId.length > 0);
        if (!catalog.length) throw new Error(`Couldn't read the ${label} items.`);
        const itemIds = [...new Set(catalog)];
        const definitions = await readGgaEntries("ItemDefinitionsGET.h", itemIds, ["displayName"]);
        for (const itemId of itemIds) {
            const name = cleanName(definitions[itemId]?.displayName, itemId);
            if (!rowStates.has(itemId))
                rowStates.set(itemId, {
                    name: van.state(name),
                    registered: van.state(false),
                    write: useWriteStatus(),
                    node: null,
                });
            else rowStates.get(itemId).name.val = name;
        }
        entries.val = itemIds;
        await readHistory();
        reconcileRows(itemIds.join("|"), () =>
            itemIds.map((itemId) => {
                const state = rowStates.get(itemId);
                if (!state.node) state.node = createRow(itemId, state);
                return state.node;
            })
        );
        const catalogIds = new Set(itemIds);
        for (const [itemId, state] of rowStates) {
            if (!catalogIds.has(itemId)) {
                state.write.clearStatus();
                rowStates.delete(itemId);
            }
        }
    };

    // The items the tools act on: the ones the list shows now.
    const shown = () => entries.val.filter((itemId) => isShown(itemId) && shownBySearch(rowStates.get(itemId)?.row));
    const itemWord = (n) => `item${n === 1 ? "" : "s"}`;

    const setShown = async (targets, registered) => {
        const result = await bulk.run(() =>
            inTurn(async () => {
                const history = await readHistory();
                const need = targets.filter((itemId) => rowStates.get(itemId)?.registered.val !== registered);
                return need.length ? applyHistory(history, need, registered) : { cancelled: true };
            })
        );
        if (!result.ok && !result.cancelled) await reload();
    };

    const tools = (ask) => {
        const remove = ActionButton({
            label: removeAll,
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().some((itemId) => rowStates.get(itemId).registered.val),
            onClick: (e) => {
                e.preventDefault();
                const targets = shown().filter((itemId) => rowStates.get(itemId).registered.val);
                const n = targets.length;
                ask({
                    question: `${removeVerb} ${n} ${itemWord(n)}?`,
                    confirmLabel: n === 1 ? `${removeVerb} it` : `${removeVerb} them`,
                    from: remove,
                    onConfirm: () => setShown(targets, false),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: addAll,
                status: bulk.status,
                disabled: () => readPending() || !shown().some((itemId) => !rowStates.get(itemId).registered.val),
                onClick: (e) => {
                    e.preventDefault();
                    return setShown(shown(), true);
                },
            }),
            remove
        );
    };

    return {
        content: [
            listNode,
            div(
                { hidden: () => !entries.val.length || entries.val.some(isShown) },
                EmptyState({ title: "Nothing missing", subtitle: "Every item is in." })
            ),
        ],
        // The tab's filter, for the line under the page's title.
        filter: labelTag(
            { class: "toggle-switch account-toggle" },
            input({
                type: "checkbox",
                checked: () => missingOnly.val,
                onchange: (e) => (missingOnly.val = e.target.checked),
            }),
            span({ class: "slider" }),
            span({ class: "label" }, "Missing only")
        ),
        load,
        busy: () => bulk.status.val === "loading",
        tools,
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() || missingOnly.val ? `${n} shown ${itemWord(n)}` : `All ${n} ${itemWord(n)}`;
        },
    };
};
