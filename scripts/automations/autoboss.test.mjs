// What "wide autoboss" does, written against its timer loop before it became a defineAutomation (#17): once a
// boss on a boss map has been seen alive and then dead, the map reloads 5 seconds later, checked every second.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: 0 });
const { gga, context, cheat } = await loadGame();
const reloads = [];
const script = context["com.stencyl.behavior.Script"];
script.createFadeOut = (seconds, delay) => `out ${seconds} ${delay}`;
script.createFadeIn = (seconds, delay) => `in ${seconds} ${delay}`;
script.reloadCurrentScene = (fadeOut, fadeIn) => reloads.push(`${Date.now()} ${gga.CurrentMap} ${fadeOut}, ${fadeIn}`);

/** Move the clock a second at a time, as the loop checks. */
const seconds = (count) => {
    for (let i = 0; i < count; i++) mock.timers.tick(1000);
};

test("a boss seen alive and then dead reloads its map 5 seconds later, and again for the next boss", async () => {
    gga.CurrentMap = 66;
    gga.BossHP = 0;
    assert.deepEqual(await cheat("wide autoboss"), {
        ok: true,
        message: "Activated automatically reload defeated boss maps.",
    });
    seconds(3);
    assert.deepEqual(reloads, [], "a boss never seen alive doesn't reload");

    gga.BossHP = 500;
    seconds(1); // 4 s: seen alive
    gga.BossHP = 0;
    seconds(5); // 5 s: seen dead, reload due at 10 s
    assert.deepEqual(reloads, []);
    seconds(1);
    assert.deepEqual(reloads, ["10000 66 out 0.4 0, in 0.5 0"]);

    gga.BossHP = 800; // the reloaded map's boss
    seconds(2);
    gga.BossHP = 0;
    seconds(6);
    assert.deepEqual(reloads.slice(1), ["18000 66 out 0.4 0, in 0.5 0"]);
    seconds(10);
    assert.equal(reloads.length, 2, "a dead boss reloads once");

    assert.deepEqual(await cheat("wide autoboss"), {
        ok: true,
        message: "Deactivated automatically reload defeated boss maps.",
    });
});

test("turning it off, leaving the map, or a map without a boss cancels the reload", async () => {
    const start = reloads.length;
    const killBoss = async () => {
        gga.BossHP = 100;
        seconds(1);
        gga.BossHP = 0;
        seconds(1); // reload due in 5 s
    };
    gga.CurrentMap = 29;
    await cheat("wide autoboss", true);
    await killBoss();
    await cheat("wide autoboss", false);
    seconds(10);
    assert.equal(reloads.length, start, "turned off");

    await cheat("wide autoboss", true);
    await killBoss();
    gga.CurrentMap = 114; // another boss map
    seconds(10);
    assert.equal(reloads.length, start, "moved to another map");

    gga.CurrentMap = 1; // not a boss map
    await killBoss();
    seconds(10);
    assert.equal(reloads.length, start, "not a boss map");

    gga.CurrentMap = 266;
    await killBoss();
    seconds(4);
    gga.BossHP = 50; // a new boss appeared before the reload; the reload still happens
    seconds(1);
    assert.deepEqual(reloads.slice(start), [`${Date.now()} 266 out 0.4 0, in 0.5 0`]);
    await cheat("wide autoboss", false);
});
