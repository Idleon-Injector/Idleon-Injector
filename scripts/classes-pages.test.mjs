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
