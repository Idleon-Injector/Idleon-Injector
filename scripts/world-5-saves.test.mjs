// World 5 page saves (sweep, 2026-11-20): a save starts from what the game holds now, so a change made in game (or by
// another row) since the page read it isn't overwritten. The Rat King's and the Slab's are in world-5-pages.test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const gga = game.gga;

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const attr = (node, name) => {
    const value = node.attributes[name];
    return String(typeof value === "function" ? value() : (value ?? ""));
};
const byClass = (root, name) => elements(root).filter((node) => attr(node, "class").split(" ").includes(name));

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const open = (file) => importRepo(file).then((page) => page.default.component());

const switchOf = (row) => elements(row).find((node) => node.attributes.role === "switch");
const wordsOf = (row) => text(byClass(row, "state-switch__words")[0]);
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
// Hold the game's writes until released, to act while a save runs.
const holdWrites = () => {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) await gate;
        return realFetch(url, options);
    };
    return () => {
        globalThis.fetch = realFetch;
        release();
    };
};

test("superbits: two superbits flipped on while the first saves both stay unlocked (they share one string)", async () => {
    const before = String(gga.Gaming[12] ?? "");
    const root = await open("src/ui/pages/world-5/gaming/4-superbits.js");
    const locked = () => byClass(root, "account-row").filter((row) => switchOf(row) && wordsOf(row) === "");
    await until(() => locked().length >= 2, "two locked superbits");
    const [first, second] = locked();
    const release = holdWrites();
    const saves = [flip(first, true)];
    await tick();
    saves.push(flip(second, true));
    await tick();
    release();
    await Promise.all(saves);
    await until(() => wordsOf(first) === "Unlocked" && wordsOf(second) === "Unlocked", "both rows to save");
    assert.equal(String(gga.Gaming[12]).length, before.length + 2, "the game holds both new letters");
    gga.Gaming[12] = before;
});
