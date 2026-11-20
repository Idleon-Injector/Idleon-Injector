// The Classes pages (review sweep): Outposts keeps every pick and press, says why one failed, and keeps its rows
// across a reload; Map Bonuses shows what the game holds after a bulk save fails partway; a masterclass search by
// index finds the row with that number.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// The tooltip that says "Click again to …" places itself on the next frame.
globalThis.requestAnimationFrame = () => {};
const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
// A press's result is read out from a live region on the page.
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const unhandled = [];
process.on("unhandledRejection", (error) => unhandled.push(String(error?.message ?? error)));

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
const buttonsNamed = (root, label) =>
    elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === label);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const writes = () => requests.filter((entry) => /write/.test(entry)).length;

async function until(check, what) {
    for (let i = 0; i < 600; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const click = (button) =>
    button.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: button, target: button });
// The browser reports a pick after the select already shows it.
const choose = (select, value) => {
    select.value = value;
    return select.listeners.change({ target: select });
};
const typeInto = (input, value) => {
    input.listeners.focus?.({ target: input });
    input.value = String(value);
    input.listeners.input({ target: input });
};
// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};
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
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const copy = (value) => JSON.parse(JSON.stringify(value));
// Counts the times a node is taken out of the page, even to be put back: a browser then drops its focus and blurs it.
const watchTakenOut = (node) => {
    let count = 0;
    for (let at = node.parentNode; at; at = at.parentNode) {
        const own = at.replaceChildren;
        at.replaceChildren = function (...children) {
            count++;
            return own.apply(this, children);
        };
    }
    return () => count;
};

const OUTPOSTS = "src/ui/pages/classes/royal-armory/4-outposts.js";
const openOutposts = async () => {
    const root = (await importRepo(OUTPOSTS)).default.component();
    await until(() => pageRead(root) && byClass(root, "outpost-card--built").length, "the outposts to load");
    return root;
};
const card = (root, mapId) =>
    byClass(root, "outpost-card--built").find((node) => text(byClass(node, "account-row__index")[0]) === `M${mapId}`);
const slotSelects = (node) => byClass(node, "outpost-slot-select");
const cardSays = (node) => text(byClass(node, "outpost-card__said")[0]);
const openUnits = async (root) => {
    await click(buttonsNamed(root, "UNITS")[0]);
    await until(() => byClass(root, "outpost-vanilla-units__row").length, "the units preview");
};
const unitArrays = () => copy([6, 7, 8, 9, 10, 11, 12, 13].map((index) => game.gga.RoyalG[index]));
const putUnitArrays = (saved) =>
    [6, 7, 8, 9, 10, 11, 12, 13].forEach((index, i) => (game.gga.RoyalG[index] = saved[i]));

test("outposts: a slot picked while another slot saves keeps both picks", async () => {
    const before = game.gga.RoyalMaps[1][11];
    const root = await openOutposts();
    const [first, second] = slotSelects(card(root, 1));
    const release = holdWrites();
    try {
        const picks = [choose(first, "3")];
        await tick();
        picks.push(choose(second, "4"));
        await tick();
        release();
        await Promise.all(picks);
        await until(() => game.gga.RoyalMaps[1][11] === 342211111, "both picks in the game");
        assert.equal(first.value, "3");
        assert.equal(second.value, "4");
    } finally {
        release();
        game.gga.RoyalMaps[1][11] = before;
    }
});

test("outposts: a refused slot or TYPE pick goes back to what the game holds and says why", async () => {
    const root = await openOutposts();
    const outpost = card(root, 1);
    const slot = slotSelects(outpost)[0];
    let restore = refuseWrites(game.gga.RoyalMaps[1], 11);
    try {
        await choose(slot, "5");
        assert.equal(slot.value, "2", "the slot shows the Worker the game kept");
        assert.match(cardSays(outpost), /Slot 1 not saved: game kept old value/);
    } finally {
        restore();
    }

    const type = byClass(outpost, "outpost-select-field__select")[0];
    restore = refuseWrites(game.gga.RoyalMaps[1], 10);
    try {
        await choose(type, "2");
        assert.equal(type.value, "1", "TYPE shows the Support Camp the game kept");
        assert.match(cardSays(outpost), /TYPE not saved: game kept old value/);
    } finally {
        restore();
    }
});

test("outposts: two quick Removes on one map remove both of its units, not another map's", async () => {
    const saved = unitArrays();
    game.gga.RoyalG[6] = [4, 4, 5];
    game.gga.RoyalG[7] = [1, 1, 2];
    const root = await openOutposts();
    const removes = buttonsNamed(card(root, 1), "Remove");
    assert.equal(removes.length, 2);
    const release = holdWrites();
    try {
        const presses = [click(removes[0])];
        await tick();
        presses.push(click(removes[1]));
        await tick();
        release();
        await Promise.all(presses);
        await until(() => JSON.stringify(game.gga.RoyalG[6]) === "[5]", "both M1 militia removed");
        assert.deepEqual([...game.gga.RoyalG[7]], [2], "M2's commander stays");
    } finally {
        release();
        putUnitArrays(saved);
    }
});

const unitTypeSelect = (root) =>
    byClass(byClass(card(root, 1), "outpost-map-unit")[0], "outpost-select-field__select")[0];
// A select shows what was picked in it, or else the value it was built with.
const selectShows = (select) => String(select.value ?? select.attributes.value);

test("outposts: after a unit TYPE pick and an undo, the unit shows what the game holds and its Remove works", async () => {
    const saved = unitArrays();
    game.gga.RoyalG[6] = [4];
    game.gga.RoyalG[7] = [1];
    const root = await openOutposts();
    try {
        const picked = unitTypeSelect(root);
        await choose(picked, "5");
        assert.deepEqual([...game.gga.RoyalG[6]], [5], "the pick landed");
        // ok(a === b): a failed equal on page nodes would print the whole page.
        assert.ok(unitTypeSelect(root) === picked, "the picked unit's row stays in place");
        // What History's Undo does: the old value goes back, then the page reads the game again.
        game.gga.RoyalG[6] = [4];
        await click(buttonsNamed(root, "Refresh")[0]);
        await until(() => selectShows(unitTypeSelect(root)) === "4", "the unit to show the Militia the game holds");
        await click(buttonsNamed(card(root, 1), "Remove")[0]);
        await until(() => game.gga.RoyalG[6].length === 0, "the unit removed");
        assert.equal(cardSays(card(root, 1)), "");
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: Populate after a unit TYPE pick asks Click again when the pick makes it remove units", async () => {
    const saved = unitArrays();
    // 10 Militia and 8 Knights on M1: Populate's default counts keep all 18. One more Knight is one too many.
    game.gga.RoyalG[6] = [...Array(10).fill(4), ...Array(8).fill(6)];
    game.gga.RoyalG[7] = Array(18).fill(1);
    const root = await openOutposts();
    try {
        await choose(unitTypeSelect(root), "6");
        assert.equal(game.gga.RoyalG[6].filter((type) => type === 6).length, 9, "the pick landed");
        await openUnits(root);
        const populate = buttonsNamed(root, "Populate outposts")[0];
        const before = writes();
        await click(populate);
        await tick();
        assert.equal(populate.attributes["data-again"], "Click again");
        assert.equal(writes(), before, "the first press writes nothing");
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: a reload after a unit change keeps the other cards and what is typed in them", async () => {
    const saved = unitArrays();
    const root = await openOutposts();
    const first = card(root, 1);
    const input = elements(byClass(first, "outpost-field")[3]).find((node) => node.nodeName === "input");
    const unitsBefore = buttonsNamed(card(root, 2), "Remove").length;
    const takenOut = watchTakenOut(first);
    try {
        typeInto(input, "999");
        await click(buttonsNamed(card(root, 2), "Add unit")[0]);
        await until(() => buttonsNamed(card(root, 2), "Remove").length === unitsBefore + 1, "the added unit");
        assert.equal(card(root, 1), first, "M1's card is the same card");
        assert.equal(takenOut(), 0, "M1's card stayed in the page");
        assert.ok(elements(root).includes(input), "the field being typed in is still on the page");
        assert.equal(input.value, "999");
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: the UNITS tab previews and populates W1-W4 when outposts exist past W4", async () => {
    assert.ok(
        game.gga.RoyalMaps.some((row, mapId) => mapId >= 200 && row.length >= 13),
        "the fake game has outposts past W4"
    );
    const saved = unitArrays();
    const root = await openOutposts();
    try {
        await openUnits(root);
        assert.equal(byClass(root, "outpost-vanilla-units__row").length, 4, "a preview row for each of W1-W4");
        await click(buttonsNamed(root, "Populate outposts")[0]);
        await until(() => game.gga.RoyalG[6].length === 22, "W1's two outposts populated");
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: Populate asks Click again when it would remove units, and runs on the second press", async () => {
    const saved = unitArrays();
    game.gga.RoyalG[6] = Array(30).fill(4);
    game.gga.RoyalG[7] = Array(30).fill(1);
    const root = await openOutposts();
    try {
        await openUnits(root);
        const populate = buttonsNamed(root, "Populate outposts")[0];
        const before = writes();
        await click(populate);
        await tick();
        assert.equal(writes(), before, "the first press writes nothing");
        assert.equal(populate.attributes["data-again"], "Click again");
        await click(populate);
        await until(() => game.gga.RoyalG[6].length === 22, "the second press populates");
    } finally {
        putUnitArrays(saved);
    }
});

// Review of #120: Populate asked about the units it last read, then removed the ones the game added since unasked.
test("outposts: Populate removes no units the game added since the page read them, unasked", async () => {
    const saved = unitArrays();
    game.gga.RoyalG[6] = [...Array(10).fill(4), ...Array(8).fill(6)];
    game.gga.RoyalG[7] = Array(18).fill(1);
    const root = await openOutposts();
    try {
        await openUnits(root);
        // Units added in game: Populate's counts no longer keep them all.
        game.gga.RoyalG[6] = Array(30).fill(4);
        game.gga.RoyalG[7] = Array(30).fill(1);
        const populate = buttonsNamed(root, "Populate outposts")[0];
        await click(populate);
        await until(() => /account-btn--(success|error)/.test(classes(populate)), "Populate to finish");
        assert.equal(game.gga.RoyalG[6].length, 30, "no unit is taken away");
        assert.match(classes(populate), /account-btn--error/);
        // The page read the game again, so the next press asks about the units it would take away.
        await click(populate);
        await tick();
        assert.equal(populate.attributes["data-again"], "Click again");
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: a refused GLORIFIED press says why, and a press while it saves can't send a second write", async () => {
    const root = await openOutposts();
    const outpost = card(root, 1);
    const glorified = byClass(outpost, "outpost-glorified-button")[0];
    const restore = refuseWrites(game.gga.RoyalMaps[1], 12);
    try {
        await click(glorified);
        assert.match(cardSays(outpost), /GLORIFIED not saved: game kept old value/);
        await until(() => classes(glorified).includes("account-btn--error"), "the button to show it failed");
    } finally {
        restore();
    }

    const release = holdWrites();
    try {
        const press = click(glorified);
        await until(() => glorified.attributes.disabled, "the button to wait while it saves");
        release();
        await press;
        assert.equal(game.gga.RoyalMaps[1][12], 0);
        assert.equal(cardSays(outpost), "", "the next press cleared the failure");
    } finally {
        release();
        game.gga.RoyalMaps[1][12] = 1;
    }
});

test("outposts: a refused Make outpost says why on its row", async () => {
    const root = await openOutposts();
    const row = byClass(root, "outpost-row--kills").find(
        (node) => text(byClass(node, "account-row__index")[0]) === "M3"
    );
    const restore = refuseWrites(game.gga.RoyalMaps, 3);
    try {
        await click(buttonsNamed(row, "Make outpost")[0]);
        assert.match(text(byClass(row, "save-state__label")[0]), /game kept old value/);
        assert.deepEqual(unhandled, []);
    } finally {
        restore();
    }
});

test("outposts: a kill-counter save updates its Kills done", async () => {
    const before = copy(game.gga.RoyalMaps[3]);
    const root = await openOutposts();
    const row = byClass(root, "outpost-row--kills").find(
        (node) => text(byClass(node, "account-row__index")[0]) === "M3"
    );
    const meta = () => text(byClass(row, "outpost-row__meta")[0]);
    assert.equal(meta(), "Kills done 33 / 207");
    const input = elements(row).find((node) => node.nodeName === "input");
    try {
        typeInto(input, "0");
        row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        await until(() => meta() === "Kills done 207 / 207", "the kills done to follow the save");
    } finally {
        game.gga.RoyalMaps[3] = before;
    }
});

test("resource nodes: a reload leaves the rows in the page", async () => {
    const root = (await importRepo("src/ui/pages/classes/royal-armory/3-resources.js")).default.component();
    await until(() => pageRead(root) && byClass(root, "resource-node-row").length, "the resource nodes to load");
    const row = byClass(root, "resource-node-row")[0];
    const takenOut = watchTakenOut(row);
    await click(buttonsNamed(root, "Refresh")[0]);
    assert.equal(byClass(root, "resource-node-row")[0], row);
    assert.equal(takenOut(), 0, "the row was not taken out and put back");
});

test("map bonuses: a bulk 10M that fails partway shows what the game holds", async () => {
    const saved = copy(game.gga.MapBon);
    const root = (await importRepo("src/ui/pages/classes/tesseract/2-map-bonuses.js")).default.component();
    const row = (mapIndex) =>
        byClass(root, "map-crystal-row").find(
            (node) => text(byClass(node, "account-row__index")[0]) === `#${mapIndex}`
        );
    await until(() => pageRead(root) && row(1), "the map bonuses to load");
    const shown = () =>
        elements(row(1))
            .filter((node) => node.nodeName === "input")
            .map((node) => node.value);
    const shownBefore = shown();
    const realFetch = globalThis.fetch;
    let batches = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).endsWith("/game/gga/write-many") && ++batches === 2)
            return new Response(JSON.stringify({ error: "the game refused" }), { status: 500 });
        return realFetch(url, options);
    };
    try {
        await click(buttonsNamed(root, "Set all to 10M")[0]);
        assert.equal(batches, 2, "the second batch was refused");
        assert.deepEqual([...game.gga.MapBon[1]], [10000000, 10000000, 10000000], "the first batch landed");
        await until(() => shown().join() !== shownBefore.join(), "map #1 to show the kills it now holds");
        assert.deepEqual(shown(), Array(3).fill(shown()[0]));
    } finally {
        globalThis.fetch = realFetch;
        saved.forEach((entry, index) => (game.gga.MapBon[index] = entry));
    }
});

test("map bonuses: a reload leaves the rows in the page", async () => {
    const root = (await importRepo("src/ui/pages/classes/tesseract/2-map-bonuses.js")).default.component();
    await until(() => pageRead(root) && byClass(root, "map-crystal-row").length, "the map bonuses to load");
    const row = byClass(root, "map-crystal-row")[0];
    const list = row.parentNode;
    const takenOut = watchTakenOut(row);
    await click(buttonsNamed(root, "Refresh")[0]);
    // ok(a === b): a failed equal on page nodes would print the whole page.
    assert.ok(byClass(root, "map-crystal-row")[0] === row, "the row is the same row");
    assert.ok(row.parentNode === list, "the row stayed in its list");
    assert.ok(elements(root).includes(list), "the list stayed in the page");
    assert.equal(takenOut(), 0, "the row was not taken out and put back");
});

test("masterclass pages: a reload leaves the rows in the page", async () => {
    const root = (await importRepo("src/ui/pages/classes/grimoire/grimoire.js")).default.component();
    await until(() => pageRead(root) && byClass(root, "masterclass-upgrade-row").length, "the grimoire to load");
    const row = byClass(root, "masterclass-upgrade-row")[0];
    const takenOut = watchTakenOut(row);
    await click(buttonsNamed(root, "Refresh")[0]);
    assert.equal(byClass(root, "masterclass-upgrade-row")[0], row);
    assert.equal(takenOut(), 0, "the row was not taken out and put back");
});

test("masterclass pages: a search by index finds the row with that number", async () => {
    const root = (await importRepo("src/ui/pages/classes/grimoire/grimoire.js")).default.component();
    await until(() => pageRead(root) && byClass(root, "masterclass-upgrade-row").length, "the grimoire to load");
    const search = elements(root).find(
        (node) => node.nodeName === "input" && String(node.attributes.placeholder ?? "").includes("OR INDEX")
    );
    const shown = () =>
        byClass(root, "masterclass-upgrade-row").map((row) => text(byClass(row, "account-row__index")[0]));
    for (const [query, first] of [
        ["#5", "#5"],
        ["#1", "#1"],
        ["5", "#5"],
    ]) {
        search.value = query;
        search.listeners.input({ target: search });
        await until(() => shown()[0] === first, `"${query}" to show ${first} first`);
        assert.ok(
            shown().every((label) => label.includes(query.replace("#", ""))),
            `"${query}" shows only matching rows`
        );
    }
});
