// Bulk removals ask in place (#25): the first click only arms "Click again" and writes nothing; bulk additions run
// on one click.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// The tooltip that says "Click again to …" places itself on the next frame.
globalThis.requestAnimationFrame = () => {};
const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
// The question is read out once, from a live region on the page.
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const buttonsNamed = (root, label) =>
    elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === label);
// The value in the field of the row named `name`: the innermost element that starts with the name and holds a field.
const fieldValue = (root, name) => {
    const isField = (node) => node.nodeName === "input";
    const row = elements(root)
        .filter((node) => text(node).startsWith(name) && elements(node).some(isField))
        .at(-1);
    return String(elements(row).find(isField)?.value ?? "");
};
// The level the index-th row's field shows (the cap sits beside the field, not in its text).
const levelShown = (root, index) =>
    String(elements(root).filter((node) => node.nodeName === "input")[index]?.attributes.value ?? "");
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
// The tray's first line (its question while it asks), opening a tab, and typing into the tray's level field: Islands'
// Set all acts on the open tab's upgrades.
const trayQuestion = (root) =>
    elements(root).find((node) => String(node.attributes.id).startsWith("tabbed-list-question-"));
const openTab = (root, label) =>
    elements(root)
        .find((node) => node.attributes.role === "tab" && text(node).trim().startsWith(label))
        .listeners.click({});
const typeLevel = (root, value) =>
    elements(root)
        .find((node) => node.nodeName === "input" && node.attributes.placeholder === "Level")
        .listeners.input({ target: { value: String(value) } });
// The page openPage opened last.
let lastRoot = null;
// Whether text matching `pattern` is on screen: the page keeps its read error in the page, hidden until it's needed.
const showsText = (root, pattern) => {
    const node = elements(root)
        .filter((entry) => pattern.test(text(entry)))
        .at(-1);
    for (let at = node; at; at = at.parentNode)
        if (String(at.attributes?.class ?? "").includes("is-hidden-until-ready")) return false;
    return Boolean(node);
};
const writes = () => requests.filter((entry) => /write/.test(entry)).length;

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${what}`);
}

const click = (button) => button.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: button });

// holdNext(matches): the next request `matches` picks waits until its `release()`; `reached` says it was sent.
// `release(response)` answers it with that response instead of sending it.
let held = null;
const holdNext = (matches) => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    held = { matches, gate, reached: false, release };
    return held;
};
// holdAnswers(matches): every request `matches` picks is sent at once, but its answer waits until `release()`; `count`
// says how many were sent. So a read held this way reads the game as it was when it was sent.
let answersHeld = null;
const holdAnswers = (matches) => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    answersHeld = { matches, gate, count: 0 };
    const hold = answersHeld;
    return {
        count: () => hold.count,
        release: () => {
            if (answersHeld === hold) answersHeld = null;
            release();
        },
    };
};
const send = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    const hold = held;
    if (hold?.matches(url, body)) {
        held = null;
        hold.reached = true;
        const answer = await hold.gate;
        if (answer) return answer;
    }
    const answers = answersHeld;
    if (answers?.matches(url, body)) {
        answers.count++;
        const response = await send(url, options);
        await answers.gate;
        return response;
    }
    return send(url, options);
};

async function openPage(file, label, open = null) {
    const root = (await importRepo(file)).default.component();
    lastRoot = root;
    if (open) {
        await until(() => buttonsNamed(root, open).length, `${open} on ${file}`);
        await click(buttonsNamed(root, open)[0]);
    }
    const ready = () => buttonsNamed(root, label).some((node) => !node.attributes.disabled);
    await until(ready, `${label} on ${file}`);
    await settle(100);
    return buttonsNamed(root, label).find((node) => !node.attributes.disabled);
}

test("an action button with a question asks in place, and runs only on the second click", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    let ran = 0;
    const button = ActionButton({ label: "Reset all", confirm: "reset every upgrade to 0.", onClick: () => ran++ });
    await click(button);
    assert.equal(ran, 0, "the first click only asks");
    assert.equal(button.attributes["data-again"], "Click again");
    await click(button);
    assert.equal(ran, 1, "the second click runs it");
    assert.equal(button.attributes["data-again"], undefined);
});

test("an action button whose question is null runs on one click", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    let ran = 0;
    const button = ActionButton({ label: "Apply", confirm: () => null, onClick: () => ran++ });
    await click(button);
    assert.equal(ran, 1);
});

// Royal Armory and Map bonuses ask about "this world": a world picked after the first press asks again.
test("a press whose targets changed since the question asks again instead of running", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const world = { val: 1 };
    let ran = 0;
    const button = ActionButton({
        label: "Deplete all",
        confirm: "deplete every node in this world.",
        confirmTargets: world,
        onClick: () => ran++,
    });
    await click(button);
    world.val = 2;
    await click(button);
    assert.equal(ran, 0, "the second press asked about W2 instead");
    assert.equal(button.attributes["data-again"], "Click again");
    await click(button);
    assert.equal(ran, 1, "and a third runs it");
});

const removals = [
    ["src/ui/pages/world-4/breeding/general.js", "Zero all"],
    ["src/ui/pages/classes/grimoire/1-grimoire.js", "Reset all"],
    ["src/ui/pages/classes/royal-armory/3-resources.js", "Deplete all"],
    ["src/ui/pages/classes/royal-armory/4-outposts.js", "Reset to vanilla", "UNITS"],
    ["src/ui/pages/account/event-shop/event-shop.js", "Disable all"],
];

for (const [file, label, open] of removals) {
    test(`${file.split("/").pop()}: ${label} asks in place and writes nothing on the first click`, async () => {
        const button = await openPage(file, label, open);
        const before = writes();
        await click(button);
        await settle(100);
        assert.equal(button.attributes["data-again"], "Click again", "the button asks");
        assert.equal(writes(), before, "nothing was written");
    });
}

test("map bonuses: Clear world asks in place once a world is picked", async () => {
    const root = (await importRepo("src/ui/pages/classes/tesseract/2-map-bonuses.js")).default.component();
    await until(() => buttonsNamed(root, "W1").length, "the world tabs");
    await click(buttonsNamed(root, "W1")[0]);
    await until(() => buttonsNamed(root, "Clear world (0)").some((node) => !node.attributes.disabled), "Clear world");
    await settle(100);
    const button = buttonsNamed(root, "Clear world (0)").find((node) => !node.attributes.disabled);
    const before = writes();
    await click(button);
    await settle(100);
    assert.equal(button.attributes["data-again"], "Click again");
    assert.equal(writes(), before);
});

test("rat king: removing crowns asks in place; adding them runs on one click", async () => {
    const root = (await importRepo("src/ui/pages/world-5/gaming/2-rat-king.js")).default.component();
    const enabled = (label) => buttonsNamed(root, label).find((node) => !node.attributes.disabled);
    await until(() => enabled("Apply"), "Apply");
    await settle(100);
    const apply = enabled("Apply");
    const field = elements(apply.parentNode).find((node) => node.nodeName === "input");
    const asks = async (button, what) => {
        const before = writes();
        await click(button);
        await settle(100);
        assert.equal(button.attributes["data-again"], "Click again", `${what} asks`);
        assert.equal(writes(), before, `${what} wrote nothing`);
    };

    let before = writes();
    await click(enabled("Max all (100)"));
    await until(() => writes() > before && enabled("Apply"), "Max all to land");
    await settle(100);

    await asks(enabled("Clear all (0)"), "Clear all");
    await asks(enabled("Clear"), "a plant's Clear");
    field.listeners.input({ target: { value: "40" } });
    await asks(apply, "lowering the count");

    before = writes();
    await click(enabled("Clear all (0)")); // the second click clears them
    await until(() => writes() > before && enabled("Apply"), "the crowns to clear");
    await settle(100);
    field.listeners.input({ target: { value: "10" } });
    before = writes();
    await click(enabled("Apply"));
    await until(() => writes() > before, "the raise to land");
    assert.equal(enabled("Apply").attributes["data-again"], undefined, "raising didn't ask");
});

test("value search: clearing the saved list asks in place first", async () => {
    const { SavedResultsSection } = await importRepo("src/ui/components/views/search/sections.js");
    const vanX = await importRepo("src/ui/vendor/van-x-0.6.3.js").catch(() => null);
    const reactive = vanX?.reactive ?? ((value) => value);
    let cleared = 0;
    const ui = reactive({
        savedResults: [{ path: "OptionsListAccount[5]", value: 1, monitorEnabled: false }],
        savedFilter: "",
        savedFilterApplied: false,
        savedRefreshError: "",
        isRefreshingSavedResults: false,
        savedEdit: { path: null, draft: "", error: "" },
    });
    const handlers = {
        clearSavedResults: () => cleared++,
        getFilteredSavedResults: () => ui.savedResults,
        refreshSavedResults() {},
        handleSavedFilterInput() {},
        clearSavedFilter() {},
    };
    const section = SavedResultsSection({ ui, handlers });
    const clear = buttonsNamed(section, "Clear")[0];
    await click(clear);
    assert.equal(cleared, 0, "the first click only asks");
    assert.equal(clear.attributes["data-again"], "Click again");
    await click(clear);
    assert.equal(cleared, 1, "the second click clears it");
});

// Disabling takes away, so it asks in the tools tray first; the answer runs it.
test("bribes: Disable all asks in the tray, then runs on the answer", async () => {
    const enable = await openPage("src/ui/pages/world-1/bribes/bribes.js", "Enable all");
    let before = writes();
    await click(enable);
    await until(() => writes() > before, "Enable all to write");
    await settle(100);
    let root = enable;
    while (root.parentNode) root = root.parentNode;
    const inTray = (name) => elements(root).find((node) => String(node.attributes.class).split(" ").includes(name));
    const disable = buttonsNamed(root, "Disable all").find((node) => !node.attributes.disabled);
    before = writes();
    await click(disable);
    await settle(100);
    assert.match(text(inTray("tabbed-list__tools-label")), /^Disable \d+ bribes? in Set 1\?$/, "the first click asks");
    assert.equal(writes(), before);
    await click(inTray("tabbed-list__yes"));
    await until(() => writes() > before, "the answer to write");
});

// Resetting takes levels away, so it asks in the tools tray first; the answer runs it.
for (const file of [
    "src/ui/pages/world-3/atom-collider/atom-collider.js",
    "src/ui/pages/world-3/salt-lick/salt-lick.js",
]) {
    test(`${file.split("/").pop()}: Reset all asks in the tray, then runs on the answer`, async () => {
        const reset = await openPage(file, "Reset all");
        let root = reset;
        while (root.parentNode) root = root.parentNode;
        const inTray = (name) => elements(root).find((node) => String(node.attributes.class).split(" ").includes(name));
        const before = writes();
        await click(reset);
        await settle(100);
        assert.match(text(inTray("tabbed-list__tools-label")), /^Reset \d+ .+ to 0\?$/, "the first click asks");
        assert.equal(writes(), before, "nothing was written");
        await click(inTray("tabbed-list__yes"));
        await until(() => writes() > before, "the answer to write");
    });
}

// Owning Set 1's expansion unlocks Set 2, the same as flipping the expansion's own switch.
test("bribes: Enable all on a set unlocks the next set when it owns the expansion", async () => {
    const status = game.gga.BribeStatus;
    const before = [...status];
    status[5] = 0; // Set 1's expansion, The Art of the Deal
    for (let index = 6; index < 13; index++) status[index] = -1; // Set 2, locked
    try {
        const enable = await openPage("src/ui/pages/world-1/bribes/bribes.js", "Enable all");
        await click(enable);
        await until(() => status[5] === 1, "the expansion to be owned");
        await until(() => status.slice(6, 13).every((value) => value === 0), "Set 2 to unlock");
    } finally {
        before.forEach((value, index) => (status[index] = value));
    }
});

// The tools act on the bribes the search showed at the press; a search typed while the game is read doesn't change that.
test("bribes: Enable all changes the bribes shown at the press, even if the search changes during the read", async () => {
    const { searchHits } = await importRepo("src/ui/menu/pageSearch.js");
    const status = game.gga.BribeStatus;
    const before = [...status];
    for (let index = 0; index < 5; index++) status[index] = 0; // Set 1's bribes before its expansion, not owned
    try {
        const enable = await openPage("src/ui/pages/world-1/bribes/bribes.js", "Enable all");
        const read = holdNext((url, body) => /read/.test(url) && JSON.stringify(body).includes("BribeStatus"));
        const pressed = click(enable);
        await until(() => read.reached, "the read");
        searchHits.val = new Set(); // a search that shows none of them
        read.release();
        await pressed;
        await until(
            () => status.slice(0, 5).every((value) => value === 1),
            "the bribes shown at the press to be owned"
        );
    } finally {
        searchHits.val = null;
        before.forEach((value, index) => (status[index] = value));
    }
});

// CodeRabbit on #196: the skins are the ones the search showed at the press, and the press says "done" once they're
// written, though the read before the write takes longer than the button waits on its own.
test("weekly bosses: Unlock all unlocks the skins shown at the press and says done once they're written", async () => {
    const { searchHits } = await importRepo("src/ui/menu/pageSearch.js");
    const { announce } = await importRepo("src/ui/components/inPlace.js");
    const weekly = game.gga.WeeklyBoss.h;
    const keys = Object.keys(weekly).filter((key) => key.startsWith("UI_"));
    const saved = keys.map((key) => weekly[key]);
    keys.forEach((key) => (weekly[key] = 0));
    try {
        const unlock = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", "Unlock all");
        announce("");
        const read = holdNext((url, body) => /read/.test(url) && JSON.stringify(body).includes("WeeklyBoss"));
        const pressed = click(unlock);
        await until(() => read.reached, "the read");
        searchHits.val = new Set(); // a search that shows none of them
        await settle(100); // the button has looked at the status while the read waits
        read.release();
        await pressed;
        assert.ok(
            keys.every((key) => Number(weekly[key]) === 1),
            "the press ended with the skins shown at it written"
        );
        const region = elements(globalThis.document.body).find((node) => node.attributes.role === "status");
        await until(() => region.textContent === "Unlock all: done", "the press to say done");
    } finally {
        searchHits.val = null;
        keys.forEach((key, i) => (weekly[key] = saved[i]));
    }
});

for (const [file, label] of [
    ["src/ui/pages/world-1/bribes/bribes.js", "Enable all"],
    ["src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", "Unlock all"],
    ["src/ui/pages/world-3/prayers/prayers.js", "Unlock all"],
    ["src/ui/pages/account/event-shop/event-shop.js", "Enable all"],
]) {
    test(`${file.split("/").pop()}: ${label} adds on one click`, async () => {
        const button = await openPage(file, label);
        const before = writes();
        await click(button);
        await until(() => writes() > before, `${label} to write`);
        assert.equal(button.attributes["data-again"], undefined, "it didn't ask");
    });
}

test("bundles: Buy all asks in place with the inventory warning beside it, and buys on the second press", async () => {
    const root = (await importRepo("src/ui/pages/account/bundles/bundles.js")).default.component();
    const buyAll = () =>
        elements(root).find((node) => node.nodeName === "button" && /^Buy all \(\d+\)$/.test(text(node).trim()));
    await until(() => buyAll() && !buyAll().attributes.disabled && text(buyAll()) !== "Buy all (0)", "Buy all");
    await settle(100);
    const button = buyAll();
    const warning = () => text(elements(root).find((node) => /said--buy-all/.test(node.attributes.class ?? "")));
    const buys = () => requests.filter((entry) => entry === "POST /api/toggle").length;

    const before = buys();
    await click(button);
    await settle(100);
    assert.equal(button.attributes["data-again"], "Click again", "the first press asks");
    assert.match(warning(), /Free up inventory space first, or items may be lost\./, "and warns beside it");
    assert.equal(buys(), before, "nothing was bought");

    click(button);
    await until(() => buys() > before, "the second press to buy");
    assert.equal(button.attributes["data-again"], undefined);
    assert.equal(warning(), "", "the warning goes once it buys");
});

// "Click again to deplete every node in this world.": the world picked between the two clicks is another question.
for (const [file, label] of [
    ["src/ui/pages/classes/royal-armory/3-resources.js", "Deplete all"],
    ["src/ui/pages/classes/tesseract/2-map-bonuses.js", "Clear world (0)"],
]) {
    test(`${file.split("/").pop()}: ${label} asks again for a world picked after the first click`, async () => {
        const root = (await importRepo(file)).default.component();
        const enabled = () => buttonsNamed(root, label).find((node) => !node.attributes.disabled);
        const pickWorld = async (name) => {
            await until(() => buttonsNamed(root, name).length, name);
            await click(buttonsNamed(root, name)[0]);
            await until(enabled, `${label} in ${name}`);
            await settle(100);
        };
        await pickWorld("W1");
        const button = enabled();
        const before = writes();
        await click(button);
        await pickWorld("W2");
        await click(button);
        await settle(100);
        assert.equal(writes(), before, "W2 was not changed on W1's question");
        assert.equal(button.attributes["data-again"], "Click again", "it asks about W2");
    });
}

// Lumi's call (2026-11-20): Lock all removes every island unlock, so it asks first: in the tray since the shared
// panels (2026-11-22).
test("islands: Lock all asks in the tray, locks every island on the answer, and Undo puts them back", async () => {
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const unlocks = () => game.gga.OptionsListAccount[169];
    game.gga.OptionsListAccount[169] = "abc";
    const button = await openPage("src/ui/pages/world-2/islands/islands.js", "Lock all");
    const root = lastRoot;
    const before = writes();
    await click(button);
    await settle(100);
    assert.equal(text(trayQuestion(root)), "Lock 3 islands?", "the press asks in the tray");
    assert.equal(writes(), before, "and locks nothing");
    assert.equal(unlocks(), "abc");
    await click(buttonsNamed(root, "Lock them")[0]);
    await until(() => writes() > before, "the answer to lock");
    await settle(100);
    assert.equal(unlocks(), "");
    const [action] = (await fetchChanges()).actions;
    await undoAction(action.id);
    assert.equal(unlocks(), "abc", "Undo unlocks them again");
});

// Lumi's call (2026-11-20): every Max all brings a value above its max down to the max, on one click, and Undo puts
// it back.
for (const [file, levels, definitions, maxIndex] of [
    ["src/ui/pages/world-3/prayers/prayers.js", "PrayersUnlocked", "PrayerInfo", 9],
    ["src/ui/pages/classes/grimoire/1-grimoire.js", "Grimoire", "GrimoireUpg", 4],
    ["src/ui/pages/world-3/salt-lick/salt-lick.js", "SaltLick", "SaltLicks", 4],
]) {
    test(`${file.split("/").pop()}: Max all lowers a level above its max on one click`, async () => {
        const { fetchChanges } = await importRepo("src/ui/services/api.js");
        const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
        const cap = Number(game.gga.CustomLists.h[definitions][0][maxIndex]);
        game.gga[levels][0] = cap + 7;
        const button = await openPage(file, "Max all");
        const before = writes();
        await click(button);
        await until(() => game.gga[levels][0] === cap, "the level to come down to its max");
        assert.equal(button.attributes["data-again"], undefined, "it didn't ask");
        assert.ok(writes() > before);
        const [action] = (await fetchChanges()).actions;
        await undoAction(action.id);
        assert.equal(game.gga[levels][0], cap + 7, "Undo puts it back");
    });
}

// A Max all the game refused in part (one level kept) reads the levels again, so the rows show what landed.
test("salt-lick.js: a Max all the game refused in part shows the levels the game holds", async () => {
    const levels = game.gga.SaltLick;
    const caps = [0, 1].map((index) => Number(game.gga.CustomLists.h.SaltLicks[index][4]));
    levels[0] = caps[0] + 5;
    const kept = caps[1] + 5;
    Object.defineProperty(levels, 1, { get: () => kept, set() {}, configurable: true });
    try {
        const root = (await importRepo("src/ui/pages/world-3/salt-lick/salt-lick.js")).default.component();
        const max = () => buttonsNamed(root, "Max all").find((node) => !node.attributes.disabled);
        await until(() => max() && levelShown(root, 0) === String(caps[0] + 5), "Salt Lick");
        await click(max());
        await until(() => levels[0] === caps[0], "the first level to land");
        await until(() => levelShown(root, 0) === String(caps[0]), "the row to show what the game holds");
        assert.equal(levelShown(root, 1), String(kept), "the refused level still shows what the game kept");
    } finally {
        Object.defineProperty(levels, 1, { value: 0, writable: true, configurable: true });
        levels[0] = 0;
    }
});

// CodeRabbit on #110: Refresh waits for a Max all, and the bulk buttons wait for the read after one the game refused in
// part, so an older read can't put earlier levels back over a newer write.
test("salt-lick.js: Refresh waits for a Max all, and Max all and Reset all wait for the read after it", async () => {
    let write;
    let reread;
    let pressed;
    const levels = game.gga.SaltLick;
    const caps = [0, 1].map((index) => Number(game.gga.CustomLists.h.SaltLicks[index][4]));
    levels[0] = caps[0] + 5;
    const kept = caps[1] + 5;
    Object.defineProperty(levels, 1, { get: () => kept, set() {}, configurable: true });
    try {
        const root = (await importRepo("src/ui/pages/world-3/salt-lick/salt-lick.js")).default.component();
        const named = (label) => buttonsNamed(root, label);
        const max = () => named("Max all").find((node) => !node.attributes.disabled);
        await until(() => max() && levelShown(root, 0) === String(caps[0] + 5), "Salt Lick");
        write = holdNext((url) => url.endsWith("/game/gga/write-many"));
        pressed = click(max());
        await until(() => write.reached, "the Max all write to be sent");
        await until(() => named("Refresh").every((node) => node.attributes.disabled), "Refresh to wait for Max all");
        reread = holdNext((url, body) => url.endsWith("/game/gga/read") && body.path === "gga.SaltLick");
        write.release();
        await until(() => reread.reached, "the read after the refused Max all");
        await until(
            () => [...named("Max all"), ...named("Reset all")].every((node) => node.attributes.disabled),
            "Max all and Reset all to wait for the read"
        );
        reread.release();
        await pressed;
        await until(() => max() && levelShown(root, 0) === String(caps[0]), "the row to show what the game holds");
    } finally {
        // A wait that failed lets the held requests go, and the Max all end, before the levels are put back.
        held = null;
        write?.release();
        reread?.release();
        await Promise.allSettled([pressed]);
        Object.defineProperty(levels, 1, { value: 0, writable: true, configurable: true });
        levels[0] = 0;
    }
});

// CodeRabbit on #110 (the same race on Islands): Refresh waits for a bulk action, and every bulk action waits for a read.
test("islands: Refresh waits for a bulk action, and the bulk actions wait for a read", async () => {
    const root = (await importRepo("src/ui/pages/world-2/islands/islands.js")).default.component();
    const named = (label) => buttonsNamed(root, label);
    const bulk = () => [...named("Unlock all"), ...named("Lock all"), ...named("Set all")];
    await until(() => bulk().length === 3 && bulk().every((node) => !node.attributes.disabled), "Islands");
    const unlocks = game.gga.OptionsListAccount[169];
    try {
        const write = holdNext((url) => url.endsWith("/game/gga/write-many"));
        const pressed = click(named("Unlock all")[0]);
        await until(() => write.reached, "the Unlock all write to be sent");
        await until(() => named("Refresh").every((node) => node.attributes.disabled), "Refresh to wait for Unlock all");
        write.release();
        await pressed;
        await until(() => named("Refresh").every((node) => !node.attributes.disabled), "Refresh after Unlock all");
        const read = holdNext((url) => url.endsWith("/game/gga/read-entries"));
        const refreshed = named("Refresh")[0].listeners.click({});
        await until(() => read.reached, "the Refresh read to be sent");
        await until(() => bulk().every((node) => node.attributes.disabled), "the bulk actions to wait for the read");
        read.release();
        await refreshed;
        // Every island is unlocked now, so Unlock all has nothing to do; the others are back.
        await until(
            () => [...named("Lock all"), ...named("Set all")].every((node) => !node.attributes.disabled),
            "the bulk actions after the read"
        );
    } finally {
        held = null;
        game.gga.OptionsListAccount[169] = unlocks;
    }
});

// A Set all the game refused in part reads the values again, so the rows show what landed.
test("islands: a Set all the game refused in part shows the values the game holds", async () => {
    const options = game.gga.OptionsListAccount;
    options[163] = 3;
    Object.defineProperty(options, 164, { get: () => 5, set() {}, configurable: true });
    try {
        const root = (await importRepo("src/ui/pages/world-2/islands/islands.js")).default.component();
        const setAll = () => buttonsNamed(root, "Set all").filter((node) => !node.attributes.disabled);
        await until(() => setAll().length === 1 && fieldValue(root, "Garbage %") === "3", "Islands");
        openTab(root, "Trash");
        typeLevel(root, 200);
        await click(setAll()[0]);
        await until(() => options[163] === 200, "the first value to land");
        await until(() => fieldValue(root, "Garbage %") === "200", "the row to show what the game holds");
        assert.equal(fieldValue(root, "Bottles %"), "5", "the refused row still shows what the game kept");
    } finally {
        Object.defineProperty(options, 164, { value: 0, writable: true, configurable: true });
        options[163] = 0;
    }
});

// A Refresh that failed leaves values the game may have changed since; the bulk actions wait for a read that works.
test("islands: the bulk actions wait while the page shows a failed read", async () => {
    const root = (await importRepo("src/ui/pages/world-2/islands/islands.js")).default.component();
    const named = (label) => buttonsNamed(root, label);
    const bulk = () => [...named("Unlock all"), ...named("Lock all"), ...named("Set all")];
    await until(() => bulk().length === 3 && bulk().every((node) => !node.attributes.disabled), "Islands");
    try {
        const read = holdNext((url) => url.endsWith("/game/gga/read-entries"));
        const refreshed = named("Refresh")[0].listeners.click({});
        await until(() => read.reached, "the Refresh read to be sent");
        read.release(new Response(JSON.stringify({ error: "The game didn't answer" }), { status: 500 }));
        await refreshed;
        await until(
            () => bulk().every((node) => node.attributes.disabled),
            "the bulk actions to wait after the failed read"
        );
        await named("Refresh")[0].listeners.click({});
        await until(
            () => bulk().every((node) => !node.attributes.disabled),
            "the bulk actions after a read that worked"
        );
    } finally {
        held = null;
    }
});

// CodeRabbit on #110: a read after a refused Max all that fails too leaves Max all and Reset all waiting for a read
// that works.
test("salt-lick.js: Max all and Reset all wait while the read after a refused Max all failed", async () => {
    const levels = game.gga.SaltLick;
    const caps = [0, 1].map((index) => Number(game.gga.CustomLists.h.SaltLicks[index][4]));
    levels[0] = caps[0] + 5;
    const kept = caps[1] + 5;
    Object.defineProperty(levels, 1, { get: () => kept, set() {}, configurable: true });
    try {
        const root = (await importRepo("src/ui/pages/world-3/salt-lick/salt-lick.js")).default.component();
        const named = (label) => buttonsNamed(root, label);
        const bulk = () => [...named("Max all"), ...named("Reset all")];
        await until(
            () => bulk().every((node) => !node.attributes.disabled) && levelShown(root, 0) === String(caps[0] + 5),
            "Salt Lick"
        );
        assert.equal(showsText(root, /Couldn't read the salt lick/), false, "no read failed yet");
        // Max all reads the levels first to plan its writes; the read after its refusal is the second one.
        let reads = 0;
        const reread = holdNext(
            (url, body) => url.endsWith("/game/gga/read") && body.path === "gga.SaltLick" && ++reads === 2
        );
        const pressed = click(named("Max all")[0]);
        await until(() => reread.reached, "the read after the refused Max all");
        reread.release(new Response(JSON.stringify({ error: "The game didn't answer" }), { status: 500 }));
        await pressed;
        await until(() => showsText(root, /Couldn't read the salt lick/), "the failed read to be said, on screen");
        await until(
            () => bulk().every((node) => node.attributes.disabled),
            "the bulk actions to wait after the failed read"
        );
        await named("Refresh")[0].listeners.click({});
        await until(
            () => bulk().every((node) => !node.attributes.disabled),
            "the bulk actions after a read that worked"
        );
    } finally {
        held = null;
        Object.defineProperty(levels, 1, { value: 0, writable: true, configurable: true });
        levels[0] = 0;
    }
});

// CodeRabbit on #110, on the shared panels: the tray's tools share one status, so while a Set all runs the other tools
// and Refresh wait, and a second Set all can't start beside it; the read after a refused one runs once it ended.
test("islands: while a Set all runs, the tray's other tools and Refresh wait, and its read comes after", async () => {
    const options = game.gga.OptionsListAccount;
    options[163] = 3;
    Object.defineProperty(options, 164, { get: () => 5, set() {}, configurable: true });
    try {
        const root = (await importRepo("src/ui/pages/world-2/islands/islands.js")).default.component();
        const named = (label) => buttonsNamed(root, label);
        const tools = () => [...named("Unlock all"), ...named("Lock all"), ...named("Set all")];
        await until(() => tools().length === 3 && tools().every((node) => !node.attributes.disabled), "Islands");
        openTab(root, "Trash");
        typeLevel(root, 200);
        const slow = holdNext((url) => url.endsWith("/game/gga/write-many"));
        const pressed = click(named("Set all")[0]);
        await until(() => slow.reached, "the Set all to be sent");
        await until(
            () => [...tools(), ...named("Refresh")].every((node) => node.attributes.disabled),
            "the other tools and Refresh to wait"
        );
        const reads = holdAnswers((url) => url.endsWith("/game/gga/read-entries"));
        slow.release();
        await pressed;
        await until(() => reads.count() > 0, "the read after the refused Set all");
        reads.release();
        await until(() => tools().every((node) => !node.attributes.disabled), "the tools after the read");
        assert.equal(fieldValue(root, "Garbage %"), "200");
        assert.equal(fieldValue(root, "Bottles %"), "5", "the refused row shows what the game kept");
    } finally {
        held = null;
        answersHeld = null;
        Object.defineProperty(options, 164, { value: 0, writable: true, configurable: true });
        options[163] = 0;
    }
});

// CodeRabbit on #110: a reload an undo asks for while a Set all runs waits for it, so it can't read the old values and
// show them after the Set all landed.
test("islands: a reload after an undo waits for a Set all still running", async () => {
    const options = game.gga.OptionsListAccount;
    options[166] = 4;
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const root = (await importRepo("src/ui/pages/world-2/islands/islands.js")).default.component();
    const named = (label) => buttonsNamed(root, label);
    await until(() => named("Unlock all").length && !named("Unlock all")[0].attributes.disabled, "Islands");
    const unlocks = options[169];
    try {
        await click(named("Unlock all")[0]);
        await until(() => options[169] === "abcde_", "the unlocks to land");
        const [action] = (await fetchChanges()).actions;
        const slow = holdNext(
            (url, body) => url.endsWith("/game/gga/write-many") && body.writes?.[0]?.path?.includes("[166]")
        );
        openTab(root, "Rando");
        typeLevel(root, 200);
        const rando = click(named("Set all")[0]);
        await until(() => slow.reached, "Rando's Set all to be sent");
        const reads = holdAnswers((url) => url.endsWith("/game/gga/read-entries"));
        await undoAction(action.id);
        // The Islands pages earlier tests opened reload at once; this one's reload waits for its Set all.
        await settle(100);
        const others = reads.count();
        slow.release();
        await rando;
        await until(() => reads.count() > others, "this page's reload after the undo");
        reads.release();
        await until(() => !named("Refresh")[0].attributes.disabled, "the reload to end");
        assert.equal(fieldValue(root, "Loot %"), "200", "Rando's Set all stays shown");
    } finally {
        held = null;
        answersHeld = null;
        options[169] = unlocks;
        options[166] = 0;
        options[167] = 0;
    }
});

// CodeRabbit on #110: an undo of this page that waits for a Set all stays queued when another page's undo comes in
// meanwhile, so the bulk actions come back once its read ran.
test("islands: a reload waiting for a Set all still runs after another page's undo", async () => {
    const options = game.gga.OptionsListAccount;
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const root = (await importRepo("src/ui/pages/world-2/islands/islands.js")).default.component();
    const named = (label) => buttonsNamed(root, label);
    const bulk = () => [...named("Unlock all"), ...named("Lock all"), ...named("Set all")];
    await until(() => bulk().length === 3 && bulk().every((node) => !node.attributes.disabled), "Islands");
    const unlocks = options[169];
    // Every island locked first, so the undo's read shows in the rows.
    options[169] = "";
    await buttonsNamed(root, "Refresh")[0].listeners.click({});
    // With every island locked, Lock all has nothing to do.
    const ready = () => [...named("Unlock all"), ...named("Set all")].every((node) => !node.attributes.disabled);
    await until(() => !/Unlocked/.test(text(root)) && ready(), "locked");
    try {
        await click(named("Unlock all")[0]);
        await until(() => options[169] === "abcde_", "the unlocks to land");
        const [action] = (await fetchChanges()).actions;
        const slow = holdNext(
            (url, body) => url.endsWith("/game/gga/write-many") && body.writes?.[0]?.path?.includes("[166]")
        );
        openTab(root, "Rando");
        typeLevel(root, 200);
        const rando = click(named("Set all")[0]);
        await until(() => slow.reached, "Rando's Set all to be sent");
        await undoAction(action.id);
        reloadPlace.val = { view: "elsewhere", page: "another page" };
        assert.match(text(root), /Unlocked/, "the rows show the unlocks until the reload");
        slow.release();
        await rando;
        await until(ready, "the bulk actions once the reload ran");
        assert.equal(options[169], "", "the undo landed");
        assert.doesNotMatch(text(root), /Unlocked/, "the reload shows what the undo put back");
    } finally {
        held = null;
        options[169] = unlocks;
        options[166] = 0;
        options[167] = 0;
    }
});

// CodeRabbit on #110: an undo waiting for a Max all the game then refused in part, and the read after that refusal, run
// one after the other, so the newer read answers last.
test("salt-lick.js: the reload after an undo and the read after a refused Max all run one after the other", async () => {
    const levels = game.gga.SaltLick;
    const caps = [0, 1].map((index) => Number(game.gga.CustomLists.h.SaltLicks[index][4]));
    levels[0] = caps[0] + 5;
    const kept = caps[1] + 5;
    Object.defineProperty(levels, 1, { get: () => kept, set() {}, configurable: true });
    const { fetchChanges, fetchConfig } = await importRepo("src/ui/services/api.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const options = game.gga.OptionsListAccount;
    try {
        const root = (await importRepo("src/ui/pages/world-3/salt-lick/salt-lick.js")).default.component();
        const max = () => buttonsNamed(root, "Max all").find((node) => !node.attributes.disabled);
        await until(() => max() && levelShown(root, 0) === String(caps[0] + 5), "Salt Lick");
        // A change to undo, made on this page.
        await withAction({ label: "level" }, () => writeManyVerified([{ path: "OptionsListAccount[399]", value: 1 }]));
        const [action] = (await fetchChanges()).actions;
        const write = holdNext((url) => url.endsWith("/game/gga/write-many"));
        const pressed = click(max());
        await until(() => write.reached, "the Max all write to be sent");
        await undoAction(action.id);
        const reads = holdAnswers((url, body) => url.endsWith("/game/gga/read") && body.path === "gga.SaltLick");
        write.release();
        await until(() => reads.count() > 0, "a read after the refused Max all");
        // A read that didn't wait for the first would be sent by now.
        await fetchConfig();
        await settle(200);
        assert.equal(reads.count(), 1, "the second read waits for the first");
        const second = holdAnswers((url, body) => url.endsWith("/game/gga/read") && body.path === "gga.SaltLick");
        reads.release();
        await until(() => second.count() === 1, "the second read, once the first answered");
        second.release();
        await pressed;
        await until(() => max(), "the reads to end");
    } finally {
        held = null;
        answersHeld = null;
        Object.defineProperty(levels, 1, { value: 0, writable: true, configurable: true });
        levels[0] = 0;
        options[399] = 0;
    }
});
