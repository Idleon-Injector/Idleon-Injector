// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { gameItems, gameLists, importRepo, loadGame } from "../known-bugs/index.mjs";

test("after character select, the game's rebuilt data is hooked again and nothing else is wrapped twice", async () => {
    const { context, installed, gga, state } = await loadGame({ setupDone: false });
    const globals = await importRepo("src/cheats/core/globals.js");
    const { setup } = await importRepo("src/cheats/core/setup.js");
    await setup.call(context);
    const before = installed.length;

    // Character select builds new lists, item definitions and W5 gaming data.
    gga.CustomLists = { h: gameLists() };
    gga.ItemDefinitionsGET = { h: gameItems() };
    gga.Gaming = Array(14).fill(5);
    context.FirebaseStorage.playButton();

    assert.equal(globals.cList, gga.CustomLists.h, "the game's variables are registered again");
    assert.equal(globals.itemDefs, gga.ItemDefinitionsGET.h);
    state.cheatState.wide.mtx = true;
    state.cheatState.equipall = true;
    state.cheatState.w5.gaming = true;
    state.cheatConfig.w5.gaming.SnailMail = 3;
    assert.equal(gga.CustomLists.h.MTXinfo[0][0][0][3], 0, "the new lists are hooked");
    assert.equal(gga.ItemDefinitionsGET.h.SwordGame.h.Class, "ALL", "the new item definitions are hooked");
    assert.equal(gga.Gaming[13], 3, "the new gaming data is hooked");
    assert.deepEqual(installed.slice(before), [], "no game method is wrapped a second time");
});
