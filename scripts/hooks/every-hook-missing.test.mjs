// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// Every game hook with its target gone after a game update: each one is reported on its own line, patches nothing,
// and installs once the target is back (as after character select).
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

const { context } = await loadGame({ setupDone: false });
const hooks = await importRepo("src/cheats/core/hooks.js");
const all = hooks.listHooks();
const owner = (hook) => (hook.early ? context[hook.early].prototype : hook.target());

// Take each target away the way an update would: the method, or the object a proxy hook replaces, is gone. A fake
// game finds something at every path, so an accessor hook's own object (or list of objects) goes at its getter.
const originals = new Map(); // hook -> what its method or proxied property held
const restores = [];
for (const hook of all) {
    if (hook.method || hook.proxy) {
        const target = owner(hook);
        const name = hook.method ?? hook.property;
        const value = target[name];
        target[name] = undefined;
        originals.set(hook, value);
        restores.unshift(() => (target[name] = value)); // a second hook on a method found it gone already
    } else if (hook.targets) {
        const { targets } = hook;
        hook.targets = () => [];
        restores.push(() => (hook.targets = targets));
    } else {
        const { target } = hook;
        hook.target = () => undefined;
        restores.push(() => (hook.target = target));
    }
}

test("every hook with its target gone is reported under its cheats, on its own line", () => {
    hooks.installHooks();
    const failures = hooks.getHookFailures();
    assert.equal(failures.length, all.length, failures.join("\n"));
    all.forEach((hook, i) => {
        assert.ok(failures[i].startsWith(`${hook.id}: `), failures[i]);
        assert.ok(failures[i].endsWith(`.${hook.method ?? hook.property} not found`), failures[i]);
    });
});

test("nothing is patched in place of a missing method or object", () => {
    for (const hook of originals.keys()) {
        assert.equal(owner(hook)[hook.method ?? hook.property], undefined, `${hook.id}: ${hook.method}`);
    }
});

test("every hook installs once its target is back", () => {
    for (const restore of restores) restore();
    hooks.installHooks();
    assert.deepEqual(hooks.getHookFailures(), []);
    for (const [hook, original] of originals) {
        assert.notEqual(owner(hook)[hook.method ?? hook.property], original, `${hook.id}: ${hook.method}`);
    }
    for (const hook of all.filter((h) => !h.method && !h.proxy)) {
        for (const target of hook.targets ? hook.targets() : [hook.target()]) {
            assert.ok(Object.getOwnPropertyDescriptor(target, hook.property).get, `${hook.id}: ${hook.property}`);
        }
    }
});
