/**
 * Building blocks for Account › Automation and each system's automation tab.
 *
 * An automation is an "automation <system>" toggle cheat; its picks are cheatConfig.automation[system]. The game
 * lists them in readComputed("automation", "list"): { id, cheat, label, on, error, status }.
 *
 * Everything these pages do with the game and the config file runs as steps in one queue, one at a time, in the order
 * the player asked: item saves, automation switches, startup changes, bulk actions and the pages' reads. Nothing runs
 * alongside anything else, so each step's own read-back is the truth when it lands. The pages keep what the game
 * accepted (its last read, or a change it took) apart from what the player clicked or typed: a click shows over the
 * accepted state until its step ends, and a step sends only the accepted state plus its own change.
 *
 * The plug-in API, for a system's automation tab:
 *
 *   const automation = van.state(null);                     // the system's entry from readAutomations()
 *   const picks = createAutomationPicks("sneaking", { cheat: "automation sneaking", entry: automation });
 *       Its items, cheatConfig.automation.sneaking. Each save is a step: it sends the accepted list plus its own
 *       change to the game, then the file, reads back what the game holds, and, when the game now runs an item the
 *       save switched on, turns the automation on (now and at start) and reads its entry back into `entry`.
 *       Returns { get(id), sync(entries), set(id, patch, onLate), setAll(ids, on, onLate), resave(onLate),
 *       fileBehind() }.
 *   PickRow({ picks, id, name, badge })                      // an item: stop-at (Enter or leaving it) and switch
 *   AutomationRow({ entry: automation, onSwitched: load })   // the system's own switch and status line
 *   const load = () => run(() => inTurn(async () => {        // a page's read is a step too (run: useAccountLoad)
 *       const [list, config] = await Promise.all([readAutomations(), fetchConfig()]);   // direct reads only
 *       showAutomation(automation, list.find(({ cheat }) => cheat === CHEAT) ?? null);
 *       picks.sync(config.cheatConfig.automation.sneaking);   // the accepted list; queued edits still show
 *       error.val = null;                                    // the newest read worked: an older failure goes
 *   }, waiting.onLate));   // waiting = useStillWaiting(): said on the page's line (waiting.over), not as a failure
 *   switchAutomation(cheat, on, onLate), ensureOn(cheat, onLate), switchAll(on, entryOf, onLate)   // for buttons
 *
 * Inside a step, call the game and the file directly (readAutomations, readComputed, fetchConfig, ...): never await
 * inTurn, switchAutomation, ensureOn, switchAll or a page's queued load, which would wait for the step itself and hold
 * the queue for good. A step still waiting for the game after `steps.timeoutMs` calls its `onLate(notice)`: the
 * caller says the notice where the step's outcome will show, and the outcome replaces it when it comes.
 */

import van from "../../../vendor/van-1.6.0.js";
import { NumberInput, getNumberInputLiveRaw, setNumberInputValue } from "../../NumberInput.js";
import {
    executeCheatAction,
    fetchConfig,
    readComputed,
    saveConfigFile,
    updateSessionConfig,
} from "../../../services/api.js";
import { SaveState, saveFailureReason, saveStateClass, useAutoSave } from "./autoSave.js";
import { AccountRow, RowTitles } from "./components/AccountRow.js";
import { ActionButton } from "./components/ActionButton.js";
import { RefreshButton } from "./components/AccountPageChrome.js";
import { PersistentAccountListPage } from "./components/PersistentAccountListPage.js";
import { StepPicker } from "./components/StepPicker.js";
import { ValueTableHead } from "./EditableFieldsRow.js";
import { toNodes, useWriteStatus } from "./accountShared.js";
import { useAccountLoad } from "./accountLoadPolicy.js";
import { ListPanel, TabbedList } from "./tabShared.js";
import { Said, announce, useSaid } from "../../inPlace.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";

const { div, input, label, span } = van.tags;

/** Every automation, with its status while it runs. A direct read: inside a step it gives the settled answer. */
export const readAutomations = () => readComputed("automation", "list");

/** How long a step may wait for the game before its caller is told it is still waiting. */
export const steps = { timeoutMs: 30000 };

let queue = Promise.resolve();

/**
 * Run `task` as the next step in the pages' one queue; resolves or rejects with it, however long that takes (each API
 * call gives up after `requestLimit.timeoutMs`, but a step can make several). The next step waits for it to end, so a
 * late answer can't land after a newer change. `onLate(notice)`, when given, is called once if the step hasn't ended `steps.timeoutMs` after it was
 * asked for (waiting behind an earlier step counts), and `onLate(null)` once that late step ends: a notice only, which
 * the step's own outcome replaces.
 */
export const inTurn = (task, onLate = null) => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    if (onLate) {
        const stop = deadline(onLate);
        run.then(stop, stop);
    }
    return run;
};

// Calls `onLate(notice)` once `steps.timeoutMs` from now, unless the returned stop comes first; a stop after it calls
// `onLate(null)`.
const deadline = (onLate) => {
    let late = false;
    const timer = setTimeout(() => {
        late = true;
        onLate("still waiting for the game"); // short, so it fits beside a field in two lines
    }, steps.timeoutMs);
    return () => {
        clearTimeout(timer);
        if (late) onLate(null);
    };
};

/**
 * One place on a page that says when its steps are still waiting for the game: pass `onLate` to each step's queued
 * call. `over(said)` is a said state for Said: the notice while any of those steps is still late, else `said`.
 */
export const useStillWaiting = () => {
    const notice = van.state(null);
    let late = 0; // steps that raised the notice and haven't ended
    const onLate = (text) => {
        if (text !== null) {
            late++;
            notice.val = text;
        } else if (--late === 0) notice.val = null;
    };
    const over = (said) => ({
        get val() {
            return notice.val === null ? said.val : { kind: "waiting", text: notice.val };
        },
    });
    return { notice, onLate, over };
};

// The server merges what a save sends into the rest of the file, so only the startup list is read and written back.
const changeStartup = async (cheat, on) => {
    const { startupCheats = [] } = await fetchConfig();
    if (startupCheats.includes(cheat) === on) return;
    await saveConfigFile({
        startupCheats: on ? [...startupCheats, cheat] : startupCheats.filter((command) => command !== cheat),
    });
};

// An automation's entry state -> what the game last said about it (`accepted`) and the clicks on its switch whose step
// hasn't ended (`clicks`); the entry shows the newest click over the accepted entry.
const switches = new WeakMap();
const switchesOf = (entry) => {
    if (!switches.has(entry)) switches.set(entry, { accepted: entry.val, clicks: [] });
    return switches.get(entry);
};
const redraw = (entry) => {
    const { accepted, clicks } = switchesOf(entry);
    entry.val = clicks.length && accepted ? { ...accepted, on: clicks[clicks.length - 1].on } : accepted;
};

/** Show a read of an automation's entry; a click on its switch whose step hasn't ended still shows over it. */
export const showAutomation = (entry, found) => {
    switchesOf(entry).accepted = found;
    redraw(entry);
};

// Run the cheat. With `entry`, the game's answer is what the entry accepts until a read; a cheat that failed may have
// switched before it failed, so its state is not known (`on: null`) until a read.
const toggle = async (cheat, on, entry) => {
    let answer = null;
    try {
        await executeCheatAction(cheat, on);
        answer = on;
    } finally {
        const known = entry && switchesOf(entry);
        if (known?.accepted) {
            known.accepted = { ...known.accepted, on: answer };
            redraw(entry);
        }
    }
};

const switchNow = async (cheat, on, entry = null) => {
    await toggle(cheat, on, entry);
    await changeStartup(cheat, on);
};

const findAutomation = async (cheat) =>
    (await readAutomations()).find((automation) => automation.cheat === cheat) ?? null;

const ensureNow = async (cheat, entry = null) => {
    const found = await findAutomation(cheat);
    if (entry) showAutomation(entry, found);
    if (!found?.on) await toggle(cheat, true, entry);
    await changeStartup(cheat, true);
};

/** Turn an automation on or off, now and at every start. */
export const switchAutomation = (cheat, on, onLate = null) => inTurn(() => switchNow(cheat, on), onLate);

/** Make sure an automation runs, now and at every start; one already running is only put in the startup cheats. */
export const ensureOn = (cheat, onLate = null) => inTurn(() => ensureNow(cheat), onLate);

/**
 * Switch every automation on or off, now and at every start: those off now or at start (a startup save that failed,
 * say) for on, those on now or at start for off. Decided when the step runs, after every switch asked for before it.
 * One that fails doesn't stop the rest; the first failure is thrown once all were tried. `entryOf(cheat)` gives the
 * entry state a page shows for an automation, so it shows the game's answer even if the page's read after it fails.
 */
export const switchAll = (on, entryOf = () => null, onLate = null) =>
    inTurn(async () => {
        const [automations, { startupCheats = [] }] = await Promise.all([readAutomations(), fetchConfig()]);
        let failure = null;
        for (const { cheat, on: running } of automations) {
            if (running === on && startupCheats.includes(cheat) === on) continue;
            await switchNow(cheat, on, entryOf(cheat)).catch((error) => (failure ??= error));
        }
        if (failure) throw failure;
    }, onLate);

/**
 * One row per automation: its name, what it is doing, and its switch. `entry` is a state holding the game's
 * entry; `onSwitched` reads it back after a switch (queue it: it then reads what the switch did).
 */
export const AutomationRow = ({ entry, onSwitched = null, column = null }) => {
    const { status, run } = useWriteStatus();
    const said = useSaid();
    // The notice while any of this row's clicks still waits for the game; then the newest outcome shows.
    const late = useStillWaiting();
    const name = () => entry.val.label ?? entry.val.cheat;
    const checkbox = input({
        type: "checkbox",
        role: "switch",
        "aria-label": () => `${name()} automation`,
        checked: () => entry.val.on,
        onchange: (e) => {
            const on = e.target.checked;
            const cheat = entry.val.cheat;
            said.clear(); // a new try: the last failure goes
            // What the player clicked shows until its step ends; then what the game answered, or a newer click.
            const known = switchesOf(entry);
            const click = { on };
            known.clicks.push(click);
            redraw(entry);
            // Clicks finish in the order they were made, so the newest click's outcome is the one left showing.
            void run(
                async () => {
                    let failed = false;
                    try {
                        await inTurn(
                            () =>
                                switchNow(cheat, on, entry).finally(() => {
                                    known.clicks.splice(known.clicks.indexOf(click), 1);
                                    redraw(entry);
                                }),
                            late.onLate
                        );
                    } catch (error) {
                        failed = true;
                        throw error;
                    } finally {
                        // A failed read-back doesn't hide why the switch failed.
                        await Promise.resolve(onSwitched?.()).catch((readError) => {
                            if (!failed) throw readError;
                        });
                    }
                },
                {
                    onSuccess: () => said.clear(),
                    onError: (caught) => said.say("failed", caught.message),
                }
            ).then(() => (checkbox.checked = Boolean(entry.val.on)));
        },
    });
    const line = () => {
        const { on, status: said, error } = entry.val;
        // Not knowing whether it runs comes first: an older tick error says nothing about that.
        if (on === null) return "Unknown: press Refresh";
        if (error) return `Last error: ${error}`;
        return on ? (said ?? "On") : "Off";
    };
    return AccountRow({
        rowClass: column === null ? "automation-row" : "value-row automation-row",
        status,
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, name),
            span({ class: "automation-row__status", role: "status" }, line),
            Said({ said: late.over(said.said), className: "said--line", kinds: ["failed", "waiting"] })
        ),
        // In an automation list the switch sits in the items' "On" column (automationColumns' `on`).
        controls:
            column === null
                ? switchLabel(checkbox)
                : div({ class: "value-cells" }, ...cellsBefore(column), Cell("On", switchLabel(checkbox))),
    });
};

// Send cheatConfig.automation[key] to the game, then to the config file. A failure only at the file is marked
// `fileOnly`: the game has the value.
const sendToGame = async (key, value) => {
    // No answer at all (not a refusal): whether the game took it is unknown.
    const result = await updateSessionConfig({ cheatConfig: { automation: { [key]: value } } }).catch((error) => {
        throw Object.assign(error, { unknown: true });
    });
    if (result.message !== "Configuration updated successfully")
        throw new Error(result.details || result.message || "The game didn't take the change");
};
const sendToFile = (key, value) =>
    saveConfigFile({ cheatConfig: { automation: { [key]: value } } }).catch((error) => {
        throw Object.assign(new Error(`in the game, but not saved to the file: ${error.message}`), { fileOnly: true });
    });

// A save before the first read of what the game holds would replace it with the page's empty start.
const NOT_READ = "not read from the game yet: press Refresh";
const GAME_NOT_READ = "the game didn't answer with its settings: press Refresh";

// The page's own read at the end of a save step (direct reads only: it runs inside the step), so its levels, costs
// and status lines follow the save. Its failure is the page's to say, even one thrown at once; the save's outcome
// stands.
const readAfter = (afterSave) =>
    Promise.resolve()
        .then(() => afterSave?.())
        .catch(() => {});

/**
 * A system's saved picks, cheatConfig.automation[group]: one { id, on, stopAt? } per item, plus any other setting the
 * system keeps per item (save, payWith, ...; null or missing is its default). What the game accepted (the
 * last read of the list, or a list it took) is kept apart from the edits still queued; each row shows the accepted item
 * with its queued edits on top. An edit queues a step that sends the accepted list plus only that edit to the game,
 * then the file, then reads back what the game holds: a taken edit joins the accepted list, a refused one is dropped,
 * and a read that works replaces the list. With `cheat`, the same step then turns that automation on (now and at
 * start) when the game runs an item the edit switched on, and reads its entry back into `entry` (a state, for its
 * AutomationRow). With `afterSave`, the step ends with that read of the page (see readAfter), saves and bulk saves
 * alike.
 */
export const createAutomationPicks = (group, { cheat = null, entry = null, afterSave = null } = {}) => {
    const items = new Map(); // id -> the states its row shows
    let accepted = new Map(); // id -> { on, stopAt }: what the game holds, as far as the page knows
    const queued = []; // [id, patch] of the edits whose step hasn't ended, oldest first
    const fileBehind = van.state(false); // the game may hold a list the config file doesn't
    let synced = false; // a read of the list has landed: before it, a save would send a list without the saved items

    const get = (id) => {
        if (!items.has(id))
            items.set(id, {
                on: van.state(false),
                stopAt: van.state(null),
                draft: van.state(""),
                fields: new Map(), // a setting beside the stop-at (save, payWith, ...) -> its state
            });
        return items.get(id);
    };
    /** The state of an item's other setting (`field` of its entry; null when the entry has none). */
    const field = (id, name) => {
        const { fields } = get(id);
        if (!fields.has(name)) fields.set(name, van.state(withEdits(accepted, queued).get(id)?.[name] ?? null));
        return fields.get(name);
    };

    const withEdits = (list, edits) => {
        const next = new Map(list);
        for (const [id, patch] of edits) next.set(id, { on: false, stopAt: null, ...next.get(id), ...patch });
        return next;
    };

    // Show the accepted list with the queued edits on top. A field showing other text than the value it replaces
    // holds the player's typing: it stays.
    const show = () => {
        const shown = withEdits(accepted, queued);
        for (const id of shown.keys()) get(id);
        for (const [id, item] of items) {
            const untouched = (getNumberInputLiveRaw(item.draft) ?? item.draft.val) === valueText(item.stopAt.val);
            item.on.val = Boolean(shown.get(id)?.on);
            item.stopAt.val = shown.get(id)?.stopAt ?? null;
            for (const [name, state] of item.fields) state.val = shown.get(id)?.[name] ?? null;
            if (untouched) showStopAt(item);
        }
    };

    /** Take a read of the list (a step's, so it is newer than every step before it) as what the game holds. */
    const sync = (entries) => {
        synced = true;
        accepted = new Map(
            entries.map(({ id, on, stopAt = null, ...fields }) => [String(id), { ...fields, on: Boolean(on), stopAt }])
        );
        show();
    };

    // Switched-off items stay while they carry a setting (a stop-at, Save for it, ...), so it survives. A setting
    // that is null is the default, so it is left out.
    const toConfig = (list) =>
        [...list]
            .map(([id, { on, ...fields }]) => ({
                id,
                on,
                ...Object.fromEntries(
                    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined)
                ),
            }))
            .filter((item) => item.on || Object.keys(item).length > 2);

    // Show `patches` ([id, { on } or { stopAt }]) and queue the step that saves them onto the accepted list.
    const save = (patches, onLate) => {
        const mine = patches.map(([id, patch]) => [id, patch]); // this step's own entries in `queued`
        queued.push(...mine);
        show();
        const switched = patches.filter(([, patch]) => patch.on).map(([id]) => id);
        return inTurn(async () => {
            if (!synced) {
                for (const edit of mine) queued.splice(queued.indexOf(edit), 1);
                show();
                throw new Error(NOT_READ);
            }
            let failure = null;
            const next = withEdits(accepted, patches);
            try {
                const list = toConfig(next);
                // From here until the file is written, the game may hold what the file doesn't: even a failed answer
                // can come after the game applied the list. Enter on the same value then saves it again.
                fileBehind.val = true;
                await sendToGame(group, list);
                accepted = next;
                await sendToFile(group, list);
                fileBehind.val = false;
            } catch (error) {
                failure = error;
            }
            // This step's edits are settled: a taken one is in the accepted list, a refused one goes. Then read back
            // what the game holds; if that read fails, the accepted list stands.
            for (const edit of mine) queued.splice(queued.indexOf(edit), 1);
            const before = accepted;
            const read = await fetchConfig().catch(() => null);
            const held = read?.cheatConfig.automation[group];
            if (held) sync(held);
            // The game didn't answer the save, so it may or may not have taken it, and the game itself couldn't be
            // read back (no read, or only the server's copy): until a read of the game, a save would send a list the
            // game may no longer hold.
            if (failure?.unknown && !read?.gameRead) synced = false;
            // A read of the game is the truth, even after a failed save (the game may have applied it before its
            // answer failed). A read that couldn't reach the game is the server's copy, which takes an edit before
            // the game does: there a refused edit stays refused.
            if (held && before !== next && !read.gameRead)
                for (const [id] of patches) before.has(id) ? accepted.set(id, before.get(id)) : accepted.delete(id);
            show();
            // The game runs an item this save switched on: the automation goes on with it, in this same step, so a
            // switch the player clicks after the item still wins. The save's own failure comes first.
            if (cheat && switched.some((id) => accepted.get(id)?.on)) {
                try {
                    await ensureNow(cheat, entry);
                } catch (error) {
                    failure ??= error;
                }
                const found = await findAutomation(cheat).catch(() => undefined);
                if (entry && found !== undefined) showAutomation(entry, found);
            }
            await readAfter(afterSave);
            if (failure) throw failure;
        }, onLate);
    };

    /** Change one item's fields (`patch`: { on } or { stopAt }). `onLate` as for inTurn. */
    const set = (id, patch, onLate = null) => save([[id, patch]], onLate);
    // How many bulk switches each item has had asked for, so a row's switch clicked before one can tell.
    const bulkAsks = new Map();
    /** Switch every item in `ids` on or off with one save. */
    const setAll = (ids, on, onLate = null) => {
        for (const id of ids) bulkAsks.set(id, (bulkAsks.get(id) ?? 0) + 1);
        return save(
            ids.map((id) => [id, { on }]),
            onLate
        );
    };
    /** Send the list again: after a file save failed, the field's Enter retries it. */
    const resave = (onLate = null) => save([], onLate);

    return {
        get,
        field,
        sync,
        set,
        setAll,
        resave,
        fileBehind: () => fileBehind.val,
        bulkAsks: (id) => bulkAsks.get(id) ?? 0,
    };
};

/**
 * A system-wide setting kept beside its picks, cheatConfig.automation[key]: a number (index null), or a list of
 * numbers by index (one per currency, say; a gap is the game's default). Its saves are steps like the picks': each
 * sends what the game accepted plus its own change to the game, then the file, reads back what the game holds, and
 * ends with `afterSave` (see readAfter). Returns { get(index), sync(held), set(index, value, onLate), resave(onLate),
 * fileBehind() }; get(index) is { value, draft }, the states a SettingRow shows.
 */
export const createAutomationSetting = (key, { afterSave = null } = {}) => {
    let accepted = null; // what the game holds, as far as the page knows
    const queued = []; // [index, value] of the edits whose step hasn't ended, oldest first
    const fileBehind = van.state(false);
    let synced = false; // as for the picks: before a read, a save would overwrite what the game holds
    const fields = new Map(); // index -> { value, draft }

    const at = (whole, index) => (index === null ? whole : whole?.[index]) ?? null;
    const withEdits = (whole, edits) =>
        edits.reduce(
            (next, [index, value]) => (index === null ? value : Object.assign([...(next ?? [])], { [index]: value })),
            whole
        );

    const show = () => {
        const shown = withEdits(accepted, queued);
        for (const [index, field] of fields) {
            const untouched = (getNumberInputLiveRaw(field.draft) ?? field.draft.val) === valueText(field.value.val);
            field.value.val = at(shown, index);
            if (untouched) setNumberInputValue(field.draft, valueText(field.value.val));
        }
    };
    const get = (index = null) => {
        if (!fields.has(index)) {
            fields.set(index, { value: van.state(null), draft: van.state("") });
            show();
        }
        return fields.get(index);
    };
    /** Take a read of the setting (a step's) as what the game holds. */
    const sync = (held) => {
        synced = true;
        accepted = held ?? null;
        show();
    };

    const save = (edits, onLate) => {
        const mine = [...edits];
        queued.push(...mine);
        show();
        return inTurn(async () => {
            if (!synced) {
                for (const edit of mine) queued.splice(queued.indexOf(edit), 1);
                show();
                throw new Error(NOT_READ);
            }
            let failure = null;
            const next = withEdits(accepted, edits);
            try {
                fileBehind.val = true; // as for the picks: the game may hold what the file doesn't
                await sendToGame(key, next);
                accepted = next;
                await sendToFile(key, next);
                fileBehind.val = false;
            } catch (error) {
                failure = error;
            }
            for (const edit of mine) queued.splice(queued.indexOf(edit), 1);
            // As for the picks: a read of the game is the truth; the server's copy took a refused edit before the
            // game did, so there a refused edit stays refused.
            const read = await fetchConfig().catch(() => null);
            if (read && (read.gameRead || accepted === next)) accepted = read.cheatConfig.automation[key] ?? accepted;
            // As for the picks: an unanswered save without a read of the game leaves the game unknown until one.
            if (failure?.unknown && !read?.gameRead) synced = false;
            show();
            await readAfter(afterSave);
            if (failure) throw failure;
        }, onLate);
    };

    return {
        get,
        sync,
        set: (index, value, onLate = null) => save([[index, value]], onLate),
        resave: (onLate = null) => save([], onLate),
        fileBehind: () => fileBehind.val,
    };
};

const valueText = (value) => (value === null ? "" : String(value));
/** Put an item's saved stop-at back in its field ("" is no limit). */
const showStopAt = (item) => setNumberInputValue(item.draft, valueText(item.stopAt.val));

const parseStopAt = (raw) => {
    const text = String(raw ?? "").trim();
    if (text === "") return null;
    // A number too big to store exactly would be saved as a different one.
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
        throw new Error("a whole number, or empty for no limit");
    return Number(text);
};

/**
 * The save state of a row whose number field saves on Enter or on leaving it. `value` is the state the field shows
 * once saved, `draft` its NumberInput's; `parse(typed)` gives the value to save or throws the reason, `write(next)`
 * saves it, and `resave()` sends it again while `fileBehind()`. The field's writes and the row's other writes
 * (`other(task)`: a switch, a pick) share one save state and take turns in the order the player made them, so what it
 * shows is the newest one's outcome; a failure of the field stays over the ✓ of another write (that write doesn't
 * save the field's value, as a Reset button would). Returns { save, other, status, reason }.
 */
const useQueuedField = ({ value, draft, parse, write, resave, fileBehind }) => {
    const showValue = () => setNumberInputValue(draft, valueText(value.val));
    let fileOnly = null; // the reason shown for the row's last failure that was only at the file
    // The notice while any of this row's writes still waits for the game, counted from the player's commit: a write
    // waiting its turn behind the row's earlier one is waiting too. Then the newest outcome shows.
    const late = useStillWaiting();
    // The commits not yet taken by a save, oldest first, each with its deadline's stop. The row's save takes the
    // newest one waiting, so older ones end there.
    let waitingCommits = [];
    const track = (task, stop) => () =>
        task()
            .catch((error) => {
                if (error.fileOnly) fileOnly = saveFailureReason(error);
                throw error;
            })
            .finally(stop);
    const save = useAutoSave({
        // The draft as the player committed it, with a deadline from that moment.
        capture: () => {
            const commit = { typed: getNumberInputLiveRaw(draft) ?? draft.val, stop: deadline(late.onLate) };
            waitingCommits.push(commit);
            return commit;
        },
        prepare: (commit) => {
            // Without a commit (leaving for the row's switch only checks the draft), the draft as it is now.
            let stop = () => {};
            if (commit) {
                const taken = waitingCommits.indexOf(commit);
                waitingCommits.slice(0, taken).forEach((older) => older.stop());
                waitingCommits = waitingCommits.slice(taken + 1);
                stop = commit.stop;
            }
            const typed = commit?.typed ?? getNumberInputLiveRaw(draft) ?? draft.val;
            // A value typed after this commit, while it waited its turn, stays in the field for the save after it.
            const stillTyped = () => (getNumberInputLiveRaw(draft) ?? draft.val) === typed;
            try {
                const next = parse(typed);
                if (next === value.val) {
                    if (stillTyped()) showValue();
                    // The game has it but the file may not: Enter saves it again.
                    if (fileBehind()) return { write: track(() => resave(), stop) };
                    stop();
                    return { unchanged: true };
                }
                return { write: track(() => write(next).finally(() => stillTyped() && showValue()), stop) };
            } catch (error) {
                stop();
                throw error;
            }
        },
        // Escape: commits still waiting won't save.
        revert: () => {
            waitingCommits.forEach((commit) => commit.stop());
            waitingCommits = [];
            showValue();
        },
    });
    const other = (task) => save.run(track(task, deadline(late.onLate)), "toggle");

    // A save still waiting for the game says so. A failure only at the file goes once a later save writes the file.
    const waiting = () => late.notice.val !== null;
    const status = {
        get val() {
            if (waiting()) return "loading"; // a wait isn't a failure: it keeps the saving look
            const shown = save.status.val === "error" && save.reason.val === fileOnly;
            return shown && !fileBehind() ? null : save.status.val;
        },
    };
    const reason = {
        get val() {
            return waiting() ? late.notice.val : save.reason.val;
        },
    };
    return { save, other, status, reason };
};

// A column's cell: its name (said by the column head; shown again where a phone folds the row), then what it holds.
const Cell = (name, ...content) => div({ class: "value-cell" }, span({ class: "value-cell__label" }, name), ...content);

// Empty cells up to column `at`, so a row's one control lands in that column of the list.
const cellsBefore = (at) => Array.from({ length: at }, () => span({ class: "value-cell value-cell--empty" }));

// The number field of a useQueuedField row, as a cell of the list; the steppers move it by 1, within 0 to `max`. Its
// save state is the row's (QueuedSaveState), at the row's end.
const QueuedField = ({ field, draft, parse, title, ariaLabel, placeholder = "", mode = "int", max = Infinity }) => {
    const step = (delta) => () => {
        let current;
        try {
            current = parse(getNumberInputLiveRaw(draft) ?? draft.val);
        } catch {
            return; // a draft that isn't a number yet: the steppers wait for one
        }
        if (current === null && delta < 0) return;
        const next = Math.round(((current ?? 0) + delta) * 10) / 10;
        setNumberInputValue(draft, String(Math.min(max, Math.max(0, next))));
    };
    return div(
        {
            class: () => `value-cell account-field-metric ${saveStateClass(field.status.val, field.save.undo)}`,
            ...field.save.handlers,
        },
        span({ class: "value-cell__label" }, title),
        NumberInput({
            mode,
            value: draft,
            placeholder,
            "aria-label": ariaLabel,
            onDecrement: step(-1),
            onIncrement: step(1),
        })
    );
};

const QueuedSaveState = (field) => SaveState({ status: field.status, reason: field.reason, undo: field.save.undo });

const switchLabel = (checkbox) =>
    label({ class: "toggle-switch" }, checkbox, span({ class: "slider", "aria-hidden": "true" }));

// The name, with the row's own lines under it when it has any. With a `bonus` (what the item does, in the game's words)
// the bonus is the main line and the name sits under it, small and muted (RowTitles).
const nameWithDetail = (name, detail, bonus = null) => {
    const title = bonus === null ? span({ class: "account-row__name" }, name) : RowTitles({ bonus, name });
    return detail === null
        ? title
        : div({ class: "account-row__name-group" }, title, div({ class: "automation-pick__detail" }, detail));
};

/**
 * The columns of an automation list, named once in its head (`head(name)`): the page's own `values` (Level, Next
 * level; a name, or { name, width } for a wider one), a column per pick in `selects`, the stop-at, "Save for it" when `save`, then the item's switch ("On").
 * `stopAt` and `on` are those columns' places, for a setting's field and an automation's switch in the same list;
 * `widths` give the list its grid. Every row of the list takes the same columns, so its numbers line up.
 */
export const automationColumns = ({ values = [], selects = [], save = false, stopAt = "Stop at" } = {}) => {
    const columns = [
        ...values.map((value) => (typeof value === "string" ? [value, "5.75rem"] : [value.name, value.width])),
        ...selects.map(({ title }) => [title, "12rem"]),
        [stopAt, "9.5rem"],
        ...(save ? [["Save for it", "5.5rem"]] : []),
        ["On", "2.75rem"],
    ];
    return {
        names: columns.map(([name]) => name),
        stopAt: values.length + selects.length,
        on: columns.length - 1,
        widths: columns.map(([, width]) => width).join(" "),
        head: (name) => ValueTableHead({ name, columns: columns.map(([column]) => column) }),
    };
};

/** The words under a saving % (SettingRow's detail). */
export const SAVING_DETAIL = "Others may cost up to this % of the goal";

/** "Save for it": the engine saves for the cheapest item with it on, and buys the rest with what's left. */
export const SAVE_FOR_IT = "save";

/**
 * An item's row, one line of its list (see automationColumns): its name with `detail` under it (a node, or a function
 * giving one), led by `bonus` (what it does, in the game's words: RowTitles) when it has one, then `values` ([{ name, text, quiet }]: read-only numbers such as its level and next cost; `quiet` for
 * one that only supports another), a step picker per pick in `selects` ({ field, title, options: [{ value, label }] };
 * a value of null is the default, left out of the config), its stop-at (empty is no limit; saves on Enter or on leaving
 * it), its "Save for it" switch when `save`, and its switch. The switches, the picks and the stop-at share one save
 * state, whose writes take turns in the order the player made them (a stop-at, then the switch, reach the game in that
 * order), so what it shows is the newest one's outcome. `label` names the item for screen readers when `name` alone
 * doesn't (a kitchen's "Speed" under its kitchen's heading, say).
 */
export const PickRow = ({
    picks,
    id,
    name,
    label = name,
    bonus = null,
    detail = null,
    values = [],
    selects = [],
    save = false,
    stopAtTitle = "Stop at",
}) => {
    const item = picks.get(id);
    const field = useQueuedField({
        value: item.stopAt,
        draft: item.draft,
        parse: parseStopAt,
        write: (next) => picks.set(id, { stopAt: next }),
        resave: () => picks.resave(),
        fileBehind: picks.fileBehind,
    });
    const checkbox = input({
        type: "checkbox",
        role: "switch",
        "aria-label": `Buy ${label}`,
        checked: () => item.on.val,
        onchange: (e) => {
            const on = e.target.checked;
            // The switch may wait behind the row's own save; an Enable all or Disable all clicked meanwhile is newer.
            const asks = picks.bulkAsks(id);
            void field
                .other(() =>
                    picks.bulkAsks(id) === asks ? picks.set(id, { on }) : Promise.resolve({ cancelled: true })
                )
                .then(() => (checkbox.checked = item.on.val));
        },
    });
    // A pick saves through the row's queue; once its save ends, taken or not, the row shows what the game holds.
    const setField = (setting, next) => field.other(() => picks.set(id, { [setting]: next }));
    const pickers = selects.map(({ field: setting, title, options }) => {
        const shown = picks.field(id, setting);
        return Cell(
            title,
            StepPicker({
                name: `${label} ${title.toLowerCase()}`,
                steps: options,
                picked: () => shown.val,
                onPick: (next) => void setField(setting, next),
            })
        );
    });
    const saved = picks.field(id, SAVE_FOR_IT);
    const saveBox = input({
        type: "checkbox",
        role: "switch",
        "aria-label": `Save for ${label}`,
        checked: () => Boolean(saved.val),
        onchange: (e) =>
            void setField(SAVE_FOR_IT, e.target.checked || null).then(() => (saveBox.checked = Boolean(saved.val))),
    });

    const row = AccountRow({
        rowClass: "value-row automation-pick",
        info: nameWithDetail(name, detail, bonus),
        controls: [
            QueuedSaveState(field),
            div(
                { class: "value-cells" },
                ...values.map(({ name: column, text, quiet = false }) =>
                    Cell(
                        column,
                        span({ class: quiet ? "automation-value automation-value--quiet" : "automation-value" }, text)
                    )
                ),
                ...pickers,
                QueuedField({
                    field,
                    draft: item.draft,
                    parse: parseStopAt,
                    title: stopAtTitle,
                    ariaLabel: `${label} ${stopAtTitle.toLowerCase()}`,
                    placeholder: "No limit",
                }),
                save ? Cell("Save for it", switchLabel(saveBox)) : null,
                Cell("On", switchLabel(checkbox))
            ),
        ],
    });
    item.row = row; // the page search's rows: a bulk switch acts only on the ones it shows
    return row;
};

/**
 * A setting's row (see createAutomationSetting): its name, `detail` under it, and its field, which saves on Enter or
 * on leaving it, in column `column` of its list (a list's stop-at, so typed numbers line up). The value is a number
 * from 0 to `max`; `mode` "float" allows one decimal.
 */
export const SettingRow = ({
    setting,
    index = null,
    name,
    title,
    detail = null,
    max = 100,
    mode = "int",
    column = 0,
}) => {
    const { value, draft } = setting.get(index);
    const words =
        mode === "float" ? `a number from 0 to ${max}, with one decimal at most` : `a whole number from 0 to ${max}`;
    const parse = (raw) => {
        const text = String(raw ?? "").trim();
        const shape = mode === "float" ? /^\d+(\.\d)?$/ : /^\d+$/;
        if (!shape.test(text) || Number(text) > max) throw new Error(words);
        return Number(text);
    };
    const field = useQueuedField({
        value,
        draft,
        parse,
        write: (next) => setting.set(index, next),
        resave: () => setting.resave(),
        fileBehind: setting.fileBehind,
    });
    return AccountRow({
        rowClass: "value-row automation-setting",
        info: nameWithDetail(name, detail),
        controls: [
            QueuedSaveState(field),
            div(
                { class: "value-cells" },
                ...cellsBefore(column),
                QueuedField({ field, draft, parse, title, ariaLabel: `${name} ${title.toLowerCase()}`, mode, max })
            ),
        ],
    });
};

/**
 * Enable all and Disable all for a list's picks, as one tool in its tray: Enable all runs on one press, Disable all
 * asks in the tray first. `targets()` gives the [picks, ids] pairs they cover, saved one after another (a save switches
 * the automation on with an item, and ends with the page's read when its picks have `afterSave`); while the top bar
 * searches the page, only the rows it shows. `done(on, total)` is true when Enable all has nothing left to do; `words`
 * names one and many items (["Orion upgrade", "Orion upgrades"], or a function giving them); `afterAll()`, when given,
 * is a queued read the page runs after every bulk save. Returns { tools(ask), label(), said, busy }: `tools`
 * and `label` go to the list's tray, `said` holds a bulk failure, for the page's top line.
 */
export const usePicksBulk = ({ targets, done, words, waiting, loading = () => false, afterAll = null }) => {
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const noun = (n) => (typeof words === "function" ? words() : words)[n === 1 ? 0 : 1];
    const shown = () => targets().map(([picks, ids]) => [picks, ids.filter((id) => shownBySearch(picks.get(id).row))]);
    const count = () => shown().reduce((n, [picks, ids]) => n + ids.filter((id) => picks.get(id).on.val).length, 0);
    const total = () => shown().reduce((n, [, ids]) => n + ids.length, 0);
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                // Every target's save is queued now, in order, so a row edit made after the press lands after them
                // all. One that fails doesn't stop the rest; the first failure is said once all have ended.
                // A group the search left with no rows sends nothing, unless the file still lacks its last save:
                // then it saves again, which is what Enable all and Disable all stay pressable for.
                const saves = await Promise.allSettled(
                    shown()
                        .filter(([picks, ids]) => ids.length || picks.fileBehind())
                        .map(([picks, ids]) => picks.setAll(ids, on, waiting.onLate))
                );
                // Whatever happened, the page's own follow-up read (a queued step), so Enable all knows what's left.
                await Promise.resolve(afterAll?.()).catch(() => {});
                const failed = saves.find(({ status }) => status === "rejected");
                if (failed) throw failed.reason;
            },
            { onSuccess: () => bulkSaid.clear(), onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => bulk.status.val === "loading";
    // The game may hold a list the config file doesn't (a file save failed): the buttons stay, to save it again.
    const behind = () => targets().some(([picks]) => picks.fileBehind());
    const label = () => (isSearching() ? `${total()} matching ${noun(total())}` : `All ${total()} ${noun(total())}`);
    const tools = (ask) => {
        const disableAll = ActionButton({
            label: "Disable all",
            variant: "danger",
            status: bulk.status,
            disabled: () => loading() || busy() || !total() || (!count() && !behind()),
            onClick: (e) => {
                e.preventDefault();
                const n = count();
                // Only a resave of the file is left: nothing is switched off, so there is nothing to ask.
                if (!n) return void setAll(false);
                ask({
                    question: `Disable ${n} ${noun(n)}?`,
                    confirmLabel: n === 1 ? "Disable it" : "Disable them",
                    from: disableAll,
                    // The answer isn't the Disable all button, so the outcome is said for screen readers here.
                    onConfirm: () => setAll(false).then(({ ok }) => announce(`Disable all: ${ok ? "done" : "failed"}`)),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Enable all",
                status: bulk.status,
                disabled: () => loading() || busy() || !total() || (done(count(), total()) && !behind()),
                onClick: (e) => {
                    e.preventDefault();
                    void setAll(true);
                },
            }),
            disableAll
        );
    };
    return { tools, label, said: bulkSaid.said, busy };
};

/**
 * What the automation holds, beside the page's title like Anvil's points left: `parts()` gives [amount, words] pairs
 * ("4.2B", "feathers"; an amount of "" for words alone), joined by a dot.
 */
export const AutomationStats = (parts) =>
    span({ class: "amount-left automation-stats", "aria-live": "polite" }, () =>
        span(
            ...parts().flatMap(([amount, words], i) => [
                i ? " · " : "",
                ...(amount === "" ? [words] : [span({ class: "amount-left__value" }, amount), ` ${words}`]),
            ])
        )
    );

/**
 * An automation page on the baseline: the title with what the automation holds beside it (`total`, AutomationStats),
 * one short line, Refresh, then one list (a table: `columns`) whose tray holds `bulk`'s Enable all and Disable all.
 * `body` is the list: settings first, then the column head and the items. `notices` is the page's own line (a wait, a
 * bulk failure).
 *
 * With `tabs` ([{ id, label, columns, bulk, body }]) the list is a TabbedList instead: each tab is its own table with
 * its own tools in the tray, and `activeId` (the open tab) lets the title's stats and line follow it.
 */
export const AutomationPage = ({
    title = "Automation",
    description,
    total = null,
    subNav = null,
    columns = null,
    bulk = null,
    tabs = null,
    activeId = null,
    state,
    load,
    busy,
    notices = null,
    what,
    body = null,
}) => {
    const table = (cols, rows) =>
        div({ class: "automation-rows", style: `--value-columns: ${cols.widths}` }, ...toNodes(rows));
    const list = tabs
        ? TabbedList({
              name: `${title}: ${what}`,
              activeId,
              tabs: tabs.map((tab) => ({ id: tab.id, label: tab.label, content: table(tab.columns, tab.body) })),
              // Every tab's tools are made once; only the open tab's show.
              tools: (open, ask) =>
                  tabs.map((tab) =>
                      div({ class: "automation-tools", hidden: () => open.val !== tab.id }, tab.bulk.tools(ask))
                  ),
              toolsLabel: (open) => tabs.find((tab) => tab.id === open.val)?.bulk.label() ?? "",
          })
        : ListPanel({
              className: "automation-list",
              tools: (_, ask) => bulk.tools(ask),
              toolsLabel: () => bulk.label(),
              body: table(columns, body),
          });
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container automation-page",
        title,
        description,
        total,
        actions: RefreshButton({ onRefresh: load, disabled: busy }),
        subNav,
        topNotices: notices,
        state,
        loadingText: `Reading ${what}`,
        errorTitle: `Couldn't read ${what}`,
        initialWrapperClass: "account-list",
        body: div({ class: "account-list account-list--tabbed" }, list),
    });
};

/**
 * What every system's automation tab shares: the entries of its automations (`cheats`, one state each, in `entries`)
 * with their switch rows in `switches`, and the tab's read as a step. `read(automation)` is the tab's own direct
 * reads, handed the read of cheatConfig.automation (sync its picks and settings there). `load()` queues the read (the
 * tab calls it once, and Refresh calls it); `afterSave` is the same read for createAutomationPicks and
 * createAutomationSetting, so the tab follows every save and bulk save; a read that fails there is said as the tab's
 * read error until a read works. `atStart(cheat)` is whether the last read found it in the startup cheats.
 */
export const useAutomationTab = ({ label, cheats, read, switchColumn = null }) => {
    const entries = cheats.map(() => van.state(null));
    const startup = van.state([]);
    const waiting = useStillWaiting();
    const { loading, error, run } = useAccountLoad({ label });
    const switches = div();
    // After a switch row's click: the automations, and the startup list it changed too (Enable all reads it).
    const readSwitches = () =>
        inTurn(async () => {
            const [list, config] = await Promise.all([readAutomations(), fetchConfig()]);
            cheats.forEach((cheat, i) =>
                showAutomation(entries[i], list.find((found) => found.cheat === cheat) ?? null)
            );
            startup.val = config.startupCheats ?? [];
        }, waiting.onLate);
    const readTab = async (afterSave = false) => {
        const [list, config] = await Promise.all([readAutomations(), fetchConfig()]);
        cheats.forEach((cheat, i) => showAutomation(entries[i], list.find((found) => found.cheat === cheat) ?? null));
        startup.val = config.startupCheats ?? [];
        if (!switches.firstChild && entries.every((entry) => entry.val))
            switches.append(
                ...entries.map((entry) => AutomationRow({ entry, onSwitched: readSwitches, column: switchColumn }))
            );
        // Only a read of the game itself is taken. The server's copy may hold an edit the game refused (after a save,
        // its own read-back already kept that out), and taken as the first read it would let a later save overwrite
        // what the game holds.
        if (!config.gameRead) {
            if (afterSave) return;
            throw new Error(GAME_NOT_READ);
        }
        await read(config.cheatConfig.automation);
        error.val = null; // this read, the newest to run, worked: an older one's failure goes
    };
    return {
        entries,
        switches,
        waiting,
        loading,
        error,
        atStart: (cheat) => startup.val.includes(cheat),
        load: () => run(() => inTurn(() => readTab(), waiting.onLate)),
        afterSave: () =>
            readTab(true).catch((caught) => {
                error.val = caught.message;
            }),
    };
};
