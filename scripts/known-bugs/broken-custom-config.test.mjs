import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { KNOWN_BUGS, captureLogger, loadCommonJs, useInstallDir } from "./index.mjs";

test(
    "a config.custom.js with a typo is reported, and saving doesn't destroy it",
    { todo: KNOWN_BUGS.brokenCustomConfig },
    async (t) => {
        const broken = "exports.cheatConfig = { amount: 2,, };";
        const dir = useInstallDir(t, { cheatConfig: { amount: 1 }, custom: broken });
        const logger = captureLogger();
        const { loadConfiguration, saveConfiguration } = loadCommonJs("src/modules/config/configManager.js", {
            "../utils/logger": logger,
        });

        let loaded = true;
        try {
            loadConfiguration();
        } catch {
            loaded = false;
        }
        assert.ok(
            !logger.lines.some((line) => /no config\.custom\.js found|not found|missing/i.test(line)),
            `the file exists, so it must not be reported as missing:\n${logger.lines.join("\n")}`
        );

        if (loaded) await saveConfiguration({ cheatConfig: { amount: 3 } });
        const kept = readdirSync(dir).some((file) => readFileSync(join(dir, file), "utf8").includes(broken));
        assert.ok(kept, "the user's file must still exist somewhere after a save");
    }
);
