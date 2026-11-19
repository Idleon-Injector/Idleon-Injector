// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("the example hook works as a copy would, but the build leaves it out", async () => {
    const { hookFiles } = await importRepo("rollup.config.mjs");
    assert.ok(hookFiles().includes("minigames.js"), "hook files are found by scanning the folder");
    assert.ok(!hookFiles().includes("_example.js"));

    const { context, state } = await loadGame({ setupDone: false });
    await importRepo("src/cheats/hooks/_example.js");
    context["scripts.ActorEvents_12"]._customBlock_PlayerReach = () => 5;
    const { setup } = await importRepo("src/cheats/core/setup.js");
    await setup.call(context);

    const reach = () => context["scripts.ActorEvents_12"]._customBlock_PlayerReach();
    state.cheatState.godlike.reach = false;
    assert.equal(reach(), 5);
    state.cheatState.godlike.reach = true;
    assert.equal(reach(), 666);
});
