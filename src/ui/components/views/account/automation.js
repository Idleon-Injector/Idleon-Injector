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

let fileQueue = Promise.resolve();

/**
 * Save the whole file: /api/config/save rewrites config.custom.js from what it is handed. `startup(list)` changes the
 * startup cheats, or returns null when they need no change and nothing is written. Saves run one at a time, each
 * reading the file the last one wrote, so two that overlap can't drop each other's change.
 */
const saveFile = (startup = (list) => list) => {
    const run = fileQueue.then(async () => {
        const config = await fetchConfig();
        if (!config?.cheatConfig) throw new Error("Could not read the config back to save it");
        const startupCheats = startup(config.startupCheats ?? []);
        if (startupCheats === null) return;
        await saveConfigFile({ startupCheats, cheatConfig: config.cheatConfig, injectorConfig: config.injectorConfig });
    });
    fileQueue = run.catch(() => {});
    return run;
};

/** Keep an automation in the startup cheats (or out of them), without running it now. */
export const setAtStart = (cheat, on) =>
    saveFile((list) => {
        if (list.includes(cheat) === on) return null;
        return on ? [...list, cheat] : list.filter((command) => command !== cheat);
    });

let switchQueue = Promise.resolve();

/**
 * Turn an automation on or off, now and at every start. Switches run one at a time from the click on, so an Off
 * clicked while an On is still answering can't be overtaken by the On's startup change.
 */
export function switchAutomation(cheat, on) {
    const run = switchQueue.then(async () => {
        await executeCheatAction(cheat, on);
        await setAtStart(cheat, on);
    });
    switchQueue = run.catch(() => {});
    return run;
}

/**
 * One row per automation: its name, what it is doing, and its switch. `entry` is a state holding the game's
 * entry; `onSwitched` runs after a switch saved (the page reads the list again).
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
            said.clear();
            // The game can take the switch and the file still fail, so read back what runs either way.
            void run(
                async () => {
                    try {
                        await switchAutomation(entry.val.cheat, on);
                        entry.val = { ...entry.val, on };
                    } finally {
                        await onSwitched?.();
                    }
                },
                { onError: (caught) => said.say("failed", caught.message) }
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
 * Saves run one at a time and each sends the whole list, so the newest values always win. `onTurnedOn` runs after
 * a save that switched an item on (the system's own switch goes on with it, so buying starts at once).
 */
export const createAutomationPicks = (group, { onTurnedOn = null } = {}) => {
    const items = new Map();
    let queue = Promise.resolve();
    let pending = 0;
    let edits = 0; // counts saves, so a read started before one can be told apart
    // id -> { on, stopAt } the game last took (read or saved): what a refused save puts a field back to.
    let accepted = new Map();
    const snapshot = () => new Map([...items].map(([id, item]) => [id, { on: item.on.val, stopAt: item.stopAt.val }]));

    const get = (id) => {
        if (!items.has(id)) items.set(id, { on: van.state(false), stopAt: van.state(null), draft: van.state("") });
        return items.get(id);
    };

    // A read that lands while a save is queued, or that started before a save, would undo the newest edits, so it
    // waits for the next read. `since` is edits() when the read started.
    const sync = (entries, since = edits) => {
        if (pending || since !== edits) return;
        const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
        for (const id of byId.keys()) get(id);
        for (const [id, item] of items) {
            item.on.val = Boolean(byId.get(id)?.on);
            item.stopAt.val = byId.get(id)?.stopAt ?? null;
            showStopAt(item);
        }
        accepted = snapshot();
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
        const sent = snapshot();
        const result = await updateSessionConfig({ cheatConfig: { automation: { [group]: toConfig() } } });
        if (result.message !== "Configuration updated successfully")
            throw new Error(result.details || result.message || "The game didn't take the change");
        accepted = sent;
        try {
            await saveFile();
        } catch (error) {
            // The game runs the change already, so the controls keep it; only the file is behind.
            throw Object.assign(new Error(`in the game, but not saved to the file: ${error.message}`), {
                applied: true,
            });
        }
    };

    // Apply `patches` ([id, { on } or { stopAt }]) and save them in one go. If the game refuses, each field goes back
    // to what the game last took (an earlier save may already have sent this value), unless a newer edit has changed
    // it since: that edit's own save carries it.
    const save = async (patches) => {
        edits++;
        const undo = patches.map(([id, patch]) => {
            const item = get(id);
            const before = Object.fromEntries(Object.keys(patch).map((field) => [field, item[field].val]));
            Object.entries(patch).forEach(([field, value]) => (item[field].val = value));
            return () =>
                Object.entries(before).forEach(([field, value]) => {
                    if (item[field].val === patch[field]) item[field].val = accepted.get(id)?.[field] ?? value;
                });
        });
        queue = queue.catch(() => {}).then(persist);
        pending++;
        try {
            await queue;
        } catch (error) {
            if (!error.applied) undo.forEach((putBack) => putBack());
            throw error;
        } finally {
            pending--;
        }
        if (patches.some(([, patch]) => patch.on)) await onTurnedOn?.();
    };

    /** Change one item's fields (`patch`: { on } or { stopAt }). */
    const set = (id, patch) => save([[id, patch]]);
    /** Switch every item in `ids` on or off with one save. */
    const setAll = (ids, on) => save(ids.map((id) => [id, { on }]));

    return { get, sync, set, setAll, edits: () => edits };
};

/** Put an item's saved stop-at back in its field ("" is no limit). */
const showStopAt = (item) => setNumberInputValue(item.draft, item.stopAt.val === null ? "" : String(item.stopAt.val));

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
    const save = useAutoSave({
        prepare: () => {
            const typed = getNumberInputLiveRaw(draft) ?? draft.val;
            const next = parseStopAt(typed);
            if (next === item.stopAt.val) {
                showStopAt(item);
                return { unchanged: true };
            }
            // A value typed while this one saves stays in the field for the save after it.
            const stillTyped = () => (getNumberInputLiveRaw(draft) ?? draft.val) === typed;
            return { write: () => picks.set(id, { stopAt: next }).finally(() => stillTyped() && showStopAt(item)) };
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
            void save.run(() => picks.set(id, { on })).then(() => (checkbox.checked = item.on.val));
        },
    });

    return AccountRow({
        rowClass: "account-row--wide-controls automation-pick",
        info: span({ class: "account-row__name" }, name),
        badge,
        controls: [
            div(
                { class: () => `account-field-metric ${saveStateClass(save.status.val, save.undo)}`, ...save.handlers },
                div(
                    { class: "account-inline-field__head" },
                    span({ class: "account-field-metric__label" }, stopAtTitle),
                    SaveState({ status: save.status, reason: save.reason, undo: save.undo })
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
