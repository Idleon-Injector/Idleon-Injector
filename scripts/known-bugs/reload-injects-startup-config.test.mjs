import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { KNOWN_BUGS, captureLogger, loadCommonJs } from "./index.mjs";

test(
    "a game reload injects the settings changed during the session",
    { todo: KNOWN_BUGS.reloadInjectsStartupConfig },
    async () => {
        const logger = { "../utils/logger": captureLogger() };
        const evaluated = [];
        let onScriptPaused;
        // Every CDP call resolves; only the ones the test needs do something.
        const domain = (methods = {}) =>
            new Proxy(methods, { get: (target, name) => target[name] ?? (async () => {}) });
        const client = {
            DOM: domain(),
            Page: domain(),
            Network: domain(),
            Runtime: domain({ consoleAPICalled() {}, evaluate: async ({ expression }) => evaluated.push(expression) }),
            Fetch: domain({
                requestPaused: (handler) => (onScriptPaused = handler),
                getResponseBody: async () => ({ body: "game.ApplicationMain = {};", base64Encoded: false }),
            }),
        };
        const { setupIntercept } = loadCommonJs("src/modules/game/cheatInjection.js", {
            "chrome-remote-interface": async () => client,
            // The injected script's last line hands back what the game received.
            fs: { promises: { readFile: async () => "({ cheatConfig })" } },
            ...logger,
        });
        const { updateSessionConfiguration } = loadCommonJs("src/modules/config/configManager.js", logger);

        const live = { cheatConfig: { godlike: { speed: 1 } }, startupCheats: [], injectorConfig: {} };
        const injectorConfig = { injreg: "\\w+\\.ApplicationMain\\s*?=", webPort: 8080 };
        await setupIntercept("fixture-hook", injectorConfig, live.startupCheats, live.cheatConfig, 32123);
        const loadGameScript = () =>
            onScriptPaused({ requestId: "1", request: { url: "N.js" }, responseStatusCode: 200 });

        await loadGameScript();
        await updateSessionConfiguration({ cheatConfig: { godlike: { speed: 5 } } }, live, {
            isAttached: async () => true,
            updateConfig: async () => ({ value: "Config updated in game." }),
        });
        await loadGameScript(); // the game reloads

        assert.equal(live.cheatConfig.godlike.speed, 5, "the injector holds the session change");
        const injected = vm.runInNewContext(evaluated.at(-1));
        assert.equal(injected.cheatConfig.godlike.speed, 5, "the reloaded game must get the session change");
    }
);
