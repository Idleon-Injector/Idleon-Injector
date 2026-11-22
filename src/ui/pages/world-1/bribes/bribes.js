import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    oneAtATime,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { captureGesture } from "../../../services/changeLog.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;
const STATUS_PATH = "BribeStatus";

/**
 * Bribe ownership across the account, without spending coins. The game's sets are tabs: a set's last bribe is its
 * expansion, which unlocks the next set (BribeStatus: 1 owned, 0 not owned, -1 locked). A row is the bribe's bonus, its
 * name under it, and a switch that says "Owned" when on and "Locked" while its set is locked.
 */
const BribesTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Bribes" });
    const busy = van.state(false);
    const message = van.state("");
    const bulk = useWriteStatus();
    const rowStates = new Map();
    let entries = [];

    const isBusy = () => loading.val || busy.val;
    const cannotWrite = () => isBusy() || Boolean(error.val) || !entries.length;

    const readStatuses = async () => {
        const raw = await gga(STATUS_PATH);
        if (raw === null || raw === undefined) {
            throw new Error("Bribe ownership data is unavailable. Refresh to try again.");
        }
        const values = toIndexedArray(raw).map(Number);
        const resolvedValues = [];
        for (const entry of entries) {
            const val = values[entry.index] ?? -1;
            if (![-1, 0, 1].includes(val)) {
                throw new Error("Bribe ownership data is unavailable or invalid. Refresh to try again.");
            }
            resolvedValues[entry.index] = val;
            rowStates.get(entry.index).value.val = val;
        }
        return resolvedValues;
    };

    const applyWrites = async (writes) => {
        if (!writes.length) return;
        try {
            await writeManyVerified(writes);
            for (const { index, value } of writes) rowStates.get(index).value.val = value;
        } catch (caughtError) {
            try {
                await readStatuses();
            } catch (readError) {
                error.val = readError.message;
            }
            // One value either landed or didn't; of several, some may have.
            throw writes.length > 1 ? new Error(`Some changes may have applied. ${caughtError.message}`) : caughtError;
        }
    };

    // A switch flipped while another write runs waits its turn (and reads the game again then), so it isn't lost.
    const inTurn = oneAtATime();

    // Returns the row's save outcome, so the switch can say why a save failed.
    const setBribe = (entry, enabled) =>
        inTurn(async () => {
            if (cannotWrite() || entry.readOnly) return;
            busy.val = true;
            message.val = "";
            try {
                return await rowStates.get(entry.index).write.run(
                    async () => {
                        const values = await readStatuses();
                        const writes = [];
                        const addWrite = (index, value) =>
                            writes.push({ index, path: `${STATUS_PATH}[${index}]`, value });
                        if (enabled) {
                            if (values[entry.index] === 1) return { cancelled: true };
                            addWrite(entry.index, 1);
                            for (let index = entry.start; index < entry.start + entry.count; index++) {
                                if (values[index] === -1) addWrite(index, 0);
                            }
                        } else {
                            if (values[entry.index] !== 1) return { cancelled: true };
                            addWrite(entry.index, 0);
                        }
                        await applyWrites(writes);
                    }
                    // The switch says why a row's save failed.
                );
            } finally {
                busy.val = false;
            }
        });

    // A set's bribes the tools act on: the buyable ones, or the ones the top bar's search shows.
    const rowOf = new Map();
    const inSet = (set) =>
        (set?.entries ?? []).filter((entry) => !entry.readOnly && shownBySearch(rowOf.get(entry.index)));
    const ownedIn = (set) => inSet(set).filter((entry) => rowStates.get(entry.index).value.val === 1);
    const bribeWord = (n) => `bribe${n === 1 ? "" : "s"}`;

    // Enabling adds, so it runs on one press; disabling takes away, so the tray asks first.
    const setAll = (enabled, set) =>
        inTurn(async () => {
            if (cannotWrite()) return;
            // The bulk action starts after a read: keep the press, so it's named after and offers Undo all beside the
            // button even if something else was clicked meanwhile.
            const inGesture = captureGesture();
            // The bribes shown at the press: a search typed while the game is read doesn't change them.
            const shown = inSet(set);
            busy.val = true;
            message.val = "";
            try {
                const values = await readStatuses();
                const targets = shown.filter((entry) =>
                    enabled ? values[entry.index] !== 1 : values[entry.index] === 1
                );
                if (!targets.length) return;
                const writes = targets.map(({ index }) => ({
                    index,
                    path: `${STATUS_PATH}[${index}]`,
                    value: enabled ? 1 : 0,
                }));
                // Owning a set's expansion unlocks the next set's locked bribes, as its own switch does.
                if (enabled) {
                    for (const entry of targets) {
                        for (let index = entry.start; index < entry.start + entry.count; index++) {
                            if (values[index] === -1 && !writes.some((write) => write.index === index)) {
                                writes.push({ index, path: `${STATUS_PATH}[${index}]`, value: 0 });
                            }
                        }
                    }
                }
                await inGesture(() =>
                    bulk.run(() => applyWrites(writes), {
                        onError: (caughtError) => (message.val = caughtError.message),
                    })
                );
            } catch (caughtError) {
                message.val = caughtError.message;
            } finally {
                busy.val = false;
            }
        });

    const renderRow = (entry) => {
        const state = rowStates.get(entry.index);
        const row = AccountRow({
            rowClass: "bribes-row",
            status: state.write.status,
            info: RowTitles({ bonus: entry.bonus, name: entry.name }),
            controls: entry.readOnly
                ? span({ class: "bribes-row__note" }, "Can't be bought")
                : [
                      // Saving and saved, for screen readers; the switch says why a save failed.
                      span({ class: "account-write-feedback", role: "status" }, () => {
                          const status = state.write.status.val;
                          return status === "loading" ? "Saving…" : status === "success" ? "Saved" : "";
                      }),
                      StateSwitch({
                          checked: () => state.value.val === 1,
                          // Only an owned bribe says so; a locked one says why it isn't on.
                          words: () => (state.value.val === 1 ? "Owned" : state.value.val === -1 ? "Locked" : ""),
                          name: entry.name,
                          disabled: () => loading.val || Boolean(error.val) || !entries.length,
                          onFlip: (owned) => setBribe(entry, owned),
                      }),
                  ],
        });
        rowOf.set(entry.index, row);
        return row;
    };

    // The game's sets: the first starts at bribe 0, and each expansion's set starts where the expansion says.
    const setsOf = (list) => {
        const starts = [0, ...list.filter((entry) => entry.count > 0).map((entry) => entry.start)];
        return starts
            .map((first, at) => ({
                label: `Set ${at + 1}`,
                entries: list.filter(
                    (entry) => entry.index >= first && (at + 1 >= starts.length || entry.index < starts[at + 1])
                ),
            }))
            .filter((set) => set.entries.length);
    };
    let sets = [];
    const setOf = (activeId) => sets.find((set) => set.label === activeId.val);

    const tools = (activeId, ask) => {
        // A bribe enabled while it asks is one more to disable, so it asks again; with none left it does nothing.
        const askDisable = (set) => {
            const n = ownedIn(set).length;
            if (!n) return;
            ask({
                question: `Disable ${n} ${bribeWord(n)} in ${set.label}?`,
                confirmLabel: n === 1 ? "Disable it" : "Disable them",
                from: disableButton,
                lowers: () => ownedIn(set).map((entry) => entry.index),
                again: () => askDisable(set),
                onConfirm: () => setAll(false, set),
            });
        };
        const disableButton = ActionButton({
            label: "Disable all",
            status: bulk.status,
            variant: "danger",
            disabled: () => cannotWrite() || !ownedIn(setOf(activeId)).length,
            onClick: (e) => {
                e.preventDefault();
                askDisable(setOf(activeId));
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Enable all",
                status: bulk.status,
                disabled: () => cannotWrite() || ownedIn(setOf(activeId)).length === inSet(setOf(activeId)).length,
                onClick: (e) => {
                    e.preventDefault();
                    void setAll(true, setOf(activeId));
                },
            }),
            disableButton
        );
    };

    // The tabs are the game's sets, built once read, and again only when the bribes change.
    const panelHost = div({ class: "account-list account-list--tabbed" });
    let panelKey = null;
    const renderPanel = () => {
        const key = JSON.stringify(entries);
        if (key === panelKey) return;
        panelKey = key;
        rowOf.clear();
        sets = setsOf(entries);
        panelHost.replaceChildren(
            TabbedList({
                name: "Bribes",
                tabs: sets.map((set) => ({ id: set.label, label: set.label, content: set.entries.map(renderRow) })),
                tools,
                toolsLabel: (activeId) => {
                    const set = setOf(activeId);
                    const n = inSet(set).length;
                    return isSearching()
                        ? `${n} matching ${bribeWord(n)} in ${set?.label ?? ""}`
                        : `All ${n} ${bribeWord(n)} in ${set?.label ?? ""}`;
                },
            })
        );
    };

    const load = () => {
        if (busy.val) return;
        return runLoad(async () => {
            const definitions = toIndexedArray(await readCList("BribeDescriptions"));
            if (!definitions.length) throw new Error("Bribe definitions are unavailable.");
            entries = definitions.map((raw, index) => {
                const definition = toIndexedArray(raw);
                const expansion = definition[4] === "BribeExpansion";
                let [start, count] = expansion
                    ? String(definition[5] ?? "")
                          .split("&")
                          .map(Number)
                    : [0, 0];
                const validExpansion =
                    expansion &&
                    Number.isInteger(start) &&
                    Number.isInteger(count) &&
                    count >= 0 &&
                    (count === 0 || (start >= 0 && start + count <= definitions.length));

                const isPlaceholder = expansion && (!validExpansion || count === 0);
                if (!validExpansion) {
                    start = 0;
                    count = 0;
                }
                if (!rowStates.has(index)) rowStates.set(index, { value: van.state(-1), write: useWriteStatus() });
                return {
                    index,
                    name: cleanName(definition[0], `Bribe ${index + 1}`),
                    bonus: cleanName(definition[1]),
                    start,
                    count,
                    readOnly: isPlaceholder,
                };
            });
            await readStatuses();
            renderPanel();
            message.val = "";
        });
    };

    load();

    return PersistentAccountListPage({
        rootClass: "bribes-tab tab-container",
        title: "Bribes",
        description: "Own bribes without spending coins. An expansion unlocks the next set.",
        actions: RefreshButton({ onRefresh: load, disabled: isBusy }),
        // Always a node: a binding that returns nothing is dropped for good, and a later failure couldn't show.
        topNotices: () => div(message.val ? WarningBanner(span({ role: "alert" }, message.val)) : null),
        state: { loading, error },
        loadingText: "Reading bribes",
        errorTitle: "Couldn't read bribes",
        initialWrapperClass: "account-list",
        body: panelHost,
    });
};

export default definePage({
    id: "w1.bribes",
    world: 1,
    system: "Bribes",
    description: "Which bribes are owned, and bribe expansions.",
    keywords: ["Expansions"],
    component: BribesTab,
});
