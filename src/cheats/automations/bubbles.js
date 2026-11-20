/**
 * Bubble automation: while "automation bubbles" is on, switched-on alchemy bubbles are raised every second with the
 * alchemy menu's own upgrade, the one furthest from its goal first.
 */

import { defineAutomation } from "../core/automations.js";
import { bubblesStatus, runBubbles, startBubbles } from "../helpers/automation/bubbles.js";

defineAutomation({
    id: "w2.automation.bubbles",
    cheat: "automation bubbles",
    label: "Bubbles",
    interval: 1000,
    tick: runBubbles,
    status: bubblesStatus,
    start: startBubbles,
});
