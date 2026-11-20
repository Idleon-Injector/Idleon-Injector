// What a field shows after the game changed under it: a save that failed part way, or a reload while the field has
// focus. The real page modules on the fake game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);

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

async function until(check, what) {
    for (let i = 0; i < 200; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

async function openPage(file, label) {
    const root = (await importRepo(file)).default.component();
    await until(() => Boolean(findRow(root, label)), `${file} to load`);
    return root;
}

// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};

// Settles once the page has read the game again after a write (its own read, not the change log's), and drawn what
// it read.
const readAfterWrite = () => {
    const realFetch = globalThis.fetch;
    let wrote = false;
    let done = false;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (String(url).includes("/write")) wrote = true;
        else if (wrote && String(url).endsWith("/gga/read")) {
            globalThis.fetch = realFetch;
            setTimeout(() => (done = true), 0);
        }
        return response;
    };
    return {
        landed: () => until(() => done, "the page to read the game again"),
        stop: () => (globalThis.fetch = realFetch),
    };
};

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
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0]))?.[1] ?? null;
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
// This field binds its text to the draft; the test DOM records that binding as the value attribute.
const shown = (input) => String(input.attributes.value);
// VanJS draws state changes on its next tick.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const clickRefresh = (root) =>
    elements(root)
        .find((node) => node.nodeName === "button" && text(node).trim() === "Refresh")
        .listeners.click({ preventDefault() {} });

// Sweep shared-blocks-1: Escape put back the value from before the half-done save, and the next save wrote it.
test("after a save the game took only part of, Escape and the next save start from what the game holds", async () => {
    const kitchen = game.gga.Cooking[0];
    [kitchen[6], kitchen[7], kitchen[8]] = [80, 27, 53];
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js", "Kitchen 1");
    const row = findRow(root, "Kitchen 1");
    const [speed, fire, luck] = inputs(row);
    const restore = refuseWrites(kitchen, 7);
    const reread = readAfterWrite();
    try {
        focus(speed);
        type(speed, 90);
        leave(row, speed, fire);
        focus(fire);
        type(fire, 40);
        press(row, fire, "Enter");
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.deepEqual([kitchen[6], kitchen[7]], [90, 27], "the game took Speed but kept Fire");
        await reread.landed();
        press(row, fire, "Escape");
        await tick();
        assert.equal(shown(speed), "90", "Escape shows the Speed the game now holds");
        assert.equal(shown(fire), "27");
    } finally {
        reread.stop();
        restore();
    }
    const start = requests.length;
    leave(row, fire, luck);
    focus(luck);
    type(luck, 60);
    press(row, luck, "Enter");
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(requests.slice(start).filter((entry) => entry.includes("/write")).length, 1);
    assert.deepEqual([kitchen[6], kitchen[7], kitchen[8]], [90, 27, 60], "Speed isn't put back to 80");
});

// Review of #115: with History down, the half-done save wasn't counted, so the page kept the old Speed.
test("a save the game took part of reads the game again even when History can't log it", async () => {
    const kitchen = game.gga.Cooking[0];
    [kitchen[6], kitchen[7], kitchen[8]] = [10, 27, 53];
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js", "Kitchen 1");
    await tick();
    const row = findRow(root, "Kitchen 1");
    const [speed, fire] = inputs(row);
    const restore = refuseWrites(kitchen, 7);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (url, options) =>
        options?.method === "POST" && String(url).endsWith("/changes")
            ? Promise.reject(new TypeError("History is down"))
            : realFetch(url, options);
    const reread = readAfterWrite();
    try {
        focus(speed);
        type(speed, 90);
        leave(row, speed, fire);
        focus(fire);
        type(fire, 40);
        press(row, fire, "Enter");
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.equal(kitchen[6], 90, "the game took Speed");
        await reread.landed();
        press(row, fire, "Escape");
        await tick();
        assert.equal(shown(speed), "90", "Escape shows the Speed the game now holds");
    } finally {
        reread.stop();
        globalThis.fetch = realFetch;
        restore();
    }
});

// A reload rebuilds the rows on some pages (Upgrade Vault), which took the reason and the typed value away.
test("a save the game refused outright keeps its reason and the typed value, and reads nothing again", async () => {
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const root = await openPage("src/ui/pages/account/upgrade-vault/upgrade-vault.js", "Ember Bramble");
    const row = findRow(root, "Ember Bramble");
    const [input] = inputs(row);
    const restore = refuseWrites(game.gga.UpgVault, 1);
    const before = reloadPlace.rawVal;
    try {
        focus(input);
        type(input, 77);
        press(row, input, "Enter");
        await settled(row);
    } finally {
        restore();
    }
    assert.equal(stateOf(row), "error");
    assert.equal(reloadPlace.rawVal, before, "nothing was saved, so the page isn't read again");
    await tick();
    assert.equal(findRow(root, "Ember Bramble"), row, "the row is still the one the player typed in");
    assert.equal(stateOf(row), "error");
    assert.equal(input.value, "77");
});

// The reload of a save that never reached the game failed too, and opened the page's READ FAILED panel.
test("a save that never reached the game doesn't read the page again", async () => {
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js", "Kitchen 2");
    const row = findRow(root, "Kitchen 2");
    const [speed] = inputs(row);
    const before = reloadPlace.rawVal;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        throw new TypeError("Failed to fetch");
    };
    try {
        focus(speed);
        type(speed, 91);
        press(row, speed, "Enter");
        await settled(row);
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.equal(stateOf(row), "error");
    assert.equal(reloadPlace.rawVal, before);
});

// Sweep shared-blocks-2: a field with focus kept its old value through a reload, and + stepped from it.
test("a reload shows the new value in a field that has focus but no edit, and + steps from it", async () => {
    const ola = game.gga.OptionsListAccount;
    ola[254] = 3;
    const root = await openPage("src/ui/pages/world-1/owl/1-orion.js", "Feather Generation");
    const row = findRow(root, "Feather Generation");
    const [input] = inputs(row);
    focus(input);
    ola[254] = 60;
    clickRefresh(root);
    await until(() => shown(input) === "60", "the field to show the reloaded value");
    const plus = elements(row).find((node) => node.nodeName === "button" && node.attributes["aria-label"] === "Raise");
    plus.listeners.click({ target: plus, preventDefault() {} });
    press(row, input, "Enter");
    await settled(row);
    assert.equal(ola[254], 61, "+ stepped from the value the game holds, not the one from before the reload");
});

// A focused sigil choice kept its old tier through Set all, so the next arrow key saved a tier stepped from that.
test("a focused choice shows the tier Set all gave it", async () => {
    const tiers = game.gga.CauldronP2W[4];
    tiers[1] = 0;
    const root = (await importRepo("src/ui/pages/world-2/sigils/sigils.js")).default.component();
    const card = () => byClass(root, "tier-card").find((node) => text(byClass(node, "tier-card__index")[0]) === "#0");
    await until(() => card() && text(byClass(card(), "tier-card__badge")[0]) === "UNLOCKED", "the sigils to load");
    const choice = elements(card()).find((node) => node.nodeName === "select");
    const chosen = () => {
        const picked = elements(choice).find((node) => {
            const selected = node.attributes.selected;
            return node.nodeName === "option" && (typeof selected === "function" ? selected() : selected);
        });
        return picked ? text(picked) : null;
    };
    focus(choice);
    byClass(root, "account-setall-row__select")[0].listeners.change({ target: { value: "4" } });
    const setAll = elements(root).find((node) => node.nodeName === "button" && text(node).trim() === "Set all");
    await setAll.listeners.click({ target: setAll, preventDefault() {} });
    await until(() => tiers[1] === 4, "Set all to save");
    await until(() => chosen() === "ECLECTIC", "the focused choice to show ECLECTIC");
});

// A field that shows a rounded value ("1.23M") keeps the exact value behind it when you leave it unedited, also when
// a reload changed that value while the field had focus.
test("leaving a rounded field the reload changed while it had focus saves nothing", async () => {
    const ola = game.gga.OptionsListAccount;
    ola[253] = 1234567;
    const root = await openPage("src/ui/pages/world-1/owl/1-orion.js", "Feathers");
    const row = findRow(root, "Feathers");
    const [input] = inputs(row);
    await until(() => input.value === "1.23M", "the page to show the value");
    focus(input);
    ola[253] = 2345678;
    clickRefresh(root);
    await until(() => input.value === "2.35M", "the field to show the reloaded value");
    const start = requests.length;
    leave(row, input);
    await tick();
    assert.deepEqual(
        requests.slice(start).filter((entry) => entry.includes("/write")),
        [],
        "no rounded copy is written"
    );
    assert.equal(ola[253], 2345678);
});
