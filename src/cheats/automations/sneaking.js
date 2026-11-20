/**
 * Sneaking automation: while "automation sneaking" is on, switched-on Ninja Knowledge upgrades are bought with jade
 * coins every second.
 */

import { defineAutomation } from "../core/automations.js";
import { runSneaking, sneakingStatus, startSneaking } from "../helpers/automation/sneaking.js";

defineAutomation({
    id: "w6.automation.sneaking",
    cheat: "automation sneaking",
    label: "Sneaking",
    interval: 1000,
    tick: runSneaking,
    status: sneakingStatus,
    start: startSneaking,
});
