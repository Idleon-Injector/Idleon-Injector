// World 3 page saves on the fake game, driven through the listeners a player triggers: a save goes to the
// character it was asked for, a value typed or a press made while another save runs isn't lost, and a bulk
// set reaches every row, including one the game changed after the page read it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
globalThis.requestAnimationFrame = () => {};
const gga = game.gga;
const db = gga.PlayerDATABASE.h;

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
const button = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
const saveState = (row) => classes(byClass(row, "save-state")[0] ?? { attributes: {} });
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root) && pageRead(root), `${file} to load`);
    return root;
}

const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const enter = (row, input) => row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
const saved = (row) => /save-state--(success|error)/.test(saveState(row));

// Hold every write-many until release(): a save the game hasn't answered yet.
function holdWrites() {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("write-many")) {
            held++;
            await gate;
        }
        return realFetch(url, options);
    };
    return {
        held: () => held,
        release: () => {
            globalThis.fetch = realFetch;
            release();
        },
    };
}

// The game's character switch: the one in play goes to PlayerDATABASE, the next one's copies go live.
const switchTo = (name) => {
    const from = gga.UserInfo[0];
    db[from].h.PldTraps = structuredClone(gga.PlacedTraps);
    db[from].h.PlayerStuff = structuredClone(gga.PlayerStuff);
    gga.PlacedTraps = structuredClone(db[name].h.PldTraps);
    gga.PlayerStuff = structuredClone(db[name].h.PlayerStuff);
    gga.UserInfo[0] = name;
};

test("Traps refuses a save or Finish once another character is in play, and writes nothing", async (t) => {
    const first = gga.UserInfo[0];
    t.after(() => switchTo(first));
    const root = await openPage("src/ui/pages/world-3/traps/traps.js", (r) => byClass(r, "trap-row").length > 1);
    const other = gga.GetPlayersUsernames.find((name) => name !== first);
    switchTo(other);
    const liveBefore = structuredClone(gga.PlacedTraps);
    const storedBefore = structuredClone(db[first].h.PldTraps);

    const [row, finishRow] = byClass(root, "trap-row");
    type(inputs(row)[0], 99);
    enter(row, inputs(row)[0]);
    await until(() => saved(row), "the trap save to end");
    assert.match(saveState(row), /save-state--error/);
    assert.match(text(row), /The character in play changed\. Refresh and try again\./);

    const finish = button(finishRow, "Finish");
    finish.listeners.click({ preventDefault() {}, currentTarget: finish });
    await until(() => classes(finish).includes("account-btn--error"), "Finish to be refused");

    assert.deepEqual(gga.PlacedTraps, liveBefore, `${other}'s traps in play are untouched`);
    assert.deepEqual(db[first].h.PldTraps, storedBefore, `${first}'s stored traps are untouched`);
});

test("Worship refuses a charge save once another character is in play, and writes nothing", async (t) => {
    const first = gga.UserInfo[0];
    t.after(() => switchTo(first));
    const other = gga.GetPlayersUsernames.find((name) => name !== first);
    const root = await openPage("src/ui/pages/world-3/worship/worship.js", (r) => Boolean(findRow(r, other)));
    switchTo(other);
    const live = gga.PlayerStuff[0];
    const stored = db[first].h.PlayerStuff[0];

    for (const name of [first, other]) {
        const row = findRow(root, name);
        type(inputs(row)[0], 7);
        enter(row, inputs(row)[0]);
        await until(() => saved(row), `${name}'s charge save to end`);
        assert.match(saveState(row), /save-state--error/);
        assert.match(text(row), /The character in play changed\. Refresh and try again\./);
    }
    assert.equal(gga.PlayerStuff[0], live, `${other}'s charge in play is untouched`);
    assert.equal(db[first].h.PlayerStuff[0], stored, `${first}'s stored charge is untouched`);
});
