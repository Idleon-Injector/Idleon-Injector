/**
 * Gaming automation: while "automation gaming" is on, switched-on Gaming upgrades are bought with bits every second,
 * and while the Gaming menu is open a full garden is harvested and the shovel digs once it is ready.
 */

import { defineAutomation } from "../core/automations.js";
import { runGaming, startGaming, gamingStatus } from "../helpers/automation/gaming.js";

defineAutomation({
    id: "w5.automation.gaming",
    cheat: "automation gaming",
    label: "Gaming",
    interval: 1000,
    tick: runGaming,
    start: startGaming,
    status: gamingStatus,
});
