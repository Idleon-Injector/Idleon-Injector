import assert from "node:assert/strict";
import { test } from "node:test";
import { KNOWN_BUGS, loadGame } from "./index.mjs";

test(
    "a cheat sent while the game is still loading doesn't run against missing game data",
    { todo: KNOWN_BUGS.cheatBeforeSetup },
    async () => {
        const game = await loadGame({ ready: false });

        const result = game.cheat("nomore Copper");
        game.context["com.stencyl.Engine"].engine.sceneInitialized = true; // the game finishes loading

        assert.doesNotMatch(String(await result), /Error/, "the cheat ran before setup had the game's data");
    }
);
