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

// Rat King with Research[11] = `crowns` on screen; the helpers find its parts.
const openRatKing = async (crowns) => {
    gga.Research[11] = crowns;
    const root = await open("src/ui/pages/world-5/gaming/2-rat-king.js");
    const chip = (id) => elements(root).find((node) => attr(node, "title").startsWith(`Crown ${id} `));
    const active = (id) => attr(chip(id), "class").includes("rat-king-crown-chip--active");
    const button = (label) =>
        elements(root).find(
            (node) => node.nodeName === "button" && (text(node).trim() === label || attr(node, "title") === label)
        );
    const press = (node) => node.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: node });
    const loaded = () => attr(button("Clear crowns for Plant 1"), "disabled") === "false";
    await until(() => chip("0_") && loaded() && crowns.every(active), "the page to load its crowns");
    return { root, active, button, press };
};

test("rat king: Set Count with the count the game already holds saves nothing and doesn't say saved", async () => {
    const before = gga.Research[11];
    const { root, press } = await openRatKing(["0_", "0a"]);
    const row = byClass(root, "account-setall-row")[0];
    const input = elements(row).find((node) => node.nodeName === "input");
    const apply = elements(row).find((node) => node.nodeName === "button" && text(node).trim() === "Apply");
    input.value = "2";
    input.listeners.input({ target: input });
    const start = writes();
    await press(apply);
    assert.equal(writes(), start, "nothing was written");
    assert.doesNotMatch(attr(apply, "class"), /account-btn--success/, "no ✓ for a change that wasn't made");
    gga.Research[11] = before;
});

test("rat king: Set Count asks before it removes a crown reclaimed in game since the page opened", async () => {
    const before = gga.Research[11];
    const { root, active, press } = await openRatKing(["0_", "0a", "0b"]);
    gga.Research[11] = ["0_", "0a", "0b", "5c", "9i"];
    const row = byClass(root, "account-setall-row")[0];
    const input = elements(row).find((node) => node.nodeName === "input");
    const apply = elements(row).find((node) => node.nodeName === "button" && text(node).trim() === "Apply");
    // The player means to add one crown to the 3 the page shows; the game holds 5, so 4 removes one.
    input.value = "4";
    input.listeners.input({ target: input });
    const start = writes();
    await press(apply);
    await until(() => active("9i"), "the page to show the crowns the game holds");
    assert.equal(writes(), start, "nothing is removed without asking");
    await press(apply);
    assert.equal(apply.attributes["data-again"], "Click again", "the next press asks with the real count");
    assert.equal(writes(), start);
    await press(apply);
    await until(() => gga.Research[11].length === 4, "the asked removal to save");
    gga.Research[11] = before;
});

test("rat king: Clear and Clear all ask before they remove crowns reclaimed in game since the page opened", async () => {
    const before = gga.Research[11];
    const { active, button, press } = await openRatKing([]);
    const start = writes();
    // Plant 6 shows 0/10, so its Clear doesn't ask, but the game has reclaimed 5c since.
    gga.Research[11] = ["5c"];
    const clear = button("Clear crowns for Plant 6");
    await press(clear);
    await until(() => active("5c"), "the page to show crown 5c");
    assert.equal(writes(), start, "Clear removed nothing without asking");
    await press(clear);
    assert.equal(clear.attributes["data-again"], "Click again", "the next Clear asks");
    // Clear all asks about the 1 crown shown; the game reclaims a second before the answer.
    const clearAll = button("Clear all (0)");
    await press(clearAll);
    assert.equal(clearAll.attributes["data-again"], "Click again");
    gga.Research[11] = ["5c", "7d"];
    await press(clearAll);
    await until(() => active("7d"), "the page to show crown 7d");
    assert.equal(writes(), start, "Clear all removed nothing it didn't ask about");
    assert.deepEqual([...gga.Research[11]], ["5c", "7d"]);
    gga.Research[11] = before;
});

test("rat king: All and Reclaim discovered keep crowns reclaimed in game since the page opened", async () => {
    const [crownsBefore, logbookBefore] = [gga.Research[11], gga.Gaming[11]];
    gga.Gaming[11] = "__________"; // nothing discovered, so Reclaim discovered adds no crown of its own
    const { button, press } = await openRatKing(["0_"]);
    gga.Research[11] = ["0_", "5c"];
    await press(button("Reclaim all 10 crowns for Plant 3"));
    assert.ok(gga.Research[11].includes("5c"), "All keeps crown 5c");
    assert.ok(gga.Research[11].includes("2i"), "All reclaims Plant 3");
    gga.Research[11] = [...gga.Research[11], "7d"];
    await press(button("Reclaim discovered"));
    assert.ok(gga.Research[11].includes("7d"), "Reclaim discovered keeps crown 7d");
    [gga.Research[11], gga.Gaming[11]] = [crownsBefore, logbookBefore];
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
    // Review of #123: the save handed back the XP read before it, so the row showed the old XP over a newer read.
    const xp = inputs()[2];
    await new Promise((resolve) => setTimeout(resolve, 50));
    const { largeFormatter } = await importRepo("src/ui/components/views/account/accountShared.js");
    assert.equal(String(xp.value), largeFormatter(9999), "the XP field shows the XP the game holds");
    gga.Captains[0] = before;
});

test("slab: Register shown runs on one press; Unregister shown still asks in place", async () => {
    const root = await open("src/ui/pages/world-5/slab/slab.js");
    const button = (label) =>
        elements(root).find(
            (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
        );
    await until(() => button("Register shown") && rowNamed(root, text(byClass(root, "account-row__name")[0])), "Slab");
    // A real browser gives an empty search box the value "".
    const search = elements(root).find((node) => node.nodeName === "input");
    if (search.value === undefined) search.value = "";
    const click = (node) => node.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: node });

    const register = button("Register shown");
    let before = writes();
    await click(register);
    await until(() => writes() > before, "Register shown to write");
    assert.equal(register.attributes["data-again"], undefined, "registering doesn't ask");

    await until(() => button("Unregister shown"), "Unregister shown");
    const unregister = button("Unregister shown");
    before = writes();
    await click(unregister);
    await until(() => unregister.attributes["data-again"] === "Click again", "Unregister shown to ask");
    assert.equal(writes(), before, "unregistering wrote nothing on the first press");
});
