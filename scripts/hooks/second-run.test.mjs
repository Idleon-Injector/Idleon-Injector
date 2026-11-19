// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("setup runs once; character select retries only what was missing and wraps nothing twice", async () => {
    const { context, installed, gga } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    const state = await importRepo("src/cheats/core/state.js");
    const events20 = context["scripts.ActorEvents_20"];
    context["scripts.ActorEvents_20"] = undefined;

    const first = setup.call(context);
    assert.equal(setup.call(context), first, "a call while setup waits for the game must share that run");
    assert.deepEqual((await first).hookFailures, ["wide.bigmodel: events(20).prototype.init not found"]);
    assert.equal(state.setupDone, true, "a missing target is reported, not retried on every cheat");
    const hp = Object.getOwnPropertyDescriptor(gga, "PlayerHP").get;
    const afterFirst = installed.length;

    const second = await setup.call(context);
    assert.equal(second.message, "Cheat setup complete");
    assert.deepEqual(second.hookFailures, ["wide.bigmodel: events(20).prototype.init not found"]);
    assert.equal(installed.length, afterFirst, "a finished setup installs nothing");

    context["scripts.ActorEvents_20"] = events20; // whatever was missing is there now
    const beforeSelect = installed.length;
    context.FirebaseStorage.playButton();
    const added = installed.slice(beforeSelect);
    assert.deepEqual(added, ["window.scripts.ActorEvents_20.prototype.init"], "only the missing hook installs");
    assert.deepEqual((await setup.call(context)).hookFailures, []);
    assert.equal(Object.getOwnPropertyDescriptor(gga, "PlayerHP").get, hp, "PlayerHP must not be hooked again");
});
