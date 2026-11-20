// Values save when you press Enter or leave the field (issue #24): the real page modules on the fake game.
// Each save shows "saving…", then a ✓ once the game reads the value back, or why it failed with the typed
// value kept; rows with several fields save them together.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
const ola = game.gga.OptionsListAccount;

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

async function until(check, what) {
    for (let i = 0; i < 200; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};

async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root), `${file} to load`);
    return root;
}

const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
// The page shows its rows once it has read the game; until then its body is hidden.
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
const rowLoaded = (label) => (root) => Boolean(findRow(root, label)) && pageRead(root);

// What the player does, as the browser reports it.
const focus = (input) => input.listeners.focus?.({ target: input });
const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const press = (row, input, key) => row.listeners.keydown({ key, target: input, preventDefault() {} });
const leave = (row, input, to = null) => {
    input.listeners.blur?.({ target: input, relatedTarget: to });
    row.listeners.focusout({ target: input, currentTarget: row, relatedTarget: to });
};

// VanJS draws state changes on its next tick.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
// Hold the game's writes until released, to see a save while it runs.
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

const saveState = (row) => byClass(row, "save-state")[0];
const stateOf = (row) => /save-state--(\w+)/.exec(classes(saveState(row)))?.[1] ?? null;
// What the state says (Undo, beside it after a save, is its own button).
const words = (row) => text(byClass(row, "save-state__label")[0]);
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
const writesSince = (start) => requests.slice(start).filter((entry) => entry.includes("/write"));

const OWL = "src/ui/pages/world-1/owl/1-orion.js";

test("Enter saves the value, shows the read-back ✓ and keeps the field", async () => {
    const root = await openPage(OWL, rowLoaded("Feather Generation"));
    const row = findRow(root, "Feather Generation");
    const [input] = inputs(row);
    const start = requests.length;
    const release = holdWrites();
    focus(input);
    type(input, 42);
    press(row, input, "Enter");
    await tick();
    assert.equal(stateOf(row), "loading");
    assert.equal(words(row), "saving…");
    release();
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(ola[254], 42);
    assert.deepEqual(writesSince(start), ["POST /api/game/gga/write"]);
    // The ✓ means the value was read back: the field shows what the game now holds.
    assert.equal(words(row), "saved", "screen readers hear that it saved");
    assert.equal(input.value, "42");
    assert.notEqual(input.disabled, true, "the field stays usable, so it keeps focus");
});

test("leaving the field saves it", async () => {
    const root = await openPage(OWL, rowLoaded("Feather Multiplier"));
    const row = findRow(root, "Feather Multiplier");
    const [input] = inputs(row);
    focus(input);
    type(input, 17);
    leave(row, input);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(ola[256], 17);
});

test("a save the game doesn't keep shows why, and the typed value stays", async () => {
    const root = await openPage(OWL, rowLoaded("Feather Cheapener"));
    const row = findRow(root, "Feather Cheapener");
    const [input] = inputs(row);
    const restore = refuseWrites(ola, 257);
    try {
        focus(input);
        type(input, 7);
        press(row, input, "Enter");
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.equal(words(row), "game kept old value");
        assert.equal(input.value, "7", "what the player typed stays");
        assert.notEqual(ola[257], 7);
        assert.match(classes(row), /is-save-failed/);
    } finally {
        restore();
    }
});

test("Escape puts the stored value back and saves nothing", async () => {
    const root = await openPage(OWL, rowLoaded("Shiny Feathers"));
    const row = findRow(root, "Shiny Feathers");
    const [input] = inputs(row);
    const stored = String(ola[260]);
    const start = requests.length;
    focus(input);
    type(input, 999);
    press(row, input, "Escape");
    await tick();
    // This field binds its text to the draft; the test DOM records that binding as the value attribute.
    assert.equal(input.attributes.value, stored);
    leave(row, input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(writesSince(start), []);
    assert.equal(stateOf(row), null);
});

test("a value equal to the stored one doesn't save", async () => {
    const root = await openPage(OWL, rowLoaded("Super Feather Cheapener"));
    const row = findRow(root, "Super Feather Cheapener");
    const [input] = inputs(row);
    const start = requests.length;
    focus(input);
    type(input, ola[261]);
    press(row, input, "Enter");
    leave(row, input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(writesSince(start), []);
    assert.equal(stateOf(row), null);
});

test("a second edit while the first saves ends with the last value saved", async () => {
    const root = await openPage(OWL, rowLoaded("Super Feather Production"));
    const row = findRow(root, "Super Feather Production");
    const [input] = inputs(row);
    const start = requests.length;
    const release = holdWrites();
    focus(input);
    type(input, 10);
    press(row, input, "Enter");
    await tick();
    assert.equal(stateOf(row), "loading");
    type(input, 11);
    press(row, input, "Enter");
    release();
    await until(() => ola[259] === 11 && stateOf(row) === "success", "the second value to save");
    assert.equal(writesSince(start).length, 2);
    assert.equal(input.value, "11");
});

test("text that isn't a number shows why and doesn't save", async () => {
    const root = await openPage(OWL, rowLoaded("Feathers"));
    const row = findRow(root, "Feathers");
    const [input] = inputs(row);
    const start = requests.length;
    focus(input);
    type(input, "lots");
    leave(row, input);
    await tick();
    assert.equal(stateOf(row), "error");
    assert.equal(words(row), "not a number");
    assert.equal(input.value, "lots");
    assert.deepEqual(writesSince(start), []);
});

test("a value out of range shows the bound and doesn't save", async () => {
    const root = await openPage("src/ui/pages/world-1/anvil/anvil.js", rowLoaded("Money Points"));
    const row = findRow(root, "Money Points");
    const [input] = inputs(row);
    const start = requests.length;
    focus(input);
    type(input, 9999);
    press(row, input, "Enter");
    await tick();
    assert.equal(stateOf(row), "error");
    assert.equal(words(row), "max 600");
    assert.equal(input.value, "9999");
    assert.deepEqual(writesSince(start), []);
});

test("a row with several fields saves them together, once, when you leave the row", async () => {
    const kitchenRow = (root) => findRow(root, "Kitchen 1");
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js", (node) => Boolean(kitchenRow(node)));
    const row = kitchenRow(root);
    const [speed, fire] = inputs(row);
    const start = requests.length;
    focus(speed);
    type(speed, 31);
    // Moving to the row's next field keeps editing.
    leave(row, speed, fire);
    focus(fire);
    type(fire, 32);
    assert.deepEqual(writesSince(start), []);
    leave(row, fire);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.deepEqual(writesSince(start), ["POST /api/game/gga/write-many"]);
    assert.equal(game.gga.Cooking[0][6], 31);
    assert.equal(game.gga.Cooking[0][7], 32);
});

// CodeRabbit on #106: taking back the reason put the stored value back in the corrected field, so it never saved.
test("a refused draft fixed before moving to the row's next field keeps the fix and saves it", async () => {
    const kitchenRow = (root) => findRow(root, "Kitchen 2");
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js", (node) => Boolean(kitchenRow(node)));
    const row = kitchenRow(root);
    const [speed, fire] = inputs(row);
    focus(speed);
    type(speed, "");
    leave(row, speed, fire);
    focus(fire);
    await tick();
    assert.equal(words(row), "enter a number");
    leave(row, fire, speed);
    focus(speed);
    type(speed, 41);
    leave(row, speed, fire);
    focus(fire);
    await tick();
    assert.equal(stateOf(row), null, "the reason goes once it fits");
    assert.equal(String(speed.attributes.value), "41", "the fix stays");
    leave(row, fire);
    await until(() => game.gga.Cooking[1][6] === 41, "the fix to save");
});

test("passing through a field that shows a rounded value keeps the exact value", async () => {
    ola[253] = 1234567;
    const root = await openPage(OWL, rowLoaded("Feathers"));
    const row = findRow(root, "Feathers");
    const [input] = inputs(row);
    const start = requests.length;
    focus(input);
    assert.equal(input.value, "1.23M");
    press(row, input, "Enter");
    leave(row, input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(writesSince(start), []);
    assert.equal(ola[253], 1234567);
});

// Lumi's call (2026-11-20): Max all lowers a level above its max; − and + don't jump it there. On a level above its
// max, + leaves it and − takes one off.
test("on a level above its max, + leaves it and − takes one off", async () => {
    const cap = Number(game.gga.CustomLists.h.SaltLicks[0][4]);
    game.gga.SaltLick[0] = cap + 5;
    const root = await openPage("src/ui/pages/world-3/salt-lick/salt-lick.js", (page) => {
        const row = byClass(page, "account-row")[0];
        return row && text(byClass(row, "account-row__badge")[0]).includes(`LV ${cap + 5}`);
    });
    const row = byClass(root, "account-row")[0];
    const [input] = inputs(row);
    const step = (label) =>
        elements(row)
            .find((node) => node.nodeName === "button" && node.attributes["aria-label"] === label)
            .listeners.click({ preventDefault() {}, currentTarget: null });
    focus(input);
    step("Raise");
    press(row, input, "Enter");
    await tick();
    await tick();
    assert.equal(game.gga.SaltLick[0], cap + 5, "+ leaves it");
    step("Lower");
    press(row, input, "Enter");
    await settled(row);
    assert.equal(game.gga.SaltLick[0], cap + 4, "− takes one off");
    game.gga.SaltLick[0] = 0;
});
