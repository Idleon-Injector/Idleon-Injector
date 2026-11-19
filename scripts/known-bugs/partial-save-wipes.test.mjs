import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { KNOWN_BUGS, captureLogger, importRepo, loadCommonJs, requireFresh, useInstallDir } from "./index.mjs";

const { applyConfigEdits } = await importRepo("src/ui/utils/index.js");

test("saving part of the config keeps the other saved settings", { todo: KNOWN_BUGS.partialSaveWipes }, async (t) => {
    // The Config view (fixed in #305): the user changed `amount`; another tab saved `companions` meanwhile.
    const opened = { cheatConfig: { amount: 1, companions: "" } };
    const edited = { cheatConfig: { amount: 5, companions: "" } };
    const latest = { cheatConfig: { amount: 1, companions: "0,1" } };
    assert.deepEqual(applyConfigEdits(latest, opened, edited), { cheatConfig: { amount: 5, companions: "0,1" } });

    // The server: a caller that posts only the setting it changed.
    const dir = useInstallDir(t, {
        cheatConfig: { amount: 1, companions: "" },
        custom: 'exports.cheatConfig = { companions: "0,1" };',
    });
    const { loadConfiguration, saveConfiguration } = loadCommonJs("src/modules/config/configManager.js", {
        "../utils/logger": captureLogger(),
    });
    loadConfiguration();
    await saveConfiguration({ cheatConfig: { amount: 5 } });

    assert.deepEqual(requireFresh(join(dir, "config.custom.js")).cheatConfig, { amount: 5, companions: "0,1" });
});
