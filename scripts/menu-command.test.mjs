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
        if (action.endsWith(" 99")) await new Promise((resolve) => setTimeout(resolve, 100)); // a slow command
        if (action.startsWith("nomore")) return { value: { ok: false, message: "the item list isn't loaded yet" } };
        return { value: { ok: true, message: `${action} (ran)` } };
    },
});
const { store } = await loadUi(router);
store.app.config = { cheatConfig: {} };
await store.loadCheats();
const { MenuSearch } = await importRepo("src/ui/components/MenuSearch.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));

const bar = MenuSearch();
const field = find(bar, (node) => node.nodeName === "input")[0];
field.focus = field.blur = field.setSelectionRange = () => {};
const key = async (name, extra = {}) => {
    field.listeners.keydown({ key: name, preventDefault() {}, stopPropagation() {}, ...extra });
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
// The line under the box that says what the last command did (#77).
const resultLine = () => {
    const line = find(bar, (node) => node.attributes?.class?.includes?.("menu-command-result"))[0];
    const said = find(line, (node) => node.attributes?.role === "status")[0];
    return { shown: !line.attributes.hidden && !line.hidden, text: text(line), tone: said.attributes.class };
};

test("picking a command fills the box without running it; Enter runs it once, with the amount typed", async () => {
    await type("candy");
    const list = results();
    assert.equal(list[0], "wide candyCandy use everywhere", "the cheat first, with what it does under it");
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
    assert.equal(field.value, "");
    assert.ok(!isCommandBox(), "back to searching");
    const line = resultLine();
    assert.ok(line.shown, "the result shows in a line under the box");
    assert.equal(line.text, "drop Timecandy1 5drop Timecandy1 5 (ran)", "the command, then what it said");
    assert.match(line.tone, /said--done/);

    await type("c");
    assert.ok(!resultLine().shown, "typing again puts the search back in its place");
});

test("results come in groups, each together, and the arrow keys follow the order shown", async () => {
    await type("candy");
    const groups = find(bar, (node) => node.attributes?.role === "group");
    assert.deepEqual(
        groups.map((group) => group.attributes["aria-label"]),
        ["Cheats", "Commands"],
        "the cheat's group first, where its best result ranked"
    );
    const shown = groups.flatMap((group) => find(group, (node) => node.attributes?.role === "option").map(text));
    assert.deepEqual(shown, results(), "every result sits in its group, in the listbox's order");
    await key("ArrowDown");
    const picked = find(
        bar,
        (node) => node.attributes?.role === "option" && node.attributes["aria-selected"] === "true"
    );
    assert.equal(text(picked[0]), shown[1], "ArrowDown picks the next row shown");
    await key("Escape");
});

test("a command that fails says why in the line under the box", async () => {
    ran.length = 0;
    await type("nomore");
    const nomore = results().findIndex((row) => row.startsWith("nomore"));
    assert.ok(nomore >= 0);
    for (let i = 0; i < nomore; i++) await key("ArrowDown");
    await key("Enter");
    await key("Enter");
    await settle();
    assert.deepEqual(ran, ["nomore Timecandy1"]);
    const line = resultLine();
    assert.ok(line.shown);
    assert.equal(line.text, "nomore Timecandy1the item list isn't loaded yet");
    assert.match(line.tone, /said--failed/);
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

test("a held Enter can't pick, arm and run a dangerous command: each step needs its own press", async () => {
    ran.length = 0;
    await type("wipe inv");
    await key("Enter");
    assert.ok(isCommandBox());
    await key("Enter", { repeat: true });
    await key("Enter", { repeat: true });
    assert.doesNotMatch(hint(), /again/, "a repeat doesn't arm it");
    await key("Enter");
    assert.match(hint(), /Press Enter again to run wipe inv/);
    await key("Enter", { repeat: true });
    await settle();
    assert.deepEqual(ran, [], "a repeat doesn't run it");
    await key("Escape");
});

test("an Enter that confirms IME input doesn't run the command", async () => {
    ran.length = 0;
    await type("candy");
    await key("ArrowDown");
    await key("Enter");
    assert.ok(isCommandBox());
    await key("Enter", { isComposing: true });
    await key("Enter", { keyCode: 229 });
    await settle();
    assert.deepEqual(ran, [], "composition Enters run nothing");
    assert.ok(isCommandBox(), "still in the command box");
    await key("Escape");
});

test("if the cheat list didn't load at start, opening search loads it again", async () => {
    const loaded = store.data.cheats;
    store.data.cheats = [];
    field.listeners.focus({});
    await settle();
    assert.ok(store.data.cheats.length > 0, "the list loaded again");
    store.data.cheats = loaded;
});

test("an unrelated load in progress doesn't stop the retry, and two focuses load the list once", async () => {
    const loaded = store.data.cheats;
    store.data.cheats = [];
    store.app.isLoading = true; // say, Settings loading its config
    let fetches = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (url, ...rest) => {
        if (String(url).includes("/api/cheats")) fetches++;
        return realFetch(url, ...rest);
    };
    field.listeners.focus({});
    field.listeners.focus({});
    await settle();
    globalThis.fetch = realFetch;
    store.app.isLoading = false;
    assert.ok(store.data.cheats.length > 0, "the list loaded although another load was running");
    assert.equal(fetches, 1, "the second focus waited for the first load");
    store.data.cheats = loaded;
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

test("a slow command that ends after a later one doesn't say its result over the later one's", async () => {
    ran.length = 0;
    const pick = async (word) => {
        await type(word);
        const at = results().findIndex((row) => row.startsWith(word));
        for (let i = 0; i < at; i++) await key("ArrowDown");
        await key("Enter");
    };
    await pick("drop");
    await type("drop Timecandy1 99");
    await key("Enter"); // runs, slowly
    await pick("nomore");
    await key("Enter"); // runs and fails at once
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(ran, ["drop Timecandy1 99", "nomore Timecandy1"]);
    assert.equal(resultLine().text, "nomore Timecandy1the item list isn't loaded yet", "the later failure stays");
    assert.match(resultLine().tone, /said--failed/);
});
