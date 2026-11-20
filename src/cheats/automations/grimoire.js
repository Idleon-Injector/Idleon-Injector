/**
 * Grimoire automation: while "automation grimoire" is on, switched-on Grimoire upgrades are bought with bones every
 * second, each bone type saving and buying on its own.
 */

import { defineAutomation } from "../core/automations.js";
import { grimoireStatus, runGrimoire, startGrimoire } from "../helpers/automation/grimoire.js";

defineAutomation({
    id: "classes.automation.grimoire",
    cheat: "automation grimoire",
    label: "Grimoire",
    interval: 1000,
    tick: runGrimoire,
    status: grimoireStatus,
    start: startGrimoire,
});
