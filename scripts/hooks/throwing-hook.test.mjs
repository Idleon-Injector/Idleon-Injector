// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("a hook that throws while it installs is reported under its cheats, and the others still install", async () => {
    const { context, gga, installed } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    const state = await importRepo("src/cheats/core/state.js");
    gga.Gaming = Object.freeze(Array(14).fill(0)); // a property that can't be hooked

    const { hookFailures } = await setup.call(context);

    assert.equal(hookFailures.length, 1, hookFailures.join("\n"));
    assert.match(hookFailures[0], /^w5\.gaming: Cannot (re)?define property: 13/);
    assert.ok(Object.getOwnPropertyDescriptor(gga.Divinity, 38).get, "the hook after it installs");
    assert.ok(installed.some((hook) => hook.includes("ActorEvents_12.")));
    assert.equal(state.setupDone, true, "it is tried again after character select, not on every cheat");

    gga.Gaming = Array(14).fill(0);
    context.FirebaseStorage.playButton();
    assert.deepEqual((await importRepo("src/cheats/core/hooks.js")).getHookFailures(), []);
    assert.ok(Object.getOwnPropertyDescriptor(gga.Gaming, 13).get);
});
