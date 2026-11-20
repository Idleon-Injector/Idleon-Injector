/**
 * Construction automation: while "automation construction" is on, switched-on W3 buildings are queued, completed
 * and paid every second, the way the construction menu's build button does it.
 */

import { defineAutomation } from "../core/automations.js";
import { constructionStatus, runConstruction, startConstruction } from "../helpers/automation/construction.js";

defineAutomation({
    id: "w3.construction.automation",
    cheat: "automation construction",
    label: "Construction",
    interval: 1000,
    tick: runConstruction,
    status: constructionStatus,
    start: startConstruction,
});
