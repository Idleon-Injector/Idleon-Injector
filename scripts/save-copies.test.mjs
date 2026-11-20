// Save copies (#32) on the fake game: the real hook on the game's cloud save, the real server routes, and copies on
// disk in a temporary folder. Done when copies appear and old ones go on schedule, and a restore never writes the
// values that are never rolled back.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import zlib from "node:zlib";
import { importRepo, request } from "./known-bugs/index.mjs";
import { createFakeGame } from "./page-shots/fake-game.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const { createGameBridge } = require("../src/modules/game/gameBridge");
const { setupSaveCopyRoutes } = require("../src/modules/server/routes/saveCopies");
const { listCopies, pickExpired, pruneCopies, writeCopy } = require("../src/modules/saveCopies");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "save-copies-test-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
let dirs = 0;
const newDir = () => path.join(root, String(dirs++));

const data = fakeGameData();
const gga = data.gga;
Object.assign(gga, {
    UserInfo: ["Ann", 0, 0],
    GetPlayersUsernames: ["Ann", "Bob"],
    Money: 100,
    Cards: { h: { Bat: 3, Frog: 1 } },
    Lv0: [1, 2, 3],
    StampLevel: [
        [1, 2],
        [3, 4],
    ],
    GemsOwned: 50,
    ServerGemsReceived: 500,
    BundlesReceived: { h: { bun_a: 1 } },
    TimeAway: { h: { GlobalTime: 1000, Forge: 900, Player: 950 } },
    CloudsaveTimer: 10,
    PlayerDATABASE: {
        h: {
            Ann: { h: { Lv0: [1, 2, 3], Money: 1, PlayerAwayTime: 1 } },
            Bob: { h: { Lv0: [4, 5], Money: 7, PlayerAwayTime: 800 } },
        },
    },
});
const game = await createFakeGame(data);

// Every game call the server makes, so a test can see what was written.
const expressions = [];
const evaluate = game.runtime.evaluate;
game.runtime.evaluate = (options) => {
    expressions.push(options.expression);
    return evaluate(options);
};
const writesSent = () =>
    expressions
        .filter((e) => e.startsWith("writeGamePath"))
        .flatMap((e) => JSON.parse(e.slice(e.indexOf("(") + 1, -1)))
        .map((w) => w.path);

// The real hook on the game's cloud save, on a FirebaseStorage whose commitSave answers "saved".
const globals = await importRepo("src/cheats/core/globals.js");
globals.firebase.commitSave = () => "saved";
await importRepo("src/cheats/hooks/firebase.js");
const hooks = await importRepo("src/cheats/core/hooks.js");
hooks.installHooks();

function server(dir = newDir()) {
    const router = new TinyRouter();
    const saveCopies = setupSaveCopyRoutes(router, createGameBridge(game.runtime, "ctx"), dir);
    saveCopies.stop();
    return { router, dir, pull: saveCopies.pullSaveCopy };
}

/** The game cloud-saves, the server takes the copy; returns the copy's id. */
async function cloudSave(app) {
    assert.equal(globals.firebase.commitSave(), "saved", "the game's save goes on as before");
    await app.pull();
    return (await listCopies(app.dir))[0].id;
}

test("the hook on the game's cloud save installs", () => {
    assert.ok(!hooks.getHookFailures().some((f) => f.startsWith("saveCopies")), hooks.getHookFailures().join("\n"));
});

test("a cloud save makes one copy on disk, and nothing more until the next save", async () => {
    const app = server();
    assert.deepEqual((await request(app.router, "GET", "/api/save-copies")).body, { copies: [], warning: null });
    const id = await cloudSave(app);
    await app.pull();
    const { body } = await request(app.router, "GET", "/api/save-copies");
    assert.equal(body.copies.length, 1);
    assert.equal(body.warning, null);
    assert.equal(body.copies[0].id, id);
    assert.equal(body.copies[0].character, "Ann");
    assert.ok(Math.abs(body.copies[0].time - Date.now()) < 60_000);
    assert.deepEqual(
        fs.readdirSync(app.dir).filter((f) => !f.endsWith(".json.gz")),
        [],
        "no temporary file is left"
    );
    const copy = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(app.dir, `${id}.json.gz`))));
    assert.equal(copy.character, "Ann");
    assert.deepEqual(copy.players, ["Ann", "Bob"]);
    assert.deepEqual(copy.save.Cards, { h: { Bat: 3, Frog: 1 } });
    assert.equal(copy.save.ServerGemsReceived, 500);
    assert.equal(copy.save.DNSM, undefined, "the game's caches aren't save data");
    assert.equal(copy.save.CustomLists, undefined, "nor are its static lists");
});

test("retention over 31 days of saves every 4 minutes: the last 24 hours, then the newest copy of each day", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    const HOUR = 3600e3;
    const copies = [];
    for (let time = now; time > now - 31 * 24 * HOUR; time -= 4 * 60e3) {
        copies.push({ id: String(time), time, character: "Ann", size: 50_000 });
    }
    const { expired, trimmed } = pickExpired(copies, now);
    const gone = new Set(expired);
    const kept = copies.filter((c) => !gone.has(c.id));
    assert.equal(trimmed, 0);
    assert.ok(
        copies.filter((c) => now - c.time < 24 * HOUR).every((c) => !gone.has(c.id)),
        "every copy of the last 24 hours stays"
    );
    assert.ok(
        kept.every((c) => now - c.time < 30 * 24 * HOUR),
        "nothing older than 30 days stays"
    );
    const older = kept.filter((c) => now - c.time >= 24 * HOUR);
    const days = older.map((c) => new Date(c.time).toDateString());
    assert.equal(new Set(days).size, days.length, "one copy a day after the first 24 hours");
    for (const c of older) {
        const sameDay = copies.filter((o) => new Date(o.time).toDateString() === new Date(c.time).toDateString());
        assert.equal(c.time, Math.max(...sameDay.map((o) => o.time)), "the newest copy of its day");
    }
    assert.equal(kept.length, 360 + older.length);
    assert.ok(older.length >= 28 && older.length <= 30, `${older.length} daily copies`);
    assert.ok(kept.reduce((sum, c) => sum + c.size, 0) < 25e6, "about 20 MB at 50 KB a copy");
});

test("retention: over the size cap the oldest copies go first, the newest always stays", () => {
    const now = Date.now();
    const copies = [0, 1, 2, 3].map((i) => ({ id: `c${i}`, time: now - i * 60e3, character: "Ann", size: 40 }));
    assert.deepEqual(pickExpired(copies, now, 100), { expired: ["c3", "c2"], trimmed: 2 });
    assert.deepEqual(pickExpired(copies.slice(0, 1), now, 10), { expired: [], trimmed: 0 });
});

test("retention runs on each new copy and deletes the copies it doesn't keep", async () => {
    const app = server();
    const json = JSON.stringify({ character: "Ann", players: [], save: {} });
    const old = Date.now() - 40 * 24 * 3600e3;
    await writeCopy(app.dir, old, json);
    await writeCopy(app.dir, old + 60e3, json);
    const yesterday = Date.now() - 2 * 24 * 3600e3;
    await writeCopy(app.dir, yesterday, json);
    await writeCopy(app.dir, yesterday - 60e3, json);
    fs.writeFileSync(path.join(app.dir, "notes.txt"), "not a copy");
    assert.equal((await listCopies(app.dir)).length, 4);
    await cloudSave(app);
    const left = await listCopies(app.dir);
    assert.deepEqual(
        left.map((c) => c.time),
        [left[0].time, yesterday],
        "the new copy and the newest of two days ago"
    );
    assert.ok(fs.existsSync(path.join(app.dir, "notes.txt")), "other files are left alone");
    assert.equal(await pruneCopies(app.dir), 0);
});

test("compare lists every difference by save key and marks the values that are never rolled back", async () => {
    const app = server();
    const id = await cloudSave(app);
    gga.Money = 999;
    gga.Cards.h.Bat = 7;
    gga.Cards.h.Owl = 1;
    gga.Lv0.push(4);
    gga.StampLevel[1] = [3, 4, 5];
    gga.GemsOwned = 0;
    gga.ServerGemsReceived = 900;
    gga.BundlesReceived.h.bun_b = 1;
    gga.TimeAway.h.Forge = 990;
    gga.TimeAway.h.Player = 995;
    gga.CloudsaveTimer = 12;
    gga.PlayerDATABASE.h.Bob.h.Money = 70;
    gga.PlayerDATABASE.h.Bob.h.PlayerAwayTime = 999;
    gga.PlayerDATABASE.h.Ann.h.Money = 2;

    const { statusCode, body } = await request(app.router, "POST", "/api/save-copies/compare", { id });
    assert.equal(statusCode, 200, JSON.stringify(body));
    assert.equal(body.id, id);
    assert.equal(body.character, "Ann");
    const byPath = Object.fromEntries(
        body.groups.flatMap((g) =>
            g.changes.map((c) => [c.path, [g.key, c.copy, c.now, c.neverRestored, c.restorable]])
        )
    );
    assert.deepEqual(byPath, {
        Money: ["Money", 100, 999, false, true],
        "Cards.h.Bat": ["Cards", 3, 7, false, true],
        // Only in the save now: a restore can't take it away.
        "Cards.h.Owl": ["Cards", undefined, 1, false, false],
        "Lv0[3]": ["Lv0", undefined, 4, false, false],
        // Below the top level an array that changed length is put back whole.
        "StampLevel[1]": ["StampLevel", [3, 4], [3, 4, 5], false, true],
        GemsOwned: ["GemsOwned", 50, 0, false, true],
        ServerGemsReceived: ["ServerGemsReceived", 500, 900, true, false],
        "BundlesReceived.h.bun_b": ["BundlesReceived", undefined, 1, true, false],
        "TimeAway.h.Forge": ["TimeAway", 900, 990, true, false],
        "TimeAway.h.Player": ["TimeAway", 950, 995, true, false],
        CloudsaveTimer: ["CloudsaveTimer", 10, 12, true, false],
        "PlayerDATABASE.h.Bob.h.Money": ["PlayerDATABASE", 7, 70, false, true],
        "PlayerDATABASE.h.Bob.h.PlayerAwayTime": ["PlayerDATABASE", 800, 999, true, false],
        // Ann is in play: her values are the top-level keys, so her PlayerDATABASE entry isn't compared.
    });
});

test("restore writes the selected values through the game's write, checks them, and never the protected ones", async () => {
    const app = server();
    const id = await cloudSave(app);
    const atCopy = { bat: gga.Cards.h.Bat, money: gga.Money, bob: gga.PlayerDATABASE.h.Bob.h.Money };
    const protectedNow = () =>
        structuredClone({
            ServerGemsReceived: gga.ServerGemsReceived,
            BundlesReceived: gga.BundlesReceived,
            TimeAway: gga.TimeAway,
            CloudsaveTimer: gga.CloudsaveTimer,
            BobAway: gga.PlayerDATABASE.h.Bob.h.PlayerAwayTime,
        });
    const cardsMap = gga.Cards;
    gga.Money = 1;
    gga.Cards.h.Bat = 99;
    gga.PlayerDATABASE.h.Bob.h.Money = 1;
    gga.ServerGemsReceived += 100;
    gga.BundlesReceived.h.bun_c = 1;
    gga.TimeAway.h.Forge += 50;
    gga.CloudsaveTimer += 1;
    gga.PlayerDATABASE.h.Bob.h.PlayerAwayTime += 50;
    const before = protectedNow();

    // Only the cards.
    expressions.length = 0;
    let res = await request(app.router, "POST", "/api/save-copies/restore", { id, select: ["Cards"] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { ok: true, results: [{ path: "gga.Cards.h.Bat", ok: true }] });
    assert.deepEqual(writesSent(), ["gga.Cards.h.Bat"]);
    assert.ok(
        expressions.some((e) => e.startsWith("readGamePaths(")),
        "each value is read back and checked"
    );
    assert.equal(gga.Cards.h.Bat, atCopy.bat);
    assert.equal(gga.Cards, cardsMap, "written into the game's map, not replacing it");
    assert.equal(gga.Money, 1);

    // Everything.
    expressions.length = 0;
    res = await request(app.router, "POST", "/api/save-copies/restore", { id, select: "all" });
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    assert.equal(gga.Money, atCopy.money);
    assert.equal(gga.PlayerDATABASE.h.Bob.h.Money, atCopy.bob);
    const written = writesSent();
    assert.ok(written.length > 0);
    for (const p of written) {
        assert.ok(
            !/^gga\.(ServerGemsReceived|BundlesReceived|TimeAway|CloudsaveTimer)\b/.test(p) &&
                !/PlayerAwayTime$/.test(p),
            `${p} must never be written by a restore`
        );
    }
    assert.deepEqual(protectedNow(), before, "the never-rolled-back values are as they were");
});

test("a selection matching only protected values writes nothing", async () => {
    const app = server();
    const id = await cloudSave(app);
    gga.ServerGemsReceived += 1;
    gga.TimeAway.h.Forge += 1;
    expressions.length = 0;
    const res = await request(app.router, "POST", "/api/save-copies/restore", {
        id,
        select: ["ServerGemsReceived", "TimeAway", "BundlesReceived", "CloudsaveTimer", "PlayerDATABASE"],
    });
    assert.deepEqual(res.body, { ok: true, results: [] });
    assert.deepEqual(writesSent(), []);
});

test("compare and restore refuse a copy taken while playing another character", async () => {
    const app = server();
    const id = await cloudSave(app);
    gga.UserInfo[0] = "Bob";
    try {
        for (const route of ["compare", "restore"]) {
            expressions.length = 0;
            const res = await request(app.router, "POST", `/api/save-copies/${route}`, { id, select: "all" });
            assert.equal(res.statusCode, 409);
            assert.match(res.body.error, /taken while playing Ann/);
            assert.deepEqual(writesSent(), []);
        }
    } finally {
        gga.UserInfo[0] = "Ann";
    }
});

test("bad requests: an unknown or malformed id, or a bad selection", async () => {
    const app = server();
    const id = await cloudSave(app);
    for (const body of [{}, { id: "../../config.custom" }, { id: "2026-01-01T00-00-00-000Z_Nobody" }]) {
        const res = await request(app.router, "POST", "/api/save-copies/compare", body);
        assert.ok([400, 404].includes(res.statusCode), JSON.stringify(res.body));
    }
    for (const select of [undefined, "some", [], [""], [1]]) {
        const res = await request(app.router, "POST", "/api/save-copies/restore", { id, select });
        assert.equal(res.statusCode, select?.length === 0 ? 200 : 400, `select ${JSON.stringify(select)}`);
    }
});

test("a copy that can't be written shows a warning, and the game and the next copy go on", async () => {
    const blocked = newDir();
    fs.writeFileSync(blocked, "a file where the folder should be");
    const app = server(blocked);

    assert.equal(globals.firebase.commitSave(), "saved");
    await app.pull();
    let { body } = await request(app.router, "GET", "/api/save-copies");
    assert.deepEqual(body.copies, []);
    assert.match(body.warning, /couldn't be written/);

    fs.rmSync(blocked);
    await cloudSave(app);
    ({ body } = await request(app.router, "GET", "/api/save-copies"));
    assert.equal(body.warning, null, "the warning clears once a copy is stored");
    assert.equal(body.copies.length, 1);
});

test("a copy the game side can't make never breaks the game's save, and shows as a warning", async () => {
    const app = server();
    const userInfo = gga.UserInfo;
    delete gga.UserInfo;
    try {
        assert.equal(globals.firebase.commitSave(), "saved");
    } finally {
        gga.UserInfo = userInfo;
    }
    await app.pull();
    const { body } = await request(app.router, "GET", "/api/save-copies");
    assert.deepEqual(body.copies, []);
    assert.match(body.warning, /couldn't be made/);
});

test("without the game (closed, or before the cheats are in), pulling does nothing", async () => {
    const router = new TinyRouter();
    const bridge = createGameBridge(
        { evaluate: async () => ({ result: {}, exceptionDetails: { text: "gone" } }) },
        "ctx"
    );
    const app = setupSaveCopyRoutes(router, bridge, newDir());
    app.stop();
    await app.pullSaveCopy();
    assert.deepEqual((await request(router, "GET", "/api/save-copies")).body, { copies: [], warning: null });
});
