// Each file runs in its own process, so the example's rows and automation don't reach the other tests.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

test("the example automation works as a copy would, but the build leaves it out", async () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const { cheat, gga } = await loadGame();
    await importRepo("src/cheats/cheats/_example.js");
    await importRepo("src/cheats/automations/_example.js");
    const { getAutomations } = await importRepo("src/cheats/core/automations.js");
    const example = () => getAutomations().find(({ id }) => id === "example.autoheal");

    gga.PlayerHP = 10;
    assert.deepEqual(await cheat("example autoheal"), {
        ok: true,
        message: "Activated top your HP back up every second.",
    });
    mock.timers.tick(1000);
    assert.equal(gga.PlayerHP, 100);
    gga.PlayerHP = 40;
    mock.timers.tick(1000);
    assert.equal(example().status, "Healed 2 times");

    await cheat("example autoheal");
    gga.PlayerHP = 5;
    mock.timers.tick(5000);
    assert.equal(gga.PlayerHP, 5);
    assert.equal(example().on, false);
});
