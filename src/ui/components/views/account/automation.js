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

const { div, input, label, span } = van.tags;

/** Every automation, with its status while it runs. */
export const readAutomations = () => readComputed("automation", "list");

/**
 * Save the whole file: /api/config/save rewrites config.custom.js from what it is handed. `startup(list)` changes the
 * startup cheats.
 */
const saveFile = async (startup = (list) => list) => {
    const config = await fetchConfig();
    if (!config?.cheatConfig) throw new Error("Could not read the config back to save it");
    await saveConfigFile({
        startupCheats: startup(config.startupCheats ?? []),
        cheatConfig: config.cheatConfig,
        injectorConfig: config.injectorConfig,
    });
};

/** Turn an automation on or off, now and at every start. */
export async function switchAutomation(cheat, on) {
    await executeCheatAction(cheat, on);
    await saveFile((list) => {
        const others = list.filter((command) => command !== cheat);
        return on ? [...others, cheat] : others;
    });
}

/**
 * One row per automation: its name, what it is doing, and its switch. `entry` is a state holding the game's
 * entry; `onSwitched` runs after a switch saved (the page reads the list again).
 */
export const AutomationRow = ({ entry, onSwitched = null }) => {
    const { status, run } = useWriteStatus();
    const name = () => entry.val.label ?? entry.val.cheat;
    const checkbox = input({
        type: "checkbox",
        role: "switch",
        "aria-label": () => `${name()} automation`,
        checked: () => entry.val.on,
        onchange: (e) => {
            const on = e.target.checked;
            void run(async () => {
                await switchAutomation(entry.val.cheat, on);
                entry.val = { ...entry.val, on };
                await onSwitched?.();
            }).then(() => (checkbox.checked = entry.val.on));
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
            span({ class: "automation-row__status", role: "status" }, line)
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

    const get = (id) => {
        if (!items.has(id)) items.set(id, { on: van.state(false), stopAt: van.state(null), draft: van.state("") });
        return items.get(id);
    };

    // A read that lands while a save is queued would undo the newest edits, so it waits for the next read.
    const sync = (entries) => {
        if (pending) return;
        const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
        for (const id of byId.keys()) get(id);
        for (const [id, item] of items) {
            item.on.val = Boolean(byId.get(id)?.on);
            item.stopAt.val = byId.get(id)?.stopAt ?? null;
            showStopAt(item);
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
        const result = await updateSessionConfig({ cheatConfig: { automation: { [group]: toConfig() } } });
        if (result.message !== "Configuration updated successfully")
            throw new Error(result.details || result.message || "The game didn't take the change");
        await saveFile();
    };

    // Apply `patches` ([id, { on } or { stopAt }]) and save them in one go; they go back if the save fails.
    const save = async (patches) => {
        const undo = patches.map(([id, patch]) => {
            const item = get(id);
            const before = Object.fromEntries(Object.keys(patch).map((field) => [field, item[field].val]));
            Object.entries(patch).forEach(([field, value]) => (item[field].val = value));
            return () => Object.entries(before).forEach(([field, value]) => (item[field].val = value));
        });
        queue = queue.catch(() => {}).then(persist);
        pending++;
        try {
            await queue;
        } catch (error) {
            undo.forEach((putBack) => putBack());
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

    return { get, sync, set, setAll };
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
            const next = parseStopAt(getNumberInputLiveRaw(draft) ?? draft.val);
            if (next === item.stopAt.val) {
                showStopAt(item);
                return { unchanged: true };
            }
            return { write: () => picks.set(id, { stopAt: next }).finally(() => showStopAt(item)) };
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
