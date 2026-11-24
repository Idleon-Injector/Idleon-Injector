import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

const { context, gga, state } = await loadGame({ setupDone: false });
const drawn = [],
    queued = [];
const graphics = { drawString: (...args) => drawn.push(args), drawCircle: (...args) => drawn.push(args) };
context["com.stencyl.Engine"].engine.g = graphics;
const script = context["com.stencyl.behavior.Script"];
script.runLater = (...args) => queued.push(args);
script.randomFloatBetween = () => 0.5;
function Station() {
    this.wrapper = { enabled: true };
    this._GenINFO = { 39: [] };
    this._DL1 = [];
    this._TRIGGEREDtext = "j1";
}
Station.prototype._event_Gaming = () => {};
Station.prototype._customEvent_W5stuffzz = function () {
    script.runLater(1600, () => script.randomFloatBetween(0.00001, 1), this.actor);
};
Station.prototype._event_3 = function () {
    graphics.drawString("header", 10, 20);
    for (const row of this._GenINFO[39]) {
        this._DL1 = row;
        graphics.drawString("effect", row[2], row[3]);
        graphics.drawCircle(row[2], row[3], 20);
        row[1]++;
        if (row[1] === 2) gga.Gaming[8] = row[5];
    }
    this._DL1 = [];
    return 42;
};
context["scripts.ActorEvents_577"] = Station;
const { setup } = await importRepo("src/cheats/core/setup.js");
const { hookFailures } = await setup.call(context);
assert.deepEqual(hookFailures, []);
const config = state.cheatConfig.automation;
gga.MenuType2 = 45;
gga.Gaming = Array(15).fill(0);

test("hidden effects retain header drawing, positions, native ages, visibility and rewards", () => {
    let visible = true;
    const image = {
        get_visible: () => visible,
        set_visible: (v) => {
            visible = v;
        },
    };
    const station = new Station(),
        row = [0, 0, 30, 40, 4, 123, image];
    station._GenINFO[39].push(row);
    config.gamingHideEffects = true;
    drawn.length = 0;
    assert.equal(station._event_3(), 42);
    assert.deepEqual(drawn, [["header", 10, 20]]);
    assert.equal(row[1], 1);
    assert.deepEqual(row.slice(2, 4), [30, 40]);
    assert.equal(visible, false);
    station._event_3();
    assert.equal(row[1], 2);
    assert.equal(gga.Gaming[8], 123);
    config.gamingHideEffects = false;
    drawn.length = 0;
    station._event_3();
    assert.equal(visible, true);
    assert.deepEqual(drawn, [
        ["header", 10, 20],
        ["effect", 30, 40],
        [30, 40, 20],
    ]);
    graphics.drawString("outside", 1, 2);
    assert.deepEqual(drawn.at(-1), ["outside", 1, 2]);
});

test("nugget bias preserves native scheduler delays and affects only shovel size rolls", () => {
    config.gamingNuggetBiasEnabled = true;
    config.gamingNuggetBias = 6;
    assert.equal(script.randomFloatBetween(0.00001, 1), 0.5);
    new Station()._customEvent_W5stuffzz();
    const [delay, callback] = queued.pop();
    assert.equal(delay, 1600);
    assert(callback() < 0.5);
    assert.equal(script.randomFloatBetween(0.00001, 1), 0.5);
    config.gamingNuggetBiasEnabled = false;
});
