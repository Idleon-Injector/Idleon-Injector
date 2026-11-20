/**
 * Building blocks for Account › Automation and each system's automation tab.
 *
 * An automation is an "automation <system>" toggle cheat; its picks are cheatConfig.automation[system]. The game
 * lists them in readComputed("automation", "list"): { id, cheat, label, on, error, status }.
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
import { SaveState, saveStateClass, useAutoSave } from "./autoSave.js";
import { AccountRow } from "./components/AccountRow.js";
import { useWriteStatus } from "./accountShared.js";
import { Said, useSaid } from "../../inPlace.js";

const { div, input, label, span } = van.tags;

/** Every automation, with its status while it runs. */
export const readAutomations = () => readComputed("automation", "list");

let queue = Promise.resolve();
// Startup changes (and the switches that make them) run one at a time from the click on, so each reads the list the
// last one wrote, and an Off clicked while an On is still answering can't be overtaken by the On's startup change.
const inTurn = (task) => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
};

// The server merges what a save sends into the rest of the file, so only the startup list is read and written back.
const changeStartup = async (cheat, on) => {
    const { startupCheats = [] } = await fetchConfig();
    if (startupCheats.includes(cheat) === on) return;
    await saveConfigFile({
        startupCheats: on ? [...startupCheats, cheat] : startupCheats.filter((command) => command !== cheat),
    });
};

/** Turn an automation on or off, now and at every start. */
export const switchAutomation = (cheat, on) =>
    inTurn(async () => {
        await executeCheatAction(cheat, on);
        await changeStartup(cheat, on);
    });

/**
 * Make sure an automation runs, now and at every start. Whether it runs is read in turn with the switches, so a
 * switch clicked just before is counted; one already running is only put in the startup cheats.
 */
export const ensureOn = (cheat) =>
    inTurn(async () => {
        const running = (await readAutomations()).find((automation) => automation.cheat === cheat)?.on;
        if (!running) await executeCheatAction(cheat, true);
        await changeStartup(cheat, true);
    });

/**
 * One row per automation: its name, what it is doing, and its switch. `entry` is a state holding the game's
 * entry; `onSwitched` runs after a switch saved (the page reads the list again).
 */
export const AutomationRow = ({ entry, onSwitched = null }) => {
    const { status, run } = useWriteStatus();
    const said = useSaid();
    let clicks = 0; // an older click that fails after a newer one ran says nothing
    const name = () => entry.val.label ?? entry.val.cheat;
    const checkbox = input({
        type: "checkbox",
        role: "switch",
        "aria-label": () => `${name()} automation`,
        checked: () => entry.val.on,
        onchange: (e) => {
            const on = e.target.checked;
            const click = ++clicks;
            said.clear();
            // The game can take the switch and the file still fail, so read back what runs either way.
            void run(
                async () => {
                    let failed = false;
                    try {
                        await switchAutomation(entry.val.cheat, on);
                        entry.val = { ...entry.val, on };
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
                { onError: (caught) => click === clicks && said.say("failed", caught.message) }
            ).then(() => (checkbox.checked = entry.val.on));
        },
    });
    const line = () => {
        const { on, status: said, error } = entry.val;
        if (error) return `Last error: ${error}`;
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
 * A system's saved picks, cheatConfig.automation[group]: one { id, on, stopAt? } per item, kept as states by id.
 * Edits show at once and their saves run one at a time, each sending the whole list. When the last queued save ends,
 * failed, the controls read back what the game holds, so they never show a value it didn't take. Then, if an item a
 * save switched on runs in the game, `onTurnedOn` runs (the system's own switch goes on with it, so buying starts at
 * once). A failure stays at its item until a later save stores what that item's failed save wanted.
 */
export const createAutomationPicks = (group, { onTurnedOn = null } = {}) => {
    const items = new Map();
    let queue = Promise.resolve();
    let pending = 0;
    let edits = 0; // counts saves, so a read started before one can be told apart
    let fileBehind = false; // the game took the last list, the config file didn't
    const switchedOn = new Set(); // ids saves switched on, until the last queued save ends

    const get = (id) => {
        if (!items.has(id))
            items.set(id, {
                on: van.state(false),
                stopAt: van.state(null),
                draft: van.state(""),
                stored: van.state(0), // counts saves that stored what this item's failed save wanted
                wanted: null, // what that failed save wanted, until a save stores it
            });
        return items.get(id);
    };

    // A read that lands while a save is queued, or that started before a save, would undo the newest edits, so it
    // waits for the next read. `since` is edits() when the read started.
    const sync = (entries, since = edits) => {
        if (pending || since !== edits) return;
        const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
        for (const id of byId.keys()) get(id);
        for (const [id, item] of items) {
            // A field showing other text than the value it replaces holds the player's typing: it stays.
            const untouched = (getNumberInputLiveRaw(item.draft) ?? item.draft.val) === stopAtText(item.stopAt.val);
            item.on.val = Boolean(byId.get(id)?.on);
            item.stopAt.val = byId.get(id)?.stopAt ?? null;
            if (untouched) showStopAt(item);
        }
    };

    // Switched-off items stay while they carry a stop-at, so it survives.
    const toConfig = () =>
        [...items]
            .filter(([, item]) => item.on.val || item.stopAt.val !== null)
            .map(([id, item]) => ({
                id,
                on: item.on.val,
                ...(item.stopAt.val !== null ? { stopAt: item.stopAt.val } : {}),
            }));

    const persist = async () => {
        const list = toConfig();
        const result = await updateSessionConfig({ cheatConfig: { automation: { [group]: list } } });
        if (result.message !== "Configuration updated successfully")
            throw new Error(result.details || result.message || "The game didn't take the change");
        fileBehind = true;
        try {
            await saveConfigFile({ cheatConfig: { automation: { [group]: list } } });
        } catch (error) {
            throw new Error(`in the game, but not saved to the file: ${error.message}`);
        }
        fileBehind = false;
        // The list is stored: an item whose failed save wanted what it now holds has nothing left to say.
        const sent = new Map(list.map((entry) => [entry.id, entry]));
        for (const [id, item] of items) {
            const now = { on: Boolean(sent.get(id)?.on), stopAt: sent.get(id)?.stopAt ?? null };
            if (item.wanted && Object.entries(item.wanted).every(([field, value]) => now[field] === value)) {
                item.wanted = null;
                item.stored.val++;
            }
        }
    };

    // Apply `patches` ([id, { on } or { stopAt }]) and save them with every other edit.
    const save = async (patches) => {
        edits++;
        for (const [id, patch] of patches) {
            Object.entries(patch).forEach(([field, value]) => (get(id)[field].val = value));
            if (patch.on) switchedOn.add(id);
        }
        queue = queue.catch(() => {}).then(persist);
        pending++;
        let failure = null;
        try {
            await queue;
        } catch (error) {
            failure = error;
        } finally {
            pending--;
        }
        if (failure) for (const [id, patch] of patches) get(id).wanted = { ...get(id).wanted, ...patch };
        // A save still queued carries these edits and decides when it ends; the last one decides from the game.
        if (!pending) {
            if (failure) {
                const since = edits;
                // A failed read-back leaves the controls as they are; the save's own failure is what gets said.
                const read = await fetchConfig().catch(() => null);
                if (read) sync(read.cheatConfig.automation[group], since);
            }
            const turnOn = [...switchedOn].some((switched) => get(switched).on.val);
            switchedOn.clear();
            if (turnOn) await onTurnedOn?.();
        }
        if (failure) throw failure;
    };

    /** Change one item's fields (`patch`: { on } or { stopAt }). */
    const set = (id, patch) => save([[id, patch]]);
    /** Switch every item in `ids` on or off with one save. */
    const setAll = (ids, on) => save(ids.map((id) => [id, { on }]));
    /** Send the list again: after a file save failed, the field's Enter retries it. */
    const resave = () => save([]);

    return { get, sync, set, setAll, resave, edits: () => edits, fileBehind: () => fileBehind };
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
 * The switch and the stop-at share one save state.
 */
export const PickRow = ({ picks, id, name, badge, stopAtTitle = "Stop at" }) => {
    const item = picks.get(id);
    const draft = item.draft;
    let failedAt = Infinity; // item.stored when this row's last save failed; Infinity while no failed save is out
    const remember = (task) => () => {
        failedAt = Infinity;
        return task().catch((error) => {
            failedAt = item.stored.val;
            throw error;
        });
    };
    const save = useAutoSave({
        prepare: () => {
            failedAt = Infinity; // a new try: what it says stands
            const typed = getNumberInputLiveRaw(draft) ?? draft.val;
            const next = parseStopAt(typed);
            if (next === item.stopAt.val) {
                showStopAt(item);
                // The game has it but the file may not: Enter saves the list again.
                return picks.fileBehind() ? { write: remember(() => picks.resave()) } : { unchanged: true };
            }
            // A value typed while this one saves stays in the field for the save after it.
            const stillTyped = () => (getNumberInputLiveRaw(draft) ?? draft.val) === typed;
            return {
                write: remember(() => picks.set(id, { stopAt: next }).finally(() => stillTyped() && showStopAt(item))),
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
            void save.run(remember(() => picks.set(id, { on }))).then(() => (checkbox.checked = item.on.val));
        },
    });

    // The row's save state, with a failure gone once a later save stored what it wanted.
    const status = {
        get val() {
            return save.status.val === "error" && item.stored.val > failedAt ? null : save.status.val;
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
                    SaveState({ status, reason: save.reason, undo: save.undo })
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
