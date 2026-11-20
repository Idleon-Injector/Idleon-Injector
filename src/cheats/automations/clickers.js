/**
 * Clicker automations: while "automation orion", "automation poppy" or "automation tarpit" is on, its switched-on
 * upgrades are bought every second with feathers, fish or tartar fish (see helpers/automation/clickers.js).
 */

import { defineAutomation } from "../core/automations.js";
import { clickerStatus, runClicker, startClicker } from "../helpers/automation/clickers.js";

for (const [key, id, label] of [
    ["orion", "w1.automation.orion", "Orion"],
    ["poppy", "w2.automation.poppy", "Poppy"],
    ["tarpit", "w2.automation.tarpit", "Tar Pit"],
]) {
    defineAutomation({
        id,
        cheat: `automation ${key}`,
        label,
        interval: 1000,
        tick: runClicker(key),
        status: clickerStatus(key),
        start: startClicker(key),
    });
}
