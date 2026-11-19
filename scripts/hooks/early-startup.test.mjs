// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("before the game is ready, the storage timers follow the startup cheats without running them", async () => {
    const { state } = await loadGame({ ready: false });
    state.setStartupCheats(["wide storagecap"]);
    const window = (globalThis.window = { __idleon_cheats__: {} }); // the registry can already be there when cheats.js loads
    (await importRepo("src/cheats/core/hooks.js")).installEarlyHooks();
    const registry = window.__idleon_cheats__;
    const timers = [];
    registry["com.stencyl.behavior.Script"] = { runLater: (delay, callback) => timers.push(callback) };
    function ActorEvents481() {}
    ActorEvents481.prototype.init = function () {
        registry["com.stencyl.behavior.Script"].runLater(500, () => ["ChestQuantity", 105e7, "GiveAtoms"], this.actor);
    };
    registry["scripts.ActorEvents_481"] = ActorEvents481;

    Object.assign(new registry["scripts.ActorEvents_481"](), { actor: {} }).init();

    assert.equal(state.cheatState.wide.storagecap, false, "the startup cheat hasn't run yet");
    assert.equal(timers[0](), undefined, "but the cap timer is already paused");
});
