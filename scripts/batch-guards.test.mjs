// A batch write whose `expect` is refused writes none of its unguarded entries (#158): a Star Signs save claims
// signs and moves the star points balance (OptionsListAccount[40], guarded by `expect`) in one batch, so a claim
// can't land without its points. On the fake game, through the real write path.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
const g = game.gga;
const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
// The fake game runs in its own realm, so its arrays are copied before comparing.
const sign = (index) => [...g.StarSignProg[index]];

// The batch a Star Signs save sends: the claims, then the balance it read before them.
const starSignsSave = (read) => [
    { path: "StarSignProg[1]", value: ["_a", 1] },
    { path: "StarSignProg[2]", value: ["_a", 1] },
    { path: "OptionsListAccount[40]", value: read + 6, expect: read },
];

test("a balance refused by its expect leaves the claims unwritten", async () => {
    const saved = [[...g.StarSignProg[1]], [...g.StarSignProg[2]], g.OptionsListAccount[40]];
    g.StarSignProg[1] = ["_", 0];
    g.StarSignProg[2] = ["_", 0];
    g.OptionsListAccount[40] = 10;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        if (String(url).endsWith("/game/gga/write-many")) g.OptionsListAccount[40] = 12; // the game moved it on
        return realFetch(url, options);
    };
    try {
        await assert.rejects(writeManyVerified(starSignsSave(10)), { message: "changed since" });
        assert.deepEqual(sign(1), ["_", 0], "the first claim is not written");
        assert.deepEqual(sign(2), ["_", 0], "the second claim is not written");
        assert.equal(g.OptionsListAccount[40], 12, "the game's balance stays");
    } finally {
        globalThis.fetch = realFetch;
        [g.StarSignProg[1], g.StarSignProg[2], g.OptionsListAccount[40]] = saved;
    }
});

test("a balance that holds saves the claims and the points together", async () => {
    const saved = [[...g.StarSignProg[1]], [...g.StarSignProg[2]], g.OptionsListAccount[40]];
    g.StarSignProg[1] = ["_", 0];
    g.StarSignProg[2] = ["_", 0];
    g.OptionsListAccount[40] = 10;
    try {
        await writeManyVerified(starSignsSave(10));
        assert.deepEqual([sign(1), sign(2), g.OptionsListAccount[40]], [["_a", 1], ["_a", 1], 16]);
    } finally {
        [g.StarSignProg[1], g.StarSignProg[2], g.OptionsListAccount[40]] = saved;
    }
});
