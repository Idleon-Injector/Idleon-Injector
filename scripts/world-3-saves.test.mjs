// World 3 page saves on the fake game, driven through the listeners a player triggers: a save goes to the
// character it was asked for, and a bulk set reaches every row, including one the game changed after the page
// read it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
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

// Record each write-many's paths; with `fail`, the game answers it with an error.
function watchWrites({ fail = false } = {}) {
    const realFetch = globalThis.fetch;
    const paths = [];
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("write-many")) return realFetch(url, options);
        paths.push(...JSON.parse(options.body).writes.map((write) => write.path));
        return fail ? new Response("{}", { status: 500 }) : realFetch(url, options);
    };
    return { paths, restore: () => (globalThis.fetch = realFetch) };
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

for (const { page, levels, label } of [
    { page: "salt-lick/salt-lick.js", levels: "SaltLick", label: "Salt Lick" },
    { page: "atom-collider/atom-collider.js", levels: "Atoms", label: "Atom Collider" },
]) {
    test(`${label} Reset all resets a level bought in the game after the page read it`, async (t) => {
        const before = gga[levels].slice();
        t.after(() => gga[levels].splice(0, before.length, ...before));
        gga[levels][0] = 0;
        const root = await openPage(`src/ui/pages/world-3/${page}`, (r) => byClass(r, "account-row").length > 0);
        gga[levels][0] = 3; // bought in the game

        const reset = button(root, "Reset all");
        reset.listeners.click({ currentTarget: reset, preventDefault() {} });
        assert.equal(reset.attributes["data-again"], "Click again");
        reset.listeners.click({ currentTarget: reset, preventDefault() {} });
        await until(() => gga[levels][0] === 0, "the reset to reach the bought level");
        assert.ok(gga[levels].slice(0, before.length).every((level) => Number(level) === 0));
    });

    test(`${label} Reset all writes only the levels it changes, so History lists no 0 → 0`, async (t) => {
        const before = gga[levels].slice();
        t.after(() => gga[levels].splice(0, before.length, ...before));
        gga[levels].fill(0, 0, before.length);
        const root = await openPage(`src/ui/pages/world-3/${page}`, (r) => byClass(r, "account-row").length > 0);
        gga[levels][1] = 2; // bought in the game
        const writes = watchWrites();
        t.after(writes.restore);

        const reset = button(root, "Reset all");
        reset.listeners.click({ currentTarget: reset, preventDefault() {} });
        reset.listeners.click({ currentTarget: reset, preventDefault() {} });
        await until(() => gga[levels][1] === 0, "the reset");
        assert.deepEqual(writes.paths, [`gga.${levels}[1]`]);
    });

    test(`${label} shows the game's levels again when Reset all fails`, async (t) => {
        const before = gga[levels].slice();
        t.after(() => gga[levels].splice(0, before.length, ...before));
        gga[levels][0] = 0;
        const root = await openPage(`src/ui/pages/world-3/${page}`, (r) => byClass(r, "account-row").length > 0);
        const field = inputs(byClass(root, "account-row")[0])[0];
        gga[levels][0] = 3; // bought in the game
        const writes = watchWrites({ fail: true });
        t.after(writes.restore);

        const reset = button(root, "Reset all");
        reset.listeners.click({ currentTarget: reset, preventDefault() {} });
        reset.listeners.click({ currentTarget: reset, preventDefault() {} });
        await until(
            () => writes.paths.length > 0 && String(field.attributes.value) === "3",
            "the field to show the game's level again"
        );
    });
}

test("A prayer row's Max sets the prayer's max level", async () => {
    const before = gga.PrayersUnlocked.slice();
    const root = await openPage("src/ui/pages/world-3/prayers/prayers.js", (r) => byClass(r, "prayer-row").length > 0);
    try {
        const row = byClass(root, "prayer-row")[0];
        button(row, "Max").listeners.click({ preventDefault() {} });
        await until(() => saved(row), "the Max save to end");
        assert.match(saveState(row), /save-state--success/);
        assert.equal(gga.PrayersUnlocked[0], Number(gga.CustomLists.h.PrayerInfo[0][9]), "the prayer's max is saved");
    } finally {
        gga.PrayersUnlocked.splice(0, before.length, ...before);
    }
});
