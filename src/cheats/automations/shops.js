/**
 * Shop automation: while "automation shops" is on, switched-on town shop items are bought into the chest every second.
 */

import { defineAutomation } from "../core/automations.js";
import { runShops, shopsStatus, startShops } from "../helpers/automation/shops.js";

defineAutomation({
    id: "account.automation.shops",
    cheat: "automation shops",
    label: "Shops",
    interval: 1000,
    tick: runShops,
    status: shopsStatus,
    start: startShops,
});
