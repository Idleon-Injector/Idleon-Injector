// Each file runs in its own process, so the cheat code here is a fresh copy.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { loadGame, request } from "../known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { createGameBridge } = require("../../src/modules/game/gameBridge");
const { setupCheatRoutes } = require("../../src/modules/server/routes/cheats");

const game = await loadGame();
game.defineCheat({
    name: "fixture broken",
    message: "a cheat that throws",
    fn: () => {
        throw new TypeError("game value missing");
    },
});
game.defineCheat({
    name: "fixture",
    message: "fixture parent",
    allowToggleChildren: true,
    subcheats: [
        { name: "one", message: "first" },
        { name: "two", message: "second" },
        { name: "value", message: "a value", configurable: true },
    ],
});
const router = new TinyRouter();
setupCheatRoutes(router, createGameBridge(game.runtime, "context"));
const toggle = (body) => request(router, "POST", "/api/toggle", body);

test("every /api/toggle answer is { ok, message }", async () => {
    const answers = {
        "a toggle": await toggle({ action: "godlike crit" }),
        "a value": await toggle({ action: "fixture value 5" }),
        "a cheat that throws": await toggle({ action: "fixture broken" }),
        "an unknown cheat": await toggle({ action: "nosuchcheat" }),
        "a bad value": await toggle({ action: "fixture value abc" }),
        "a value for a plain toggle": await toggle({ action: "godlike crit 5" }),
        "no action": await toggle({}),
        "an 'on' that isn't a boolean": await toggle({ action: "godlike crit", on: "yes" }),
    };
    const shapes = Object.fromEntries(
        Object.entries(answers).map(([name, { statusCode, body }]) => [
            name,
            { statusCode, ok: body.ok, keys: Object.keys(body).sort().join(","), message: typeof body.message },
        ])
    );
    const shape = (statusCode, ok) => ({ statusCode, ok, keys: "message,ok", message: "string" });
    assert.deepEqual(shapes, {
        "a toggle": shape(200, true),
        "a value": shape(200, true),
        "a cheat that throws": shape(200, false),
        "an unknown cheat": shape(200, false),
        "a bad value": shape(200, false),
        "a value for a plain toggle": shape(200, false),
        "no action": shape(400, false),
        "an 'on' that isn't a boolean": shape(400, false),
    });
    assert.match(answers["a toggle"].body.message, /^Activated /);
    assert.equal(answers["an unknown cheat"].body.message, "nosuchcheat is not a valid option.");
});

test("a cheat that throws answers with the reason only, no stack and no 'Error:' prefix", async () => {
    const { body } = await toggle({ action: "fixture broken" });
    assert.deepEqual(body, { ok: false, message: "game value missing" });
});

test("a game the bridge can't reach answers ok: false", async () => {
    const failing = new TinyRouter();
    setupCheatRoutes(failing, {
        executeCheat: async () => ({ value: undefined, error: { text: "Uncaught", details: "Uncaught" } }),
    });
    const crashed = new TinyRouter();
    setupCheatRoutes(crashed, {
        executeCheat: async () => {
            throw new Error("WebSocket is not open");
        },
    });
    const cdpError = await request(failing, "POST", "/api/toggle", { action: "godlike crit" });
    const thrown = await request(crashed, "POST", "/api/toggle", { action: "godlike crit" });
    assert.deepEqual(
        [cdpError.statusCode, cdpError.body],
        [500, { ok: false, message: "Failed to execute cheat 'godlike crit': Uncaught" }]
    );
    assert.deepEqual(
        [thrown.statusCode, thrown.body],
        [500, { ok: false, message: "Internal server error while executing cheat 'godlike crit'" }]
    );
});

test("'on' sets a toggle instead of flipping it; without it the cheat still flips", async () => {
    const crit = () => game.state.cheatState.godlike.crit;
    await toggle({ action: "godlike crit", on: false });
    assert.equal(crit(), false);
    await toggle({ action: "godlike crit", on: false });
    assert.equal(crit(), false, "a second 'off' leaves it off");
    await toggle({ action: "godlike crit", on: true });
    await toggle({ action: "godlike crit", on: true });
    assert.equal(crit(), true, "a second 'on' leaves it on");
    await toggle({ action: "godlike crit" });
    assert.equal(crit(), false, "no 'on' flips it, as before");
});

test("'on' sets a parent's own flag and its children the same way", async () => {
    const { cheatState } = game.state;
    await toggle({ action: "fixture", on: true });
    await toggle({ action: "fixture", on: true });
    assert.deepEqual(
        [cheatState.fixtures, cheatState.fixture.one, cheatState.fixture.two],
        [true, true, true],
        "two 'on' requests leave the parent and its children on"
    );
    await toggle({ action: "fixture", on: false });
    assert.deepEqual([cheatState.fixtures, cheatState.fixture.one, cheatState.fixture.two], [false, false, false]);
});

test("the bridge passes 'on' to the game as a literal and asks for the result by value", async () => {
    const calls = [];
    const bridge = createGameBridge(
        {
            evaluate: async (options) => {
                calls.push(options);
                return { result: { value: { ok: true, message: "done" } } };
            },
        },
        "window.fixture"
    );
    await bridge.executeCheat("godlike crit", true);
    await bridge.executeCheat('say "hi"');
    assert.deepEqual(
        calls.map(({ expression, returnByValue, awaitPromise }) => ({ expression, returnByValue, awaitPromise })),
        [
            { expression: 'cheat.call(window.fixture, "godlike crit", true)', returnByValue: true, awaitPromise: true },
            { expression: 'cheat.call(window.fixture, "say \\"hi\\"", null)', returnByValue: true, awaitPromise: true },
        ]
    );
});
