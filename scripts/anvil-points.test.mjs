// Anvil's points left (W1): the page works them out with the game's formula, so they follow every change at once,
// and falls back to the game's own AnvilPAstats[0] when an input can't be read.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";

const { anvilPointsLeft } = await importRepo("src/ui/pages/world-1/anvil/anvil.js");

// [0] is the game's own (stale) count; the formula never reads it.
const inputs = (stats, rest = {}) => ({ smithingLevel: 34, talentLevel: 67, talentNumber: 2, stats, ...rest });

test("points left follow the game's formula", () => {
    // 34 + 67 + 2 × floor(34 / 10) + 40 + 30 − (90 + 50 + 25)
    assert.equal(anvilPointsLeft(inputs([999, 40, 30, 90, 50, 25])), 12);
    // Numbers the game keeps as text count the same, as the game's asNumber reads them.
    assert.equal(anvilPointsLeft(inputs(["0", "40", "30", "90", "50", "25"], { smithingLevel: "34" })), 12);
});

test("zero inputs and nothing left", () => {
    assert.equal(anvilPointsLeft(inputs([0, 0, 0, 0, 0, 0], { smithingLevel: 0, talentLevel: 0, talentNumber: 0 })), 0);
    assert.equal(anvilPointsLeft(inputs([0, 40, 30, 100, 50, 27])), 0);
});

test("overspending gives a negative count, as the game shows it", () => {
    assert.equal(anvilPointsLeft(inputs([0, 40, 30, 105, 50, 25])), -3);
});

test("missing or non-numeric inputs give null, so the page shows the game's own count", () => {
    assert.equal(anvilPointsLeft(inputs([0, 40, 30, 90, 50])), null);
    assert.equal(anvilPointsLeft(inputs([0, 40, 30, 90, 50, 25], { talentNumber: null })), null);
    assert.equal(anvilPointsLeft(inputs([0, 40, 30, 90, 50, 25], { smithingLevel: undefined })), null);
    assert.equal(anvilPointsLeft(inputs([0, 40, "lots", 90, 50, 25])), null);
    assert.equal(anvilPointsLeft(inputs([0, 40, 30, 90, 50, 25], { talentLevel: "" })), null);
    assert.equal(anvilPointsLeft(inputs([0, 40, 30, 90, 50, 25], { talentNumber: { error: "x" } })), null);
    assert.equal(anvilPointsLeft({ smithingLevel: 34, talentLevel: 67, talentNumber: 2 }), null);
});
