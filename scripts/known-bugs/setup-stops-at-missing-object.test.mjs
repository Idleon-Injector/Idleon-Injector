import assert from "node:assert/strict";
import { test } from "node:test";
import { captureLogger, importRepo, loadCommonJs, loadGame } from "./index.mjs";

/** Start src/main.js with fake services, load the page once, and return what it logged. */
async function startInjector(setupResult) {
    const logger = captureLogger();
    let onPageLoad;
    const client = {
        Runtime: {
            evaluate: async ({ expression }) =>
                expression.startsWith("setup.call(") ? setupResult : { result: { value: true } },
        },
        Page: {
            loadEventFired: (handler) => (onPageLoad = handler),
            reload: async () => {},
        },
    };
    const injectorConfig = { enableUI: false, target: "web" };
    loadCommonJs("src/main.js", {
        "./modules/config/configManager": {
            loadConfiguration() {},
            getInjectorConfig: () => injectorConfig,
            getStartupCheats: () => [],
            getCheatConfig: () => ({}),
            getDefaultConfig: () => ({}),
            getCdpPort: () => 32123,
            getWebPort: () => 8080,
        },
        "./modules/config/setupWizard": { runSetupWizard: async () => {} },
        "./modules/game/gameAttachment": { attachToTarget: async () => "fixture-hook" },
        "./modules/game/cheatInjection": { setupIntercept: async () => client, createCheatContext: () => "window" },
        "./modules/server/webServer": { createWebServer: () => ({}), startServer: async () => {} },
        "./modules/server/apiRoutes": { setupApiRoutes() {} },
        "./modules/cli/cliInterface": { startCliInterface: async () => {} },
        "./modules/updateService": { createUpdater: () => ({ check: async () => null }) },
        "./modules/utils/logger": logger,
    });
    for (let i = 0; !onPageLoad && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    if (!onPageLoad) throw new Error(`main.js never reached the page load:\n${logger.lines.join("\n")}`);
    await onPageLoad();
    return logger.lines;
}

test("a missing game object doesn't stop later hooks, setup can run again, and the console says so", async () => {
    const { gga, context, installed } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    gga.Holes = undefined; // for example a game update renamed it

    const result = await setup.call(context).then(
        (value) => ({ result: { value } }),
        (error) => ({ result: {}, exceptionDetails: { text: String(error) } })
    );
    assert.ok(
        installed.some((hook) => hook.includes("ActorEvents_579.")),
        `hooks after the missing object must still install; installed:\n${installed.join("\n")}`
    );

    const lines = await startInjector(result);
    assert.ok(!lines.includes("info: Cheats ready!"), `the console must not say ready:\n${lines.join("\n")}`);
    assert.ok(
        lines.some((line) => /^(warn|error):/.test(line)),
        "the console must warn that setup failed"
    );

    gga.Holes = Array.from({ length: 12 }, () => []);
    assert.notEqual(
        await setup.call(context),
        "Cheat setup complete",
        "after a failed setup, running setup again must retry instead of reporting complete"
    );
});
