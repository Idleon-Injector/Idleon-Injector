/**
 * Core Setup Module
 *
 * Contains the main setup function that initializes all cheats and game hooks.
 */

import { markSetupDone, setupDone, cheatConfig, startupCheats } from "./state.js";
import { gameReady, gameContext } from "./globals.js";
import { runCheat } from "./registration.js";

// Imports for setup logic
import { getHookFailures, installHooks } from "./hooks.js";
import { injectWebUI } from "../ui/overlay.js";
import { monitor } from "./valueMonitor.js";

/** The setup run in progress, so calls that arrive while it waits for the game share it. */
let running = null;

/**
 * Startup cheats, the value monitor and the in-game UI start once, on the first setup that reaches them.
 * Set once setup has the game's data and has installed the game hooks; cheats wait for that.
 */
export let started = false;

/**
 * Main setup function - initializes all cheats and game hooks.
 *
 * This function:
 * 1. Waits for the game to be ready
 * 2. Installs every game hook (a hook whose target is missing is reported and tried again at character select)
 * 3. Runs startup cheats (first time only)
 * 4. Injects the web UI (if enabled, first time only)
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

        installHooks();
        markSetupDone();

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
    return startupCheats.map((c) => runCheat(c, gameContext).message);
}
