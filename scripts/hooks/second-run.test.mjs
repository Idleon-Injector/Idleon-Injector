// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("running setup again retries only what failed and wraps nothing twice", async () => {
    const { context, installed, gga } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    const state = await importRepo("src/cheats/core/state.js");
    const events20 = context["scripts.ActorEvents_20"];
    context["scripts.ActorEvents_20"] = undefined;

    const first = setup.call(context);
    assert.equal(setup.call(context), first, "a call while setup waits for the game must share that run");
    assert.equal((await first).hookFailures.length, 1);
    const hp = Object.getOwnPropertyDescriptor(gga, "PlayerHP").get;

    context["scripts.ActorEvents_20"] = events20; // whatever was missing is there now
    const afterFirst = [...installed];
    const second = await setup.call(context);

    assert.deepEqual(second.hookFailures, []);
    assert.equal(second.error, undefined);
    assert.equal(state.setupDone, true);
    const added = installed.slice(afterFirst.length);
    assert.ok(added.length > 0, "the retried step must install");
    assert.ok(
        added.every((hook) => hook.includes("ActorEvents_20.")),
        `only the retried step may install anything:\n${added.join("\n")}`
    );
    assert.equal(Object.getOwnPropertyDescriptor(gga, "PlayerHP").get, hp, "PlayerHP must not be hooked again");

    const third = await setup.call(context);
    assert.equal(third.message, "Cheat setup complete");
    assert.equal(installed.length, afterFirst.length + added.length, "a finished setup installs nothing");
});
