// A nomore rule written by hand with `g` blocks the same items on every check (`test` alternated with `g`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "../known-bugs/index.mjs";

const { setCheatConfig, nomoreBlocks } = await importRepo("src/cheats/core/state.js");

test("a nomore rule with g or y blocks its item on every check", () => {
    setCheatConfig({ nomore: { items: [/^Copper$/g, /Iron/y] } });
    for (let check = 0; check < 3; check++) {
        assert.equal(nomoreBlocks("Copper"), true);
        assert.equal(nomoreBlocks("Iron"), true);
        assert.equal(nomoreBlocks("Gold"), false);
    }
    setCheatConfig({});
    assert.equal(nomoreBlocks("Copper"), false);
});
