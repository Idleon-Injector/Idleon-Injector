// The first-start tour (#200): whether it was done is kept by the server (the browser menu and the in-game overlay
// don't share the browser's storage), and the Practice page's saves never reach the game or the server's change log:
// they offer the row's Undo like any save, show in History as practice, and go when the tour ends.
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { importRepo, loadUi, request } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const tourFile = path.join(os.tmpdir(), `idleon-tour-test-${process.pid}.json`);
await rm(tourFile, { force: true });
const { router } = await createFakeApi(undefined, { tourFile });
const { requests } = await loadUi(router);
const { fetchTour, saveTour, fetchChanges } = await importRepo("src/ui/services/api.js");
const { practiceActions, clearPractice } = await importRepo("src/ui/services/changeLog.js");
const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
const { PRACTICE_PAGE, practiceValues, resetPractice } = await importRepo("src/ui/tour/practice.js");

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

test("the tour counts as not done until it's finished or skipped, and Show the tour again undoes that", async () => {
    assert.deepEqual(await fetchTour(), { done: false });
    await saveTour(true);
    assert.deepEqual(await fetchTour(), { done: true });
    assert.deepEqual(JSON.parse(await readFile(tourFile, "utf8")), { done: true });
    await saveTour(false);
    assert.deepEqual(await fetchTour(), { done: false });
    const refused = await request(router, "POST", "/api/tour", { done: "yes" });
    assert.equal(refused.statusCode, 400);
    assert.deepEqual(await fetchTour(), { done: false }, "a wrong answer changes nothing");
});

test("a practice save logs as practice, offers Undo, and never reaches the game or the change log", async () => {
    resetPractice();
    clearPractice();
    const root = PRACTICE_PAGE.component();
    const row = byClass(root, "practice-row--stone")[0];
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    const before = requests.length;

    input.value = "10";
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--success/.test(classes(byClass(row, "save-state")[0])), "the practice save");

    assert.equal(practiceValues.stone.val, 10);
    const sent = requests.slice(before);
    assert.ok(
        !sent.some((request) => /\/api\/(game|changes)/.test(request)),
        `nothing goes to the game or the log: ${sent.join(", ")}`
    );
    assert.equal((await fetchChanges()).actions.length, 0, "the server's change log stays empty");
    const [action] = practiceActions.val;
    assert.equal(action.practice, true);
    assert.deepEqual(
        action.entries.map(({ path, before, after, undone }) => ({ path, before, after, undone })),
        [{ path: "Practice stone", before: 3, after: 10, undone: false }]
    );
    const undo = byClass(row, "save-state__undo")[0];
    assert.equal(undo.attributes.hidden, false, "the row offers Undo");

    await undoAction(action.id);
    assert.equal(practiceValues.stone.val, 3);
    assert.ok(practiceActions.val[0].entries.every((entry) => entry.undone));
    await assert.rejects(() => undoAction(action.id), /already undone/);

    clearPractice();
    assert.equal(practiceActions.val.length, 0, "the tour's end takes its practice out of History");
});

test("a practice undo is refused when the value moved on since", async () => {
    resetPractice();
    clearPractice();
    const root = PRACTICE_PAGE.component();
    const row = byClass(root, "practice-row--ore")[0];
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    input.value = "9";
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--success/.test(classes(byClass(row, "save-state")[0])), "the practice save");
    practiceValues.ore.val = 12;
    await assert.rejects(() => undoAction(practiceActions.val[0].id), /changed since/);
    assert.equal(practiceValues.ore.val, 12);
    clearPractice();
});
