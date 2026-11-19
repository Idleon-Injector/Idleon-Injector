// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("an early hook installs when the game's script defines the class, before any actor or setup", async () => {
    await loadGame({ ready: false });
    const window = (globalThis.window = {});
    const hooks = await importRepo("src/cheats/core/hooks.js");
    hooks.defineHook({ id: "test.early", early: "scripts.ActorEvents_9", method: "init" }, (base) => `${base}, hooked`);
    hooks.defineHook({ id: "test.gone", early: "scripts.ActorEvents_9", method: "renamed" }, (base) => base);
    hooks.installEarlyHooks(); // as cheats.js loads

    // The game's script: the registry, then each class before its prototype.
    const registry = {};
    window.__idleon_cheats__ = registry;
    assert.equal(window.__idleon_cheats__, registry);
    function ActorEvents9() {}
    registry["scripts.ActorEvents_9"] = ActorEvents9;
    assert.equal(registry["scripts.ActorEvents_9"], ActorEvents9, "a class without its prototype yet is left alone");
    ActorEvents9.prototype = { init: () => "init" };

    const actor = new registry["scripts.ActorEvents_9"]();
    assert.equal(actor.init(), "init, hooked");
    assert.ok("value" in Object.getOwnPropertyDescriptor(registry, "scripts.ActorEvents_9"));
    assert.deepEqual(hooks.getDefinedHookFailures(), ["test.gone: scripts.ActorEvents_9.prototype.renamed not found"]);

    hooks.installHooks(); // setup later
    assert.equal(actor.init(), "init, hooked", "setup doesn't wrap it again");
});
