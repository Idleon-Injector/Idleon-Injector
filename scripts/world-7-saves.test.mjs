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
const observationTiles = (root) => byClass(root, "observation-tile");

test("Observations: leaving Insight Lv or Insight EXP saves what was typed", async () => {
    const root = await openPage(OBSERVATIONS, (node) => observationTiles(node).length > 3);
    const tile = observationTiles(root)[1];
    const [, level, exp] = inputs(tile);
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
    const [, level] = inputs(tile);
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

test("Sushi General: saving Perfect keeps the knowledge XP and level the game gained since the page read", async () => {
    // The game keeps one value per tier here (src/cheats/cheats/sushi/knowledge.js).
    Sushi[6] = Array.from({ length: 20 }, (_, i) => i * 100);
    Sushi[7] = Array.from({ length: 20 }, (_, i) => i % 7);
    const tierRows = (root) => byClass(root, "account-row").filter((row) => text(row).includes("TIER"));
    const root = await openPage("src/ui/pages/world-7/sushi-station/1-general.js", (node) => tierRows(node).length > 3);
    const row = tierRows(root)[2];
    const [perfect] = inputs(row);
    await until(() => perfect.attributes.value === String(Sushi[5][2]), "the tier to show the game's values");
    Sushi[6][2] = 987654;
    Sushi[7][2] = 9;
    const next = Sushi[5][2] === 1 ? 0 : 1;
    focus(perfect);
    type(perfect, next);
    press(row, perfect, "Enter");
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(Sushi[5][2], next);
    assert.equal(Sushi[6][2], 987654, "the XP the game gained stays");
    assert.equal(Sushi[7][2], 9, "the level the game gained stays");
});

test("Sushi Station: a slot save the game refuses shows the game's tier again and says why", async () => {
    const tiles = (root) => byClass(root, "sushi-station-tile");
    const root = await openPage(
        "src/ui/pages/world-7/sushi-station/2-station.js",
        (node) => tiles(node).length > 10 && inputs(tiles(node)[1])[0].attributes.value === String(Sushi[0][1] + 1)
    );
    const tile = tiles(root)[1];
    const [field] = inputs(tile);
    const shown = field.attributes.value;
    const restore = refuseWrites(Sushi[0], 1);
    try {
        field.listeners.focus({ target: field });
        field.value = String(Number(shown) + 1);
        field.listeners.input({ target: field });
        field.listeners.blur({ target: field });
        const region = () =>
            elements(globalThis.document.body).find((node) => node.attributes.role === "status")?.textContent ?? "";
        await until(() => region().startsWith("Slot 1 not saved"), "the failure to be said");
        await until(() => field.attributes.value === shown, "the field to show the game's tier");
    } finally {
        restore();
    }
});

test("Research Grid: Refresh while a level saves keeps the typed level, and leaving again writes nothing", async () => {
    const GRID = "src/ui/pages/world-7/research/grid.js";
    const tiles = (root) => byClass(root, "research-grid-tile").filter((tile) => tile.attributes.disabled === false);
    const root = await openPage(GRID, (node) => tiles(node).length > 3);
    const card = () => byClass(root, "research-grid-detail__edit-row")[0];
    tiles(root)[3].listeners.click({});
    await until(card, "the tile's card");
    const index = Number(/Tile (\d+)/.exec(text(byClass(root, "research-grid-detail__index")[0]))[1]) - 1;
    const max = Number(/\/ (\d+)/.exec(text(byClass(root, "research-grid-detail__preview-level")[0]))[1]);
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

test("Spelunking Caves: Add and Remove keep objects the game destroyed since the page read", async () => {
    const removeButtons = (root) =>
        elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === "Remove");
    const root = await openPage("src/ui/pages/world-7/spelunking/1-caves.js", (node) => removeButtons(node).length > 0);
    const read = [...Spelunk[6]];
    Spelunk[6].push("Rock_5_1");
    await buttonNamed(root, "Add").listeners.click({ preventDefault() {} });
    await until(() => Spelunk[6].length === read.length + 2, "the object to be added");
    assert.ok(Spelunk[6].includes("Rock_5_1"), "Add keeps the game's new object");
    await until(
        () => removeButtons(root).length === Spelunk[6].length && removeButtons(root)[0].attributes.disabled === false,
        "the page to show the game's list"
    );

    Spelunk[6].push("Rock_6_2");
    const first = Spelunk[6][0];
    await removeButtons(root)[0].listeners.click({ preventDefault() {} });
    await until(() => !Spelunk[6].includes(first), "the first object to be removed");
    assert.ok(Spelunk[6].includes("Rock_6_2"), "Remove keeps the game's new object");
    assert.equal(removeButtons(root).length, Spelunk[6].length);
});
