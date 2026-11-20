/**
 * Cooking automation: while "automation cooking" is on, switched-on kitchen upgrades and meals level up every second.
 */

import { defineAutomation } from "../core/automations.js";
import { cookingStatus, runCooking, startCooking } from "../helpers/automation/cooking.js";

defineAutomation({
    id: "w4.automation.cooking",
    cheat: "automation cooking",
    label: "Cooking",
    interval: 1000,
    tick: runCooking,
    status: cookingStatus,
    start: startCooking,
});
