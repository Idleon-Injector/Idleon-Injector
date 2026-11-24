// w5 betternuggets: the shovel's nugget roll, randomFloatBetween(1E-5, 1), leans low (bigger nuggets) by the configured
// power, within the game's own range; every other roll stays the game's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, set, setup, state, context } = await loadHookGame();
const script = context["com.stencyl.behavior.Script"];
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
