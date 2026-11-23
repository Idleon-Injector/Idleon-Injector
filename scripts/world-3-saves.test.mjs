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
// Reset all takes levels away, so it asks in the tray first; the answer there resets them.
const resetAll = (root) => {
    const reset = button(root, "Reset all");
    reset.listeners.click({ currentTarget: reset, preventDefault() {} });
    const yes = byClass(root, "tabbed-list__yes")[0];
    yes.listeners.click({ currentTarget: yes, preventDefault() {} });
};

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
    assert.match(text(row), /Character changed\. Refresh\./);

    const finish = button(finishRow, "Finish");
    finish.listeners.click({ preventDefault() {}, currentTarget: finish });
    await until(() => classes(finish).includes("account-btn--error"), "Finish to be refused");
    // The reason stays beside the button, not just "failed".
    const saidIn = (node) => byClass(node, "said__text").map(text).join(" | ");
    await until(() => saidIn(finishRow) === "Character changed. Refresh.", "Finish to say why it was refused");

    const finishAll = button(root, "Finish all");
    finishAll.listeners.click({ preventDefault() {}, currentTarget: finishAll });
    await until(
        () => /Character changed\. Refresh\./.test(saidIn(root).replace(saidIn(finishRow), "")),
        "Finish all to say why"
    );

    assert.deepEqual(gga.PlacedTraps, liveBefore, `${other}'s traps in play are untouched`);
    assert.deepEqual(db[first].h.PldTraps, storedBefore, `${first}'s stored traps are untouched`);

    // Back on the character the page read: the next Finish and Finish all work and clear their reasons.
    switchTo(first);
    finish.listeners.click({ preventDefault() {}, currentTarget: finish });
    await until(() => saidIn(finishRow) === "", "a Finish that worked to clear its reason");
    finishAll.listeners.click({ preventDefault() {}, currentTarget: finishAll });
    await until(() => saidIn(root) === "", "a Finish all that worked to clear its reason");
});

test("Traps' Set all sets the picked column of the picked character's traps, and nothing else (#245)", async (t) => {
    const first = gga.UserInfo[0];
    const other = gga.GetPlayersUsernames.find((name) => name !== first);
    const before = {
        live: structuredClone(gga.PlacedTraps),
        first: structuredClone(db[first].h.PldTraps),
        other: structuredClone(db[other].h.PldTraps),
    };
    t.after(() => {
        gga.PlacedTraps = before.live;
        db[first].h.PldTraps = before.first;
        db[other].h.PldTraps = before.other;
    });
    const root = await openPage("src/ui/pages/world-3/traps/traps.js", (r) => byClass(r, "trap-row").length > 1);
    const pick = byClass(root, "pick-in-place__option").find((option) => text(option).includes(other));
    pick.listeners.click({ preventDefault() {}, currentTarget: pick });
    const tray = byClass(root, "tabbed-list__tools")[0];
    const setAll = (value) => {
        type(inputs(byClass(tray, "account-setall-row")[0])[0], value);
        const press = button(tray, "Set all");
        press.listeners.click({ preventDefault() {}, currentTarget: press });
    };
    const column = (index) => db[other].h.PldTraps.filter((trap) => trap[0] !== -1).map((trap) => trap[index]);

    // Qty first: the other character's traps get it; EXP and Rare, and the first character's traps, stay.
    setAll(50);
    await until(() => column(4).every((qty) => qty === 50), "Qty to reach every trap");
    assert.deepEqual(
        column(7),
        before.other.filter((trap) => trap[0] !== -1).map((trap) => trap[7])
    );
    assert.deepEqual(gga.PlacedTraps, before.live, `${first}'s traps in play are untouched`);
    assert.deepEqual(db[first].h.PldTraps, before.first);

    // EXP picked: only EXP changes.
    const exp = elements(tray).find((node) => node.attributes.role === "radio" && text(node) === "EXP");
    exp.listeners.click({ preventDefault() {}, currentTarget: exp });
    setAll(77);
    await until(() => column(7).every((value) => value === 77), "EXP to reach every trap");
    assert.deepEqual(column(4), [50, 50, 50], "Qty stays as it was set");
    assert.deepEqual(gga.PlacedTraps, before.live);
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
        assert.match(text(row), /Character changed\. Refresh\./);
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

        resetAll(root);
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

        resetAll(root);
        await until(() => gga[levels][1] === 0, "the reset");
        assert.deepEqual(writes.paths, [`gga.${levels}[1]`]);
    });

    // Review of #207: a row Reset all skipped (the game already held 0) went on showing its old level.
    test(`${label} Reset all shows 0 on a row the game had already reset`, async (t) => {
        const before = gga[levels].slice();
        t.after(() => gga[levels].splice(0, before.length, ...before));
        gga[levels].fill(0, 0, before.length);
        gga[levels][0] = 5;
        gga[levels][1] = 2;
        const root = await openPage(`src/ui/pages/world-3/${page}`, (r) => byClass(r, "account-row").length > 0);
        const field = inputs(byClass(root, "account-row")[0])[0];
        assert.equal(String(field.attributes.value), "5");
        gga[levels][0] = 0; // reset in the game

        resetAll(root);
        await until(() => gga[levels][1] === 0, "the reset");
        await until(() => String(field.attributes.value) === "0", "the skipped row to show 0");
    });

    // Review of #207: Reset all's read of the levels answered with the game before a row's save, so the row it skipped
    // went back to that older level over the save.
    test(`${label} Reset all keeps a level the row saved while Reset all read the game`, async (t) => {
        const before = gga[levels].slice();
        t.after(() => gga[levels].splice(0, before.length, ...before));
        gga[levels].fill(0, 0, before.length);
        gga[levels][1] = 2;
        const root = await openPage(`src/ui/pages/world-3/${page}`, (r) => byClass(r, "account-row").length > 0);
        const row = byClass(root, "account-row")[0];
        const field = inputs(row)[0];
        // Reset all's read answers with the game as it was, but only once released.
        const realFetch = globalThis.fetch;
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        let held = false;
        globalThis.fetch = (url, options) => {
            if (!String(url).includes("/game/gga/read") || JSON.parse(options.body).path !== `gga.${levels}`) {
                return realFetch(url, options);
            }
            held = true;
            const answer = realFetch(url, options);
            return gate.then(() => answer);
        };
        t.after(() => {
            globalThis.fetch = realFetch;
            release();
        });

        resetAll(root);
        await until(() => held, "Reset all to read the levels");
        type(field, 4);
        enter(row, field);
        await until(() => saved(row) && gga[levels][0] === 4, "the row's save");
        release();
        await until(() => gga[levels][1] === 0, "the reset");
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(String(field.attributes.value), "4", "the row keeps its save");
    });

    // Review of #207: the read answered with the level from before the row's save, so Reset all wrote 0 over the save.
    test(`${label} Reset all doesn't write over a level the row saved while it read the game`, async (t) => {
        const before = gga[levels].slice();
        t.after(() => gga[levels].splice(0, before.length, ...before));
        gga[levels].fill(0, 0, before.length);
        gga[levels][0] = 2;
        gga[levels][1] = 2;
        const root = await openPage(`src/ui/pages/world-3/${page}`, (r) => byClass(r, "account-row").length > 0);
        const row = byClass(root, "account-row")[0];
        const field = inputs(row)[0];
        const realFetch = globalThis.fetch;
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        let held = false;
        globalThis.fetch = (url, options) => {
            if (!String(url).includes("/game/gga/read") || JSON.parse(options.body).path !== `gga.${levels}`) {
                return realFetch(url, options);
            }
            held = true;
            const answer = realFetch(url, options);
            return gate.then(() => answer);
        };
        t.after(() => {
            globalThis.fetch = realFetch;
            release();
        });

        resetAll(root);
        await until(() => held, "Reset all to read the levels");
        type(field, 4);
        enter(row, field);
        await until(() => saved(row) && gga[levels][0] === 4, "the row's save");
        release();
        await until(() => gga[levels][1] === 0, "the reset of the other row");
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(gga[levels][0], 4, "the game keeps the row's save");
        assert.equal(String(field.attributes.value), "4", "and the row shows it");
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

        resetAll(root);
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

// Review of #207: Unequip all asked about one character, and once another was picked the answer unequipped that one.
test("Prayers' Unequip all refuses once another character is picked than the one it asked about", async (t) => {
    const first = gga.UserInfo[0];
    const other = gga.GetPlayersUsernames.find((name) => name !== first);
    // The other character has the same prayers on, so the answer would find them on that one too.
    const otherOwn = [...db[other].h.Prayers];
    db[other].h.Prayers.splice(0, 12, ...db[first].h.Prayers);
    t.after(() => db[other].h.Prayers.splice(0, 12, ...otherOwn));
    const [firstBefore, otherBefore] = [first, other].map((name) => [...db[name].h.Prayers]);
    const root = await openPage("src/ui/pages/world-3/prayers/prayers.js", (r) => byClass(r, "prayer-row").length > 0);
    const unequipAll = button(root, "Unequip all");
    unequipAll.listeners.click({ currentTarget: unequipAll, preventDefault() {} });
    await until(() => text(root).includes(`from ${first}?`), "the question to name the character picked");

    const option = byClass(root, "pick-in-place__option").find(
        (node) => text(byClass(node, "pick-in-place__option-label")[0]) === other
    );
    option.listeners.click({ currentTarget: option, preventDefault() {} });
    const yes = byClass(root, "tabbed-list__yes")[0];
    yes.listeners.click({ currentTarget: yes, preventDefault() {} });
    await until(() => text(root).includes("Character changed") || db[other].h.Prayers[0] === -1, "Unequip all to end");
    assert.deepEqual([...db[other].h.Prayers], otherBefore, `${other}'s prayers stay on`);
    assert.deepEqual([...db[first].h.Prayers], firstBefore, `${first}'s prayers stay on too`);
});

test("Library: a save for one character that answers after a Refresh to another stays off the new rows", async () => {
    const [main, alt] = [gga.UserInfo[0], Object.keys(db).find((name) => name !== gga.UserInfo[0])];
    const levels = gga.SkillLevelsMAX;
    const root = await openPage("src/ui/pages/world-3/library/library.js", (r) =>
        byClass(r, "talent-row").some((row) => inputs(row).length)
    );
    // A talent is named once in the game's list, so its name finds its id.
    const { normalCase } = await importRepo("src/ui/components/views/account/accountShared.js");
    const names = gga.CustomLists.h.TalentIconNames.map(normalCase);
    const nameOf = (candidate) => text(byClass(candidate, "account-row__name")[0]);
    const row = byClass(root, "talent-row").find(
        (candidate) => inputs(candidate).length && names.filter((name) => name === nameOf(candidate)).length === 1
    );
    const talentId = names.indexOf(nameOf(row));
    const rowFor = () => byClass(root, "talent-row").find((candidate) => nameOf(candidate) === nameOf(row));
    const shown = () => String(inputs(rowFor())[0].attributes.value);
    levels[talentId] = 2;
    await button(root, "Refresh").listeners.click({});
    await until(() => shown() === "2", "the page to show level 2");

    // The game takes Main's save at once; its answer reaches the page only after the Refresh to Alt.
    const realFetch = globalThis.fetch;
    let release;
    const answer = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (String(url).includes("write-many")) await answer;
        return response;
    };
    try {
        type(inputs(row)[0], 3);
        enter(row, inputs(row)[0]);
        await until(() => levels[talentId] === 3, "Main's save to land");
        gga.UserInfo[0] = alt;
        gga.SkillLevelsMAX = Object.assign([...levels], { [talentId]: 1 });
        await button(root, "Refresh").listeners.click({});
        await until(() => shown() === "1", "Alt's rows");
        release();
        await until(() => saved(row), "Main's save to finish");
        assert.equal(shown(), "1", "Alt's row still shows Alt's level");
    } finally {
        globalThis.fetch = realFetch;
        release();
        gga.UserInfo[0] = main;
        gga.SkillLevelsMAX = levels;
    }
});
