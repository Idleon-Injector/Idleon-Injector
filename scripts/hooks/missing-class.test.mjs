// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("a game class an update removed is reported, and every other hook still installs", async () => {
    const { context, installed } = await loadGame({ setupDone: false });
    const { setup } = await importRepo("src/cheats/core/setup.js");
    context["scripts.ActorEvents_579"] = undefined;

    const { hookFailures } = await setup.call(context);

    // One line for each hook on the class, under the cheats it serves.
    for (const failure of hookFailures) assert.match(failure, /^[\w., ]+: events\(579\)\._customBlock_\w+ not found$/);
    assert.ok(hookFailures.includes("w5.holes: events(579)._customBlock_Holes not found"));
    assert.ok(hookFailures.includes("w7.sushi: events(579)._customBlock_SushiStuff not found"));
    assert.equal(hookFailures.length, 23, hookFailures.join("\n"));
    for (const other of ["ActorEvents_12.", "ActorEvents_481.", "ActorEvents_713.", "ActorEvents_91."]) {
        assert.ok(
            installed.some((hook) => hook.includes(other)),
            `${other} hooks must install`
        );
    }
});
