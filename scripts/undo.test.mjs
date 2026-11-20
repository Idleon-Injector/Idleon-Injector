// Undo for every change (issue #31): the real page modules on the fake game. A save is logged with its old value,
// its character and its action; Undo puts one value back, Undo all a whole bulk action, a character's value goes
// back to that character even when another is in play, and a refused undo keeps the log entry and says why.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { store, requests } = await loadUi(router);
const gga = game.gga;
const ola = gga.OptionsListAccount;
const { fetchChanges } = await importRepo("src/ui/services/api.js");
const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
const { writeVerified, writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
const { withAction } = await importRepo("src/ui/services/changeLog.js");

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

async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root), `${file} to load`);
    return root;
}

const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
const rowLoaded = (label) => (root) => {
    const row = findRow(root, label);
    return row && !/^[-—]?$/.test(text(byClass(row, "account-row__badge")[0]));
};
const saveState = (row) => classes(byClass(row, "save-state")[0]);
const undoButton = (row) => byClass(row, "save-state__undo")[0];
const undoOffered = (row) => undoButton(row) && undoButton(row).attributes.hidden === false;

async function saveRow(row, value) {
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--(success|error)/.test(saveState(row)), "the save to finish");
    assert.match(saveState(row), /save-state--success/);
}

async function clickUndo(row) {
    await undoButton(row).listeners.click({});
    await new Promise((resolve) => setTimeout(resolve, 20)); // VanJS draws the state on its next tick
}

const newest = async () => (await fetchChanges()).actions[0];

// The game saves the character in play into PlayerDATABASE and loads the next one's live copies.
const switchCharacter = (name) => {
    const db = gga.PlayerDATABASE.h;
    const from = gga.UserInfo[0];
    for (const key of Object.keys(db[from].h)) if (key in gga) db[from].h[key] = structuredClone(gga[key]);
    for (const key of Object.keys(db[name].h)) if (key in gga) gga[key] = structuredClone(db[name].h[key]);
    gga.UserInfo[0] = name;
};

const OWL = "src/ui/pages/world-1/owl/owl.js";
const FEATHERS = "Feather Generation";

test("a saved value offers Undo beside its ✓, and Undo puts the old value back", async () => {
    const root = await openPage(OWL, rowLoaded(FEATHERS));
    const row = findRow(root, FEATHERS);
    const old = ola[254];
    await saveRow(row, 42);
    assert.equal(ola[254], 42);
    assert.ok(undoOffered(row), "Undo shows after the save");

    const action = await newest();
    assert.equal(action.label, "");
    assert.deepEqual(
        action.entries.map(({ path, before, after, character, undone }) => ({
            path,
            before,
            after,
            character,
            undone,
        })),
        [{ path: "OptionsListAccount[254]", before: old, after: 42, character: null, undone: false }]
    );

    await clickUndo(row);
    assert.match(saveState(row), /save-state--success/, "undoing shows the same ✓");
    assert.equal(ola[254], old);
    await until(() => text(byClass(row, "account-row__badge")[0]).includes(String(old)), "the row to show it");
    assert.equal(undoOffered(row), false, "nothing left to undo on the row");
    assert.equal((await newest()).entries[0].undone, true);
});

test("a bulk action is one action, and Undo all puts every value back", async () => {
    const cauldron = gga.CauldronInfo[4];
    const before = [...cauldron];
    const root = await openPage(
        "src/ui/pages/world-2/vials/vials.js",
        (node) => byClass(node, "account-row").length > 3
    );
    const setAll = byClass(root, "account-setall-row")[0];
    const [input] = elements(setAll).filter((node) => node.nodeName === "input");
    input.value = "7";
    input.listeners.input({ target: input });
    const [apply] = byClass(setAll, "account-btn");
    await apply.listeners.click({ preventDefault() {} });
    await until(() => cauldron.every((level) => level === 7), "SET ALL to land");

    const action = await newest();
    const changed = before.filter((level) => level !== 7).length;
    assert.equal(action.label, "");
    assert.equal(action.entries.length, changed, "one action holds every value it changed");
    assert.ok(action.entries.every((entry) => entry.path.startsWith("CauldronInfo[4][")));

    await undoAction(action.id);
    assert.deepEqual([...cauldron], before);
    assert.ok((await newest()).entries.every((entry) => entry.undone));
    await assert.rejects(undoAction(action.id), /already undone/);
});

test("a change made on one character goes back to that character while another is in play", async () => {
    const [first, second] = gga.GetPlayersUsernames;
    assert.equal(gga.UserInfo[0], first);
    const root = await openPage("src/ui/pages/account/player/player.js", rowLoaded("Mining level"));
    const row = findRow(root, "Mining level");
    const oldLevel = gga.Lv0[2];
    const oldExp = gga.Exp0[2];
    await saveRow(row, oldLevel + 5);

    const action = await newest();
    assert.deepEqual(
        action.entries.map(({ path, character, live }) => ({ path, character, live })),
        [
            { path: "Exp0[2]", character: first, live: true },
            { path: "ExpReq0[2]", character: first, live: true },
            { path: "Lv0[2]", character: first, live: true },
        ]
    );

    switchCharacter(second);
    const secondLevel = gga.Lv0[2];
    const secondExp = gga.Exp0[2];
    await clickUndo(row);
    assert.match(saveState(row), /save-state--success/);
    const saved = gga.PlayerDATABASE.h[first].h;
    assert.equal(saved.Lv0[2], oldLevel, "the first character's level is back");
    assert.equal(saved.Exp0[2], oldExp);
    assert.equal(gga.Lv0[2], secondLevel, "the character in play is untouched");
    assert.equal(gga.Exp0[2], secondExp);
    switchCharacter(first);
});

test("an undo refused because the game changed the value keeps the entry and says why", async () => {
    const root = await openPage(OWL, rowLoaded(FEATHERS));
    const row = findRow(root, FEATHERS);
    await saveRow(row, 31);
    ola[254] = 33; // the game moved on

    await clickUndo(row);
    assert.match(saveState(row), /save-state--error/);
    assert.match(saveState(row), /save-state--refused/, "the reason pulses");
    assert.equal(text(byClass(row, "save-state__label")[0]), "changed since: now 33");
    assert.equal(ola[254], 33, "nothing written");
    assert.equal((await newest()).entries[0].undone, false, "still in the log, still undoable");
});

test("an undo the game doesn't keep says so and stays in the log", async () => {
    const root = await openPage(OWL, rowLoaded(FEATHERS));
    const row = findRow(root, FEATHERS);
    await saveRow(row, 12);
    const kept = ola[254];
    Object.defineProperty(ola, 254, { get: () => kept, set() {}, configurable: true });
    try {
        await clickUndo(row);
        assert.equal(text(byClass(row, "save-state__label")[0]), "game kept the value");
        assert.equal((await newest()).entries[0].undone, false);
    } finally {
        Object.defineProperty(ola, 254, { value: kept, writable: true, configurable: true });
    }
});

test("an undo for a character whose saved entry is now in play goes to its live copy", async () => {
    const [first, second] = gga.GetPlayersUsernames;
    const { writeVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const old = gga.PlayerDATABASE.h[second].h.Lv0[2];
    await withAction({ label: "test" }, () => writeVerified(`PlayerDATABASE.h[${second}].h.Lv0[2]`, old + 3));
    const action = await newest();
    assert.equal(action.entries[0].character, second);

    switchCharacter(second);
    try {
        await undoAction(action.id);
        assert.equal(gga.Lv0[2], old, "the live copy, the one the game keeps for the character in play");
    } finally {
        switchCharacter(first);
    }
});

test("History lists the actions newest first, grouped, with old → new and Undo", async () => {
    const { History } = await importRepo("src/ui/components/views/History.js");
    store.app.activeTab = "history-tab";
    const root = History();
    const { actions } = await fetchChanges();
    await until(() => byClass(root, "change-group").length === actions.length, "History to list the log");

    const groups = byClass(root, "change-group");
    assert.ok(actions.length >= 5);
    const times = actions.map((action) => action.time);
    assert.deepEqual(
        times,
        [...times].sort((a, b) => b - a),
        "newest first"
    );
    assert.match(text(groups[0]), /Player/);
    const bulk = groups.find((group) => /CauldronInfo\[4\]/.test(text(group)));
    assert.match(text(bulk), /values/);
    assert.match(text(bulk), /undone/);
    const refused = groups.find((group) => /OptionsListAccount\[254\]/.test(text(group)) && /31/.test(text(group)));
    assert.match(text(refused), /31/);
    assert.match(text(refused), /→/);
    assert.equal(byClass(refused, "change-group__button")[0].attributes.hidden, false, "still undoable");
});

test("a character's undo is refused when who is in play can't be read", async () => {
    const [first] = gga.GetPlayersUsernames;
    const saved = gga.PlayerDATABASE.h[first].h;
    const savedBefore = saved.Lv0[2];
    await withAction({ label: "test" }, () => writeVerified("Lv0[2]", gga.Lv0[2] + 2));
    const action = await newest();
    assert.equal(action.entries[0].character, first);
    const live = gga.Lv0[2];
    saved.Lv0[2] = live; // the game copied the live value into the saved one
    const userInfo = gga.UserInfo;
    gga.UserInfo = null;
    try {
        await assert.rejects(undoAction(action.id), /can't tell who is in play/);
    } finally {
        gga.UserInfo = userInfo;
    }
    assert.equal(gga.Lv0[2], live);
    assert.equal(saved.Lv0[2], live, "its saved copy is untouched too");
    assert.equal((await newest()).entries[0].undone, false);
    saved.Lv0[2] = savedBefore;
});

test("a value saved to both copies of the character in play goes back as the live copy had it", async () => {
    const [first] = gga.GetPlayersUsernames;
    const saved = gga.PlayerDATABASE.h[first].h;
    const old = gga.Lv0[2];
    saved.Lv0[2] = old - 4; // the saved copy lags behind the live one
    // The saved copy first, as Prayers writes them.
    await withAction({ label: "test" }, () =>
        writeManyVerified([
            { path: `PlayerDATABASE.h[${first}].h.Lv0[2]`, value: old + 3 },
            { path: "Lv0[2]", value: old + 3 },
        ])
    );
    await undoAction((await newest()).id);
    assert.equal(gga.Lv0[2], old);
    saved.Lv0[2] = old;
});

test("an undo refuses a value the game changes between its check and its write", async () => {
    await withAction({ label: "test" }, () => writeVerified("OptionsListAccount[254]", 55));
    const action = await newest();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        if (String(url).endsWith("/game/gga/write-many")) ola[254] = 56; // the game moved on
        return realFetch(url, options);
    };
    try {
        await assert.rejects(undoAction(action.id), { message: "changed since" });
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.equal(ola[254], 56, "the game's value stays");
    assert.equal((await newest()).entries[0].undone, false, "still in the log");
});

test("a save key whose owner couldn't be read is asked about again", async () => {
    const { isLiveCharacterKey } = await importRepo("src/ui/services/changeLog.js");
    const [first] = gga.GetPlayersUsernames;
    const key = Object.keys(gga.PlayerDATABASE.h[first].h).find((name) => !/^(Lv0|Exp0|ExpReq0)$/.test(name));
    await isLiveCharacterKey(key, "Nobody").catch(() => {});
    assert.equal(await isLiveCharacterKey(key, first), true, "asked again, and it is the character's");
});

test("Undo all is offered once the bulk action's last batch landed", async () => {
    const { lastBulkAction } = await importRepo("src/ui/services/changeLog.js");
    const old = [ola[253], ola[254]];
    let made, offeredMidway;
    await withAction({ label: "two batches" }, async (action) => {
        made = action;
        await writeManyVerified([{ path: "OptionsListAccount[253]", value: 1 }]);
        offeredMidway = lastBulkAction.val?.action;
        await writeManyVerified([{ path: "OptionsListAccount[254]", value: 2 }]);
    });
    assert.notEqual(offeredMidway, made, "not while a batch is still to come");
    assert.equal(lastBulkAction.val?.action, made);
    assert.equal(made.entries, 2);
    [ola[253], ola[254]] = old;
});

test("Undo stays while it has focus, even after the pointer passed over it", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { SaveState, UNDO_MS, useAutoSave } = await importRepo("src/ui/components/views/account/autoSave.js");
    const save = useAutoSave({
        prepare: () => ({ write: () => writeVerified("OptionsListAccount[254]", ola[254] + 1) }),
    });
    await save.save();
    assert.ok(save.undo.offer.rawVal, "Undo is offered");
    const [button] = byClass(SaveState(save), "save-state__undo");
    try {
        button.listeners.focus({});
        button.listeners.mouseenter({});
        button.listeners.mouseleave({});
        t.mock.timers.tick(UNDO_MS);
        assert.ok(save.undo.offer.rawVal, "still there while it has focus");
        button.listeners.blur({});
        t.mock.timers.tick(UNDO_MS);
        assert.equal(save.undo.offer.rawVal, null, "gone once neither holds it");
    } finally {
        t.mock.timers.runAll(); // VanJS's own redraw timers
    }
});

test("a row's Undo shows the value the game got back, even when the row's copy was stale", async () => {
    const root = await openPage(OWL, rowLoaded(FEATHERS));
    const row = findRow(root, FEATHERS);
    ola[254] = 15; // the game changed it; the row still shows its last read
    await saveRow(row, 20);
    await clickUndo(row);
    assert.equal(ola[254], 15);
    await until(() => /\b15\b/.test(text(byClass(row, "account-row__badge")[0])), "the row to show 15");
});

test("Account Options' Undo shows the value the game got back, even when the row's copy was stale", async () => {
    const { AccountOptionsTab } = await importRepo("src/ui/components/views/account/AccountOptionsTab.js");
    const root = AccountOptionsTab();
    const optionRow = () => elements(root).find((node) => node.attributes["data-index"] === 254);
    await until(optionRow, "Account Options to load");
    const row = optionRow();
    const [wrapper] = byClass(row, "option-input-wrapper");
    const [field] = elements(wrapper).filter((node) => node.nodeName === "input");
    ola[254] = 15; // the game changed it; the row still shows its last read
    field.value = "20";
    field.listeners.input({ target: field });
    wrapper.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
    await until(() => ola[254] === 20 && undoOffered(row), "the save and its Undo");
    await clickUndo(row);
    assert.equal(ola[254], 15);
    await until(() => String(field.attributes.value) === "15", "the row to show 15");
});

test("a reload asked for while the page loads runs once that load ends", async () => {
    const { useAccountLoad } = await importRepo("src/ui/components/views/account/accountLoadPolicy.js");
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const { run } = useAccountLoad();
    let loads = 0;
    let finish;
    await run(async () => loads++);
    const slow = run(() => {
        loads++;
        return new Promise((resolve) => (finish = resolve));
    });
    reloadPlace.val = { view: "", page: "" }; // an undo elsewhere, while this page reads
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish();
    await slow;
    await until(() => loads === 3, "the reload after the load");
    finish();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(loads, 3, "once");
});

test("Undo stays with the tile or slot it saved: it goes when the fields move on to another", async () => {
    const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
    const { useAutoSave } = await importRepo("src/ui/components/views/account/autoSave.js");
    const selected = van.state("A");
    const save = useAutoSave({
        subject: () => selected.val,
        prepare: () => ({ write: () => writeVerified("OptionsListAccount[254]", ola[254] + 1) }),
    });
    await save.save();
    assert.ok(save.undo.offer.rawVal, "Undo for A");
    selected.val = "B";
    await until(() => save.undo.offer.rawVal === null, "A's Undo to go when B is picked");

    // Picking C saves B first (leaving B's field): that save lands while C is shown, so C gets no Undo for it.
    const landing = save.save();
    selected.val = "C";
    await landing;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(save.undo.offer.rawVal, null);
});

test("the research grid's Undo goes when another tile is picked", async () => {
    const tiles = (root) => byClass(root, "research-grid-tile").filter((tile) => tile.attributes.disabled === false);
    const root = await openPage("src/ui/pages/world-7/research/grid.js", (node) => tiles(node).length > 1);
    const card = () => byClass(root, "research-grid-detail__edit-row")[0];
    const [first, second] = tiles(root);
    first.listeners.click({});
    await until(card, "the tile's card");
    const [field] = elements(card()).filter((node) => node.nodeName === "input");
    await saveRow(card(), String(field.attributes.value) === "0" ? 1 : 0);
    assert.ok(undoOffered(card()), "Undo beside the save");
    second.listeners.click({});
    await until(() => !undoOffered(card()), "the other tile's card without that Undo");
});

test("Printer's reload after an undo elsewhere keeps an unsaved draft", async () => {
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const selects = (root) => elements(root).filter((node) => classes(node).includes("printer-item-select"));
    const root = await openPage("src/ui/pages/world-3/printer/printer.js", (node) => selects(node).length > 0);
    const [select] = selects(root);
    const draft = elements(select).find((node) => node.nodeName === "option" && node.attributes.value !== select.value)
        .attributes.value;
    select.value = draft;
    select.listeners.change({ target: select });

    const asked = requests.length;
    reloadPlace.val = { view: "", page: "" }; // an undo made in History
    await until(() => requests.length > asked, "the reload to read the game");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(select.value, draft, "the draft is still there");
});

test("History's Undo stays in place, marked busy, while it runs", async () => {
    const { History } = await importRepo("src/ui/components/views/History.js");
    await withAction({ label: "test" }, () => writeVerified("OptionsListAccount[254]", ola[254] + 1));
    store.app.activeTab = "history-tab";
    const root = History();
    const { actions } = await fetchChanges();
    await until(() => byClass(root, "change-group").length === actions.length, "History to list the log");
    const [button] = byClass(byClass(root, "change-group")[0], "change-group__button");
    const realFetch = globalThis.fetch;
    let release;
    const held = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (...args) => (await held, realFetch(...args));
    const undoing = button.listeners.click({});
    try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(button.attributes.hidden, false, "still there, so focus stays on it");
        assert.equal(button.attributes["aria-disabled"], "true");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await undoing;
    await until(() => button.attributes["aria-disabled"] === "false", "Undo to finish");
});
