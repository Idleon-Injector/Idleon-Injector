import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { fetchCheatStates, gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { NumberInput } from "../../../components/NumberInput.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { askAtField } from "../../../components/inPlace.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;
const PROGRESS_PATH = "OptionsListAccount[369]";
const ENTRIES_PATH = "OptionsListAccount[370]";
const CACHE_PATH = "DNSM.h.EmperorBon";
// Emperor tries from the gem shop (a past limited buy): each is +1 try a day and +6 to the tries saved up.
const TRIES_PATH = "OptionsListAccount[382]";
// Above 1617 completed showdowns, the next fight's base HP becomes Infinity.
const PROGRESS_LIMIT = 1617;
// The game's placeholder rewards ("+{%_something_World_7ish").
const isPlaceholder = (description) => cleanName(description).includes("something World 7ish");

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
    // Typed values save on Enter or on leaving the field (useAutoSave); Reset (once asked) and Max save at once.
    const progressWrite = useAutoSave({
        // The draft as it was at the commit, so a later one (made after Reset, say) can't save in its place.
        capture: () => progressDraft.val,
        prepare: (draft = progressDraft.val) => ({ write: () => saveProgress(false, draft) }),
        revert: () => (progressDraft.val = String(snapshot.val?.progress ?? progressDraft.val)),
    });
    const entriesWrite = useAutoSave({
        capture: () => entriesDraft.val,
        prepare: (draft = entriesDraft.val) => ({ write: () => saveEntries(false, draft) }),
        revert: () => (entriesDraft.val = String(snapshot.val?.remaining ?? entriesDraft.val)),
    });
    // Reset asks in place first: the row's name becomes the question and its buttons the answer.
    const askingReset = van.state(false);
    const triesState = van.state(0);
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
        const [rawProgress, rawCounter, rawMetadata, rawCapacity, rawDaily, cheats, rawCache, rawTries] =
            await Promise.all([
                gga(PROGRESS_PATH),
                gga(ENTRIES_PATH),
                readCList("EmperorBon"),
                readComputed("thingies", "MaxEmperorAttemptStack", [0, 0]),
                readComputed("thingies", "DailyEmperorTries", [0, 0]),
                fetchCheatStates(),
                gga(CACHE_PATH),
                gga(TRIES_PATH),
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
            throw new Error("Couldn't read the showdowns won. Refresh to try again.");
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
            throw new Error("Couldn't read the entries. Refresh to try again.");
        }
        if (
            metadata.descriptions.length !== 12 ||
            metadata.descriptions.some((value) => typeof value !== "string") ||
            metadata.amounts.length !== 12 ||
            metadata.amounts.some((value) => !Number.isFinite(value) || value < 0) ||
            metadata.mapping.length !== 48 ||
            metadata.mapping.some((value) => !Number.isInteger(value) || value < 0 || value >= 12)
        ) {
            throw new Error("Couldn't read the rewards. Refresh to try again.");
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
            tries: Math.max(0, Math.floor(Number(rawTries) || 0)),
        };
    };

    const showSnapshot = (current, syncInputs = false, savedRow = null) => {
        snapshot.val = current;
        triesState.val = current.tries;
        if (savedRow === "progress") progressDraft.val = String(current.progress);
        if (savedRow === "entries") entriesDraft.val = String(current.remaining);
        if (syncInputs) {
            if (!progressInput.contains(document.activeElement)) progressDraft.val = String(current.progress);
            if (!entriesInput.contains(document.activeElement)) entriesDraft.val = String(current.remaining);
        }
        reconcileRewards(JSON.stringify(current.metadata), () =>
            current.metadata.descriptions.flatMap((description, index) =>
                isPlaceholder(description)
                    ? []
                    : [
                          // The reward with what the showdowns won so far add up to ("1.30x Ninja Stealth").
                          AccountRow({
                              info: span({ class: "account-row__name" }, () =>
                                  snapshot.val ? rewardText(description, snapshot.val.baseRewards[index]) : ""
                              ),
                          }),
                      ]
            )
        );
    };

    const recoverWrite = async (caughtError, writesStarted, label) => {
        try {
            const actual = await readSnapshot();
            showSnapshot(actual);
            message.val = writesStarted
                ? `${label} may not have saved fully. The fields show what the game holds now.`
                : caughtError.message;
        } catch (readError) {
            error.val = readError.message;
            message.val = writesStarted
                ? `${label} may not have saved fully, and the game couldn't be read. Refresh before you try again.`
                : caughtError.message;
        }
    };

    // A typed decrease asks in place (#77): the first Enter is refused beside the field with what it would do,
    // and Enter again within a few seconds saves it.
    const askAtProgress = askAtField(() => progressInput);

    // Each save returns { cancelled: true } when there's nothing to write, and throws when it fails. `reset` was asked
    // in place already (its row's question), so it doesn't ask again.
    const saveProgress = async (reset = false, draft = progressDraft.val) => {
        if (cannotWrite()) return { cancelled: true };
        busy.val = true;
        message.val = "";
        let writesStarted = false;
        try {
            const before = await readSnapshot();
            showSnapshot(before);
            // The count the game holds isn't an edit, so the limit an edit keeps to doesn't apply to it.
            const untouched = String(draft).trim() !== "" && Number(draft) === before.progress;
            const next = reset ? 0 : untouched ? before.progress : wholeNumber(draft, PROGRESS_LIMIT);
            let fresh = before;
            // The same count saves again only to repair a base reward cache that's out of sync.
            if (next === before.progress && cacheMatches(before)) {
                progressDraft.val = String(before.progress);
                return { cancelled: true };
            }
            const question = `lower showdowns won from ${before.progress} to ${next}: their base rewards go too`;
            if (next < before.progress && !reset && !askAtProgress(question)) return { cancelled: true };
            if (next < before.progress) {
                fresh = await readSnapshot();
                showSnapshot(fresh);
            }
            if (
                fresh.progress !== before.progress ||
                JSON.stringify(fresh.metadata) !== JSON.stringify(before.metadata)
            ) {
                throw new Error("The showdowns changed in the game. Try again.");
            }
            const totals = baseRewards(next, fresh.metadata);
            writesStarted = true;
            await writeVerified(PROGRESS_PATH, next);
            await writeVerified(CACHE_PATH, totals);
            const actual = await readSnapshot();
            if (actual.progress !== next || !cacheMatches(actual)) {
                showSnapshot(actual);
                throw new Error("The showdowns changed while saving. Try again.");
            }
            showSnapshot(actual, false, "progress");
        } catch (caughtError) {
            // Asking again is said beside the field, before anything was written.
            if (!caughtError.askAgain) await recoverWrite(caughtError, writesStarted, "Showdowns won");
            throw caughtError;
        } finally {
            busy.val = false;
        }
    };

    const saveEntries = async (refill = false, raw = entriesDraft.val) => {
        if (cannotWriteEntries()) return { cancelled: true };
        busy.val = true;
        message.val = "";
        let writesStarted = false;
        try {
            const fresh = await readSnapshot();
            showSnapshot(fresh);
            if (fresh.cheatEnabled) throw new Error("Turn off the w6 emperor cheat first.");
            if (!refill && String(raw).trim() !== "" && Number(raw) === fresh.remaining) return { cancelled: true };
            const next = refill ? fresh.capacity : wholeNumber(raw, fresh.capacity);
            if (refill && fresh.remaining >= fresh.capacity) {
                message.val = "Entries are full already.";
                return { cancelled: true };
            }
            if (next === fresh.remaining) return { cancelled: true };
            writesStarted = true;
            await writeVerified(ENTRIES_PATH, 1 - next);
            const actual = await readSnapshot();
            if (actual.cheatEnabled || actual.remaining !== next || actual.capacity !== fresh.capacity) {
                showSnapshot(actual);
                throw new Error("The entries changed while saving. Try again.");
            }
            showSnapshot(actual, false, "entries");
        } catch (caughtError) {
            await recoverWrite(caughtError, writesStarted, "Entries");
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
            // Entries show their natural capacity, what Refill fills to, as the field's cap.
            cap: entryControl ? () => snapshot.val?.capacity : null,
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
    const progressInput = numberControl(progressDraft, () => PROGRESS_LIMIT, cannotWrite, "Showdowns won");
    const entriesInput = numberControl(entriesDraft, () => snapshot.val.capacity, cannotWriteEntries, "Entries", true);

    // Reset asks in place: the row's name becomes the question with its answer beside it, and Reset keeps its room
    // (unseen while it asks), so nothing in the row or under it moves.
    const resetButton = ActionButton({
        label: "Reset",
        variant: "danger",
        className: () => (askingReset.val ? "is-asking" : ""),
        disabled: () => cannotEdit() || !snapshot.val.progress,
        buttonProps: { "aria-hidden": () => String(askingReset.val) },
        onClick: () => (askingReset.val = true),
    });
    const resetAnswer = span(
        { class: "emperor-answer", hidden: () => !askingReset.val },
        ActionButton({
            label: "Reset them",
            variant: "danger",
            onClick: () => {
                askingReset.val = false;
                return progressWrite.run(() => saveProgress(true));
            },
        }),
        ActionButton({ label: "Cancel", onClick: () => (askingReset.val = false) })
    );
    const progressRow = AccountRow({
        rowClass: () => `account-row--wide-controls ${saveStateClass(progressWrite.status.val, progressWrite.undo)}`,
        rowProps: progressWrite.handlers,
        info: div(
            { class: "emperor-ask" },
            span({ class: "account-row__name" }, () =>
                askingReset.val ? `Reset ${snapshot.val?.progress ?? 0} showdowns won to 0?` : "Showdowns won"
            ),
            resetAnswer
        ),
        controls: [SaveState(progressWrite), progressInput, resetButton],
    });
    // The gem shop's Emperor tries. The game sets no max. A save reads the game again, so the entries' cap and the
    // tries a day follow.
    const triesRow = ClampedLevelRow({
        valueState: triesState,
        integerMode: "floor",
        write: async (count) => {
            const verified = await writeVerified(TRIES_PATH, count);
            await load();
            return verified;
        },
        renderInfo: () => RowTitles({ bonus: "+1 try a day and +6 saved-up tries each", name: "Emperor tries" }),
    });
    const entriesRow = AccountRow({
        rowClass: () => `account-row--wide-controls ${saveStateClass(entriesWrite.status.val, entriesWrite.undo)}`,
        rowProps: entriesWrite.handlers,
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, "Entries"),
            span({ class: "emperor-daily" }, () => (snapshot.val ? `+${snapshot.val.daily} a day` : ""))
        ),
        badge: () => (snapshot.val?.cheatEnabled ? "Cheat on" : ""),
        controls: [
            SaveState(entriesWrite),
            entriesInput,
            // A draft the field keeps (over a refresh too): the count the game holds, when it differs.
            span({ class: "account-row__now" }, () => {
                const current = snapshot.val;
                const draft = String(entriesDraft.val).trim();
                return current && !current.cheatEnabled && draft !== "" && Number(draft) !== current.remaining
                    ? `now ${current.remaining}`
                    : "";
            }),
            ActionButton({
                label: "Max",
                disabled: () =>
                    cannotEdit() || snapshot.val.cheatEnabled || snapshot.val.remaining >= snapshot.val.capacity,
                onClick: () => entriesWrite.run(() => saveEntries(true)),
            }),
        ],
    });
    // One short line under the title while something is off: a failure, the cheat, or a count the page can't keep to.
    const notice = () => {
        const current = snapshot.val;
        if (!current) return "";
        if (current.cheatEnabled) return "The w6 emperor cheat is on. Turn it off to edit entries.";
        if (current.progress > PROGRESS_LIMIT) return `Showdowns won can be set to ${PROGRESS_LIMIT} at most.`;
        if (!cacheMatches(current))
            return "The game's reward total is out of date. Enter the showdowns again to fix it.";
        return "";
    };
    const nextReward = () => {
        const current = snapshot.val;
        if (!current) return "";
        const index = current.metadata.mapping[current.progress % current.metadata.mapping.length];
        const description = current.metadata.descriptions[index];
        return isPlaceholder(description)
            ? ""
            : `Next showdown: ${rewardText(description, current.metadata.amounts[index])}`;
    };
    const refreshButton = RefreshButton({ onRefresh: load, disabled: isBusy });
    refreshButton.onmousedown = (event) => event.preventDefault();
    load();
    return PersistentAccountListPage({
        rootClass: "emperor-tab tab-container scroll-container",
        title: "Emperor",
        description: "Showdowns won, entries and their rewards. No fight loot is given.",
        actions: refreshButton,
        // A failure, or a warning only while its trouble is real.
        topNotices: () =>
            div(
                message.val ? WarningBanner(span({ role: "alert" }, message.val)) : null,
                notice() ? WarningBanner(span({ role: "status" }, notice())) : null
            ),
        state: { loading, error },
        loadingText: "Reading the emperor",
        errorTitle: "Couldn't read the emperor",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: [
                    AccountSection({ title: "Gem shop", body: div({ class: "field-columns" }, triesRow) }),
                    AccountSection({
                        title: "Showdowns",
                        body: div({ class: "field-columns" }, progressRow, entriesRow),
                    }),
                    AccountSection({ title: "Rewards", meta: span(nextReward), body: rewardList }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w6.emperor",
    world: 6,
    system: "Emperor",
    description: "Showdowns won, entries and their rewards.",
    keywords: ["Emperor Fights", "Emperor Entries", "Emperor tries", "FOMO Tickets", "Limited", "Gem shop", "FOMO"],
    component: EmperorTab,
});
