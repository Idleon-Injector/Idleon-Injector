// The core runs every automation (#17): its toggle cheat starts and stops it, a running one shows in the active-cheats
// list, a tick that throws is reported without stopping anything, and a stopped one never ticks again.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { mock, test } from "node:test";
import { importRepo, loadGame, loadUi } from "../known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { setupApiRoutes } = require("../../src/modules/server/apiRoutes");

mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: 0 });
const game = await loadGame();
const { cheat, defineCheat, state } = game;
const { defineAutomation, getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const { cheats } = await importRepo("src/cheats/core/registration.js");
const errors = [];
console.error = (...args) => errors.push(args.join(" "));

const ticks = { steady: 0, flaky: 0, command: 0 };
defineCheat({
    name: "fixture",
    message: "fixture",
    allowToggleChildren: true,
    subcheats: [
        { name: "steady", message: "steady loop" },
        { name: "flaky", message: "flaky loop" },
        { name: "picky", message: "picky loop" },
    ],
});
defineAutomation({
    id: "fixture.steady",
    cheat: "fixture steady",
    interval: 100,
    tick: () => ticks.steady++,
    status: () => `ticked ${ticks.steady}`,
});
defineAutomation({
    id: "fixture.flaky",
    cheat: "fixture flaky",
    interval: 100,
    tick() {
        ticks.flaky++;
        throw new Error(`bad tick ${ticks.flaky}`);
    },
    status: () => "flaky",
});
defineAutomation({
    id: "fixture.picky",
    cheat: "fixture picky",
    interval: 100,
    tick() {},
    status: () => "picky",
    start() {
        throw new Error("Open the picky menu first.");
    },
});
// A command with its own answer starts and stops its automation itself.
defineCheat({
    name: "fixturecmd",
    message: "command loop",
    fn: (params, on) => switchAutomation("fixture.command", on),
});
defineAutomation({
    id: "fixture.command",
    cheat: "fixturecmd",
    interval: 100,
    tick: () => ticks.command++,
    status: () => "command",
    start: () => "Command loop on.",
    stop: () => "Command loop off.",
});

const automation = (id) => getAutomations().find((entry) => entry.id === id);

test("the toggle cheat starts and stops its automation, which ticks only while on", async () => {
    assert.deepEqual(await cheat("fixture steady"), { ok: true, message: "Activated steady loop." });
    mock.timers.tick(350);
    assert.equal(ticks.steady, 3);
    assert.deepEqual(automation("fixture.steady"), {
        id: "fixture.steady",
        cheat: "fixture steady",
        on: true,
        error: null,
        status: "ticked 3",
    });

    assert.deepEqual(await cheat("fixture steady", false), { ok: true, message: "Deactivated steady loop." });
    mock.timers.tick(1000);
    assert.equal(ticks.steady, 3, "stopping really stops");
    assert.equal(automation("fixture.steady").status, null);

    // A group's "all on" starts its automations too, reporting the one that refused, and "all off" stops them.
    assert.deepEqual(await cheat("fixture", true), { ok: false, message: "Open the picky menu first." });
    assert.deepEqual(
        getAutomations().map(({ id, on }) => [id, on]),
        [
            ["w7.sushi", false],
            ["wide.autoboss", false],
            ["fixture.steady", true],
            ["fixture.flaky", true],
            ["fixture.picky", false],
            ["fixture.command", false],
        ]
    );
    assert.equal(state.cheatState.fixture.picky, false);
    mock.timers.tick(100);
    assert.deepEqual([ticks.steady, ticks.flaky], [4, 1]);
    await cheat("fixture", false);
    mock.timers.tick(1000);
    assert.deepEqual([ticks.steady, ticks.flaky], [4, 1]);
});

test("a command switches its automation and answers with the automation's own message", async () => {
    assert.deepEqual(await cheat("fixturecmd", true), { ok: true, message: "Command loop on." });
    assert.deepEqual(await cheat("fixturecmd", true), { ok: true, message: "fixture.command is already on." });
    mock.timers.tick(200);
    assert.deepEqual(await cheat("fixturecmd"), { ok: true, message: "Command loop off." });
    mock.timers.tick(500);
    assert.equal(ticks.command, 2);
});

test("an automation that refuses to start fails its cheat and leaves the toggle off", async () => {
    assert.deepEqual(await cheat("fixture picky"), { ok: false, message: "Open the picky menu first." });
    assert.equal(state.cheatState.fixture.picky, false);
    assert.equal(automation("fixture.picky").on, false);
});

test("a tick that throws is reported, and it and the other automations keep going", async () => {
    await cheat("fixture steady", true);
    await cheat("fixture flaky", true);
    const before = { ...ticks, errors: errors.length };
    mock.timers.tick(300);
    assert.equal(ticks.flaky, before.flaky + 3, "the throwing automation keeps its schedule");
    assert.equal(ticks.steady, before.steady + 3, "the other automation is unaffected");
    assert.equal(automation("fixture.flaky").error, `bad tick ${ticks.flaky}`);
    assert.equal(automation("fixture.flaky").on, true);
    assert.deepEqual(
        errors.slice(before.errors).map((line) => line.split(":")[0]),
        Array(3).fill("Automation fixture.flaky failed")
    );
    await cheat("fixture flaky", false);
    await cheat("fixture steady", false);
    mock.timers.tick(1000);
    assert.equal(ticks.flaky, before.flaky + 3);
    assert.equal(ticks.steady, before.steady + 3);
});

test("a running automation shows in the WebUI's active-cheats list, and a click there turns it off", async () => {
    const client = Object.assign(new EventEmitter(), { Runtime: game.runtime });
    const router = new TinyRouter();
    setupApiRoutes(router, "context", client, { cheatConfig: {}, startupCheats: [], injectorConfig: {} });
    const { store } = await loadUi(router);

    await cheat("fixturecmd", true);
    await cheat("fixture steady", true);
    await store.loadCheatStates();
    assert.deepEqual(store.getActiveCheats().sort(), ["fixture steady", "fixturecmd"]);

    // The list sends the opposite of what it shows, so a second click can't turn it back on.
    assert.equal(await store.executeCheat("fixturecmd", "command loop"), true);
    await store.loadCheatStates();
    assert.deepEqual(store.getActiveCheats(), ["fixture steady"]);
    assert.equal(automation("fixture.command").on, false);
    await cheat("fixture steady", false);
});

test("every automation's cheat is a command, and the folder holds the real ones", async () => {
    const { automationFiles } = await importRepo("rollup.config.mjs");
    assert.ok(automationFiles().includes("autoboss.js"), "automation files are found by scanning the folder");
    assert.ok(!automationFiles().includes("_example.js"));
    for (const { id, cheat: command } of getAutomations()) assert.ok(cheats[command], `${id}: ${command}`);
    assert.deepEqual(
        getAutomations()
            .map(({ id }) => id)
            .filter((id) => !id.startsWith("fixture")),
        ["w7.sushi", "wide.autoboss"]
    );
});
