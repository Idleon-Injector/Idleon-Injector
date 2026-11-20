// The menu search's command box, driven by keys in the fake DOM, against the real cheat routes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const { setupCheatRoutes } = require("../src/modules/server/routes/cheats");

// Rows as GET /api/cheats returns them.
const SUGGESTIONS = [
    { value: "wide", message: "all account-wide cheats", category: "wide" },
    { value: "wide candy", message: "candy use everywhere", category: "wide" },
    { value: "wipe inv", message: "Wipe your inventory", category: "wipe", dangerous: true },
    { value: "drop Timecandy1", message: "24 Hr Time Candy", category: "drop", needsParam: true },
    { value: "nomore Timecandy1", message: "24 Hr Time Candy", category: "nomore" },
];

const ran = [];
const router = new TinyRouter();
setupCheatRoutes(router, {
    callHelper: async () => ({ value: SUGGESTIONS }),
    executeCheat: async (action) => {
        ran.push(action);
        return { value: { ok: true, message: `${action} (ran)` } };
    },
});
const { store } = await loadUi(router);
store.app.config = { cheatConfig: {} };
await store.loadCheats();
const { MenuSearch } = await importRepo("src/ui/components/MenuSearch.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const text = (node) => (typeof node === "string" ? node : (node.childNodes ?? []).map(text).join(""));

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
const results = () => find(bar, (node) => node.attributes?.role === "option").map(text);
const hint = () => find(bar, (node) => node.attributes?.id === "menu-command-hint").map(text)[0] ?? "";
const isCommandBox = () => bar.attributes.class.includes("is-command");

test("picking a command fills the box without running it; Enter runs it once, with the amount typed", async () => {
    await type("candy");
    const list = results();
    assert.equal(list[0], "wide candyCheat · Cheats › Wide", "the cheat first");
    const drop = list.findIndex((row) => row.startsWith("drop · 24 Hr Time Candy"));
    assert.ok(drop > 0, "then the candy drop");

    for (let i = 0; i < drop; i++) await key("ArrowDown");
    await key("Enter");
    assert.equal(field.value, "drop Timecandy1 ");
    assert.ok(isCommandBox(), "the box is a command box");
    assert.match(hint(), /24 Hr Time Candy/);
    assert.match(hint(), /Amount optional · Enter runs · Esc cancels/);
    assert.deepEqual(ran, [], "picking doesn't run it");

    await type("drop Timecandy1 5");
    await key("Enter");
    await key("Enter");
    await settle();
    assert.deepEqual(ran, ["drop Timecandy1 5"], "Enter runs it once, through /api/toggle");
    assert.equal(store.app.toast.message, "Cheat drop Timecandy1 5 (ran)", "the result shows as a toast");
    assert.equal(field.value, "");
    assert.ok(!isCommandBox(), "back to searching");
});

test("a dangerous command needs a second Enter, and Esc backs out", async () => {
    ran.length = 0;
    await type("wipe inv");
    await key("Enter");
    assert.equal(field.value, "wipe inv ");
    await key("Enter");
    assert.deepEqual(ran, [], "the first Enter only asks");
    assert.match(hint(), /Press Enter again to run wipe inv/);
    await key("Escape");
    assert.equal(field.value, "");
    assert.ok(!isCommandBox());
    assert.deepEqual(ran, [], "Esc cancels");

    await type("wipe inv");
    await key("Enter");
    await key("Enter");
    await type("wipe inv ");
    assert.doesNotMatch(hint(), /again/, "editing the command asks again");
    await key("Enter");
    await key("Enter");
    await settle();
    assert.deepEqual(ran, ["wipe inv"]);
});

test("Esc in the command box goes back to an empty search", async () => {
    ran.length = 0;
    await type("candy");
    await key("ArrowDown");
    await key("Enter");
    assert.ok(isCommandBox());
    await key("Escape");
    assert.equal(field.value, "");
    assert.ok(!isCommandBox());
    await type("candy");
    assert.ok(results().length > 0, "searching works again");
    assert.deepEqual(ran, []);
});
