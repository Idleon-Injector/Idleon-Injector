// World 5 page saves (sweep, 2026-11-20): a save starts from what the game holds now, so a change made in game (or by
// another row) since the page read it isn't overwritten, and adding registrations runs on one press.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// "Click again" places its tooltip on the next frame and reads its question from a live region on the page.
globalThis.requestAnimationFrame = () => {};
const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
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
const writes = () => requests.filter((entry) => /write/.test(entry)).length;

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const open = (file) => importRepo(file).then((page) => page.default.component());

const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
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
    const locked = () => byClass(root, "account-row").filter((row) => switchOf(row) && wordsOf(row) === "Locked");
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

test("rat king: clicking a crown keeps a crown reclaimed in game since the page opened", async () => {
    const before = gga.Research[11];
    gga.Research[11] = ["0_", "1a"];
    const root = await open("src/ui/pages/world-5/gaming/2-rat-king.js");
    const chip = (id) => elements(root).find((node) => attr(node, "title").startsWith(`Crown ${id} `));
    const active = (id) => attr(chip(id), "class").includes("rat-king-crown-chip--active");
    await until(() => chip("1a") && active("1a"), "the page to show crown 1a");
    gga.Research[11] = ["0_", "1a", "5c"];
    await chip("9i").listeners.click({});
    await until(() => gga.Research[11].includes("9i"), "crown 9i to save");
    assert.deepEqual([...gga.Research[11]], ["0_", "1a", "5c", "9i"]);
    assert.ok(active("5c"), "the page shows the crown the game holds");
    gga.Research[11] = before;
});

test("boats: saving a captain's level keeps the XP a voyage gave since the page opened", async () => {
    const before = [...gga.Captains[0]];
    const root = await open("src/ui/pages/world-5/sailing/4-boats.js");
    const row = () => rowNamed(root, "Captain 1");
    const inputs = () => elements(row()).filter((node) => node.nodeName === "input");
    await until(() => row() && inputs()[2]?.value !== undefined, "Captain 1 to load");
    const saveState = () => /save-state--(\w+)/.exec(attr(byClass(row(), "save-state")[0], "class"))?.[1];
    gga.Captains[0][4] = 9999;
    const level = inputs()[1];
    level.listeners.focus?.({ target: level });
    level.value = "77";
    level.listeners.input({ target: level });
    row().listeners.keydown({ key: "Enter", target: level, preventDefault() {} });
    await until(() => ["success", "error"].includes(saveState()), "the save");
    assert.equal(saveState(), "success");
    assert.equal(gga.Captains[0][3], 77, "the typed level saved");
    assert.equal(gga.Captains[0][4], 9999, "the XP the game holds stays");
    assert.equal(gga.Captains[0][5], before[5], "an untouched bonus amount stays");
    gga.Captains[0] = before;
});
