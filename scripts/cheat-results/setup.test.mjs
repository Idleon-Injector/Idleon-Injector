// Each file runs in its own process, so the cheat code here is a fresh copy.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadGame } from "../known-bugs/index.mjs";

test("a cheat whose setup fails answers ok: false with the reason, and the next cheat retries setup", async () => {
    const game = await loadGame({ setupDone: false });
    const items = game.gga.ItemDefinitionsGET;
    game.gga.ItemDefinitionsGET = undefined; // setup can't read the game's item list

    const failed = await game.cheat("godlike crit");
    assert.equal(failed.ok, false);
    assert.match(failed.message, /^Cheat setup failed: /);
    assert.equal(game.state.cheatState.godlike.crit, false, "the cheat didn't run");

    game.gga.ItemDefinitionsGET = items;
    assert.deepEqual(await game.cheat("godlike crit", true), { ok: true, message: "Activated crit set to 100." });
    assert.equal(game.state.cheatState.godlike.crit, true);
});
