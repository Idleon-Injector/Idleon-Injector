// w5 instantnuggets: the shovel's nugget rolls all run at once, each record saved before the next roll; the 6 s lock
// and every other timer keep their delay.
// w5 betternuggets: the shovel's nugget roll, randomFloatBetween(1E-5, 1), leans low (bigger nuggets) by the configured
// power, within the game's own range; every other roll stays the game's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, actor, set, setup, state, context, gga } = await loadHookGame();
const script = context["com.stencyl.behavior.Script"];
const queued = [];
game.returns._customBlock_Thingies = 0;
game.returns.runLater = (delay, callback, target) => queued.push({ delay, callback, target });
// The game's shovel click: its nugget rolls (one every 1600 ms), three movements, then the 6000 ms unlock.
game.returns._customEvent_W5stuffzz = function () {
    if (this._TRIGGEREDtext !== "j1" || this._GenINFO[43][1] !== 0) return "native";
    this._GenINFO[43][1] = 1;
    this._DN1 = this.count;
    for (let i = 0; i < this._DN1; i++) {
        script.runLater(
            1600 * i,
            () => {
                this.dreamBefore.push(gga.OptionsListAccount[192]);
                gga.OptionsListAccount[192]++;
                this._GenINFO[39].push([300 + 40 * i, 0, 20, 30, 4, this.powers ? this.powers[i] : i + 1]);
            },
            this.actor
        );
    }
    for (let i = 0; i < 3; i++) script.runLater(1100 * i, () => {}, this.actor);
    script.runLater(6000, () => (this._GenINFO[43][1] = 0), this.actor);
    return "native";
};
const { hookFailures, error } = await setup();

test("its hook installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("off, or any other roll, the game's roll stays", () => {
    game.returns.randomFloatBetween = (min, max) => (min + max) / 2;
    assert.equal(script.randomFloatBetween(1e-5, 1), (1e-5 + 1) / 2);
    set("w5.betternuggets");
    assert.equal(script.randomFloatBetween(0, 1), 0.5);
    assert.equal(script.randomFloatBetween(1e-5, 2), (1e-5 + 2) / 2);
    set("w5.betternuggets", false);
});

test("on, the nugget roll leans low by the configured power, inside the game's range", () => {
    set("w5.betternuggets");
    const min = 1e-5;
    for (const [power, roll] of [
        [3, 0.5],
        [6, 0.5],
        [1, 0.5],
        [3, min],
        [3, 1],
    ]) {
        state.cheatConfig.w5.betternuggets = power;
        game.returns.randomFloatBetween = () => roll;
        const expected = min + (1 - min) * ((roll - min) / (1 - min)) ** power;
        assert.equal(script.randomFloatBetween(min, 1), expected, `power ${power}, roll ${roll}`);
    }
    state.cheatConfig.w5.betternuggets = 3;
    game.returns.randomFloatBetween = () => 0.5;
    assert.ok(script.randomFloatBetween(min, 1) < 0.5, "a lower roll is a bigger nugget");
    set("w5.betternuggets", false);
});

const shovel = (count) => {
    gga.Gaming = Array(10).fill(0);
    gga.OptionsListAccount[192] = 0;
    const station = actor(577, {
        actor: {},
        _TRIGGEREDtext: "j1",
        _GenINFO: { 43: [0, 0], 39: [] },
        count,
        powers: null,
        dreamBefore: [],
    });
    queued.length = 0;
    station._customEvent_W5stuffzz();
    return station;
};
const delays = () => queued.map(({ delay }) => delay);

test("instant nuggets: every roll at once, the 6 s lock kept, and no second dig while locked", () => {
    set("w5.instantnuggets");
    const station = shovel(500);
    assert.deepEqual(delays(), [...Array(500).fill(0), 0, 1100, 2200, 6000]);
    for (const { callback } of queued.slice(0, 500)) callback();
    assert.equal(gga.Gaming[8], 500);
    assert.equal(station._GenINFO[39].length, 500, "the popups stay for the game to fade");
    station._customEvent_W5stuffzz();
    assert.equal(queued.length, 504, "locked: another click digs nothing");
    queued.at(-1).callback();
    assert.equal(station._GenINFO[43][1], 0);
    set("w5.instantnuggets", false);
});

test("instant nuggets off, an empty shovel, or any other timer: the game's delays", () => {
    shovel(3);
    assert.deepEqual(delays(), [0, 1600, 3200, 0, 1100, 2200, 6000]);
    set("w5.instantnuggets");
    shovel(0);
    assert.deepEqual(delays(), [0, 1100, 2200, 6000]);
    for (const { callback } of queued) callback(); // no nugget, so the first movement isn't taken for one
    script.runLater(1600, () => {}, {});
    assert.equal(queued.at(-1).delay, 1600);
    set("w5.instantnuggets", false);
});

test("instant nuggets: a click that throws leaves later timers alone", () => {
    set("w5.instantnuggets");
    const original = game.returns._customEvent_W5stuffzz;
    game.returns._customEvent_W5stuffzz = function () {
        this._DN1 = 5;
        throw new Error("native failed");
    };
    try {
        const station = actor(577, { actor: {}, _TRIGGEREDtext: "j1", _GenINFO: { 43: [0, 0], 39: [] } });
        assert.throws(() => station._customEvent_W5stuffzz(), /native failed/);
        const later = () => {};
        script.runLater(0, later, station.actor);
        assert.equal(queued.at(-1).callback, later, "the station's next timer is the game's own");
    } finally {
        game.returns._customEvent_W5stuffzz = original;
        set("w5.instantnuggets", false);
    }
});

test("instant nuggets: a record resets Dream before the next roll, unless the legend bonus keeps it", () => {
    set("w5.instantnuggets");
    for (const legend of [0, 1]) {
        game.returns._customBlock_Thingies = legend;
        gga.Gaming = Array(10).fill(0);
        gga.OptionsListAccount[192] = 0;
        queued.length = 0;
        const station = actor(577, { actor: {}, _TRIGGEREDtext: "j1", _GenINFO: { 43: [0, 0], 39: [] }, count: 4 });
        Object.assign(station, { powers: [50, 20, 80, 40], dreamBefore: [] });
        station._customEvent_W5stuffzz();
        for (const { callback } of queued.slice(0, 4)) callback();
        assert.equal(gga.Gaming[8], 80);
        assert.deepEqual(station.dreamBefore, legend ? [0, 1, 2, 3] : [0, 0, 1, 0]);
        assert.equal(gga.OptionsListAccount[192], legend ? 4 : 1);
    }
    game.returns._customBlock_Thingies = 0;
    set("w5.instantnuggets", false);
});
