/**
 * Automations
 *
 * An automation is work that repeats while its toggle cheat is on, like Sushi Auto Play. Declare it with
 * defineAutomation() in a file in src/cheats/automations/; the build picks up every file there (see
 * rollup.config.mjs), so a new automation is just a new file. Copy automations/_example.js to start.
 *
 * The core owns the loop: it starts one timer per automation when its cheat turns on and clears it when the cheat
 * turns off, reports a tick that throws without stopping it or any other automation, and shows each running
 * automation in the active-cheats list. A mod never runs a timer of its own.
 */

import { cheatState } from "./state.js";

const automations = [];

/**
 * Declare an automation.
 *
 * @param {object} spec
 * @param {string} spec.id - The feature it belongs to, e.g. "w7.sushi"; errors are reported under it.
 * @param {string} spec.cheat - The cheat that turns it on and off, e.g. "wide autoboss". When that cheat is a toggle,
 *   the automation follows it (a group's "all on" included). A command with its own answer calls
 *   switchAutomation() instead.
 * @param {string} [spec.label] - Its name on the Automation overview, which lists only the automations with a label.
 * @param {string} [spec.whenOff] - What its overview row says after "Off.", when it can only start in some places.
 * @param {boolean} [spec.startup=true] - false when it can't start at launch: its overview switch then leaves the
 *   startup cheats out.
 * @param {number} spec.interval - Milliseconds between ticks.
 * @param {Function} spec.tick - One step of work.
 * @param {Function} spec.status - What the menu shows while it runs.
 * @param {Function} [spec.start] - Runs when it turns on, before the first tick. Throw to refuse; return the message.
 * @param {Function} [spec.stop] - Runs when it turns off; return the message.
 */
export function defineAutomation(spec) {
    automations.push({ ...spec, timer: null, error: null });
}

function tick(automation) {
    try {
        automation.tick();
    } catch (error) {
        automation.error = error?.message || String(error);
        console.error(`Automation ${automation.id} failed:`, error);
    }
}

/**
 * Turn an automation on or off, or flip it when `on` is undefined.
 * @returns {{ok: boolean, message: string}}
 */
export function switchAutomation(id, on) {
    const automation = automations.find((candidate) => candidate.id === id);
    const running = automation.timer !== null;
    on ??= !running;
    if (on === running) return { ok: true, message: `${id} is already ${on ? "on" : "off"}.` };
    try {
        if (!on) {
            clearInterval(automation.timer);
            automation.timer = null;
            return { ok: true, message: automation.stop?.() ?? `Stopped ${id}.` };
        }
        const message = automation.start?.() ?? `Started ${id}.`;
        automation.error = null;
        automation.timer = setInterval(() => tick(automation), automation.interval);
        return { ok: true, message };
    } catch (error) {
        return { ok: false, message: error?.message || String(error) };
    }
}

/**
 * Start or stop the automations whose cheat is a toggle so they match it. runCheat calls this after every cheat.
 * @returns {{ok: false, message: string} | undefined} Why an automation refused to start; its toggle is turned back off.
 */
export function followToggles() {
    let refused;
    for (const automation of automations) {
        const words = automation.cheat.split(" ");
        const name = words.pop();
        const parent = words.reduce((obj, key) => obj?.[key], cheatState);
        if (typeof parent?.[name] !== "boolean" || parent[name] === (automation.timer !== null)) continue;
        const result = switchAutomation(automation.id, parent[name]);
        if (result.ok) continue;
        parent[name] = false;
        refused ??= result;
    }
    return refused;
}

/** The cheat states with every automation's on/off at its cheat, so the active-cheats list shows running ones. */
export function withAutomations(states) {
    const view = { ...states };
    for (const automation of automations) {
        const words = automation.cheat.split(" ");
        const name = words.pop();
        let parent = view;
        for (const key of words) parent = parent[key] = { ...parent[key] };
        parent[name] = automation.timer !== null;
    }
    return view;
}

/**
 * Every automation, with its status while it runs and the last error a tick threw.
 * @returns {{id: string, cheat: string, label?: string, whenOff?: string, startup: boolean, on: boolean,
 *   error: string|null, status: any}[]}
 */
export function getAutomations() {
    return automations.map((automation) => {
        const on = automation.timer !== null;
        let status = null;
        try {
            if (on) status = automation.status();
        } catch (error) {
            status = `Status failed: ${error?.message || error}`;
        }
        const { id, cheat, label, whenOff, startup = true, error } = automation;
        return { id, cheat, label, whenOff, startup, on, error, status };
    });
}
