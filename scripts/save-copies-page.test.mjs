// History › Save copies (#32) on the fake game: the real page and server over copies on disk. Done when a copy of the
// character in play opens to its compare (the game's own progress in its own box), Restore puts one key back with a
// copy before and after (going back is restoring "Before restore"), Restore all never writes the protected values, gems
// bought since a copy are kept, and another character's copy is listed greyed with a hint to switch.
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
const { fetchChanges, fetchSaveCopies } = await importRepo("src/ui/services/api.js");
const { SaveCopies, copyName } = await importRepo("src/ui/components/views/SaveCopies.js");

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
    await until(() => byClass(root, "save-copy").length >= 4, "the copies to list");
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

/** The row of a copy, by id (the list is newest first, in the page as in the API). */
async function openById(root, copyId) {
    const { copies } = await fetchSaveCopies();
    await until(() => byClass(root, "save-copy").length === copies.length, "the list to show every copy");
    await heads(root)[copies.findIndex((c) => c.id === copyId)].listeners.click({});
    await until(() => byClass(root, "save-key__head").length > 0, "the compare to show");
}
const status = (root) => text(byClass(root, "save-copy__status")[0]);

test("Restore is a fork: a copy before and after, listed on top; going back is restoring Before restore", async () => {
    const root = await openPage();
    await openById(root, id);
    const [restore] = byClass(keyHead(root, "Cards"), "save-key__restore");
    const logged = (await fetchChanges()).actions.length;
    const listed = (await fetchSaveCopies()).copies.length;
    // A quick second press while the first runs does nothing.
    await Promise.all([restore.listeners.click({}), restore.listeners.click({})]);
    await until(() => /Restored Cards\./.test(status(root)), "the restore to finish");
    assert.match(status(root), /To go back, restore "Before restore"\./);
    assert.equal(gga.Cards[0].h.mob0, atCopy.mob0);
    assert.equal(gga.Cards[0].h.mob1, atCopy.mob1);
    assert.equal(gga.Money, now.money, "only the cards");
    await until(() => !keyHead(root, "Cards"), "the compare to read the game again");

    const { copies } = await fetchSaveCopies();
    assert.equal(copies.length, listed + 2, "one restore, two copies");
    await until(() => byClass(root, "save-copy").length === copies.length, "the new copies to list");
    const labels = byClass(root, "save-copy__label").map(text);
    assert.deepEqual(labels.slice(0, 2), [`Restored from ${copyName(copyTime)} (Cards)`, "Before restore"]);
    assert.equal((await fetchChanges()).actions.length, logged, "a restore is no change with an Undo");

    // Going back: the same Restore, on "Before restore".
    const before = copies[1];
    await openById(root, before.id);
    await byClass(keyHead(root, "Cards"), "save-key__restore")[0].listeners.click({});
    await until(() => gga.Cards[0].h.mob0 === now.mob0, "the cards to go back");
    await until(() => /To go back/.test(byClass(root, "save-copy__status").map(text).join()), "its copy after");
    assert.equal(gga.Cards[0].h.mob1, now.mob1);
});

test("Restore all writes everything, the game's own progress too, never the protected values; gems bought since are kept", async () => {
    const root = await openPage();
    await openById(root, gemsId);
    assert.match(text(keyHead(root, "GemsOwned")), /Gems were bought since this copy/);
    assert.equal(byClass(keyHead(root, "GemsOwned"), "save-key__restore").length, 0);
    const protectedNow = structuredClone({
        gems: gga.GemsOwned,
        server: gga.ServerGemsReceived,
        time: gga.TimeAway,
        timer: gga.CloudsaveTimer,
    });
    const farmNow = gga.FarmPlot[0][6];
    const [all] = byClass(root, "save-copy__bar").flatMap((bar) => byClass(bar, "save-key__restore"));
    await all.listeners.click({});
    await until(() => /Restored everything\./.test(status(root)), "Restore all to finish");
    assert.equal(gga.Money, atCopy.money);
    assert.equal(gga.Cards[0].h.mob0, atCopy.mob0);
    assert.equal(gga.FarmPlot[0][6], atCopy.farm, "the game's own progress too");
    assert.deepEqual(
        structuredClone({
            gems: gga.GemsOwned,
            server: gga.ServerGemsReceived,
            time: gga.TimeAway,
            timer: gga.CloudsaveTimer,
        }),
        protectedNow
    );
    const { copies } = await fetchSaveCopies();
    assert.deepEqual(copies[0].label, { kind: "restored", from: copyTime - 60e3, what: "all" });

    // Back, with Restore all on "Before restore".
    await openById(root, copies[1].id);
    await byClass(root, "save-copy__bar")
        .flatMap((bar) => byClass(bar, "save-key__restore"))[0]
        .listeners.click({});
    await until(() => gga.Money === now.money, "the money to go back");
    await until(() => /To go back/.test(byClass(root, "save-copy__status").map(text).join()), "its copy after");
    assert.equal(gga.FarmPlot[0][6], farmNow);
    assert.equal(gga.Cards[0].h.mob0, now.mob0);
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
