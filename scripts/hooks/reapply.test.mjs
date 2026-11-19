// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("after character select, the game's rebuilt data is hooked again and nothing else is wrapped twice", async () => {
    const { context, installed, gga } = await loadGame({ setupDone: false });
    const globals = await importRepo("src/cheats/core/globals.js");
    const { setup } = await importRepo("src/cheats/core/setup.js");
    await setup.call(context);
    const before = installed.length;

    // Character select builds new lists, item definitions and W5 gaming data. A fresh game object has no
    // _isPatched flag; the fake game would answer that read with a (truthy) fake, so it is set here.
    const fresh = (object) =>
        Object.defineProperty(object, "_isPatched", { value: false, writable: true, configurable: true });
    for (const key of ["CustomLists", "ItemDefinitionsGET", "Gaming"]) delete gga[key];
    fresh(gga.CustomLists.h);
    fresh(gga.ItemDefinitionsGET.h);
    fresh(gga.Gaming);
    context.FirebaseStorage.playButton();

    assert.equal(globals.cList, gga.CustomLists.h, "the game's variables are registered again");
    assert.equal(globals.itemDefs, gga.ItemDefinitionsGET.h);
    assert.equal(globals.cList._isPatched, true, "the new lists are hooked");
    assert.equal(globals.itemDefs._isPatched, true, "the new item definitions are hooked");
    assert.equal(gga.Gaming._isPatched, true, "the new gaming data is hooked");
    assert.deepEqual(installed.slice(before), [], "no game method is wrapped a second time");
});
