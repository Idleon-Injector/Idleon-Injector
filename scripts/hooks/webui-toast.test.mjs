// Each file runs in its own process, so each scenario gets a fresh copy of the WebUI code.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "../known-bugs/index.mjs";

const TinyRouter = createRequire(import.meta.url)("../../src/modules/server/tinyRouter");

test("the warning stays until another notification replaces it, while normal ones fade", async (t) => {
    const { store } = await loadUi(new TinyRouter());
    const { Toast } = await importRepo("src/ui/components/Toast.js");
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const toast = Toast();
    const visible = () => /is-visible/.test(toast.attributes.class) && !/fade-out/.test(toast.attributes.class);
    const settle = async (ms) => {
        t.mock.timers.tick(ms);
        for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); // VanJS redraws in a microtask
    };

    store.notify("2 game hooks failed to install", "error", true);
    await settle(0);
    await settle(60000);
    assert.ok(visible(), "a persistent notification must still show after a minute");

    store.notify("Cheat done");
    await settle(0);
    assert.ok(visible());
    await settle(5000);
    assert.ok(!visible(), "a normal notification must fade after 5 seconds");
});
