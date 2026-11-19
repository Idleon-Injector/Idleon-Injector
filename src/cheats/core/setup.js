/**
 * Core Setup Module
 *
 * Contains the main setup function that initializes all cheats and proxies.
 */

import { markSetupDone, setupDone, cheatConfig, startupCheats } from "./state.js";
import { gameReady, gameContext } from "./globals.js";
import { cheat } from "./registration.js";

// Imports for setup logic
import { getHookFailures, setupAllProxies } from "../proxies/setup.js";
import { injectWebUI } from "../ui/overlay.js";
import { monitor } from "./valueMonitor.js";

/** The setup run in progress, so calls that arrive while it waits for the game share it. */
let running = null;

/** Startup cheats, the value monitor and the in-game UI start once, on the first setup that reaches them. */
let started = false;

/**
 * Main setup function - initializes all cheats and proxies.
 *
 * This function:
 * 1. Waits for the game to be ready
 * 2. Sets up every game proxy that isn't installed yet
 * 3. Runs startup cheats (first time only)
 * 4. Injects the web UI (if enabled, first time only)
 *
 * Setup counts as done only once every proxy step has run to the end; until then a later call
 * (main.js on page load, or the first cheat) runs it again and retries the steps that threw.
 *
 * @returns {Promise<{message?: string, error?: string, hookFailures: string[]}>} Setup result
 */
export function setup() {
    if (setupDone) return Promise.resolve({ message: "Cheat setup complete", hookFailures: getHookFailures() });
    if (!running) running = runSetup(this).finally(() => (running = null));
    return running;
}

async function runSetup(context) {
    console.log("Entering setup function");

    try {
        await gameReady(context);

        if (setupAllProxies()) markSetupDone();

        const rtn = ["Cheat setup complete"];
        if (!started) {
            started = true;
            monitor.init();
            rtn.unshift("--------------------", ...runStartupCheats());
            rtn.push(
                "--------------------",
                "Hit enter to list available cheats",
                "Cheats will find as you type, so if you're looking for eg gem cheats, or an item just type it and see what comes up",
                "--------------------"
            );
            if (cheatConfig.ingameUI) {
                injectWebUI();
            }
        }

        console.log("Exiting setup function successfully");
        return { message: rtn.join("\n"), hookFailures: getHookFailures() };
    } catch (setupError) {
        console.error("Error occurred during setup function:", setupError.stack || setupError);
        return { error: String(setupError.message || setupError), hookFailures: getHookFailures() };
    }
}

/**
 * Run startup cheats from config.
 *
 * @returns {string[]} Array of result messages
 */
export function runStartupCheats() {
    return startupCheats.map((c) => cheat(c, gameContext));
}
