/**
 * Royal Armory automation: while "automation armory" is on, switched-on Armory upgrades are bought with royal
 * resources every second, each resource saving and buying on its own, and switched-on Royal Statues are rolled with
 * Parchments of Enchantment, the lowest level first.
 */

import { defineAutomation } from "../core/automations.js";
import { armoryStatus, runArmory, startArmory } from "../helpers/automation/armory.js";

defineAutomation({
    id: "classes.automation.armory",
    cheat: "automation armory",
    label: "Royal Armory",
    interval: 1000,
    tick: runArmory,
    status: armoryStatus,
    start: startArmory,
});
