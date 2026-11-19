import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { KNOWN_BUGS, captureLogger, loadCommonJs, requireFresh, useInstallDir } from "./index.mjs";

test(
    "saving the config keeps quotes, backslashes and null as typed",
    { todo: KNOWN_BUGS.configEscaping },
    async (t) => {
        const dir = useInstallDir(t, { cheatConfig: { note: "", path: "", amount: 1 } });
        const { loadConfiguration, saveConfiguration } = loadCommonJs("src/modules/config/configManager.js", {
            "../utils/logger": captureLogger(),
        });
        loadConfiguration();

        const cheatConfig = { note: 'say "hi"', path: "C:\\Games\\Idleon", amount: null };
        await saveConfiguration({ cheatConfig });

        assert.deepEqual(requireFresh(join(dir, "config.custom.js")).cheatConfig, cheatConfig);
    }
);
