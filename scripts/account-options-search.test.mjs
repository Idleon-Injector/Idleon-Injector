// The menu search finds Account Options' slots "Everywhere", by the names the page shows, and opens the page searched
// for the picked slot.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const { setupCheatRoutes } = require("../src/modules/server/routes/cheats");
const SCHEMA = require("../src/ui/config/optionsAccountSchema.json");

const { optionSearchEntries, optionNote, searchMenu } = await importRepo("src/ui/menu/menuModel.js");

// A slot's row as the page's own search reads it: "#1", its name, its note and warning, lower case.
const rowText = (index) =>
    [`#${index}`, SCHEMA[index].name, optionNote(SCHEMA[index]), SCHEMA[index].warning ?? ""]
        .join(" ")
        .toLowerCase()
        .replace(/[_\s]+/g, " ");
const rowsMatching = (words) => Object.keys(SCHEMA).filter((index) => rowText(index).includes(words));

const options = optionSearchEntries(SCHEMA);
const page = { label: "Talent Book", where: "World 1", words: [], target: { world: 1, page: "w1.talent" } };
const cheat = {
    kind: "Cheat",
    label: "talent points",
    where: "Cheat · Cheats › General",
    command: "talent points",
    description: "Free talent points",
    target: { view: "CHEATS", cheat: "talent points" },
};

test("a search that only slots match shows the best three, then one line for the rest, which the page shows too", () => {
    const hits = searchMenu(options, "quick tap");
    const matching = rowsMatching("quick tap");
    assert.ok(matching.length > 4, "the slot list has more than four Quick Tap slots");
    assert.equal(hits.length, 4);
    assert.ok(hits.every((hit) => hit.kind === "Option"));
    assert.deepEqual(
        hits.slice(0, 3).map((hit) => hit.label),
        ["#1 Storage Chest - Quick Tap", "#3 Shop - Quick Tap", "#4 Shop - Quick Tap Tip Seen"],
        "slots named for it, in slot order"
    );
    const more = hits[3];
    assert.equal(more.label, `${matching.length - 3} more in Account Options`);
    assert.deepEqual(more.target, { view: "ACCOUNT_OPTIONS", query: "quick tap" }, "it opens the page searched");
});

test("a slot opens the page searched for that slot alone", () => {
    const [first] = searchMenu(options, "quick tap");
    assert.deepEqual(first.target, { view: "ACCOUNT_OPTIONS", query: "#1 Storage Chest - Quick Tap" });
    assert.deepEqual(rowsMatching(first.target.query.toLowerCase()), ["1"], "the page's search leaves one row");
    assert.equal(first.description, SCHEMA[1].description, "what it does, under its name");
});

test("pages and cheats keep their room next to the slots, and pages stay first", () => {
    const hits = searchMenu([page, cheat, ...options], "talent");
    const kinds = hits.map((hit) => hit.kind ?? "Page");
    assert.equal(kinds[0], "Page");
    assert.ok(kinds.includes("Cheat"));
    assert.equal(kinds.filter((kind) => kind === "Option").length, 4, "three slots and the rest line");
    assert.ok(hits.length <= 8, "at most 8 results");
    assert.match(hits.at(-1).label, /^\d+ more in Account Options$/);
});

test("a search nothing matches shows nothing, and a slot's number finds it", () => {
    assert.deepEqual(searchMenu([page, cheat, ...options], "zzzz"), []);
    assert.equal(searchMenu(options, "#606")[0].label, `#606 ${SCHEMA[606].name}`);
    assert.match(searchMenu(options, "#40")[0].description, /^Unchecked AI guess\. /, "a guess says so");
});

// The bar itself, in the fake DOM: groups, keys, and what a pick opens.
const router = new TinyRouter();
setupCheatRoutes(router, { callHelper: async () => ({ value: [] }), executeCheat: async () => ({ value: {} }) });
const { store } = await loadUi(router);
// The fake DOM has no pages on show: the page search finds no pane for the page that opens.
globalThis.document.querySelector ??= () => null;
store.app.config = { cheatConfig: {} };
// The page's slot list, as the search's first use loads it (the fake server doesn't serve files).
store.data.accountSchema = SCHEMA;
const { MenuSearch } = await importRepo("src/ui/components/MenuSearch.js");
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const find = (node, match) => (match(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, match)));
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const bar = MenuSearch();
const field = find(bar, (node) => node.nodeName === "input")[0];
field.focus = field.blur = field.setSelectionRange = () => {};
const key = async (name) => {
    field.listeners.keydown({ key: name, preventDefault() {}, stopPropagation() {} });
    await settle();
};
const type = async (value) => {
    field.value = value;
    field.listeners.input({ target: field });
    await settle();
};
const picked = () =>
    find(bar, (node) => node.attributes?.role === "option" && node.attributes["aria-selected"] === "true").map(text)[0];

test("the bar shows the slots in an Account Options group; the keys walk to them and Enter opens the page searched", async () => {
    await type("quick tap");
    const groups = find(bar, (node) => node.attributes?.role === "group").map(
        (group) => group.attributes["aria-label"]
    );
    assert.deepEqual(groups, ["Account Options"]);
    const rows = find(bar, (node) => node.attributes?.role === "option").map(text);
    assert.equal(rows[0], `#1 Storage Chest - Quick Tap${SCHEMA[1].description}`, "its name, then what it does");
    assert.match(rows[3], /^\d+ more in Account Options$/, "the rest is one line, with nothing under it");

    await key("ArrowDown");
    assert.equal(picked(), rows[1]);
    await key("ArrowDown");
    await key("ArrowDown");
    assert.equal(picked(), rows[3], "the keys reach the rest line");
    await key("ArrowDown");
    assert.equal(picked(), rows[0], "and wrap to the top");

    await key("Enter");
    await settle();
    assert.equal(store.app.activeTab, "account-options-tab", "Account Options opens");
    assert.equal(field.attributes.value, "#1 Storage Chest - Quick Tap", "with This page searched for the slot");
    assert.equal(find(bar, (node) => node.attributes?.role === "option").length, 0, "the results close");
});

test("picking a slot while Account Options is open searches it there", async () => {
    // The fake DOM has no rows, so the bar searches everywhere here, as it does with Everywhere picked.
    await type("talent points");
    await key("Enter");
    await settle();
    assert.equal(store.app.activeTab, "account-options-tab");
    assert.match(field.attributes.value, /^#\d+ Talent Points/, "the first slot that matches, searched on the page");
});
