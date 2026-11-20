// What a field shows after the game changed under it: a save that failed part way, or a reload while the field has
// focus. The real page modules on the fake game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);

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
const inputs = (row) => elements(row).filter((node) => node.nodeName === "input");
const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);

async function until(check, what) {
    for (let i = 0; i < 200; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

async function openPage(file, label) {
    const root = (await importRepo(file)).default.component();
    await until(() => Boolean(findRow(root, label)), `${file} to load`);
    return root;
}

// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};

// Settles once the page has read the game again after a write, and drawn what it read.
const readAfterWrite = () => {
    const realFetch = globalThis.fetch;
    let wrote = false;
    let done = false;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (String(url).includes("/write")) wrote = true;
        else if (wrote) {
            globalThis.fetch = realFetch;
            setTimeout(() => (done = true), 0);
        }
        return response;
    };
    return {
        landed: () => until(() => done, "the page to read the game again"),
        stop: () => (globalThis.fetch = realFetch),
    };
};

// What the player does, as the browser reports it.
const focus = (input) => input.listeners.focus?.({ target: input });
const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const press = (row, input, key) => row.listeners.keydown({ key, target: input, preventDefault() {} });
const leave = (row, input, to = null) => {
    input.listeners.blur?.({ target: input, relatedTarget: to });
    row.listeners.focusout({ target: input, currentTarget: row, relatedTarget: to });
};
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0]))?.[1] ?? null;
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
// This field binds its text to the draft; the test DOM records that binding as the value attribute.
const shown = (input) => String(input.attributes.value);
// VanJS draws state changes on its next tick.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Sweep shared-blocks-1: Escape put back the value from before the half-done save, and the next save wrote it.
test("after a save the game took only part of, Escape and the next save start from what the game holds", async () => {
    const kitchen = game.gga.Cooking[0];
    [kitchen[6], kitchen[7], kitchen[8]] = [80, 27, 53];
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js", "Kitchen 1");
    const row = findRow(root, "Kitchen 1");
    const [speed, fire, luck] = inputs(row);
    const restore = refuseWrites(kitchen, 7);
    const reread = readAfterWrite();
    try {
        focus(speed);
        type(speed, 90);
        leave(row, speed, fire);
        focus(fire);
        type(fire, 40);
        press(row, fire, "Enter");
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.deepEqual([kitchen[6], kitchen[7]], [90, 27], "the game took Speed but kept Fire");
        await reread.landed();
        press(row, fire, "Escape");
        await tick();
        assert.equal(shown(speed), "90", "Escape shows the Speed the game now holds");
        assert.equal(shown(fire), "27");
    } finally {
        reread.stop();
        restore();
    }
    const start = requests.length;
    leave(row, fire, luck);
    focus(luck);
    type(luck, 60);
    press(row, luck, "Enter");
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(requests.slice(start).filter((entry) => entry.includes("/write")).length, 1);
    assert.deepEqual([kitchen[6], kitchen[7], kitchen[8]], [90, 27, 60], "Speed isn't put back to 80");
});
