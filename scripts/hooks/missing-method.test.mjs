// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("a game method an update renamed is reported, and the hooks beside it still install", async () => {
    const { context, installed } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    const state = await importRepo("src/cheats/core/state.js");
    const events579 = context["scripts.ActorEvents_579"];
    events579._customBlock_Holes = undefined;

    const { hookFailures } = await setup.call(context);

    assert.deepEqual(hookFailures, ["setupEvents579Proxies: _customBlock_Holes not found"]);
    assert.equal(events579._customBlock_Holes, undefined, "nothing may be wrapped around a missing method");
    for (const hook of [
        "ActorEvents_579._customBlock_Holes2",
        "ActorEvents_579._customBlock_Sushi",
        "ActorEvents_713.",
    ]) {
        assert.ok(
            installed.some((path) => path.includes(hook)),
            `${hook} must still install`
        );
    }
    // A renamed method doesn't come back while the page runs, so setup is done and doesn't retry it.
    assert.equal(state.setupDone, true);
});
