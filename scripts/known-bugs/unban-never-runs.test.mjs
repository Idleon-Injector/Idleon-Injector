import assert from "node:assert/strict";
import { test } from "node:test";
import { KNOWN_BUGS, importRepo, loadGame } from "./index.mjs";

test("with unban on, account option 26 reads 0 and can't be written", { todo: KNOWN_BUGS.unbanNeverRuns }, async () => {
    const game = await loadGame();
    game.gga.OptionsListAccount = Array(500).fill(0);
    const { setupGameAttributeProxies } = await importRepo("src/cheats/proxies/gameAttributes.js");
    setupGameAttributeProxies();
    assert.equal(game.state.cheatConfig.unban, true, "unban is on in the default config");

    game.gga.OptionsListAccount[26] = 3;

    assert.equal(game.gga.OptionsListAccount[26], 0);
});
