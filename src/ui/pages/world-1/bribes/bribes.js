import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    oneAtATime,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { clickAgain } from "../../../components/inPlace.js";
import { captureGesture } from "../../../services/changeLog.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;
const STATUS_PATH = "BribeStatus";

/** Edit account-wide bribe ownership without spending coins. */
const BribesTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Bribes" });
    const busy = van.state(false);
    const message = van.state("");
    const bulk = useWriteStatus();
    const rowStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);
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

    // `button`: the bulk button clicked, which asks in place (#77).
    const setAll = (enabled, button) =>
        inTurn(async () => {
            if (cannotWrite()) return;
            // The bulk action starts after a read: keep the button's click, so it's named after and offers Undo all
            // beside the button even if something else was clicked meanwhile.
            const inGesture = captureGesture();
            busy.val = true;
            message.val = "";
            try {
                const values = await readStatuses();
                const targets = entries.filter(
                    (entry) => !entry.readOnly && (enabled ? values[entry.index] !== 1 : values[entry.index] === 1)
                );
                if (!targets.length) return;
                // Enabling adds, so it runs on one click; disabling removes, so it asks in place first (#25).
                if (
                    !enabled &&
                    !clickAgain(
                        button,
                        `${enabled ? "enable" : "disable"} ${targets.length} bribes. ${
                            enabled
                                ? "Grants ownership without spending coins."
                                : "Removes ownership. Locked bribes stay locked."
                        }`,
                        { targets: targets.map((entry) => entry.index) }
                    )
                )
                    return;
                await inGesture(() =>
                    bulk.run(
                        () =>
                            applyWrites(
                                targets.map(({ index }) => ({
                                    index,
                                    path: `${STATUS_PATH}[${index}]`,
                                    value: enabled ? 1 : 0,
                                }))
                            ),
                        { onError: (caughtError) => (message.val = caughtError.message) }
                    )
                );
            } catch (caughtError) {
                message.val = caughtError.message;
            } finally {
                busy.val = false;
            }
        });

    const renderRow = (entry) => {
        const state = rowStates.get(entry.index);
        return AccountRow({
            rowClass: "bribes-row",
            status: state.write.status,
            info: div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, entry.name),
                span({ class: "bribes-row__bonus" }, entry.bonus)
            ),
            controls: entry.readOnly
                ? span({ class: "write-status" }, "Read only")
                : [
                      // Saving and saved, for screen readers; the switch says why a save failed.
                      span({ class: "account-write-feedback", role: "status" }, () => {
                          const status = state.write.status.val;
                          return status === "loading" ? "Saving" : status === "success" ? "Saved" : "";
                      }),
                      StateSwitch({
                          checked: () => state.value.val === 1,
                          words: () =>
                              state.value.val === 1 ? "Owned" : state.value.val === 0 ? "Not owned" : "Locked",
                          name: entry.name,
                          disabled: () => loading.val || Boolean(error.val) || !entries.length,
                          title: () =>
                              state.value.val === 1
                                  ? `Remove ${entry.name}`
                                  : `Own ${entry.name} without spending coins`,
                          onFlip: (owned) => setBribe(entry, owned),
                      }),
                  ],
        });
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
                    bonus: isPlaceholder ? "No bonus. Unpurchasable placeholder." : cleanName(definition[1]),
                    start,
                    count,
                    readOnly: isPlaceholder,
                };
            });
            await readStatuses();
            reconcileRows(JSON.stringify(entries), () => entries.map(renderRow));
            message.val = "";
        });
    };

    load();

    return PersistentAccountListPage({
        rootClass: "bribes-tab tab-container",
        title: "Bribes",
        description:
            "Edit account-wide ownership without spending coins. Enabling an expansion unlocks its next group.",
        wrapActions: false,
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    disabled: cannotWrite,
                    onClick: (e) => setAll(true, e.currentTarget),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: cannotWrite,
                    onClick: (e) => setAll(false, e.currentTarget),
                },
            ],
            refresh: { onClick: load, disabled: isBusy },
        }),
        state: { loading, error },
        loadingText: "Reading bribes",
        errorTitle: "Bribes read failed",
        body: div(
            { class: "scrollable-panel content-stack" },
            div({ class: "write-status write-status--error", role: "alert" }, () => message.val),
            listNode
        ),
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
