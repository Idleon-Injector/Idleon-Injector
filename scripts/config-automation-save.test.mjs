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

// The draft builds before #104 kept each list as { saving, target, items }. A file one of them saved loads as the list,
// with its saving % as `<key>Saving` (`kitchenSaving` for kitchens) and the bubbles target as `bubblesTarget`.
const DRAFT_FILE = `exports.cheatConfig = { automation: {
    shops: [{ id: "0:CraftMat3", on: true }],
    orion: { saving: 5, items: [{ id: 8, on: true, priority: 1 }, { id: 0, on: true }] },
    poppy: { items: [{ id: 6, on: false, stopAt: 1 }] },
    kitchens: { saving: [20, 30], items: [{ id: 1, on: true }] },
    bubbles: { target: 75, items: [{ id: "0:1", on: true }] },
} };`;
const DRAFT_DEFAULTS = {
    cheatConfig: {
        automation: {
            shops: [],
            orion: [{ id: "8", on: false, save: true }],
            orionSaving: 10,
            poppy: [],
            poppySaving: 10,
            kitchens: [],
            kitchenSaving: [10, 10],
            bubbles: [],
            bubblesTarget: 90,
        },
    },
};

test("lists a draft build saved as { saving, items } load as lists", (t) => {
    useInstallDir(t, { ...DRAFT_DEFAULTS, custom: DRAFT_FILE });
    const { automation } = start().getCheatConfig();
    assert.deepEqual(automation.shops, [{ id: "0:CraftMat3", on: true }]);
    assert.deepEqual(automation.orion, [
        { id: 8, on: true, save: true },
        { id: 0, on: true },
    ]);
    assert.equal(automation.orionSaving, 5);
    assert.deepEqual(automation.poppy, [{ id: 6, on: false, stopAt: 1 }]);
    assert.equal(automation.poppySaving, 10, "no saving in the file keeps the default");
    assert.deepEqual(automation.kitchens, [{ id: 1, on: true }]);
    assert.deepEqual(automation.kitchenSaving, [20, 30]);
    assert.deepEqual(automation.bubbles, [{ id: "0:1", on: true }]);
    assert.equal(automation.bubblesTarget, 75);
});

test("the next save writes a draft build's lists in the new shape", async (t) => {
    const dir = useInstallDir(t, { ...DRAFT_DEFAULTS, custom: DRAFT_FILE });
    const config = start();
    await config.saveConfiguration({
        startupCheats: config.getStartupCheats(),
        cheatConfig: config.getCheatConfig(),
        injectorConfig: config.getInjectorConfig(),
    });
    const file = join(dir, "config.custom.js");
    assert.doesNotMatch(readFileSync(file, "utf8"), /items|saving:|target:/);
    const { automation } = requireFresh(file).cheatConfig;
    assert.deepEqual(automation.orion[0], { id: 8, on: true, save: true });
    assert.equal(automation.orionSaving, 5);
    assert.equal(automation.bubblesTarget, 75);
});
