/**
 * Shipped setting values (#198): a cheat that's switched on never makes a late account worse than the game would.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { cheatConfig } = require("../config.js");
const descriptions = require("fs").readFileSync(require.resolve("../config.js"), "utf8");

test("Bravery gives the game's 9 swords, and its rerolls and revisions never go down", () => {
    const holes = cheatConfig.w5.holes;
    assert.equal(holes.Bravery_SwordsOwned(3), 9);
    assert.equal(holes.MaxRerolls(5), 20);
    assert.equal(holes.MaxRerolls(35), 35);
    assert.equal(holes.MaxRevisions(8), 8);
});

test("Overgrowth stops at the game's 1e9", () => {
    const og = cheatConfig.w6.farming.OGmulti;
    assert.equal(og(1), 1);
    assert.equal(og(4), 8);
    assert.equal(og(8e8), 1e9);
});

test("the toll keeps all the loot (the game keeps 1 - discount)", () => {
    assert.equal(cheatConfig.w7.spelunk.TollExitTax(0.8), 1);
});

test("fixed mainframe and chip numbers never lower a late account; on/off rows stay as they are", () => {
    const { mainframe, chipbonuses } = cheatConfig.w4;
    for (const [key, value] of Object.entries({ ...mainframe, ...chipbonuses })) {
        const fixed = value(0);
        if (fixed === 0) continue; // scales with the game's value (t * 2)
        if (["5", "7", "12", "card1", "card2", "star", "pend", "key1", "troph"].includes(key)) continue;
        assert.equal(value(1e6), 1e6, `${key} lowers a value above ${fixed}`);
    }
    assert.equal(mainframe[7](5), 2, "row 7 must be 2 to work");
    assert.equal(chipbonuses.card1(0), 1);
});

test("settings that change nothing until set say so", () => {
    for (const line of descriptions.split("\n").filter((l) => /^\s*\w+: \(t\) => t, \/\//.test(l)))
        assert.match(line, /No change until you set it$/, line.trim());
});
