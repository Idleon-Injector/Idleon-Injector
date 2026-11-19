// Each file runs in its own process, so the example's rows don't reach the other cheat tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("the example cheat works as a copy would, but the build leaves it out", async () => {
    const { cheatFiles } = await importRepo("rollup.config.mjs");
    assert.ok(cheatFiles().includes("worlds.js"), "cheat files are found by scanning the folder");
    assert.ok(!cheatFiles().includes("_example.js"));
    assert.ok(!cheatFiles().includes("automation.js"), "files in helper folders like sushi/ are not cheat files");

    const { cheat, gga, state } = await loadGame();
    await importRepo("src/cheats/cheats/_example.js");

    assert.deepEqual(await cheat("examplehp 100"), { ok: true, message: "The amount of health is set to 100" });
    assert.equal(gga.PlayerHP, 100);
    assert.deepEqual(await cheat("examplehp lots"), {
        ok: false,
        message: "Give the HP as a number, e.g. examplehp 100",
    });

    assert.deepEqual(await cheat("example", true), { ok: true, message: "Activated example cheats" });
    assert.equal(state.cheatState.example.speed, true);
    assert.deepEqual(await cheat("example speed"), {
        ok: true,
        message: "Deactivated faster example bars (see config).",
    });
    assert.deepEqual(await cheat("example reset"), { ok: true, message: "The example bars were reset" });

    const { cheats, cheatRows } = await importRepo("src/cheats/core/registration.js");
    assert.equal(cheats["example reset"].dangerous, true);
    assert.equal(cheatRows.at(-1).config.speed.default(3), 6);
});
