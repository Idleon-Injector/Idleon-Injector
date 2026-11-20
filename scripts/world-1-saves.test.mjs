// World 1 pages save from what the game holds now, not from what the page read when it opened, and say why a save
// failed where the player acted.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
const g = game.gga;

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
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root) && ready(root), `${file} to load`);
    return root;
};
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
const switchOf = (row) => elements(row).find((node) => node.attributes.role === "switch");
const wordsOf = (row) => text(byClass(row, "state-switch__words")[0]);
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const saveState = (node) =>
    /save-state--(\w+)/.exec(classes(byClass(node, "save-state")[0] ?? { attributes: {} }))?.[1];

const STAMPS = "src/ui/pages/world-1/stamps/stamps.js";

test("stamps: two exalt flips saving at once both land", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Stamp A3"));
    const release = holdWrites();
    const saves = [flip(rowNamed(root, "Stamp A1"), true)];
    await tick();
    saves.push(flip(rowNamed(root, "Stamp A3"), true));
    await tick();
    release();
    await Promise.all(saves);
    assert.deepEqual([...g.Compass[4]], ["_0", "_1", "_2", "a0", "b4"]);
    assert.equal(switchOf(rowNamed(root, "Stamp A1")).checked, true);
});

test("stamps: an exalt flip keeps a stamp exalted in the game since the page opened", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Stamp A6"));
    g.Compass[4] = [...g.Compass[4], "_9"]; // exalted in the game
    await flip(rowNamed(root, "Stamp A6"), true);
    assert.deepEqual([...g.Compass[4]], ["_1", "_5", "_9", "a0", "b4"]);
    await tick();
    assert.equal(wordsOf(rowNamed(root, "Stamp A10")), "Exalted", "the page shows the game's own exalt too");
});

test("stamps: a refused exalt says why on the row and shows what the game holds", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Stamp A6"));
    const row = rowNamed(root, "Stamp A6");
    const restore = refuseWrites(g.Compass, 4);
    try {
        await flip(row, true);
    } finally {
        restore();
    }
    assert.deepEqual([...g.Compass[4]], ["_1", "a0", "b4"]);
    assert.equal(saveState(row), "error");
    assert.equal(switchOf(row).checked, false);
});

const STATUES = "src/ui/pages/world-1/statues/statues.js";
const statueRow = (root, index) => byClass(root, "statue-row")[index];
const tierOf = (row) => text(byClass(row, "statue-tier-badge")[0]);
// The player types into the row's last field (Flair) and presses Enter.
const typeFlair = (row, value) => {
    const flair = elements(row)
        .filter((node) => node.nodeName === "input")
        .at(-1);
    flair.value = value;
    flair.listeners.input({ target: flair });
    row.listeners.keydown({ key: "Enter", target: flair, preventDefault() {} });
};

test("statues: saving one field keeps what the game gained since the page opened", async () => {
    const saved = [[...g.StatueLevels[1]], g.StatueG[1], g.RoyalG[22][1]];
    g.RoyalG[22][1] = 1;
    const root = await openPage(STATUES, (root) => statueRow(root, 1));
    const row = statueRow(root, 1);
    g.StatueLevels[1][1] = 99999; // deposited in the game
    g.StatueG[1] = 3;
    typeFlair(row, "4");
    await until(() => ["success", "error"].includes(saveState(row)), "the save");
    assert.equal(saveState(row), "success");
    assert.deepEqual([...g.StatueLevels[1]], [saved[0][0], 99999]);
    assert.equal(g.StatueG[1], 3);
    assert.equal(g.RoyalG[22][1], 4);
    await tick();
    assert.equal(tierOf(row), "Zenith", "the row shows what the game holds");
    [g.StatueLevels[1], g.StatueG[1], g.RoyalG[22][1]] = saved;
});

test("statues: a refused save says why and shows what the game holds", async () => {
    const saved = [g.StatueG[1], g.RoyalG[22][1]];
    g.RoyalG[22][1] = 1;
    const root = await openPage(STATUES, (root) => statueRow(root, 1));
    const row = statueRow(root, 1);
    g.StatueG[1] = 3;
    const restore = refuseWrites(g.RoyalG[22], 1);
    try {
        typeFlair(row, "4");
        await until(() => ["success", "error"].includes(saveState(row)), "the save");
    } finally {
        restore();
    }
    assert.equal(saveState(row), "error");
    assert.equal(g.StatueG[1], 3);
    await tick();
    assert.equal(tierOf(row), "Zenith");
    [g.StatueG[1], g.RoyalG[22][1]] = saved;
});

test("statues: names show the game's underscores as spaces", async () => {
    const root = await openPage(STATUES, (root) => statueRow(root, 7));
    assert.equal(text(byClass(statueRow(root, 7), "account-row__name")[0]), "THICC SKIN");
});
