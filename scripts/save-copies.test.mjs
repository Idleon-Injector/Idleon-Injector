// Save copies (#32) on the fake game: the real hook on the game's cloud save, the real server routes, and copies on
// disk in a temporary folder. Done when copies appear and old ones go on schedule, and a restore's writes never hold the
// values that are never rolled back (the page writes them: save-copies-page.test.mjs).
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
const { diffSave, listCopies, pickExpired, pruneCopies, writeCopy } = require("../src/modules/saveCopies");

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
        .flatMap((e) => JSON.parse(`[${e.slice(e.indexOf("(") + 1, -1)}]`)[0])
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

test("a value the game keeps in another shape while it runs is never restored in its saved shape", () => {
    // OptionsList[11] is 0 in the save and a list in play; CauldronInfo[8] is [] until the game builds it.
    const [group] = diffSave(
        { character: "Ann", save: { OptionsList: [0, [], 0] } },
        { character: "Ann", save: { OptionsList: [[596, 10], [[1, 2]], 7] } }
    );
    assert.deepEqual(
        group.changes.map((c) => [c.path, c.restorable]),
        [
            ["OptionsList[0]", false],
            ["OptionsList[1]", false],
            ["OptionsList[2]", true],
        ]
    );
});

test("retention keeps a restore's own copies their 30 days, and drops them last for the size cap", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    const DAY = 24 * 3600e3;
    const copy = (id, age, label = null) => ({ id, time: now - age, character: "Ann", size: 40, label });
    const copies = [
        copy("new", 0),
        copy("plain", 3 * DAY - 2000),
        copy("after", 3 * DAY - 1000, { kind: "restored", from: 0, what: "Cards" }),
        copy("before", 3 * DAY, { kind: "before" }),
        copy("old", 31 * DAY, { kind: "before" }),
    ];
    assert.deepEqual(pickExpired(copies, now, 1e6).expired, ["old"], "the newest of their day or not");
    assert.deepEqual(pickExpired(copies.slice(0, 4), now, 120), { expired: ["plain"], trimmed: 1 });
    assert.deepEqual(pickExpired(copies.slice(0, 4), now, 50).expired, ["plain", "before", "after"]);
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
    delete gga.Cards.h.Frog;
    gga.Lv0.push(4);
    gga.StampLevel[0] = [1];
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
    const ownProgress = body.groups.flatMap((g) => g.changes.filter((c) => c.onItsOwn).map((c) => c.path));
    assert.deepEqual(
        ownProgress.sort(),
        ["CloudsaveTimer", "PlayerDATABASE.h.Bob.h.PlayerAwayTime", "TimeAway.h.Forge", "TimeAway.h.Player"],
        "the game's own progress is marked"
    );
    assert.deepEqual(byPath, {
        Money: ["Money", 100, 999, false, true],
        "Cards.h.Bat": ["Cards", 3, 7, false, true],
        // Only in the save now: a restore can't take it away.
        "Cards.h.Owl": ["Cards", undefined, 1, false, false],
        // Only in the copy: a restore would add it, and an undo couldn't take it away.
        "Cards.h.Frog": ["Cards", 1, undefined, false, false],
        "Lv0[3]": ["Lv0", undefined, 4, false, false],
        // Below the top level an array that changed length is put back whole.
        // A list only at its length now: a shorter one drops entries the game reads, and "Before restore" couldn't
        // take back a longer one.
        "StampLevel[0]": ["StampLevel", [1, 2], [1], false, false],
        "StampLevel[1]": ["StampLevel", [3, 4], [3, 4, 5], false, false],
        // Gems were bought since the copy (ServerGemsReceived went up): putting back 50 would lose them.
        GemsOwned: ["GemsOwned", 50, 0, false, false],
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

/** A stored copy's save, by id. */
const saveOf = (app, id) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(app.dir, `${id}.json.gz`)))).save;
const restore = (app, id, select) => request(app.router, "POST", "/api/save-copies/restore", { id, select });

test("a restore is a fork: a copy before, the values written into the game, a copy after", async () => {
    const app = server();
    const id = await cloudSave(app);
    const copyTime = (await listCopies(app.dir))[0].time;
    const atCopy = { bat: gga.Cards.h.Bat, money: gga.Money, bob: gga.PlayerDATABASE.h.Bob.h.Money };
    const cardsMap = gga.Cards;
    gga.Money = 1;
    gga.Cards.h.Bat = 99;
    gga.PlayerDATABASE.h.Bob.h.Money = 1;

    // Only the cards.
    let res = await restore(app, id, ["Cards"]);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.results, [{ path: "gga.Cards.h.Bat", ok: true }]);
    assert.equal(res.body.ok, true);
    assert.equal(gga.Cards.h.Bat, atCopy.bat);
    assert.equal(gga.Cards, cardsMap, "written into the game's map, not replacing it");
    assert.equal(gga.Money, 1);
    const [after, before] = await listCopies(app.dir);
    assert.deepEqual([after.id, before.id], [res.body.after, res.body.before], "both listed, newest first");
    assert.deepEqual(before.label, { kind: "before" });
    assert.deepEqual(after.label, { kind: "restored", from: copyTime, what: "Cards" });
    assert.equal(saveOf(app, before.id).Cards.h.Bat, 99, "the save as it was before");
    assert.equal(saveOf(app, after.id).Cards.h.Bat, atCopy.bat, "and as it is after");

    // Going back is restoring "Before restore", the same action.
    res = await restore(app, before.id, ["Cards"]);
    assert.equal(res.body.ok, true);
    assert.equal(gga.Cards.h.Bat, 99);
    assert.deepEqual((await listCopies(app.dir))[0].label, { kind: "restored", from: before.time, what: "Cards" });

    // A second click finds nothing left to put back, and makes no copies.
    const copies = (await listCopies(app.dir)).length;
    res = await restore(app, before.id, ["Cards"]);
    assert.deepEqual(res.body, { ok: true, results: [], before: null, after: null, afterError: null });
    assert.equal((await listCopies(app.dir)).length, copies);
});

test("Restore all writes everything restorable, the game's own progress too, and never the protected values", async () => {
    const app = server();
    const id = await cloudSave(app);
    const atCopy = { money: gga.Money, bob: gga.PlayerDATABASE.h.Bob.h.Money };
    const protectedNow = () =>
        structuredClone({
            ServerGemsReceived: gga.ServerGemsReceived,
            BundlesReceived: gga.BundlesReceived,
            TimeAway: gga.TimeAway,
            CloudsaveTimer: gga.CloudsaveTimer,
            BobAway: gga.PlayerDATABASE.h.Bob.h.PlayerAwayTime,
        });
    gga.Money = atCopy.money + 5;
    gga.PlayerDATABASE.h.Bob.h.Money = atCopy.bob + 5;
    gga.ServerGemsReceived += 100;
    gga.BundlesReceived.h.bun_c = 1;
    gga.TimeAway.h.Forge += 50;
    gga.CloudsaveTimer += 1;
    gga.PlayerDATABASE.h.Bob.h.PlayerAwayTime += 50;
    const before = protectedNow();

    expressions.length = 0;
    const res = await restore(app, id, "all");
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    assert.equal(gga.Money, atCopy.money);
    assert.equal(gga.PlayerDATABASE.h.Bob.h.Money, atCopy.bob);
    for (const p of writesSent()) {
        assert.ok(
            !/^gga\.(ServerGemsReceived|BundlesReceived|TimeAway|CloudsaveTimer|GemsOwned)\b/.test(p) &&
                !/PlayerAwayTime$/.test(p),
            `${p} must never be written by a restore`
        );
    }
    assert.deepEqual(protectedNow(), before, "the never-rolled-back values are as they were");
    assert.equal((await listCopies(app.dir))[0].label.what, "all");
});

test("a selection matching only protected values has nothing to restore", async () => {
    const app = server();
    const id = await cloudSave(app);
    gga.ServerGemsReceived += 1;
    gga.TimeAway.h.Forge += 1;
    expressions.length = 0;
    const res = await restore(app, id, [
        "ServerGemsReceived",
        "TimeAway",
        "BundlesReceived",
        "CloudsaveTimer",
        "PlayerDATABASE",
    ]);
    assert.deepEqual(res.body, { ok: true, results: [], before: null, after: null, afterError: null });
    assert.deepEqual(writesSent(), []);
});

test("gems bought since a copy: its GemsOwned and gem purchases are kept; without, they can be put back", async () => {
    const app = server();
    const id = await cloudSave(app);
    const gems = gga.GemsOwned;
    gga.GemsOwned += 300;
    let res = await request(app.router, "POST", "/api/save-copies/compare", { id });
    let change = res.body.groups.find((g) => g.key === "GemsOwned").changes[0];
    assert.deepEqual([change.restorable, change.gemsBought], [true, false], "gems spent or cheated, none bought");

    gga.ServerGemsReceived += 300;
    res = await request(app.router, "POST", "/api/save-copies/compare", { id });
    change = res.body.groups.find((g) => g.key === "GemsOwned").changes[0];
    assert.deepEqual([change.restorable, change.gemsBought], [false, true]);
    res = await restore(app, id, ["GemsOwned"]);
    assert.deepEqual(res.body.results, []);
    assert.equal(gga.GemsOwned, gems + 300);
    gga.GemsOwned = gems;
});

test("a gem bought between the plan and the write refuses the restore, and the gems stay", async () => {
    const app = server();
    const id = await cloudSave(app);
    const gems = gga.GemsOwned;
    gga.GemsOwned += 300;
    gga.Money += 7;
    const money = gga.Money;
    const real = game.runtime.evaluate;
    game.runtime.evaluate = (options) => {
        if (options.expression.startsWith("writeGamePaths(")) gga.GemsOwned += 50;
        return real(options);
    };
    let res;
    try {
        res = await restore(app, id, ["GemsOwned", "Money"]);
    } finally {
        game.runtime.evaluate = real;
    }
    assert.equal(res.body.ok, false);
    assert.ok(
        res.body.results.every((r) => !r.ok && r.error === "changed since"),
        JSON.stringify(res.body)
    );
    assert.equal(gga.GemsOwned, gems + 350, "the bought gems stay");
    assert.equal(gga.Money, money, "and nothing else is written");
    assert.equal(res.body.after, null);
    gga.GemsOwned = gems;
});

test("a restore that landed says so even when its copy after can't be made", async () => {
    const app = server();
    const id = await cloudSave(app);
    const bat = gga.Cards.h.Bat;
    gga.Cards.h.Bat = 77;
    const real = game.runtime.evaluate;
    let wrote = false;
    game.runtime.evaluate = (options) => {
        if (options.expression.startsWith("writeGamePaths(")) wrote = true;
        else if (wrote && options.expression.startsWith("readSave(")) throw new Error("the game is busy");
        return real(options);
    };
    let res;
    try {
        res = await restore(app, id, ["Cards"]);
    } finally {
        game.runtime.evaluate = real;
    }
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    assert.ok(res.body.before, "the way back is there");
    assert.equal(res.body.after, null);
    assert.match(res.body.afterError, /busy/);
    assert.equal(gga.Cards.h.Bat, bat);
});

test("two quick restores each get their own before-copy, taken after the first restore", async () => {
    const app = server();
    const id = await cloudSave(app);
    const atCopy = { bat: gga.Cards.h.Bat, money: gga.Money };
    gga.Cards.h.Bat = 55;
    gga.Money = 2;
    const [first, second] = await Promise.all([restore(app, id, ["Cards"]), restore(app, id, ["Money"])]);
    assert.notEqual(first.body.before, second.body.before);
    assert.equal(saveOf(app, first.body.before).Cards.h.Bat, 55);
    assert.equal(saveOf(app, second.body.before).Cards.h.Bat, atCopy.bat, "the second one starts from the first's");
    assert.equal(saveOf(app, second.body.before).Money, 2);
    assert.equal(gga.Money, atCopy.money);
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
