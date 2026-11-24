// History › Save copies (#32) on the fake game: the real page and server over copies on disk. Done when a copy of the
// character in play opens to its compare (the game's own progress in its own box), Restore puts one key back as one
// action in Changes that Undo takes back, Restore all never writes the protected values, gems bought since a copy are
// kept, and another character's copy is listed greyed with a hint to switch.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

const require = createRequire(import.meta.url);
const { writeCopy } = require("../src/modules/saveCopies");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "save-copies-page-"));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const fixture = fakeGameData();
Object.assign(fixture.gga, {
    GemsOwned: 900,
    ServerGemsReceived: 500,
    FarmPlot: [[0, 0, 0, 0, 0, 0, 40]],
    TimeAway: { h: { GlobalTime: 2000, Forge: 1900 } },
    CloudsaveTimer: 20,
});
const { router, game } = await createFakeApi(fixture, { saveCopiesDir: dir });
const { store } = await loadUi(router);
const gga = game.gga;
const { readSave } = await importRepo("src/cheats/core/saveCopy.js");
const { fetchChanges } = await importRepo("src/ui/services/api.js");
const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
const { SaveCopies, copyName, restoreCopy } = await importRepo("src/ui/components/views/SaveCopies.js");

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(typeof node.attributes.class === "function" ? "" : node.attributes.class);
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

// The copy: the save as it is now, with older cards, money, gems and the game's own progress.
const atCopy = { mob0: 3, mob1: 4, money: 111, farm: 10, gems: 700 };
const copyTime = Date.now() - 12 * 60e3;
const copy = JSON.parse(readSave());
copy.save.Cards[0].h.mob0 = atCopy.mob0;
copy.save.Cards[0].h.mob1 = atCopy.mob1;
copy.save.Money = atCopy.money;
copy.save.FarmPlot[0][6] = atCopy.farm;
copy.save.TimeAway.h.Forge = 1000;
copy.save.CloudsaveTimer = 10;
copy.save.GemsOwned = atCopy.gems;
const id = await writeCopy(dir, copyTime, JSON.stringify(copy));
// Gems bought since: the same copy, but the server had handed out fewer gems.
const gemsCopy = structuredClone(copy);
gemsCopy.save.ServerGemsReceived = 100;
const gemsId = await writeCopy(dir, copyTime - 60e3, JSON.stringify(gemsCopy));
await writeCopy(dir, copyTime - 120e3, JSON.stringify({ ...copy, character: "Lumi_Alt" }));
const oldTime = Date.now() - 3 * 24 * 3600e3;
await writeCopy(dir, oldTime, JSON.stringify(copy));

const now = { mob0: gga.Cards[0].h.mob0, mob1: gga.Cards[0].h.mob1, money: gga.Money };

async function openPage() {
    store.app.activeTab = "save-copies-tab";
    const root = SaveCopies();
    await until(() => byClass(root, "save-copy").length === 4, "the copies to list");
    return root;
}
const heads = (root) => byClass(root, "save-copy__head");
async function openCopy(root, index) {
    await heads(root)[index].listeners.click({});
    await until(() => byClass(root, "save-key__head").length > 0, "the compare to show");
}
const keyHead = (root, key) =>
    byClass(root, "save-key__head").find((head) => text(byClass(head, "save-key__name")[0]) === key);

test("the list: newest first, the character in play's copies open, another's is greyed with a hint", async () => {
    const root = await openPage();
    const rows = byClass(root, "save-copy");
    assert.match(text(rows[0]), /12 min ago/);
    assert.match(text(rows[0]), /Lumi_Main/);
    assert.equal(heads(root)[0].nodeName, "button");
    assert.ok(classes(rows[2]).includes("is-other"));
    assert.equal(heads(root)[2].nodeName, "div", "another character's copy doesn't open");
    assert.match(text(rows[2]), /Switch to Lumi_Alt to compare/);

    // By day, newest first: today's copies open, an older day's folded.
    const days = byClass(root, "save-copies__day");
    assert.ok(days.length >= 2);
    const toggle = (day) => byClass(day, "save-copies__day-toggle")[0];
    assert.match(text(toggle(days[0])), /^(Today|Yesterday)\d+ cop/);
    assert.equal(toggle(days[0]).attributes["aria-expanded"], "true");
    assert.equal(
        text(byClass(days.at(-1), "save-copies__day-name")[0]),
        new Date(oldTime).toLocaleDateString([], { month: "short", day: "numeric" })
    );
    assert.equal(toggle(days.at(-1)).attributes["aria-expanded"], "false");
    await toggle(days.at(-1)).listeners.click({});
    assert.equal(toggle(days.at(-1)).attributes["aria-expanded"], "true", "an older day opens");
});

test("a copy opens to one box per key; the game's own progress waits in its own box", async () => {
    const root = await openPage();
    await openCopy(root, 0);
    const names = byClass(root, "save-key__name").map(text);
    assert.ok(names.includes("Cards") && names.includes("Money"), names.join());
    assert.ok(names.includes("Changed on its own"));
    assert.ok(!names.includes("FarmPlot"), "the farm's progress is in the closed box");
    assert.match(text(keyHead(root, "Cards")), /2 values/);
});

test("Restore puts one key back as one action in Changes, and Undo takes it back", async () => {
    const root = await openPage();
    await openCopy(root, 0);
    const [restore] = byClass(keyHead(root, "Cards"), "save-key__restore");
    const logged = (await fetchChanges()).actions.length;
    // A quick second press while the first runs does nothing.
    await Promise.all([restore.listeners.click({}), restore.listeners.click({})]);
    await until(() => /Restored Cards\./.test(text(byClass(root, "save-copy__status")[0])), "the restore to finish");
    assert.equal(gga.Cards[0].h.mob0, atCopy.mob0);
    assert.equal(gga.Cards[0].h.mob1, atCopy.mob1);
    assert.equal(gga.Money, now.money, "only the cards");
    await until(() => !keyHead(root, "Cards"), "the compare to read the game again");

    const { actions } = await fetchChanges();
    assert.equal(actions.length, logged + 1, "one restore, one action");
    const [action] = actions;
    assert.equal(action.label, `Restored Cards from ${copyName(copyTime)}`);
    assert.deepEqual(action.entries.map((entry) => [entry.path, entry.before, entry.after]).sort(), [
        ["Cards[0].h.mob0", now.mob0, atCopy.mob0],
        ["Cards[0].h.mob1", now.mob1, atCopy.mob1],
    ]);

    await undoAction(action.id);
    assert.equal(gga.Cards[0].h.mob0, now.mob0);
    assert.equal(gga.Cards[0].h.mob1, now.mob1);
});

test("Restore all puts back the player's values, not the game's own progress or the protected ones; gems bought since are kept", async () => {
    const root = await openPage();
    await openCopy(root, 1);
    assert.match(text(keyHead(root, "GemsOwned")), /Gems were bought since this copy/);
    assert.equal(byClass(keyHead(root, "GemsOwned"), "save-key__restore").length, 0);
    const protectedNow = structuredClone({
        gems: gga.GemsOwned,
        server: gga.ServerGemsReceived,
        time: gga.TimeAway,
        timer: gga.CloudsaveTimer,
    });
    const [all] = byClass(root, "save-copy__bar").flatMap((bar) => byClass(bar, "save-key__restore"));
    await all.listeners.click({});
    await until(() => /Restored all\./.test(text(byClass(root, "save-copy__status")[0])), "Restore all to finish");
    assert.equal(gga.Money, atCopy.money);
    assert.equal(gga.Cards[0].h.mob0, atCopy.mob0);
    const farmNow = gga.FarmPlot[0][6];
    assert.notEqual(farmNow, atCopy.farm, "the game's own progress stays (it waits in its own box)");
    assert.deepEqual(
        structuredClone({
            gems: gga.GemsOwned,
            server: gga.ServerGemsReceived,
            time: gga.TimeAway,
            timer: gga.CloudsaveTimer,
        }),
        protectedNow
    );
    const [action] = (await fetchChanges()).actions;
    assert.equal(action.label, `Restored all from ${copyName(copyTime - 60e3)}`);
    await undoAction(action.id);
    assert.equal(gga.Money, now.money, "so Undo takes it back while the game moves on");
    assert.equal(gga.FarmPlot[0][6], farmNow);
});

test("without gems bought since, a copy's GemsOwned is restorable", async () => {
    const res = await fetch("/api/save-copies/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    });
    const { groups } = await res.json();
    const gems = groups.find((group) => group.key === "GemsOwned").changes[0];
    assert.equal(gems.restorable, true);
    assert.equal(gems.gemsBought, false);
    assert.ok(gemsId);
});

test("a gem bought between the plan and the write is kept: that value is refused, the others land", async () => {
    const gems = gga.GemsOwned;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        // The purchase lands after the server planned the writes, before the game writes them.
        if (String(url).includes("/game/gga/write-many")) gga.GemsOwned += 50;
        return realFetch(url, options);
    };
    let error;
    try {
        await restoreCopy({ id, time: copyTime, character: "Lumi_Main" }, ["GemsOwned", "Money"], "test").catch(
            (e) => (error = e)
        );
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.ok(error, "the restore says a value wasn't put back");
    assert.deepEqual(
        error.results.map((result) => [result.path, result.ok, result.error ?? ""]),
        [
            ["gga.GemsOwned", false, "changed since"],
            ["gga.Money", true, ""],
        ]
    );
    assert.equal(gga.GemsOwned, gems + 50, "the bought gems stay");
    assert.equal(gga.Money, atCopy.money);
    gga.Money = now.money;
    gga.GemsOwned = gems;
});
