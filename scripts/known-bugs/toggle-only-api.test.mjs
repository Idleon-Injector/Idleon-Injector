import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { KNOWN_BUGS, loadGame, request } from "./index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { createGameBridge } = require("../../src/modules/game/gameBridge");
const { setupCheatRoutes } = require("../../src/modules/server/routes/cheats");

test("two requests to turn a cheat on leave it on", { todo: KNOWN_BUGS.toggleOnlyApi }, async () => {
    const game = await loadGame();
    const router = new TinyRouter();
    setupCheatRoutes(router, createGameBridge(game.runtime, "context"));
    assert.equal(game.state.cheatState.godlike.crit, false);

    // Two open tabs both see "godlike crit" off and both turn it on. /api/toggle is the only way to
    // write a cheat today; the fix changes these two requests to its "turn on" form.
    const first = await request(router, "POST", "/api/toggle", { action: "godlike crit" });
    const second = await request(router, "POST", "/api/toggle", { action: "godlike crit" });

    assert.equal(
        game.state.cheatState.godlike.crit,
        true,
        `the cheat must stay on; responses: ${first.body.result} / ${second.body.result}`
    );
});
