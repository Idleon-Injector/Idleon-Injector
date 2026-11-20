import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { fetchCheatStates, gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { NumberInput } from "../../../components/NumberInput.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;
const PROGRESS_PATH = "OptionsListAccount[369]";
const ENTRIES_PATH = "OptionsListAccount[370]";
const CACHE_PATH = "DNSM.h.EmperorBon";
// Above 1617 completed showdowns, the next fight's base HP becomes Infinity.
const PROGRESS_LIMIT = 1617;

const baseRewards = (progress, metadata) => {
    const totals = metadata.amounts.map(() => 0);
    for (let index = 0; index < progress; index++) {
        const reward = metadata.mapping[index % metadata.mapping.length];
        totals[reward] += metadata.amounts[reward];
    }
    return totals;
};

const rewardText = (template, amount) => {
    const mult = Math.round((1 + amount / 100) * 10000) / 10000;
    return cleanName(
        template
            .replace(/}/g, String(mult))
            .replace(/{/g, String(amount))
            .replace(/\$/g, String(amount === 0 ? 0 : Math.floor(((amount + 4) / (amount + 100)) * 1000) / 10))
    );
};

// Short reasons: they show beside the field.
const wholeNumber = (raw, max) => {
    const value = Number(raw);
    if (raw === null || raw === undefined || String(raw).trim() === "") throw new Error("enter a number");
    if (!Number.isSafeInteger(value)) throw new Error("whole numbers only");
    if (value < 0) throw new Error("min 0");
    if (value > max) throw new Error(`max ${max}`);
    return value;
};

/** Edit Emperor progress and stored entries, with locally derived base rewards. */
const EmperorTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Emperor" });
    const busy = van.state(false);
    const snapshot = van.state(null);
    const message = van.state("");
    const progressDraft = van.state("0");
    const entriesDraft = van.state("0");
    // Typed values save on Enter or on leaving the field (useAutoSave); RESET and REFILL save at once.
    const progressWrite = useAutoSave({
        prepare: () => ({ write: () => saveProgress() }),
        revert: () => (progressDraft.val = String(snapshot.val?.progress ?? progressDraft.val)),
    });
    const entriesWrite = useAutoSave({
        prepare: () => ({ write: () => saveEntries() }),
        revert: () => (entriesDraft.val = String(snapshot.val?.remaining ?? entriesDraft.val)),
    });
    const rewardList = div({ class: "account-item-stack" });
    const reconcileRewards = createStaticRowReconciler(rewardList);

    const isBusy = () => loading.val || busy.val;
    const cannotWrite = () => isBusy() || Boolean(error.val) || !snapshot.val;
    const cannotWriteEntries = () => cannotWrite() || snapshot.val.cheatEnabled;
    // Buttons stay enabled while a save runs (the save checks again), so Tab onto them never loses focus.
    const cannotEdit = () => Boolean(error.val) || !snapshot.val;
    const cacheMatches = (current) =>
        current.cache.length === current.baseRewards.length &&
        current.baseRewards.every((value, index) => current.cache[index] === value);

    const readSnapshot = async () => {
        const [rawProgress, rawCounter, rawMetadata, rawCapacity, rawDaily, cheats, rawCache] = await Promise.all([
            gga(PROGRESS_PATH),
            gga(ENTRIES_PATH),
            readCList("EmperorBon"),
            readComputed("thingies", "MaxEmperorAttemptStack", [0, 0]),
            readComputed("thingies", "DailyEmperorTries", [0, 0]),
            fetchCheatStates(),
            gga(CACHE_PATH),
        ]);
        const progress = Number(rawProgress);
        const counter = Number(rawCounter);
        const capacity = Number(rawCapacity) + 1;
        const daily = Number(rawDaily);
        const definitions = toIndexedArray(rawMetadata);
        const metadata = {
            descriptions: toIndexedArray(definitions[0]),
            amounts: toIndexedArray(definitions[1]).map(Number),
            mapping: toIndexedArray(definitions[2]).map(Number),
        };
        if (
            rawProgress === null ||
            rawProgress === undefined ||
            String(rawProgress).trim() === "" ||
            !Number.isSafeInteger(progress) ||
            progress < 0
        ) {
            throw new Error("Completed showdowns is unavailable or invalid. Refresh to retry.");
        }
        if (
            [rawCounter, rawCapacity, rawDaily].some(
                (value) => value === null || value === undefined || String(value).trim() === ""
            ) ||
            !Number.isSafeInteger(counter) ||
            !Number.isSafeInteger(capacity) ||
            capacity < 1 ||
            !Number.isSafeInteger(daily) ||
            daily < 0 ||
            typeof cheats?.data?.w6?.emperor !== "boolean"
        ) {
            throw new Error(
                "Emperor entries, natural capacity, replenishment or cheat state is unavailable. Refresh to retry."
            );
        }
        if (
            metadata.descriptions.length !== 12 ||
            metadata.descriptions.some((value) => typeof value !== "string") ||
            metadata.amounts.length !== 12 ||
            metadata.amounts.some((value) => !Number.isFinite(value) || value < 0) ||
            metadata.mapping.length !== 48 ||
            metadata.mapping.some((value) => !Number.isInteger(value) || value < 0 || value >= 12)
        ) {
            throw new Error("Emperor reward definitions are unavailable or invalid. Refresh to retry.");
        }
        const rewards = baseRewards(progress, metadata);
        return {
            progress,
            counter,
            remaining: 1 - counter,
            capacity,
            daily,
            cheatEnabled: cheats.data.w6.emperor,
            metadata,
            baseRewards: rewards,
            cache: toIndexedArray(rawCache).map(Number),
        };
    };

    const showSnapshot = (current, syncInputs = false, savedRow = null) => {
        snapshot.val = current;
        if (savedRow === "progress") progressDraft.val = String(current.progress);
        if (savedRow === "entries") entriesDraft.val = String(current.remaining);
        if (syncInputs) {
            if (!progressInput.contains(document.activeElement)) progressDraft.val = String(current.progress);
            if (!entriesInput.contains(document.activeElement)) entriesDraft.val = String(current.remaining);
        }
        reconcileRewards(JSON.stringify(current.metadata), () =>
            current.metadata.descriptions.map((description, index) =>
                AccountRow({
                    info: div(
                        { class: "account-row__name-group" },
                        span(
                            { class: "account-row__name" },
                            cleanName(description).replace(/^(\}x|\$%|\+\{%?)\s*/, "")
                        ),
                        span(
                            { class: "account-row__sub-label" },
                            cleanName(description).includes("something World 7ish")
                                ? `World 7 placeholder, slot ${index + 1}`
                                : index === 11
                                  ? "Listed in reward metadata; effect unconfirmed"
                                  : "Base reward before external modifiers"
                        )
                    ),
                    badge: () => {
                        const active = snapshot.val;
                        if (!active) return "—";
                        const match = cleanName(description).match(/^(\}x|\$%|\+\{%?)/);
                        return match
                            ? rewardText(match[1], active.baseRewards[index])
                            : `+${active.baseRewards[index]}`;
                    },
                })
            )
        );
    };

    const recoverWrite = async (caughtError, writesStarted, label) => {
        try {
            const actual = await readSnapshot();
            showSnapshot(actual);
            message.val = writesStarted
                ? `${label} was not fully verified. Current progress: ${actual.progress}; entries: ${actual.cheatEnabled ? "masked by the cheat, stored count unavailable" : `${actual.remaining}/${actual.capacity}`}; base reward cache ${cacheMatches(actual) ? "matches progress" : "is out of sync"}. Some changes may have applied. ${caughtError.message}`
                : caughtError.message;
        } catch (readError) {
            error.val = readError.message;
            message.val = writesStarted
                ? `${label} may have partially applied. Current values could not be read. Refresh before another edit. ${caughtError.message}`
                : caughtError.message;
        }
    };

    // Each save returns { cancelled: true } when there's nothing to write, and throws when it fails.
    const saveProgress = async (reset = false) => {
        if (cannotWrite()) return { cancelled: true };
        busy.val = true;
        message.val = "";
        let writesStarted = false;
        try {
            const next = reset ? 0 : wholeNumber(progressDraft.val, PROGRESS_LIMIT);
            const before = await readSnapshot();
            showSnapshot(before);
            let fresh = before;
            // The same count saves again only to repair a base reward cache that's out of sync.
            if (next === before.progress && cacheMatches(before)) {
                progressDraft.val = String(before.progress);
                return { cancelled: true };
            }
            if (
                next < before.progress &&
                !window.confirm(
                    `Decrease completed showdowns from ${before.progress} to ${next}? This removes the base rewards from ${before.progress - next} showdowns and makes those showdowns eligible again. It grants no fight loot.`
                )
            ) {
                progressDraft.val = String(before.progress);
                return { cancelled: true };
            }
            if (next < before.progress) {
                fresh = await readSnapshot();
                showSnapshot(fresh);
            }
            if (
                fresh.progress !== before.progress ||
                JSON.stringify(fresh.metadata) !== JSON.stringify(before.metadata)
            ) {
                throw new Error(
                    "Emperor progress or reward definitions changed during this edit. Review the fresh values and retry."
                );
            }
            const totals = baseRewards(next, fresh.metadata);
            writesStarted = true;
            await writeVerified(PROGRESS_PATH, next);
            await writeVerified(CACHE_PATH, totals);
            const actual = await readSnapshot();
            if (actual.progress !== next || !cacheMatches(actual)) {
                showSnapshot(actual);
                throw new Error("Progress or base rewards changed while saving. Refresh and retry.");
            }
            showSnapshot(actual, false, "progress");
        } catch (caughtError) {
            await recoverWrite(caughtError, writesStarted, "Progress and base rewards");
            throw caughtError;
        } finally {
            busy.val = false;
        }
    };

    const saveEntries = async (refill = false) => {
        if (cannotWriteEntries()) return { cancelled: true };
        busy.val = true;
        message.val = "";
        let writesStarted = false;
        try {
            const raw = entriesDraft.val;
            const fresh = await readSnapshot();
            showSnapshot(fresh);
            if (fresh.cheatEnabled) throw new Error("Disable the w6 emperor cheat before editing stored entries.");
            if (!refill && String(raw).trim() !== "" && Number(raw) === fresh.remaining) return { cancelled: true };
            const next = refill ? fresh.capacity : wholeNumber(raw, fresh.capacity);
            if (refill && fresh.remaining >= fresh.capacity) {
                message.val = "Entries are already at or above natural capacity.";
                return { cancelled: true };
            }
            if (next === fresh.remaining) return { cancelled: true };
            writesStarted = true;
            await writeVerified(ENTRIES_PATH, 1 - next);
            const actual = await readSnapshot();
            if (actual.cheatEnabled || actual.remaining !== next || actual.capacity !== fresh.capacity) {
                showSnapshot(actual);
                throw new Error("Entries, capacity or the cheat state changed while saving. Refresh and retry.");
            }
            showSnapshot(actual, false, "entries");
        } catch (caughtError) {
            await recoverWrite(caughtError, writesStarted, "Stored entries");
            throw caughtError;
        } finally {
            busy.val = false;
        }
    };

    const load = () => {
        if (busy.val || (loading.val && snapshot.val)) return;
        return runLoad(async () => {
            showSnapshot(await readSnapshot(), true);
            message.val = "";
        });
    };

    const numberControl = (value, max, disabled, label, entryControl = false) => {
        const control = NumberInput({
            value,
            mode: "int",
            inputmode: "numeric",
            "aria-label": label,
            readOnly: isBusy,
            disabled: () => Boolean(error.val) || !snapshot.val || (entryControl && snapshot.val.cheatEnabled),
            onDecrement: () => {
                if (disabled()) return;
                value.val = String(Math.max(0, (Number(value.val) || 0) - 1));
            },
            onIncrement: () => {
                if (disabled()) return;
                value.val = String(Math.min(max(), (Number(value.val) || 0) + 1));
            },
        });
        van.derive(() => {
            const locked = disabled();
            for (const button of control.querySelectorAll("button")) button.disabled = locked;
        });
        return control;
    };
    const progressInput = numberControl(progressDraft, () => PROGRESS_LIMIT, cannotWrite, "Completed showdowns");
    const entriesInput = numberControl(
        entriesDraft,
        () => snapshot.val.capacity,
        cannotWriteEntries,
        "Remaining Emperor entries",
        true
    );

    const progressRow = AccountRow({
        rowClass: () => `account-row--wide-controls ${saveStateClass(progressWrite.status.val, progressWrite.undo)}`,
        rowProps: progressWrite.handlers,
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, "Completed showdowns"),
            span({ class: "account-row__sub-label" }, `0–${PROGRESS_LIMIT}, numeric safety ceiling`)
        ),
        badge: () => String(snapshot.val?.progress ?? "—"),
        controls: [
            SaveState(progressWrite),
            progressInput,
            ActionButton({
                label: "RESET",
                variant: "danger",
                disabled: cannotEdit,
                onClick: () => progressWrite.run(() => saveProgress(true)),
            }),
        ],
    });
    const entriesRow = AccountRow({
        rowClass: () => `account-row--wide-controls ${saveStateClass(entriesWrite.status.val, entriesWrite.undo)}`,
        rowProps: entriesWrite.handlers,
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, "Remaining entries"),
            span({ class: "account-row__sub-label" }, () =>
                snapshot.val
                    ? `Natural capacity ${snapshot.val.capacity}; base daily replenishment ${snapshot.val.daily}`
                    : ""
            )
        ),
        badge: () =>
            snapshot.val
                ? snapshot.val.cheatEnabled
                    ? "CHEAT ACTIVE"
                    : `${snapshot.val.remaining} / ${snapshot.val.capacity}`
                : "—",
        controls: [
            SaveState(entriesWrite),
            entriesInput,
            ActionButton({
                label: "REFILL",
                disabled: () =>
                    cannotEdit() || snapshot.val.cheatEnabled || snapshot.val.remaining >= snapshot.val.capacity,
                onClick: () => entriesWrite.run(() => saveEntries(true)),
            }),
        ],
    });
    const body = div(
        { class: "scrollable-panel content-stack" },
        div({ class: "write-status write-status--error", role: "alert" }, () => message.val),
        div({ class: "account-item-stack" }, progressRow, entriesRow),
        div({ class: "write-status", role: "status" }, () => {
            const current = snapshot.val;
            if (!current) return "";
            return current.cheatEnabled
                ? "The w6 emperor cheat masks the stored entry count and forces the disabled input value. Disable it to read and edit stored entries. Progress remains editable."
                : current.progress > PROGRESS_LIMIT
                  ? `Completed showdowns exceed the numeric safety ceiling of ${PROGRESS_LIMIT}. Edits must stay within the safety ceiling.`
                  : "";
        }),
        div({ class: "write-status", role: "status" }, () =>
            snapshot.val && !cacheMatches(snapshot.val)
                ? "Base reward cache is out of sync or missing. Rewards below are calculated from progress. Enter the completed showdowns again to reconcile the cache."
                : ""
        ),
        div({ class: "write-status" }, () => {
            const current = snapshot.val;
            if (!current) return "";
            const index = current.metadata.mapping[current.progress % current.metadata.mapping.length];
            const note = cleanName(current.metadata.descriptions[index]).includes("something World 7ish")
                ? " World 7 placeholder."
                : index === 11
                  ? " Effect unconfirmed."
                  : "";
            return `Next showdown ${current.progress + 1}: base reward ${rewardText(current.metadata.descriptions[index], current.metadata.amounts[index])}.${note}`;
        }),
        AccountSection({ title: "BASE REWARDS", note: "Before external modifiers", body: rewardList })
    );
    const refreshButton = RefreshButton({ onRefresh: load, disabled: isBusy });
    refreshButton.onmousedown = (event) => event.preventDefault();
    load();
    return PersistentAccountListPage({
        rootClass: "emperor-tab tab-container",
        title: "EMPEROR",
        description:
            "Edit account progress and stored entries directly, including before fight entry unlocks. No fight loot is granted. Existing entries above natural capacity are preserved. New entry edits must stay within natural capacity.",
        actions: refreshButton,
        state: { loading, error },
        loadingText: "READING EMPEROR",
        errorTitle: "EMPEROR READ FAILED",
        body,
    });
};

export default definePage({
    id: "w6.emperor",
    world: 6,
    system: "Emperor",
    description: "Emperor account progress and stored fight entries, with the base rewards.",
    keywords: ["Emperor Fights", "Emperor Entries"],
    component: EmperorTab,
});
