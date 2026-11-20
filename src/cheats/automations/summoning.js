/**
 * Summoning automation: while "automation summoning" is on, switched-on summoning board upgrades are bought with
 * essence every second, each colour saving and buying on its own.
 */

import { defineAutomation } from "../core/automations.js";
import { runSummoning, startSummoning, summoningStatus } from "../helpers/automation/summoning.js";

defineAutomation({
    id: "w6.automation.summoning",
    cheat: "automation summoning",
    label: "Summoning",
    interval: 1000,
    tick: runSummoning,
    status: summoningStatus,
    start: startSummoning,
});
