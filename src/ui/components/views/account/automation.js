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

const { div, input, label, option, select, span } = van.tags;

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

/** Keep an automation in the startup cheats (or out of them), without running it now. */
export const setAtStart = (cheat, on) => inTurn(() => changeStartup(cheat, on));

/** Turn an automation on or off, now and at every start. */
export const switchAutomation = (cheat, on) =>
    inTurn(async () => {
        await executeCheatAction(cheat, on);
        await changeStartup(cheat, on);
    });

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
 * A system's saved picks, cheatConfig.automation[group]: one { id, on, stopAt?, priority? } per item, kept as states
 * by id (priority 1 is High, 2 Low, none Balanced). With `savingKey`, cheatConfig.automation[savingKey] is a saving %
 * per currency, kept by index and saved with the list. Edits show at once and their saves run one at a time, each
 * sending the whole list. When a save fails, the controls read back what the game holds, so they never show a value
 * it didn't take. `onTurnedOn` runs when a save leaves an item it switched on running in the game (the system's own
 * switch goes on with it, so buying starts at once).
 */
export const createAutomationPicks = (group, { onTurnedOn = null, savingKey = null } = {}) => {
    const items = new Map();
    const savings = new Map(); // currency index -> { value, draft }
    let queue = Promise.resolve();
    let pending = 0;
    let edits = 0; // counts saves, so a read started before one can be told apart
    let fileBehind = false; // the game took the last list, the config file didn't

    const get = (id) => {
        if (!items.has(id))
            items.set(id, {
                on: van.state(false),
                stopAt: van.state(null),
                priority: van.state(null),
                draft: van.state(""),
            });
        return items.get(id);
    };
    const saving = (index) => {
        if (!savings.has(index)) savings.set(index, { value: van.state(null), draft: van.state("") });
        return savings.get(index);
    };

    // A read that lands while a save is queued, or that started before a save, would undo the newest edits, so it
    // waits for the next read. `since` is edits() when the read started; `savingList` is savingKey's list.
    const sync = (entries, since = edits, savingList = []) => {
        if (pending || since !== edits) return;
        savingList.forEach((value, index) => {
            saving(index).value.val = value;
            showValue(saving(index));
        });
        const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
        for (const id of byId.keys()) get(id);
        for (const [id, item] of items) {
            item.on.val = Boolean(byId.get(id)?.on);
            item.stopAt.val = byId.get(id)?.stopAt ?? null;
            item.priority.val = byId.get(id)?.priority ?? null;
            showStopAt(item);
        }
    };

    // Switched-off items stay while they carry a stop-at or a priority, so it survives.
    const toConfig = () =>
        [...items]
            .filter(([, item]) => item.on.val || item.stopAt.val !== null || item.priority.val !== null)
            .map(([id, item]) => ({
                id,
                on: item.on.val,
                ...(item.stopAt.val !== null ? { stopAt: item.stopAt.val } : {}),
                ...(item.priority.val !== null ? { priority: item.priority.val } : {}),
            }));

    const persist = async () => {
        const list = { [group]: toConfig() };
        // Only once read: an empty list would wipe the saved one.
        if (savingKey && savings.size) {
            const values = [];
            for (const [index, entry] of savings) values[index] = entry.value.val;
            list[savingKey] = Array.from(values, (value) => value ?? null); // a gap the game reads as its default
        }
        const result = await updateSessionConfig({ cheatConfig: { automation: list } });
        if (result.message !== "Configuration updated successfully")
            throw new Error(result.details || result.message || "The game didn't take the change");
        fileBehind = true;
        try {
            await saveConfigFile({ cheatConfig: { automation: list } });
        } catch (error) {
            throw new Error(`in the game, but not saved to the file: ${error.message}`);
        }
        fileBehind = false;
    };

    // Apply `patches` ([id, { on }, { stopAt } or { priority }]) and `savingPatch` ([index, %]), and save them with
    // every other edit.
    const save = async (patches, savingPatch = null) => {
        edits++;
        for (const [id, patch] of patches)
            Object.entries(patch).forEach(([field, value]) => (get(id)[field].val = value));
        if (savingPatch) saving(savingPatch[0]).value.val = savingPatch[1];
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
        // A save still queued carries these edits and reports its own outcome; otherwise the game is the truth.
        if (failure && !pending) {
            const since = edits;
            const { automation } = (await fetchConfig()).cheatConfig;
            sync(automation[group], since, savingKey ? automation[savingKey] : []);
        }
        if (patches.some(([id, patch]) => patch.on && get(id).on.val)) await onTurnedOn?.();
        if (failure) throw failure;
    };

    /** Change one item's fields (`patch`: { on }, { stopAt } or { priority }). */
    const set = (id, patch) => save([[id, patch]]);
    /** Change one currency's saving %. */
    const setSaving = (index, value) => save([], [index, value]);
    /** Switch every item in `ids` on or off with one save. */
    const setAll = (ids, on) => save(ids.map((id) => [id, { on }]));
    /** Send the list again: after a file save failed, the field's Enter retries it. */
    const resave = () => save([]);

    return { get, saving, sync, set, setSaving, setAll, resave, edits: () => edits, fileBehind: () => fileBehind };
};

/** Put an item's saved stop-at back in its field ("" is no limit). */
const showStopAt = (item) => setNumberInputValue(item.draft, item.stopAt.val === null ? "" : String(item.stopAt.val));
/** Put a saving % back in its field. */
const showValue = (entry) => setNumberInputValue(entry.draft, entry.value.val === null ? "" : String(entry.value.val));

const parseStopAt = (raw) => {
    const text = String(raw ?? "").trim();
    if (text === "") return null;
    if (!/^\d+$/.test(text)) throw new Error("a whole number, or empty for no limit");
    return Number(text);
};

const parsePercent = (raw) => {
    const text = String(raw ?? "").trim();
    if (!/^\d+$/.test(text) || Number(text) > 100) throw new Error("a whole number from 0 to 100");
    return Number(text);
};

/**
 * A saved number field (saves on Enter or on leaving it): `entry` holds its `draft`, `current()` is the saved value,
 * `show()` puts it back, `write(next)` saves a new one. Returns the field and its save, which a row's other controls
 * may share.
 */
const PicksField = ({
    picks,
    entry,
    current,
    show,
    parse,
    write,
    title,
    ariaLabel,
    placeholder = "",
    max = Infinity,
}) => {
    const { draft } = entry;
    const save = useAutoSave({
        prepare: () => {
            const typed = getNumberInputLiveRaw(draft) ?? draft.val;
            const next = parse(typed);
            if (next === current()) {
                show();
                // The game has it but the file may not: Enter saves the list again.
                return picks.fileBehind() ? { write: () => picks.resave() } : { unchanged: true };
            }
            // A value typed while this one saves stays in the field for the save after it.
            const stillTyped = () => (getNumberInputLiveRaw(draft) ?? draft.val) === typed;
            return { write: () => write(next).finally(() => stillTyped() && show()) };
        },
        revert: show,
    });
    const step = (delta) => () => {
        const value = parse(getNumberInputLiveRaw(draft) ?? draft.val);
        if (value === null && delta < 0) return;
        setNumberInputValue(draft, String(Math.min(max, Math.max(0, (value ?? 0) + delta))));
    };
    const node = div(
        { class: () => `account-field-metric ${saveStateClass(save.status.val, save.undo)}`, ...save.handlers },
        div(
            { class: "account-inline-field__head" },
            span({ class: "account-field-metric__label" }, title),
            SaveState({ status: save.status, reason: save.reason, undo: save.undo })
        ),
        NumberInput({
            mode: "int",
            value: draft,
            placeholder,
            "aria-label": ariaLabel,
            onDecrement: step(-1),
            onIncrement: step(1),
        })
    );
    return { save, node };
};

const PRIORITIES = [
    ["", "Balanced"],
    ["1", "High"],
    ["2", "Low"],
];

/**
 * An item's row: name, a badge, its stop-at (empty is no limit; saves on Enter or on leaving it) and its switch.
 * `label` names it for screen readers when `name` leans on its section heading; `detail` is an optional line under
 * the name; `priority` adds the High / Low / Balanced choice. The switch, the stop-at and the priority share one save
 * state.
 */
export const PickRow = ({
    picks,
    id,
    name,
    label: fullName = name,
    badge,
    stopAtTitle = "Stop at",
    detail = null,
    priority = false,
}) => {
    const item = picks.get(id);
    const stopAt = PicksField({
        picks,
        entry: item,
        current: () => item.stopAt.val,
        show: () => showStopAt(item),
        parse: parseStopAt,
        write: (next) => picks.set(id, { stopAt: next }),
        title: stopAtTitle,
        ariaLabel: `${fullName} ${stopAtTitle.toLowerCase()}`,
        placeholder: "No limit",
    });
    const { save } = stopAt;
    const checkbox = input({
        type: "checkbox",
        role: "switch",
        "aria-label": `Buy ${fullName}`,
        checked: () => item.on.val,
        onchange: (e) => {
            const on = e.target.checked;
            void save.run(() => picks.set(id, { on })).then(() => (checkbox.checked = item.on.val));
        },
    });
    const choice =
        priority &&
        select(
            {
                class: "select-base automation-priority",
                "aria-label": `${fullName} priority`,
                onchange: (e) => {
                    const next = e.target.value ? Number(e.target.value) : null;
                    void save
                        .run(() => picks.set(id, { priority: next }))
                        .then(() => (choice.value = String(item.priority.val ?? "")));
                },
            },
            PRIORITIES.map(([value, text]) =>
                option({ value, selected: () => String(item.priority.val ?? "") === value }, text)
            )
        );

    return AccountRow({
        rowClass: "account-row--wide-controls automation-pick",
        info: detail
            ? div(
                  { class: "account-row__name-group" },
                  span({ class: "account-row__name" }, name),
                  span({ class: "account-row__sub-label" }, detail)
              )
            : span({ class: "account-row__name" }, name),
        badge,
        controls: [
            stopAt.node,
            ...(choice ? [choice] : []),
            label({ class: "toggle-switch" }, checkbox, span({ class: "slider", "aria-hidden": "true" })),
        ],
    });
};

/**
 * A currency's saving % (picks made with `savingKey`): while it saves for its cheapest High or Low item, Balanced
 * items may spend up to this % of that item's cost. `detail` is the line under the name (what it holds and saves for).
 */
export const SavingRow = ({ picks, index, name, detail }) => {
    const entry = picks.saving(index);
    const field = PicksField({
        picks,
        entry,
        current: () => entry.value.val,
        show: () => showValue(entry),
        parse: parsePercent,
        write: (next) => picks.setSaving(index, next),
        title: "Balanced may spend %",
        ariaLabel: `${name}: % of what it saves for that Balanced items may spend`,
        max: 100,
    });
    return AccountRow({
        rowClass: "account-row--wide-controls automation-saving",
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, name),
            span({ class: "account-row__sub-label" }, detail)
        ),
        controls: field.node,
    });
};
