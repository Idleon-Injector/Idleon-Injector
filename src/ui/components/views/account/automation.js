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
import { AccountRow } from "./components/AccountRow.js";
import { useWriteStatus } from "./accountShared.js";
import { Said, useSaid } from "../../inPlace.js";

const { div, input, label, span } = van.tags;

/** Every automation, with its status while it runs. A direct read: inside a step it gives the settled answer. */
export const readAutomations = () => readComputed("automation", "list");

/** How long a step may wait for the game before its caller is told it is still waiting. */
export const steps = { timeoutMs: 30000 };

let queue = Promise.resolve();

/**
 * Run `task` as the next step in the pages' one queue; resolves or rejects with it, however long that takes (neither
 * the game bridge nor the API calls time out). The next step waits for it to end, so a late answer can't land after a
 * newer change. `onLate(notice)`, when given, is called once if the step hasn't ended `steps.timeoutMs` after it was
 * asked for (waiting behind an earlier step counts), and `onLate(null)` once that late step ends: a notice only, which
 * the step's own outcome replaces.
 */
export const inTurn = (task, onLate = null) => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    if (onLate) {
        let late = false;
        const timer = setTimeout(() => {
            late = true;
            onLate(`still waiting for the game after ${steps.timeoutMs / 1000} s`);
        }, steps.timeoutMs);
        const stop = () => {
            clearTimeout(timer);
            if (late) onLate(null);
        };
        run.then(stop, stop);
    }
    return run;
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
            return notice.val === null ? said.val : { kind: "failed", text: notice.val };
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
export const AutomationRow = ({ entry, onSwitched = null }) => {
    const { status, run } = useWriteStatus();
    const said = useSaid();
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
                            // Until the outcome replaces it.
                            (notice) => notice && said.say("failed", notice)
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
        if (error) return `Last error: ${error}`;
        if (on === null) return "Unknown: press Refresh";
        return on ? (said ?? "On") : "Off";
    };
    return AccountRow({
        rowClass: "automation-row",
        status,
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, name),
            span({ class: "automation-row__status", role: "status" }, line),
            Said({ said: said.said, className: "said--line", kinds: ["failed"] })
        ),
        controls: label({ class: "toggle-switch" }, checkbox, span({ class: "slider", "aria-hidden": "true" })),
    });
};

/**
 * A system's saved picks, cheatConfig.automation[group]: one { id, on, stopAt? } per item. What the game accepted (the
 * last read of the list, or a list it took) is kept apart from the edits still queued; each row shows the accepted item
 * with its queued edits on top. An edit queues a step that sends the accepted list plus only that edit to the game,
 * then the file, then reads back what the game holds: a taken edit joins the accepted list, a refused one is dropped,
 * and a read that works replaces the list. With `cheat`, the same step then turns that automation on (now and at
 * start) when the game runs an item the edit switched on, and reads its entry back into `entry` (a state, for its
 * AutomationRow).
 */
export const createAutomationPicks = (group, { cheat = null, entry = null } = {}) => {
    const items = new Map(); // id -> the states its row shows
    let accepted = new Map(); // id -> { on, stopAt }: what the game holds, as far as the page knows
    const queued = []; // [id, patch] of the edits whose step hasn't ended, oldest first
    const fileBehind = van.state(false); // the game took the last list, the config file didn't

    const get = (id) => {
        if (!items.has(id)) items.set(id, { on: van.state(false), stopAt: van.state(null), draft: van.state("") });
        return items.get(id);
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
            const untouched = (getNumberInputLiveRaw(item.draft) ?? item.draft.val) === stopAtText(item.stopAt.val);
            item.on.val = Boolean(shown.get(id)?.on);
            item.stopAt.val = shown.get(id)?.stopAt ?? null;
            if (untouched) showStopAt(item);
        }
    };

    /** Take a read of the list (a step's, so it is newer than every step before it) as what the game holds. */
    const sync = (entries) => {
        accepted = new Map(entries.map(({ id, on, stopAt = null }) => [String(id), { on: Boolean(on), stopAt }]));
        show();
    };

    // Switched-off items stay while they carry a stop-at, so it survives.
    const toConfig = (list) =>
        [...list]
            .filter(([, item]) => item.on || item.stopAt !== null)
            .map(([id, { on, stopAt }]) => ({ id, on, ...(stopAt !== null ? { stopAt } : {}) }));

    // Show `patches` ([id, { on } or { stopAt }]) and queue the step that saves them onto the accepted list.
    const save = (patches, onLate) => {
        const mine = patches.map(([id, patch]) => [id, patch]); // this step's own entries in `queued`
        queued.push(...mine);
        show();
        const switched = patches.filter(([, patch]) => patch.on).map(([id]) => id);
        return inTurn(async () => {
            let failure = null;
            const next = withEdits(accepted, patches);
            try {
                const list = toConfig(next);
                const result = await updateSessionConfig({ cheatConfig: { automation: { [group]: list } } });
                if (result.message !== "Configuration updated successfully")
                    throw new Error(result.details || result.message || "The game didn't take the change");
                accepted = next;
                fileBehind.val = true;
                await saveConfigFile({ cheatConfig: { automation: { [group]: list } } }).catch((error) => {
                    throw Object.assign(new Error(`in the game, but not saved to the file: ${error.message}`), {
                        fileOnly: true,
                    });
                });
                fileBehind.val = false;
            } catch (error) {
                failure = error;
            }
            // This step's edits are settled: a taken one is in the accepted list, a refused one goes. Then read back
            // what the game holds; if that read fails, the accepted list stands.
            for (const edit of mine) queued.splice(queued.indexOf(edit), 1);
            const held = (await fetchConfig().catch(() => null))?.cheatConfig.automation[group];
            if (held) sync(held);
            else show();
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
            if (failure) throw failure;
        }, onLate);
    };

    /** Change one item's fields (`patch`: { on } or { stopAt }). `onLate` as for inTurn. */
    const set = (id, patch, onLate = null) => save([[id, patch]], onLate);
    /** Switch every item in `ids` on or off with one save. */
    const setAll = (ids, on, onLate = null) =>
        save(
            ids.map((id) => [id, { on }]),
            onLate
        );
    /** Send the list again: after a file save failed, the field's Enter retries it. */
    const resave = (onLate = null) => save([], onLate);

    return { get, sync, set, setAll, resave, fileBehind: () => fileBehind.val };
};

const stopAtText = (stopAt) => (stopAt === null ? "" : String(stopAt));
/** Put an item's saved stop-at back in its field ("" is no limit). */
const showStopAt = (item) => setNumberInputValue(item.draft, stopAtText(item.stopAt.val));

const parseStopAt = (raw) => {
    const text = String(raw ?? "").trim();
    if (text === "") return null;
    if (!/^\d+$/.test(text)) throw new Error("a whole number, or empty for no limit");
    return Number(text);
};

/**
 * An item's row: name, a badge, its stop-at (empty is no limit; saves on Enter or on leaving it) and its switch.
 * The switch and the stop-at share one save state; the row's saves finish in the order they were made, so what it
 * shows is the newest one's outcome.
 */
export const PickRow = ({ picks, id, name, badge, stopAtTitle = "Stop at" }) => {
    const item = picks.get(id);
    const draft = item.draft;
    let fileOnly = null; // the reason shown for the row's last failure that was only at the file
    // The notice while any of this row's saves still waits for the game; then the newest outcome shows.
    const late = useStillWaiting();
    // `task(onLate)` starts the save.
    const track = (task) => () =>
        task(late.onLate).catch((error) => {
            if (error.fileOnly) fileOnly = saveFailureReason(error);
            throw error;
        });
    const save = useAutoSave({
        prepare: () => {
            const typed = getNumberInputLiveRaw(draft) ?? draft.val;
            const next = parseStopAt(typed);
            if (next === item.stopAt.val) {
                showStopAt(item);
                // The game has it but the file may not: Enter saves the list again.
                return picks.fileBehind() ? { write: track((onLate) => picks.resave(onLate)) } : { unchanged: true };
            }
            // A value typed while this one saves stays in the field for the save after it.
            const stillTyped = () => (getNumberInputLiveRaw(draft) ?? draft.val) === typed;
            return {
                write: track((onLate) =>
                    picks.set(id, { stopAt: next }, onLate).finally(() => stillTyped() && showStopAt(item))
                ),
            };
        },
        revert: () => showStopAt(item),
    });
    const step = (delta) => () => {
        const current = parseStopAt(getNumberInputLiveRaw(draft) ?? draft.val);
        if (current === null && delta < 0) return;
        setNumberInputValue(draft, String(Math.max(0, (current ?? 0) + delta)));
    };
    const checkbox = input({
        type: "checkbox",
        role: "switch",
        "aria-label": `Buy ${name}`,
        checked: () => item.on.val,
        onchange: (e) => {
            const on = e.target.checked;
            void save
                .run(track((onLate) => picks.set(id, { on }, onLate)))
                .then(() => (checkbox.checked = item.on.val));
        },
    });

    // A save still waiting for the game says so. A failure only at the file goes once a later save (any row's) writes
    // the file.
    const waiting = () => late.notice.val !== null;
    const status = {
        get val() {
            if (waiting()) return "error";
            const shown = save.status.val === "error" && save.reason.val === fileOnly;
            return shown && !picks.fileBehind() ? null : save.status.val;
        },
    };
    const reason = {
        get val() {
            return waiting() ? late.notice.val : save.reason.val;
        },
    };

    return AccountRow({
        rowClass: "account-row--wide-controls automation-pick",
        info: span({ class: "account-row__name" }, name),
        badge,
        controls: [
            div(
                { class: () => `account-field-metric ${saveStateClass(status.val, save.undo)}`, ...save.handlers },
                div(
                    { class: "account-inline-field__head" },
                    span({ class: "account-field-metric__label" }, stopAtTitle),
                    SaveState({ status, reason, undo: save.undo })
                ),
                NumberInput({
                    mode: "int",
                    value: draft,
                    placeholder: "No limit",
                    "aria-label": `${name} ${stopAtTitle.toLowerCase()}`,
                    onDecrement: step(-1),
                    onIncrement: step(1),
                })
            ),
            label({ class: "toggle-switch" }, checkbox, span({ class: "slider", "aria-hidden": "true" })),
        ],
    });
};
