import assert from "node:assert/strict";
import { test } from "node:test";
import { loadGame } from "./index.mjs";

test("a cheat sent while the game is still loading doesn't run against missing game data", async () => {
    const game = await loadGame({ ready: false });

    const result = game.cheat("nomore Copper");
    game.context["com.stencyl.Engine"].engine.sceneInitialized = true; // the game finishes loading

    const { ok, message } = await result;
    assert.ok(ok, `the cheat ran before setup had the game's data: ${message}`);
});
