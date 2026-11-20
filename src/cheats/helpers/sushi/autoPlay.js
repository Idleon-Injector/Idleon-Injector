/**
 * Sushi Auto Play: its state and steps, shared by the sushi cheat (cheats/sushi.js, which declares the automation),
 * the in-game buttons (hooks/sushiButton.js) and the East Wind hook (hooks/sushiWind.js). Only this module changes
 * the state; the core owns the timer.
 */

import { gga } from "../../core/globals.js";
import { cheatConfig } from "../../core/state.js";
import { switchAutomation } from "../../core/automations.js";
import { sushiTools } from "./station.js";
import { readSushiSettings } from "./settings.js";

/** The East Wind options hooks/sushiWind.js applies: set when Auto Play starts, cleared when it stops. */
export let windExtended = false;
export let windHigher = false;

export function configureSushiWind(extendChain, higherTier) {
    windExtended = extendChain;
    windHigher = higherTier;
}

export let busy = false;
export let enabled = false;
let message = "Ready. Keep Sushi Station open in the game.";
let merges = 0;
let cycles = 0;
/** The board being played as start() found it, and the step the next tick takes. */
let session = null;

function call(action, expected) {
    if (
        busy &&
        (gga !== session.game ||
            gga.Sushi !== session.data ||
            gga.Sushi[0] !== session.board ||
            gga.Sushi[1] !== session.plates ||
            gga.PixelHelperActor[27] !== session.actor ||
            session.actor.behaviors.getBehavior("ActorEvents_741") !== session.ui)
    )
        throw new Error("Game session changed; stopped.");
    return sushiTools(action, expected, busy ? session.options : cheatConfig.w7.sushitools);
}

/** Wait for East Wind to settle, checking each tick for up to 60 seconds, then go on with `next`. */
function settle(next) {
    session.step = "settle";
    session.next = next;
    session.deadline = Date.now() + 60000;
}

function end(text) {
    message = text;
    busy = false;
    session = null;
}

function begin(state) {
    if (state.reserved.some((index) => state.board[index] >= 0)) {
        call("sort", state.board);
        return settle(play);
    }
    play(state);
}

function refill(state) {
    const options = session.options;
    if (state.capped < options.targetCount && state.working.some((index) => state.board[index] < 0)) {
        message = `Buying tier ${options.tier} sushi. Capped: ${state.capped}/${options.targetCount}.`;
        const bought = call("buy", { board: state.board, plates: state.plates, purchaseTier: options.tier });
        if (bought.bought) {
            // Read back the native purchase on the next tick.
            session.step = "bought";
            return;
        }
        // Out of fuel: merge what is on the board, then stop with the reason (play() ends once no merge is left).
        session.outOfFuel = bought.reason;
    }
    cycles++;
    play(state);
}

function play(state) {
    const options = session.options;
    if (state.capped >= options.targetCount) {
        call("sort", state.board);
        return end(`Finished: ${state.capped}/${options.targetCount} tier ${state.targetTier + 1}+ sushi.`);
    }
    const plan = call("plan", { board: state.board });
    if (!plan) {
        if (session.outOfFuel) return end(`Stopped: ${session.outOfFuel} Nothing on the board is left to merge.`);
        if (!state.working.some((index) => state.board[index] < 0))
            throw new Error("Working slots are full and no legal merge remains.");
        return refill(state);
    }
    if (plan.tier >= state.targetTier) throw new Error("Capped sushi cannot be merged.");
    message = `Merging tier ${plan.tier + 1} with ${plan.tail.length} planned Wind upgrades.`;
    call("merge", plan);
    merges++;
    message = `Waiting for East Wind after merge ${merges}…`;
    settle(play);
}

/** One 50 ms step: read the board, then keep waiting or carry on where the last step left off. */
export function tick() {
    if (!session) return; // finished, or stopped on an error: idle until turned off
    try {
        const state = call("status");
        if (session.step === "bought") {
            if (state.dragging >= 0) throw new Error("A sushi is being dragged; purchasing stopped.");
            return state.pending ? settle(refill) : refill(state);
        }
        if (state.dragging >= 0) throw new Error("Dragging detected; stopped.");
        if (!state.pending) return session.next(state);
        if (Date.now() >= session.deadline) throw new Error("East Wind did not settle within 60 seconds.");
    } catch (error) {
        end("Stopped: " + error.message);
    }
}

export function getSushiStatus() {
    const state = { enabled, busy, message, merges, cycles };
    try {
        return { ...call("status"), ...state };
    } catch (error) {
        return { ...sushiTools("settings"), ...state, error: error.message };
    }
}

export function start() {
    const options = readSushiSettings();
    const initial = sushiTools("status", null, options);
    if (initial.dragging >= 0) throw new Error("Release the sushi before starting.");
    if (options.targetCount > initial.working.length)
        throw new Error(
            `Target quantity ${options.targetCount} doesn't fit: ${initial.working.length} at most with ${options.reserveSlots} empty slots.`
        );
    if (initial.board.filter((value) => value >= 0).length > initial.working.length)
        throw new Error("Clear " + options.reserveSlots + " slots before starting; no sushi will be deleted.");
    configureSushiWind(options.extendChain, options.higherTier);
    const actor = gga.PixelHelperActor[27];
    session = {
        options,
        game: gga,
        data: gga.Sushi,
        board: gga.Sushi[0],
        plates: gga.Sushi[1],
        actor,
        ui: actor.behaviors.getBehavior("ActorEvents_741"),
    };
    settle(begin);
    busy = true;
    enabled = true;
    merges = 0;
    cycles = 0;
    message = "Waiting for the board…";
    return "Auto Play enabled. It will idle when the goal is reached.";
}

export function stop() {
    enabled = false;
    busy = false;
    session = null;
    configureSushiWind(false, false);
    message = "Auto Play disabled.";
    return message;
}

/** Turn Auto Play (the "w7.sushi" automation) on or off; throws why it refused. */
export function switchSushi(on) {
    const result = switchAutomation("w7.sushi", on);
    if (!result.ok) throw new Error(result.message);
    return { enabled, message: result.message };
}

// The in-game Start and Stop buttons.
export const startSushi = () => switchSushi(true);
export const stopSushi = () => switchSushi(false);

export function sortSushi() {
    if (enabled || busy) throw new Error("Disable Auto Play before sorting.");
    const options = { reserveSlots: 0 };
    const initial = sushiTools("status", null, options);
    const result = sushiTools("sort", initial.board, options);
    message = result.message;
    return { enabled, message };
}
