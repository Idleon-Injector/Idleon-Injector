import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, actor, set, setup, context, gga } = await loadHookGame();
const script = context["com.stencyl.behavior.Script"];
const queued = [];
game.returns._customBlock_Thingies = 0;
game.returns.runLater = (delay, callback, target) => queued.push({ delay, callback, target });
// Native shovel order: nugget rolls, three movements, then the 6000 ms unlock.
game.returns._customEvent_W5stuffzz = function () {
    if (this._TRIGGEREDtext !== "j1" || this._GenINFO[43][1] !== 0) return "native";
    this._GenINFO[43][1] = 1;
    this._DN1 = this.count;
    for (let i = 0; i < this._DN1; i++) {
        script.runLater(
            1600 * i,
            () => {
                this.rewards.push(i);
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
const shovel = (count = 500) => {
    gga.Gaming = Array(10).fill(0);
    gga.OptionsListAccount[192] = 0;
    return actor(577, {
        actor: {},
        _TRIGGEREDtext: "j1",
        _GenINFO: { 43: [0, 0], 39: [] },
        count,
        powers: null,
        rewards: [],
        dreamBefore: [],
    });
};

test("instant nuggets resolve together without shortening the shovel lock or losing rolls", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
    set("w5.instantnuggets");
    set("wide.nogamingpop");
    queued.length = 0;
    const station = shovel();
    assert.equal(station._customEvent_W5stuffzz(), "native");
    assert.equal(queued.length, 504);
    assert.ok(queued.slice(0, 500).every(({ delay }) => delay === 0));
    assert.deepEqual(
        queued.slice(500).map(({ delay }) => delay),
        [0, 1100, 2200, 6000]
    );
    for (const { callback } of queued.slice(0, 500)) callback();
    assert.deepEqual(
        station.rewards,
        Array.from({ length: 500 }, (_, i) => i)
    );
    assert.equal(gga.Gaming[8], 500);
    assert.equal(station._GenINFO[39].length, 0, "settled nuggets leave no popup backlog");
    assert.equal(station._GenINFO[43][1], 1);
    station._customEvent_W5stuffzz();
    assert.equal(queued.length, 504, "another dig cannot bypass the native lock");
    queued.at(-1).callback();
    assert.equal(station._GenINFO[43][1], 0);
});

test("instant off keeps native spacing; empty shovels and unrelated timers stay native", () => {
    set("w5.instantnuggets", false);
    queued.length = 0;
    shovel(3)._customEvent_W5stuffzz();
    assert.deepEqual(
        queued.map(({ delay }) => delay),
        [0, 1600, 3200, 0, 1100, 2200, 6000]
    );
    set("w5.instantnuggets");
    queued.length = 0;
    shovel(0)._customEvent_W5stuffzz();
    assert.deepEqual(
        queued.map(({ delay }) => delay),
        [0, 1100, 2200, 6000]
    );
    script.runLater(1600, () => {}, {});
    assert.equal(queued.at(-1).delay, 1600);
});

test("an exception cannot leave unrelated scheduling accelerated", () => {
    const original = game.returns._customEvent_W5stuffzz;
    game.returns._customEvent_W5stuffzz = () => {
        throw new Error("native failed");
    };
    try {
        assert.throws(() => shovel()._customEvent_W5stuffzz(), /native failed/);
        script.runLater(0, () => {}, {});
        script.runLater(1600, () => {}, {});
        assert.equal(queued.at(-1).delay, 1600);
    } finally {
        game.returns._customEvent_W5stuffzz = original;
        set("w5.instantnuggets", false);
    }
});

test("records settle before the next Dream roll, unless the legend bonus preserves the counter", () => {
    set("w5.instantnuggets");
    for (const legend of [0, 1]) {
        game.returns._customBlock_Thingies = legend;
        queued.length = 0;
        const station = shovel(4);
        station.powers = [50, 20, 80, 40];
        station._customEvent_W5stuffzz();
        for (const { callback } of queued.slice(0, 4)) callback();
        assert.equal(gga.Gaming[8], 80);
        assert.deepEqual(station.dreamBefore, legend ? [0, 1, 2, 3] : [0, 0, 1, 0]);
        assert.equal(gga.OptionsListAccount[192], legend ? 4 : 1);
    }
    game.returns._customBlock_Thingies = 0;
    set("w5.instantnuggets", false);
});

test("instant completion and popup hiding are independent toggles", () => {
    for (const instant of [false, true]) {
        for (const hidden of [false, true]) {
            set("w5.instantnuggets", instant);
            set("wide.nogamingpop", hidden);
            queued.length = 0;
            const station = shovel(3);
            station._customEvent_W5stuffzz();
            assert.deepEqual(
                queued.slice(0, 3).map(({ delay }) => delay),
                instant ? [0, 0, 0] : [0, 1600, 3200]
            );
            for (const { callback } of queued.slice(0, 3)) callback();
            assert.equal(station._GenINFO[39].length, instant && hidden ? 0 : 3);
            if (instant) assert.equal(gga.Gaming[8], 3, "records settle before any visible popup finishes");
            assert.equal(queued.at(-1).delay, 6000);
        }
    }
    set("w5.instantnuggets", false);
    set("wide.nogamingpop", false);
});
