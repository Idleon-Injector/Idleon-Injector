// Each file runs in its own process, so the cheat code here is a fresh copy.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("cheats that arrive together while the game loads all wait for the one setup, then run in order", async () => {
    const game = await loadGame({ ready: false });
    const globals = await importRepo("src/cheats/core/globals.js");
    game.registerCheat({
        name: "fixture needs game",
        message: "reads the game's data",
        fn: () => `${Object.keys(globals.itemDefs).length >= 0 ? "had" : "missed"} the game's data`,
    });

    const results = Promise.all([
        game.cheat("fixture needs game"),
        game.cheat("godlike crit"),
        game.cheat("godlike crit"),
        game.cheat("nosuchcheat"),
    ]);
    game.context["com.stencyl.Engine"].engine.sceneInitialized = true; // the game finishes loading

    const [data, first, second, unknown] = await results;
    assert.deepEqual(data, { ok: true, message: "had the game's data" });
    assert.deepEqual([first.ok, second.ok, unknown.ok], [true, true, false]);
    assert.match(first.message, /^Activated /);
    assert.match(second.message, /^Deactivated /);
    assert.equal(unknown.message, "nosuchcheat is not a valid option.");
});
