// The XP need the Levels page writes with a level (Account › Player › Levels): the game's own. The game works it out
// (ActorEvents_189.IncreaseExpREQ) only on a level-up, so a skill at level 1 keeps the need it started with.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";

const { getPlayerExpRequired } = await importRepo("src/cheats/helpers/player.js");

test("level 1 needs what the skill started with: 15, Spelunking 25, Research 10", () => {
    // Laboratory's formula gives 10.24 here, the main level's 17.56; the game never uses either.
    for (let index = 0; index <= 18; index++) assert.equal(getPlayerExpRequired(index, 1), 15, `skill ${index}`);
    assert.equal(getPlayerExpRequired(19, 1), 25);
    assert.equal(getPlayerExpRequired(20, 1), 10);
});

test("above level 1 the need is the game's, as read from a test account's characters", () => {
    // [skill, level, the game's ExpReq0]: every skill of every character on the account at level 2 or more matched.
    for (const [index, level, game] of [
        [0, 285, 39400584410.68894],
        [1, 56, 11963137.757027596],
        [2, 60, 20687540.993139],
        [3, 53, 7692563.931384298],
        [4, 50, 4897004.572641805],
        [5, 61, 24478551.907413553],
        [7, 15, 6602.517768348721],
        [8, 127, 7547658.89435774],
        [10, 7, 605.9378642946983],
        [11, 3, 65.73330507951435],
        [15, 201, 1.0300044059751281e24],
    ]) {
        const required = getPlayerExpRequired(index, level);
        assert.ok(Math.abs(required - game) <= game * 1e-12, `skill ${index} level ${level}: ${required}`);
    }
});
