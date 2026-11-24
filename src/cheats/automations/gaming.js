import { defineAutomation } from "../core/automations.js";
import { runGaming, startGaming, gamingStatus } from "../helpers/automation/gaming.js";

defineAutomation({
    id: "w5.automation.gaming",
    cheat: "automation gaming",
    label: "Gaming",
    interval: 100,
    tick: runGaming,
    start: startGaming,
    status: gamingStatus,
});
