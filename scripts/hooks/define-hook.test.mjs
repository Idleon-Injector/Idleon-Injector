// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// The defineHook core on its own: installing, the double-patch guard, re-applying and early hooks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

const { context, installed } = await loadGame({ setupDone: false });
const hooks = await importRepo("src/cheats/core/hooks.js");
const { setup } = await importRepo("src/cheats/core/setup.js");
const { getHookFailures } = await importRepo("src/cheats/core/hooks.js");

// A game object character select rebuilds, and one it keeps.
let rebuilt = { value: () => 1 };
const kept = { value: () => 10 };
hooks.defineHook({ id: "test.rebuilt", target: () => rebuilt, method: "value" }, (base) => base + 1);
hooks.defineHook({ id: "test.kept", target: () => kept, method: "value" }, (base) => base + 1);
// One that isn't there until later.
let late = null;
hooks.defineHook({ id: "test.late", target: () => late, method: "value" }, (base) => base * 2);
hooks.defineHook({ id: "test.around", target: () => kept, method: "skip", around: true }, (callOriginal, flag) =>
    flag ? "skipped" : callOriginal()
);
kept.skip = (flag) => `game ran with ${flag}`;

test("each hook installs on its own and a missing one is reported, not wrapped", async () => {
    const { hookFailures } = await setup.call(context);
    assert.deepEqual(hookFailures, ["test.late: late.value not found"]);
    assert.equal(rebuilt.value(), 2);
    assert.equal(kept.value(), 11);
    assert.equal(kept.skip(true), "skipped", "an around hook can skip the game's method");
    assert.equal(kept.skip(false), "game ran with false");
});

test("installing again wraps nothing twice", () => {
    const before = installed.length;
    hooks.installHooks();
    hooks.installHooks();
    assert.equal(kept.value(), 11);
    assert.equal(rebuilt.value(), 2);
    assert.equal(installed.length, before);
});

test("character select re-applies hooks on rebuilt objects, once, and picks up late ones", () => {
    rebuilt = { value: () => 1 };
    late = { value: () => 4 };
    const before = installed.length;
    context.FirebaseStorage.playButton();
    context.FirebaseStorage.playButton();
    assert.equal(rebuilt.value(), 2, "the rebuilt object is hooked once");
    assert.equal(kept.value(), 11, "the kept object isn't hooked again");
    assert.equal(late.value(), 8);
    assert.deepEqual(getHookFailures(), [], "a hook that installs later is no longer reported");
    assert.equal(installed.length, before, "no game method on the fake game is wrapped again");
});
