/**
 * Building blocks for Account › Automation and each system's automation tab.
 *
 * An automation is an "automation <system>" toggle cheat; its picks are cheatConfig.automation[system]. The game
 * lists them in readComputed("automation", "list"): { id, cheat, label, on, error, status }.
 *
 * Everything these pages do with the game and the config file runs as steps in one queue, one at a time, in the order
 * the player asked: item saves, automation switches, startup changes, bulk actions and the pages' reads. Nothing runs
 * alongside anything else, so each step's own read-back is the truth when it lands. Only what the player clicked or
 * typed shows ahead of the game, and only until its step runs.
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

/** Every automation, with its status while it runs. Read it inside a step (`inTurn`) to get a settled answer. */
export const readAutomations = () => readComputed("automation", "list");

let queue = Promise.resolve();
// While an item save queues its follow-up (`onTurnedOn`), the steps that follow-up asks for run only if the game took
// the item: a promise of true or false, set for the length of that synchronous call.
let onlyIf = null;

/**
 * Run `task` as the next step in the pages' one queue; resolves or rejects with it. A step never waits on another
 * queued step (that one would wait for it in turn): it calls the game and the file directly.
 */
export const inTurn = (task) => {
    const gate = onlyIf;
    const run = queue.then(async () => (gate && !(await gate) ? undefined : task()));
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

const switchNow = async (cheat, on) => {
    await executeCheatAction(cheat, on);
    await changeStartup(cheat, on);
};

/** Turn an automation on or off, now and at every start. */
export const switchAutomation = (cheat, on) => inTurn(() => switchNow(cheat, on));

/** Make sure an automation runs, now and at every start; one already running is only put in the startup cheats. */
export const ensureOn = (cheat) =>
    inTurn(async () => {
        const running = (await readAutomations()).find((automation) => automation.cheat === cheat)?.on;
        if (!running) await executeCheatAction(cheat, true);
        await changeStartup(cheat, true);
    });

/**
 * Switch every automation on or off, now and at every start: those off now or at start (a startup save that failed,
 * say) for on, those on now or at start for off. Decided when the step runs, after every switch asked for before it.
 * One that fails doesn't stop the rest; the first failure is thrown once all were tried.
 */
export const switchAll = (on) =>
    inTurn(async () => {
        const [automations, { startupCheats = [] }] = await Promise.all([readAutomations(), fetchConfig()]);
        let failure = null;
        for (const { cheat, on: running } of automations) {
            if (running === on && startupCheats.includes(cheat) === on) continue;
            await switchNow(cheat, on).catch((error) => (failure ??= error));
        }
        if (failure) throw failure;
    });

/**
 * One row per automation: its name, what it is doing, and its switch. `entry` is a state holding the game's
 * entry; `onSwitched` reads it back after a switch (it is queued after the switch, so it reads what the switch did).
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
            entry.val = { ...entry.val, on }; // what the player clicked, until the read-back
            // Clicks finish in the order they were made, so the newest click's outcome is the one left showing.
            void run(
                async () => {
                    let failed = false;
                    try {
                        await switchAutomation(entry.val.cheat, on);
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
 * An edit shows at once and queues a step that sends the whole list to the game, then the file, then reads back what
 * the game holds and shows it (items with a step of their own still queued keep showing what the player asked).
 * `onTurnedOn` is called when the player switches an item on; the steps it asks for (switchAutomation, ensureOn) are
 * queued right behind the save and run only if the game ended up running an item that save switched on, so a switch
 * the player clicks after the item still wins.
 */
export const createAutomationPicks = (group, { onTurnedOn = null } = {}) => {
    const items = new Map();
    let edits = 0; // counts edits, so a read taken before one can be told apart
    const fileBehind = van.state(false); // the game took the last list, the config file didn't

    const get = (id) => {
        if (!items.has(id))
            items.set(id, {
                on: van.state(false),
                stopAt: van.state(null),
                draft: van.state(""),
                ahead: 0, // this item's steps still queued: until they run it shows what the player asked
            });
        return items.get(id);
    };

    // Show what the game holds, except for items whose own step hasn't run yet. A field showing other text than the
    // value it replaces holds the player's typing: it stays.
    const show = (entries) => {
        const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
        for (const id of byId.keys()) get(id);
        for (const [id, item] of items) {
            if (item.ahead) continue;
            const untouched = (getNumberInputLiveRaw(item.draft) ?? item.draft.val) === stopAtText(item.stopAt.val);
            item.on.val = Boolean(byId.get(id)?.on);
            item.stopAt.val = byId.get(id)?.stopAt ?? null;
            if (untouched) showStopAt(item);
        }
    };

    /** Show a page's read; one taken before an edit (`since` is edits() when it was taken) is older than it and dropped. */
    const sync = (entries, since = edits) => {
        if (since === edits) show(entries);
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

    // Apply `patches` ([id, { on } or { stopAt }]) and queue the step that saves them with the rest of the list.
    const save = (patches) => {
        edits++;
        for (const [id, patch] of patches) {
            const item = get(id);
            Object.entries(patch).forEach(([field, value]) => (item[field].val = value));
            item.ahead++;
        }
        const switched = patches.filter(([, patch]) => patch.on).map(([id]) => id);
        let runs = false; // the game runs an item this save switched on
        const step = inTurn(async () => {
            for (const [id] of patches) get(id).ahead--;
            let failure = null;
            let took = false;
            try {
                const list = toConfig();
                const result = await updateSessionConfig({ cheatConfig: { automation: { [group]: list } } });
                if (result.message !== "Configuration updated successfully")
                    throw new Error(result.details || result.message || "The game didn't take the change");
                took = true;
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
            // Read back what the game holds. If that read fails, only a change the game confirmed counts as taken.
            const read = await fetchConfig().catch(() => null);
            const held = read?.cheatConfig.automation[group];
            if (held) show(held);
            runs = held
                ? switched.some((id) => held.some((entry) => entry.id === id && entry.on))
                : took && switched.length > 0;
            if (failure) throw failure;
        });
        let followUp = null;
        if (switched.length && onTurnedOn) {
            onlyIf = step.then(
                () => runs,
                () => runs
            );
            try {
                followUp = onTurnedOn();
            } finally {
                onlyIf = null;
            }
        }
        // The save's own failure comes first; a follow-up's failure is said when the save itself worked.
        return Promise.allSettled([step, followUp]).then(([saved, followed]) => {
            if (saved.status === "rejected") throw saved.reason;
            if (followed.status === "rejected") throw followed.reason;
        });
    };

    /** Change one item's fields (`patch`: { on } or { stopAt }). */
    const set = (id, patch) => save([[id, patch]]);
    /** Switch every item in `ids` on or off with one save. */
    const setAll = (ids, on) => save(ids.map((id) => [id, { on }]));
    /** Send the list again: after a file save failed, the field's Enter retries it. */
    const resave = () => save([]);

    return { get, sync, set, setAll, resave, edits: () => edits, fileBehind: () => fileBehind.val };
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
    let fileOnly = false; // the row's last save failed only at the file
    const track = (task) => () => {
        fileOnly = false;
        return task().catch((error) => {
            fileOnly = Boolean(error.fileOnly);
            throw error;
        });
    };
    const save = useAutoSave({
        prepare: () => {
            const typed = getNumberInputLiveRaw(draft) ?? draft.val;
            const next = parseStopAt(typed);
            if (next === item.stopAt.val) {
                showStopAt(item);
                // The game has it but the file may not: Enter saves the list again.
                return picks.fileBehind() ? { write: track(() => picks.resave()) } : { unchanged: true };
            }
            // A value typed while this one saves stays in the field for the save after it.
            const stillTyped = () => (getNumberInputLiveRaw(draft) ?? draft.val) === typed;
            return {
                write: track(() => picks.set(id, { stopAt: next }).finally(() => stillTyped() && showStopAt(item))),
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
            void save.run(track(() => picks.set(id, { on }))).then(() => (checkbox.checked = item.on.val));
        },
    });

    // A failure only at the file goes once a later save (any row's) writes the file.
    const status = {
        get val() {
            return save.status.val === "error" && fileOnly && !picks.fileBehind() ? null : save.status.val;
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
