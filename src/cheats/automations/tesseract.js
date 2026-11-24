/**
 * Tesseract automation: while "automation tesseract" is on, switched-on Tesseract upgrades are bought with tachyons
 * every second, each tachyon saving and buying on its own.
 */

import { defineAutomation } from "../core/automations.js";
import { tesseract } from "../helpers/automation/tesseract.js";

defineAutomation({
    id: "classes.automation.tesseract",
    cheat: "automation tesseract",
    label: "Tesseract",
    interval: 1000,
    tick: tesseract.run,
    status: () => tesseract.status(),
    start: tesseract.start,
});
