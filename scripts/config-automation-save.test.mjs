/**
 * #205: automation items had a priority (1 High, 2 Low, none Balanced); they now have one "Save for it" switch. A
 * config.custom.js written before keeps working: High and Low load as `save: true`, Balanced as off, and the next save
 * writes the new words.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { captureLogger, loadCommonJs, requireFresh, useInstallDir } from "./known-bugs/index.mjs";

const OLD_FILE = `exports.cheatConfig = { automation: {
    orion: [
        { id: "8", on: true, priority: 1 },
        { id: "4", on: false, stopAt: 3, priority: 2 },
        { id: "0", on: true, priority: null },
        { id: "1", on: true },
    ],
    kitchens: [{ id: "2", on: true, stopAt: 40, priority: 2, save: false }],
    orionSaving: 25,
} };`;

const start = () => {
    const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": captureLogger() });
    config.loadConfiguration();
    return config;
};

test("High and Low load as Save for it, Balanced as off", (t) => {
    useInstallDir(t, { cheatConfig: { automation: { orion: [], kitchens: [], orionSaving: 10 } }, custom: OLD_FILE });
    const { automation } = start().getCheatConfig();
    assert.deepEqual(automation.orion, [
        { id: "8", on: true, save: true },
        { id: "4", on: false, stopAt: 3, save: true },
        { id: "0", on: true },
        { id: "1", on: true },
    ]);
    // A save switch already there wins over the old priority.
    assert.deepEqual(automation.kitchens, [{ id: "2", on: true, stopAt: 40, save: false }]);
    assert.equal(automation.orionSaving, 25, "settings beside the lists stay");
});

test("the next save writes the new words to the file", async (t) => {
    const dir = useInstallDir(t, {
        cheatConfig: { automation: { orion: [], kitchens: [], orionSaving: 10 } },
        custom: OLD_FILE,
    });
    const config = start();
    await config.saveConfiguration({
        startupCheats: config.getStartupCheats(),
        cheatConfig: config.getCheatConfig(),
        injectorConfig: config.getInjectorConfig(),
    });
    const file = join(dir, "config.custom.js");
    assert.doesNotMatch(readFileSync(file, "utf8"), /priority/);
    assert.deepEqual(requireFresh(file).cheatConfig.automation.orion[1], { id: "4", on: false, stopAt: 3, save: true });
});
