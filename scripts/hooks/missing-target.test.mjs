// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// The three hooks moved to defineHook first (#14), each with its game target gone after an update.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

const { context, installed } = await loadGame({ setupDone: false });
const { setup } = await importRepo("src/cheats/core/setup.js");
const state = await importRepo("src/cheats/core/state.js");
context["scripts.ActorEvents_229"] = undefined; // minigames: mining, fishing and catching
context.FirebaseStorage.playButton = undefined; // the re-apply after character select
context["scripts.ActorEvents_203"].prototype._event_Click = undefined; // an early storage hook
const { hookFailures } = await setup.call(context);
const hooked = (path) => installed.some((hook) => hook.includes(path));

test("a removed minigame class is reported, and the other minigame hooks still install", () => {
    assert.ok(hookFailures.includes("minigame: events(229).prototype._customEvent_MiningGameOver not found"));
    assert.ok(hookFailures.includes("minigame: events(229).prototype.init not found"));
    for (const path of [
        "ActorEvents_116.prototype.init",
        "ActorEvents_670.prototype._event_OwlEvent",
        "ActorEvents_741.prototype._event_Minehead",
    ]) {
        assert.ok(hooked(path), `${path} must still install`);
    }
});

test("a missing play button is reported, and nothing is wrapped around it", () => {
    assert.ok(hookFailures.includes("core.reapply: firebase.playButton not found"));
    assert.equal(context.FirebaseStorage.playButton, undefined);
});

test("a renamed early-hook method is reported, and the hook beside it still installs", () => {
    assert.ok(hookFailures.includes("wide.storagecap: scripts.ActorEvents_203.prototype._event_Click not found"));
    assert.ok(hooked("ActorEvents_203.prototype._customEvent_AutoClaimio"));
    assert.ok(hooked("ActorEvents_116.prototype._event_STORAGECHEST"));
});

test("those are the only failures, every other hook installs, and setup is done", () => {
    assert.equal(hookFailures.length, 4, hookFailures.join("\n"));
    assert.ok(hooked("ActorEvents_12."), "a step before the hooks installs");
    assert.ok(hooked("ActorEvents_91."), "a step after them installs");
    assert.equal(state.setupDone, true, "a missing target is reported, not retried on every cheat");
});
