// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("a game class an update removed is reported, and every other hook still installs", async () => {
    const { context, installed } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    context["scripts.ActorEvents_579"] = undefined;

    const { hookFailures } = await setup.call(context);

    assert.equal(hookFailures.length, 1, hookFailures.join("\n"));
    assert.match(
        hookFailures[0],
        /^setupEvents579Proxies: _customBlock_Summoning, .*_customBlock_SushiStuff not found$/
    );
    for (const before of ["ActorEvents_12.", "ActorEvents_481."]) {
        assert.ok(
            installed.some((hook) => hook.includes(before)),
            `${before} hooks run before it and must install`
        );
    }
    for (const after of ["ActorEvents_713.", "ActorEvents_91."]) {
        assert.ok(
            installed.some((hook) => hook.includes(after)),
            `${after} hooks run after it and must install`
        );
    }
});
