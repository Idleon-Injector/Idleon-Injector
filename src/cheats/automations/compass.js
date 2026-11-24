/**
 * Compass automation: while "automation compass" is on, switched-on Compass upgrades the Compass shows are bought with
 * dust every second, each dust saving and buying on its own; it waits while the Compass is open.
 */

import { defineAutomation } from "../core/automations.js";
import { compass } from "../helpers/automation/compass.js";

defineAutomation({
    id: "classes.automation.compass",
    cheat: "automation compass",
    label: "Compass",
    interval: 1000,
    tick: compass.run,
    status: () => compass.status(),
    start: compass.start,
});
