// The fake API behind the page screenshots answers every route the WebUI calls, from the fake game's data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { request } from "../known-bugs/index.mjs";
import { createFakeApi } from "./fake-api.mjs";
import { fakeGameData } from "./fake-game-data.mjs";

const { router, game } = await createFakeApi();

// One example request for each route; a new route in services/api.js needs one here.
const EXAMPLES = {
    "/cheat-states": ["GET"],
    "/cheats": ["GET"],
    "/game/bundles": ["GET"],
    "/config": ["GET"],
    "/pages": ["GET"],
    "/app-info": ["GET"],
    "/update/check": ["GET"],
    "/devtools-url": ["GET"],
    "/heartbeat": ["GET"],
    "/search/keys": ["GET"],
    "/toggle": ["POST", { action: "godlike crit", on: true }],
    "/update/apply": ["POST", {}, 400],
    "/config/update": ["POST", { cheatConfig: {} }],
    "/config/save": ["POST", { cheatConfig: {} }],
    "/configs": ["POST", { action: "use", name: "No such config" }, 400],
    "/open-url": ["POST", { url: "https://example.com" }],
    "/search": ["POST", { query: "60", keys: ["StampLevelMAX"] }],
    "/game/gga/read": ["POST", { path: "gga.StampLevel[0]" }],
    "/game/gga/read-entries": ["POST", { rootPath: "gga.CustomLists.h", keys: ["StatueInfo"] }],
    "/game/gga/read-many": ["POST", { paths: ["gga.StatueG", "gga.AnvilPAstats"] }],
    "/game/gga/write": ["POST", { path: "gga.StatueG[0]", value: 2 }],
    "/game/gga/write-many": ["POST", { writes: [{ path: "gga.StatueG[1]", value: 2 }] }],
    "/game/gga/delete": ["POST", { path: "gga.Number2Letter" }],
    "/game/computed/read": ["POST", { namespace: "thingies", name: "anything" }],
    "/game/computed/read-many": ["POST", { namespace: "thingies", name: "anything", argSets: [[], [1]] }],
    // The fake game has no save copies yet.
    "/save-copies": ["GET"],
    "/save-copies/compare": ["POST", { id: "2026-11-20T00-00-00-000Z_Lumi_Main" }, 404],
    "/save-copies/restore": ["POST", { id: "2026-11-20T00-00-00-000Z_Lumi_Main", select: "all" }, 404],
    "/changes": ["GET"],
    "/changes/undone": ["POST", { id: "no-such-action", indexes: [0] }, 404],
    // Pictures only come from the real game on the player's PC: the fake one has none.
    "/game/pet-frames": ["GET"],
};

const uiRoutes = [
    ...readFileSync(new URL("../../src/ui/services/api.js", import.meta.url), "utf8").matchAll(
        /_request\(\s*["`](\/[\w/-]+)/g
    ),
].map((match) => match[1]);

test("every route the WebUI calls has an example here", () => {
    assert.ok(uiRoutes.length > 20, "found the WebUI's routes");
    assert.deepEqual(
        [...new Set(uiRoutes)].filter((route) => !EXAMPLES[route]),
        []
    );
});

for (const [route, [method, body, status = 200]] of Object.entries(EXAMPLES)) {
    test(`${method} /api${route} answers on the fake game`, async () => {
        const response = await request(router, method, `/api${route}`, body);
        assert.equal(response.statusCode, status, JSON.stringify(response.body));
    });
}

test("reads come from the fake game's data, and what it lacks is listed", async () => {
    const stamps = await request(router, "POST", "/api/game/gga/read", { path: "gga.StampLevel[1]" });
    assert.deepEqual(stamps.body.value, fakeGameData().gga.StampLevel[1]);
    const cheats = await request(router, "GET", "/api/cheats");
    assert.ok(
        cheats.body.some((cheat) => cheat.value === "godlike crit"),
        "the real cheat list"
    );
    game.misses.clear();
    const missing = await request(router, "POST", "/api/game/gga/read", { path: "gga.NotInTheFakeGame.x" });
    assert.equal(missing.statusCode, 500);
    assert.deepEqual([...game.misses.keys()], ["gga.NotInTheFakeGame.x"]);
});

test("the fake game hands out no pet pictures, so CI and the page shots never hold one", async () => {
    assert.equal((await request(router, "GET", "/api/game/pet-picture?id=0")).statusCode, 404);
    assert.equal((await request(router, "GET", "/api/game/pet-frames?id=0")).body, null);
});

test("the fake game's data is the same every time", () => {
    assert.deepEqual(fakeGameData(), fakeGameData());
});

test("a level a test gives the fake game doesn't carry into the next fixture", () => {
    const first = fakeGameData();
    const start = first.gga.Summon[0][0];
    first.gga.Summon[0][0] = start + 5; // a summoning upgrade levelled in one test
    assert.equal(fakeGameData().gga.Summon[0][0], start);
});
