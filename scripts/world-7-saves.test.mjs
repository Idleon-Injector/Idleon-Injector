// World 7 page saves on the fake game: a save writes only what the player changed and keeps what the game did
// since the page read; a read that crosses a save doesn't bring back the old value; a failed save shows what
// the game holds.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
// The caves page keeps its scroll place on the next frame.
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
// Sushi Tools polls the game's status while it is open; that timer may not keep the test alive.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { Research, Spelunk, Sushi, Menagerie } = game.gga;

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
// The picked square of a board (BoardEditor): its row, the ones picked before kept hidden.
const openSquareOf = (root) =>
    byClass(root, "board-editor__square").find((square) => !square.attributes.hidden) ??
    byClass(root, "board-editor")[0];
const inputs = (row) => elements(row).filter((node) => node.nodeName === "input");
const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const writesSince = (start) => requests.slice(start).filter((entry) => entry.includes("/write"));

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

// What the player does, as the browser reports it: blur on the field, then focusout bubbling to the row.
const fire = (node, kind, event) =>
    (node.handlers[kind] ?? []).filter((handler) => typeof handler === "function").forEach((handler) => handler(event));
const focus = (input) => fire(input, "focus", { target: input });
const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const press = (row, input, key) => row.listeners.keydown({ key, target: input, preventDefault() {} });
const leave = (row, input, to = null) => {
    fire(input, "blur", { target: input, relatedTarget: to });
    fire(row, "focusout", { target: input, currentTarget: row, relatedTarget: to });
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0] ?? { attributes: {} }))?.[1];
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
// Hold requests whose URL has `part` until released.
const hold = (part) => {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes(part)) await gate;
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

const OBSERVATIONS = "src/ui/pages/world-7/research/observations.js";
// An observation's line: its Insight Lv and Insight EXP fields, then its Unlocked switch.
const observationTiles = (root) =>
    byClass(root, "account-row").filter((row) => elements(row).some((node) => node.attributes.role === "switch"));

test("Observations: leaving Insight Lv or Insight EXP saves what was typed", async () => {
    const root = await openPage(OBSERVATIONS, (node) => observationTiles(node).length > 3);
    const tile = observationTiles(root)[1];
    const [level, exp] = inputs(tile);
    focus(level);
    type(level, 42);
    leave(tile, level);
    await settled(tile);
    assert.equal(Research[4][1], 42);

    // Typed in EXP, then Tab to Insight Lv and out of the tile.
    focus(exp);
    type(exp, 777);
    leave(tile, exp, level);
    focus(level);
    leave(tile, level);
    await until(() => Research[3][1] === 777, "the EXP to save");
    assert.equal(exp.attributes.value, "777");
});

test("Observations: saving Insight Lv keeps the Insight EXP the game gained since the page read", async () => {
    const root = await openPage(OBSERVATIONS, (node) => observationTiles(node).length > 3);
    const tile = observationTiles(root)[2];
    const [level] = inputs(tile);
    Research[3][2] = 99999;
    const start = requests.length;
    focus(level);
    type(level, 3);
    press(tile, level, "Enter");
    await settled(tile);
    assert.equal(stateOf(tile), "success");
    assert.equal(Research[4][2], 3);
    assert.equal(Research[3][2], 99999, "the EXP the game gained stays");
    assert.equal(writesSince(start).length, 1, "only Insight Lv is written");
});

test("Sushi General: picking Perfect keeps the knowledge XP and level the game gained since the page read", async () => {
    // The game keeps one value per tier here (src/cheats/cheats/sushi/knowledge.js).
    Sushi[6] = Array.from({ length: 20 }, (_, i) => i * 100);
    Sushi[7] = Array.from({ length: 20 }, (_, i) => i % 7);
    const tierRows = (root) => byClass(root, "account-row").filter((row) => text(row).includes("Tier "));
    const root = await openPage("src/ui/pages/world-7/sushi-station/1-general.js", (node) => tierRows(node).length > 3);
    const row = tierRows(root)[2];
    const step = (label) =>
        elements(row).find((node) => node.attributes.role === "radio" && text(node).trim() === label);
    const picked = () =>
        elements(row).find((node) => node.attributes.role === "radio" && node.attributes["aria-checked"] === "true");
    await until(() => picked(), "the sushi to show the game's state");
    Sushi[6][2] = 987654;
    Sushi[7][2] = 9;
    const next = Sushi[5][2] === 1 ? 0 : 1;
    step(next === 1 ? "Perfect" : "Unlocked").listeners.click({});
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(Sushi[5][2], next);
    assert.equal(Sushi[6][2], 987654, "the XP the game gained stays");
    assert.equal(Sushi[7][2], 9, "the level the game gained stays");
});

// Station: a slot picked opens its row under the board, its tier field there.
const STATION = "src/ui/pages/world-7/sushi-station/2-station.js";
const stationSlots = (root) => byClass(root, "sushi-station-tile");
// Read once a slot can be picked: until then every slot is one not unlocked.
const stationRead = (root) => stationSlots(root).some((slot) => slot.attributes.disabled === false);
const openSlot = async (root, index) => {
    stationSlots(root)[index].listeners.click({});
    const row = () => byClass(openSquareOf(root), "account-row")[0];
    await until(row, "the slot's row");
    return row();
};

test("Sushi Station: a slot save the game refuses says why beside the field, and the game keeps its tier", async () => {
    const root = await openPage(STATION, stationRead);
    const row = await openSlot(root, 1);
    const [field] = inputs(row);
    const shown = String(Sushi[0][1] + 1);
    await until(() => field.attributes.value === shown, "the field to show the slot's tier");
    const restore = refuseWrites(Sushi[0], 1);
    try {
        focus(field);
        type(field, Number(shown) + 1);
        leave(row, field);
        await settled(row);
        assert.equal(stateOf(row), "error", "the row says it wasn't saved");
        assert.notEqual(text(byClass(row, "save-state__label")[0]).trim(), "", "and why, beside the field");
        assert.equal(String(Sushi[0][1] + 1), shown, "the game keeps its tier");
    } finally {
        restore();
    }
});

// Review of #125: the earlier save, ending, put its tier over the one the player had typed since.
test("Sushi Station: a tier typed while the last one saves stays in the field", async () => {
    Sushi[0][2] = 1; // tier 2
    const root = await openPage(STATION, stationRead);
    const row = await openSlot(root, 2);
    const [field] = inputs(row);
    await until(() => field.attributes.value === "2", "the field to show tier 2");
    const release = hold("/write");
    try {
        focus(field);
        type(field, 1);
        leave(row, field);
        focus(field);
        type(field, 2);
    } finally {
        release();
    }
    await until(() => Sushi[0][2] === 0, "tier 1 to save");
    await tick();
    assert.equal(field.attributes.value, "2", "the field keeps the tier typed since");
    leave(row, field);
    await until(() => Sushi[0][2] === 1, "the tier typed since to save on leaving");
});

test("Research Grid: Refresh while a level saves keeps the typed level, and leaving again writes nothing", async () => {
    const GRID = "src/ui/pages/world-7/research/grid.js";
    const tiles = (root) => byClass(root, "research-grid-tile").filter((tile) => tile.attributes.disabled === false);
    const root = await openPage(GRID, (node) => tiles(node).length > 3);
    // A square picked opens its row under the board.
    const card = () => byClass(openSquareOf(root), "account-row")[0];
    const tile = tiles(root)[3];
    tile.listeners.click({});
    await until(card, "the square's row");
    const index = Number(tile.attributes["data-square"]);
    const max = Number(game.gga.CustomLists.h.ResGridSquares[index][1]);
    const next = Research[0][index] === max ? 0 : max;
    const [field] = inputs(card());

    focus(field);
    type(field, next);
    const release = hold("/write");
    leave(card(), field);
    // Refresh reads the game while the save's write waits.
    await buttonNamed(root, "Refresh").listeners.click({ preventDefault() {} });
    release();
    await settled(card());
    assert.equal(Research[0][index], next);
    assert.equal(field.attributes.value, String(next), "the field keeps the saved level");

    const start = requests.length;
    focus(field);
    leave(card(), field);
    await tick();
    assert.deepEqual(writesSince(start), [], "leaving the untouched field writes nothing");
    assert.equal(Research[0][index], next);
});

test("Sushi Tools: Refresh during a settings save keeps the typed setting, and the next save doesn't undo it", async () => {
    const status = { enabled: false, maxPurchaseTier: 70, maxTier: 70, working: [], reserved: [], message: "Idle" };
    router.post("/api/toggle", async (req, res) => res.json({ ok: true, message: JSON.stringify(status) }));
    const root = (await importRepo("src/ui/pages/automation/sushi-station/sushi-station.js")).default.component();
    root.offsetParent = null; // off screen: no status polling
    const field = (title) => elements(root).find((node) => node.attributes["aria-label"] === title);
    await until(() => buttonNamed(root, "Enable Auto Play")?.attributes.disabled === false, "the tab to load");
    const tier = field("Purchase tier");
    let section = tier;
    while (!section.listeners.focusout) section = section.parentNode;
    const { fetchConfig } = await importRepo("src/ui/services/api.js");
    const savedTier = async () => (await fetchConfig()).cheatConfig.w7.sushitools.tier;
    const next = (await savedTier()) === 3 ? 4 : 3;

    type(tier, next);
    const release = hold("/config/save");
    leave(section, tier);
    await buttonNamed(root, "Refresh").listeners.click({ preventDefault() {} });
    release();
    // Each setting says its own save on its row.
    const saidOn = (input) => {
        let row = input;
        while (!byClass(row, "save-state__label").length) row = row.parentNode;
        return text(byClass(row, "save-state__label")[0]);
    };
    await until(() => saidOn(tier) === "saved", "the settings to save");
    assert.equal(await savedTier(), next);
    assert.equal(tier.attributes.value, String(next), "the field keeps the saved setting");

    const chain = field("Extended East Wind chain");
    const releaseToggle = hold("/config/save");
    chain.listeners.change({ target: { checked: !chain.attributes.checked } });
    await until(() => saidOn(chain) === "saving…", "the toggle to save");
    releaseToggle();
    await until(() => saidOn(chain) === "saved", "the toggle save to finish");
    assert.equal(await savedTier(), next, "the toggle's save keeps the tier");
});

const MENAGERIE = "src/ui/pages/world-7/menagerie/menagerie.js";
const menagerieRead = (node) => Boolean(findRow(node, "Lumi balance"));
// The unlocks are the page's switches, in the game's order.
const unlockRow = (root, n) =>
    byClass(root, "account-row").filter((row) => elements(row).some((node) => node.attributes.role === "switch"))[n];

test("Menagerie: fields stay usable while a save runs, and a second Enter saves too", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    const rank = findRow(root, "Shell rank");
    const exp = findRow(root, "Unspent Shell EXP");
    const [rankField] = inputs(rank);
    const [expField] = inputs(exp);
    focus(rankField);
    type(rankField, 77);
    const release = hold("/write");
    press(rank, rankField, "Enter");
    await tick();
    assert.equal(rankField.attributes.disabled, false, "the field the player saved stays usable");
    assert.equal(expField.attributes.disabled, false, "the other fields stay usable");
    focus(expField);
    type(expField, 1234);
    press(exp, expField, "Enter");
    release();
    await settled(rank);
    await settled(exp);
    assert.equal(stateOf(rank), "success");
    assert.equal(stateOf(exp), "success");
    assert.equal(Menagerie[0][2], 77);
    assert.equal(Menagerie[0][1], 1234);
});

test("Menagerie: a save made while another runs offers its Undo beside its row too", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    const rank = findRow(root, "Shell rank");
    const exp = findRow(root, "Unspent Shell EXP");
    const [rankField] = inputs(rank);
    const [expField] = inputs(exp);
    const undoShown = (row) => byClass(row, "save-state__undo")[0]?.attributes.hidden === false;
    focus(rankField);
    type(rankField, Menagerie[0][2] === 55 ? 56 : 55);
    const release = hold("/write");
    try {
        press(rank, rankField, "Enter");
        await tick();
        focus(expField);
        type(expField, Menagerie[0][1] === 4321 ? 4322 : 4321);
        press(exp, expField, "Enter");
    } finally {
        release();
    }
    await until(() => undoShown(rank), "the first save's Undo");
    await until(() => undoShown(exp), "the second save's Undo");
});

test("Menagerie: switching an unlock off takes back the line saying all were saved", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    const line = () => byClass(root, "account-write-feedback").find((node) => text(node).includes("All 25"));
    await buttonNamed(root, "Unlock all").listeners.click({ preventDefault() {} });
    await until(line, "the bulk line");
    const row = unlockRow(root, 3);
    await until(() => inputs(row)[0].attributes.disabled === false, "the page to read again");
    inputs(row)[0].listeners.change({ target: { checked: false } });
    await until(() => Menagerie[2][3] === 0, "the unlock to switch off");
    assert.equal(line(), undefined);
});

// The line beside Unlock all, not a switch's own saving/saved read-out inside its row.
const unlockLine = (root) => {
    const inRows = new Set(byClass(root, "account-row").flatMap((row) => elements(row)));
    return byClass(root, "account-write-feedback")
        .filter((node) => !inRows.has(node))
        .map(text)
        .join("");
};

test("Menagerie: an unlock switched off while Unlock all saves doesn't leave 'All 25 unlocks saved.'", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    for (let i = 0; i < 25; i++) Menagerie[2][i] = i === 3 ? 1 : 0;
    await buttonNamed(root, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => inputs(unlockRow(root, 3))[0].attributes.checked === true, "unlock #3 to show On");
    const release = hold("/write");
    try {
        buttonNamed(root, "Unlock all").listeners.click({ preventDefault() {} });
        await until(() => unlockLine(root) === "Saving…", "Unlock all to start");
        inputs(unlockRow(root, 3))[0].listeners.change({ target: { checked: false } });
    } finally {
        release();
    }
    await until(
        () => unlockLine(root) !== "Saving…" && buttonNamed(root, "Unlock all").attributes.disabled === false,
        "both saves to finish"
    );
    assert.equal(Menagerie[2][3], 0);
    assert.equal(unlockLine(root), "");
});

test("Menagerie: Undo all after Unlock all takes back 'All 25 unlocks saved.'", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    for (let i = 0; i < 25; i++) Menagerie[2][i] = 0;
    const { lastBulkAction } = await importRepo("src/ui/services/changeLog.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    lastBulkAction.val = null;
    buttonNamed(root, "Unlock all").listeners.click({ preventDefault() {} });
    await until(() => unlockLine(root) === "All 25 unlocks saved." && lastBulkAction.val, "Unlock all to save");
    await undoAction(lastBulkAction.val.action.id);
    await until(() => inputs(unlockRow(root, 3))[0].attributes.checked === false, "the page to read the undo");
    assert.equal(Menagerie[2][3], 0);
    assert.equal(unlockLine(root), "");
});

// Caves: every object with a Discovered switch (the Hat Rack's way). A flip is a click: the change log hears it first.
const CAVES = "src/ui/pages/world-7/spelunking/1-caves.js";
const { startChangeLog } = await importRepo("src/ui/services/changeLog.js");
const { default: appStore } = await importRepo("src/ui/state/store.js");
const clicks = globalThis.document.createElement("div");
startChangeLog(appStore.app, clicks);
const switchOf = (row) => elements(row).find((node) => node.attributes.role === "switch");
const objectRows = (root) => byClass(root, "account-row").filter((row) => switchOf(row));
const objectRow = (root, id) =>
    objectRows(root).find((row) => text(byClass(row, "account-row__name")[0]) === id.replace(/_/g, " "));
const flip = (row, on) => {
    clicks.listeners.pointerdown({ target: switchOf(row) });
    return switchOf(row).listeners.change({ target: { checked: on } });
};
const wordsOf = (row) => text(byClass(row, "state-switch__words")[0]);
const cavesRead = (node) => objectRows(node).length > 3;

test("Spelunking Caves: switching an object off takes it off the game's list at once", async () => {
    const root = await openPage(CAVES, cavesRead);
    const read = [...Spelunk[6]];
    await flip(objectRow(root, read[0]), false);
    await until(() => Spelunk[6].length === read.length - 1, "the object to come off");
    assert.equal(Spelunk[6].includes(read[0]), false);
    assert.deepEqual([...Spelunk[6]], read.slice(1), "the others stay");
    Spelunk[6] = read;
});

test("Spelunking Caves: discovering and taking off keep objects the game destroyed since the page read", async () => {
    const root = await openPage(CAVES, cavesRead);
    const read = [...Spelunk[6]];
    const off = objectRows(root).find((row) => wordsOf(row) === "");
    Spelunk[6].push("Rock_5_1");
    await flip(off, true);
    await until(() => Spelunk[6].length === read.length + 2, "the object to be added");
    assert.ok(Spelunk[6].includes("Rock_5_1"), "the switch keeps the game's new object");

    Spelunk[6].push("Rock_6_2");
    const first = Spelunk[6][0];
    await flip(objectRow(root, first), false);
    await until(() => !Spelunk[6].includes(first), "the first object to come off");
    assert.ok(Spelunk[6].includes("Rock_6_2"), "taking one off keeps the game's new object");
    Spelunk[6] = read;
});

test("Spelunking Caves: a refused switch goes back and says why on its row", async () => {
    const root = await openPage(CAVES, cavesRead);
    const before = [...Spelunk[6]];
    const row = objectRow(root, before[0]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/write")) return realFetch(url, options);
        Spelunk[6].push("Rock_7_3"); // the game destroyed another object meanwhile
        return new Response(JSON.stringify({ error: "the game refused" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    const realError = console.error;
    console.error = () => {};
    try {
        await flip(row, false);
        await until(() => !["Discovered", ""].includes(wordsOf(row)), "the refusal to show");
    } finally {
        globalThis.fetch = realFetch;
        console.error = realError;
    }
    assert.ok(objectRows(root).includes(row), "the row that asked is still on the page");
    assert.ok(Spelunk[6].includes(before[0]), "the object is still on the game's list");
    Spelunk[6] = before;
});

test("Spelunking Caves: a switch the game no longer needs writes nothing", async () => {
    const root = await openPage(CAVES, cavesRead);
    const before = [...Spelunk[6]];
    const start = requests.length;
    const row = objectRow(root, before[0]);
    Spelunk[6] = before.slice(1); // the game no longer lists it
    await flip(row, false);
    const off = objectRows(root).find((other) => wordsOf(other) === "");
    const id = text(byClass(off, "account-row__name")[0]).replace(/ /g, "_");
    Spelunk[6] = [...Spelunk[6], id]; // the game destroyed it meanwhile
    await flip(off, true);
    assert.deepEqual(writesSince(start), [], "nothing was written");
    Spelunk[6] = before;
});

test("Spelunking Caves: Add all discovers every object left in one write, and keeps the game's", async () => {
    const root = await openPage(CAVES, cavesRead);
    const before = [...Spelunk[6]];
    const start = requests.length;
    await buttonNamed(root, "Add all").listeners.click({ preventDefault() {} });
    await until(
        () => objectRows(root).every((row) => wordsOf(row) === "Discovered"),
        "every object to show discovered"
    );
    assert.deepEqual([...Spelunk[6]].slice(0, before.length), before, "the game's own stay first");
    assert.equal(writesSince(start).length, 1, "one write");
    Spelunk[6] = before;
});
