// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("a setup step that throws is reported, the steps after it still install, and setup isn't done", async () => {
    const { context, installed } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    const state = await importRepo("src/cheats/core/state.js");
    context["scripts.ActorEvents_20"] = undefined; // its step reads .prototype straight away, so it throws

    const { hookFailures } = await setup.call(context);

    assert.equal(hookFailures.length, 1, hookFailures.join("\n"));
    assert.match(hookFailures[0], /^setupEvents020Proxies: Cannot read properties of undefined/);
    assert.ok(
        installed.some((hook) => hook.includes("ActorEvents_12.")),
        "the step before it must install"
    );
    assert.ok(
        installed.some((hook) => hook.includes("ActorEvents_44.")),
        "the step after it must install"
    );
    assert.equal(state.setupDone, false, "a step that threw must be retried by the next setup");
});
