// What Sushi Auto Play does, written against the automation before it became a defineAutomation (#17): the game
// actions it takes, when it takes them, and what it answers. A fake Sushi station stands in for the game.
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
const { cheatConfig } = game.state;
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** Move the fake clock in 50 ms steps, the automation's pace, letting each step's work finish. */
async function advance(ms) {
    for (let i = 0; i < ms / 50; i++) {
        mock.timers.tick(50);
        await flush();
    }
}
const run = async (action) => {
    const result = await game.cheat(action);
    return result.ok ? JSON.parse(result.message) : result;
};

/**
 * A Sushi board with 6 open slots (the last 2 reserved), tiers 0-5 and 2 cookable tiers. Merging ("i<slot>")
 * upgrades the slot and starts a 120 ms East Wind chain; buying ("A") costs 1 fuel, fills the first open slot and
 * is pending for 60 ms; `stuck` keeps East Wind going forever. Every native trigger is logged with the milliseconds since
 * the station was set up.
 */
function station(board = [], fuel = 1e9) {
    const start = Date.now();
    const log = [];
    const sushi = [
        Array(120).fill(-1),
        Array(120).fill(-1),
        [],
        Array(15).fill(0),
        [fuel, 0, 0, 0, 0],
        Array(7).fill(0),
    ];
    board.forEach((tier, index) => (sushi[0][index] = tier));
    for (let index = 0; index < 6; index++) sushi[1][index] = 0;
    let pendingUntil = 0;
    const info = Object.assign([], { 142: 0, 150: 0, 151: -1, 158: 0 });
    const ui = {
        stuck: false,
        _GenINFO: info,
        _UIinventory17On: Object.assign([], { 64: 1 }),
        _TRIGGEREDtext: "",
        _customEvent_sushistuff() {
            const trigger = this._TRIGGEREDtext;
            if (trigger === "m") return; // refreshes the station's totals
            log.push(`${Date.now() - start}:${trigger}`);
            if (trigger[0] === "i") {
                sushi[0][Number(trigger.slice(1))]++;
                pendingUntil = Date.now() + 120;
            }
        },
        _customEvent_sushistuff2() {
            const trigger = this._TRIGGEREDtext;
            log.push(`${Date.now() - start}:${trigger}`);
            if (trigger === "B") sushi[4][4] = (sushi[4][4] + 1) % 2;
            if (trigger === "A") {
                sushi[4][0]--;
                sushi[0][sushi[0].findIndex((tier, index) => sushi[1][index] >= 0 && tier === -1)] = sushi[4][4];
                pendingUntil = Date.now() + 60;
            }
        },
    };
    Object.defineProperty(info, 157, { get: () => (ui.stuck || Date.now() < pendingUntil ? [1] : []) });
    game.gga.MenuType2 = 102;
    game.gga.PixelHelperActor[27] = { behaviors: { getBehavior: () => ui } };
    game.gga.Sushi = sushi;
    const rules = { MaxTier: 5, MaxCookTier: 1, FuelCost: 1, UpgradeQTY: 0, UniqueSushi: 99, FireplaceEffect: 0 };
    game.context["scripts.ActorEvents_579"]._customBlock_SushiStuff = (name) => rules[name] ?? 0;
    cheatConfig.w7.sushitools = { ...cheatConfig.w7.sushitools, tier: 1, targetCount: 2, targetTier: 3 };
    return { log, ui, board: sushi[0] };
}

const ON = { enabled: true, message: "Auto Play enabled. It will idle when the goal is reached." };
const OFF = { enabled: false, message: "Auto Play disabled." };

test("Auto Play buys, merges and waits for East Wind on the same steps, then idles at the goal", async () => {
    const { log, board } = station();
    assert.deepEqual(await run("w7 sushitools"), ON);
    assert.equal((await run("w7 sushitools status")).message, "Waiting for the board…");
    await advance(5000);

    const status = await run("w7 sushitools status");
    assert.equal(status.message, "Finished: 2/2 tier 3+ sushi.");
    assert.deepEqual([status.enabled, status.busy, status.merges, status.cycles], [true, false, 6, 3]);
    assert.deepEqual(board.slice(0, 6), [2, 2, -1, -1, -1, -1], "sorted at the end");
    assert.deepEqual(log, [
        "50:A",
        "150:A",
        "250:A",
        "350:A",
        "450:i0",
        "450:h1",
        "600:h2",
        "600:h3",
        "600:i0",
        "600:h1",
        "750:h2",
        "750:i0",
        "750:h1",
        "900:A",
        "1000:A",
        "1100:A",
        "1200:h2",
        "1200:i0",
        "1200:h1",
        "1350:A",
        "1450:h3",
        "1450:i0",
        "1450:h1",
        "1600:h3",
        "1600:i0",
        "1600:h1",
        "1750:h1",
        "1750:h2",
    ]);

    // It stays on, idle, until it's turned off; nothing else happens meanwhile.
    await advance(1000);
    assert.equal(log.length, 28);
    assert.deepEqual(await run("w7 sushitools"), OFF);
    assert.equal((await run("w7 sushitools status")).enabled, false);
});

test("turning it off stops it before its next step", async () => {
    const { log } = station();
    assert.deepEqual(await run("w7 sushitools"), ON);
    await advance(200);
    assert.deepEqual(log, ["50:A", "150:A"]);
    assert.deepEqual(await run("w7 sushitools"), OFF);
    await advance(2000);
    assert.deepEqual(log, ["50:A", "150:A"]);
    const status = await run("w7 sushitools status");
    assert.deepEqual([status.enabled, status.busy, status.message], [false, false, "Auto Play disabled."]);
});

test("the in-game buttons and the East Wind hook see the state the cheat's Auto Play sets, and only while it runs", async () => {
    // The module both hooks import (hooks/sushiButton.js, hooks/sushiWind.js).
    const autoPlay = await importRepo("src/cheats/helpers/sushi/autoPlay.js");
    const seen = () => [autoPlay.enabled, autoPlay.windExtended, autoPlay.windHigher];
    const { ui } = station();
    cheatConfig.w7.sushitools = { ...cheatConfig.w7.sushitools, extendChain: true, higherTier: false };
    ui._GenINFO[151] = 0;
    assert.equal((await run("w7 sushitools")).ok, false);
    assert.deepEqual(seen(), [false, false, false], "a refused start sets nothing");
    ui._GenINFO[151] = -1;
    assert.deepEqual(await run("w7 sushitools"), ON);
    assert.deepEqual(seen(), [true, true, false]);
    assert.deepEqual(await run("w7 sushitools"), OFF);
    assert.deepEqual(seen(), [false, false, false]);
});

test("a sushi picked up mid-run stops it with the reason, and it stays on until turned off", async () => {
    const after = station();
    assert.deepEqual(await run("w7 sushitools"), ON);
    await advance(50);
    after.ui._GenINFO[151] = 3; // picked up while the purchase settles
    await advance(500);
    let status = await run("w7 sushitools status");
    assert.deepEqual(after.log, ["50:A"]);
    assert.equal(status.message, "Stopped: A sushi is being dragged; purchasing stopped.");
    assert.deepEqual([status.enabled, status.busy], [true, false]);
    assert.deepEqual(await run("w7 sushitools"), OFF);

    const merging = station([0, 0]);
    assert.deepEqual(await run("w7 sushitools"), ON);
    await advance(50);
    merging.ui._GenINFO[151] = 2; // picked up while East Wind settles
    await advance(500);
    status = await run("w7 sushitools status");
    assert.deepEqual(merging.log, ["50:i0", "50:h1"]);
    assert.equal(status.message, "Stopped: Dragging detected; stopped.");
    assert.deepEqual(await run("w7 sushitools"), OFF);
});

test("East Wind that never settles stops it after 60 seconds", async () => {
    const { ui, log } = station([0, 0]);
    assert.deepEqual(await run("w7 sushitools"), ON);
    await advance(50);
    assert.deepEqual(log, ["50:i0", "50:h1"]);
    ui.stuck = true;
    await advance(59950);
    assert.equal((await run("w7 sushitools status")).message, "Waiting for East Wind after merge 1…");
    await advance(50);
    assert.equal((await run("w7 sushitools status")).message, "Stopped: East Wind did not settle within 60 seconds.");
    assert.deepEqual(await run("w7 sushitools"), OFF);
});

test("sushi in the reserved slots are sorted out first, and a bad board refuses to start", async () => {
    const { log } = station([-1, -1, -1, -1, 0, 1]);
    assert.deepEqual(await run("w7 sushitools"), ON);
    await advance(100);
    assert.deepEqual(log, ["50:h0", "50:h1", "50:h4", "50:h5", "100:A"]);
    assert.deepEqual(await run("w7 sushitools"), OFF);
    await advance(50); // before #17, the stopped loop still held the board until its next 50 ms step

    const { ui } = station();
    ui._GenINFO[151] = 0;
    assert.deepEqual(await run("w7 sushitools"), { ok: false, message: "Release the sushi before starting." });
    assert.equal((await run("w7 sushitools status")).enabled, false);
    station([0, 0, 0, 0, 0, 0]);
    assert.deepEqual(await run("w7 sushitools"), {
        ok: false,
        message: "Clear 2 slots before starting; no sushi will be deleted.",
    });
    assert.equal((await run("w7 sushitools status")).enabled, false);
});

// Issue #4. The game reads only slots 0-119, but its East Wind can chain from slot 119 into a "slot 120" and upgrade
// it, which makes Sushi[0] longer than Sushi[1]. The game ignores those entries; so do the tools.
test("a board the game's East Wind made longer than 120 plays and sorts, and its extra entries are left alone", async () => {
    const { board } = station();
    board.push(1, 2);
    assert.deepEqual(await run("w7 sushitools"), ON);
    await advance(5000);
    const status = await run("w7 sushitools status");
    assert.equal(status.message, "Finished: 2/2 tier 3+ sushi.");
    assert.equal(status.board.length, 120);
    assert.deepEqual(board.slice(0, 6), [2, 2, -1, -1, -1, -1]);
    assert.deepEqual(board.slice(120), [1, 2]);
    assert.deepEqual(await run("w7 sushitools"), OFF);

    const sorting = station([-1, -1, -1, -1, 0, 1]);
    sorting.board.push(3);
    assert.deepEqual(await run("w7 sushitools sort"), { enabled: false, message: "Sorted 4 slots." });
    assert.deepEqual(sorting.board.slice(0, 6), [1, 0, -1, -1, -1, -1]);
    assert.deepEqual(sorting.board.slice(120), [3]);
});

test("a board shorter than 120, which the game never makes, refuses with what's wrong", async () => {
    station().board.length = 119;
    assert.deepEqual(await run("w7 sushitools"), {
        ok: false,
        message:
            "The Sushi board save has 119 slots instead of 120, so the Sushi tools can't use it. Please report this on the injector's GitHub.",
    });
    assert.equal((await run("w7 sushitools status")).enabled, false);
});

test("while Auto Play is on, the WebUI's active-cheats list shows it, and a click there turns it off", async () => {
    const router = new TinyRouter();
    const client = Object.assign(new EventEmitter(), { Runtime: game.runtime });
    setupApiRoutes(router, "context", client, { cheatConfig: {}, startupCheats: [], injectorConfig: {} });
    const { store } = await loadUi(router);
    station();
    assert.deepEqual(await run("w7 sushitools"), ON);
    await store.loadCheatStates();
    assert.ok(store.getActiveCheats().includes("w7 sushitools"));

    assert.equal(await store.executeCheat("w7 sushitools", "Sushi tools"), true);
    assert.equal((await run("w7 sushitools status")).enabled, false);
    await store.loadCheatStates();
    assert.ok(!store.getActiveCheats().includes("w7 sushitools"));
});

// Issue #79: with a target the board can't hold, the start said only that it must fit.
test("a target the board can't hold refuses to start, saying the most that fits", async () => {
    station();
    cheatConfig.w7.sushitools = { ...cheatConfig.w7.sushitools, targetCount: 40, reserveSlots: 2 };
    assert.deepEqual(await run("w7 sushitools"), {
        ok: false,
        message: "Target quantity 40 doesn't fit: 4 at most with 2 empty slots.",
    });
    assert.equal((await run("w7 sushitools status")).enabled, false);
});

// Issue #79: out of fuel, the sushi it had just bought stayed on the board unmerged.
test("out of fuel, it merges what it bought before stopping, and says so", async () => {
    const { log, board } = station([], 3);
    assert.deepEqual(await run("w7 sushitools"), ON);
    await advance(5000);
    const status = await run("w7 sushitools status");
    assert.equal(status.message, "Stopped: Not enough fuel for tier 1 sushi. Nothing on the board is left to merge.");
    assert.deepEqual([status.enabled, status.busy, status.merges], [true, false, 1]);
    assert.deepEqual(log.filter((entry) => entry.endsWith(":A")).length, 3, "bought 3, the fuel it had");
    assert.deepEqual(board.slice(0, 4).sort(), [-1, -1, 0, 1], "two of them merged; the third has no pair");
    assert.deepEqual(await run("w7 sushitools"), OFF);
});
