/**
 * Bubba automation: while "automation bubba" is on, switched-on Bubba upgrades are bought with meat every second.
 */

import { defineAutomation } from "../core/automations.js";
import { bubbaStatus, runBubba, startBubba } from "../helpers/automation/bubba.js";

defineAutomation({
    id: "w7.automation.bubba",
    cheat: "automation bubba",
    label: "Bubba",
    interval: 1000,
    tick: runBubba,
    status: bubbaStatus,
    start: startBubba,
});
