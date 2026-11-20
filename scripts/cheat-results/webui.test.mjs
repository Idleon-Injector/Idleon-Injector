// Each file runs in its own process, so the cheat code and the store here are fresh copies.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadGame, loadUi } from "../known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { createGameBridge } = require("../../src/modules/game/gameBridge");
const { setupCheatRoutes } = require("../../src/modules/server/routes/cheats");

const game = await loadGame();
game.defineCheat({
    name: "fixture broken",
    message: "a cheat that throws",
    fn: () => {
        throw new TypeError("game value missing");
    },
});
game.defineCheat({
    name: "fixture",
    message: "fixture parent",
    subcheats: [{ name: "nested", message: "nested", subcheats: [{ name: "deep", message: "deep" }] }],
});

// What the WebUI asked the game for: each cheat with the state it set (undefined = flip).
const sent = [];
const bridge = createGameBridge(game.runtime, "context");
const executeCheat = bridge.executeCheat;
bridge.executeCheat = (action, on) => {
    sent.push([action, on]);
    return executeCheat(action, on);
};
const router = new TinyRouter();
setupCheatRoutes(router, bridge);
const { store, requests } = await loadUi(router);
const { CheatItem } = await importRepo("src/ui/components/CheatItem.js");
// The Sidebar reads the window size when it loads, and its status line listens on the document for outside clicks.
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.document.addEventListener = () => {};
const { Sidebar, turnOff } = await importRepo("src/ui/components/Sidebar.js");
const { useSaid } = await importRepo("src/ui/components/inPlace.js");
const { Home } = await importRepo("src/ui/components/views/Home.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const button = (cheat) => CheatItem({ value: cheat, message: cheat }).childNodes[0];
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const classOf = (node) => node.className ?? node.attributes?.class ?? "";
const crit = () => game.state.cheatState.godlike.crit;

test("a cheat button sets the state the player clicked, so a double click can't flip it back", async () => {
    await store.loadCheatStates();
    assert.equal(crit(), false);
    sent.length = 0;

    const item = button("godlike crit");
    await Promise.all([item.listeners.click(), item.listeners.click()]); // both clicks saw it off

    assert.deepEqual(sent, [
        ["godlike crit", true],
        ["godlike crit", true],
    ]);
    assert.equal(crit(), true, "the cheat stays on");

    await store.loadCheatStates();
    sent.length = 0;
    await button("godlike crit").listeners.click(); // now it shows on, so a click turns it off
    assert.deepEqual(sent, [["godlike crit", false]]);
    assert.equal(crit(), false);
});

test("a parent's button sets its own flag; a cheat with a value or no state still runs as before", async () => {
    await store.loadCheatStates();
    sent.length = 0;
    await button("fixture").listeners.click();
    await store.executeCheat("fixture nested deep 5");
    await store.executeCheat("fixture broken");
    assert.deepEqual(sent, [
        ["fixture", true],
        ["fixture nested deep 5", undefined],
        ["fixture broken", undefined],
    ]);
    assert.equal(game.state.cheatState.fixtures, true);
    await store.executeCheat("fixture", false);
});

test("a failed cheat says why on a line under its row, and a cheat that ran says so on the row", async () => {
    const row = CheatItem({ value: "fixture broken", message: "fixture broken" });
    const runButton = row.childNodes[0];
    await runButton.listeners.click();
    await settle();

    const line = find(row, (node) => /said--row-failed/.test(classOf(node)))[0];
    assert.equal(line.attributes.role, "status", "screen readers hear it");
    assert.match(classOf(line), /said--failed/);
    assert.equal(text(line), "game value missing", "the reason, in place, without the toast's prefix");
    assert.match(classOf(runButton), /is-failed/);
    assert.equal(runButton.attributes["data-confirmed"], undefined, "a failure doesn't confirm");

    const okRow = CheatItem({ value: "godlike crit", message: "godlike crit" });
    const okButton = okRow.childNodes[0];
    await okButton.listeners.click();
    await settle();
    const said = find(okButton, (node) => /said--row/.test(classOf(node)))[0];
    assert.match(classOf(said), /said--done/);
    assert.ok(text(said).length > 0, "the cheat's own words show on its row");
    assert.equal(okButton.attributes["data-confirmed"], "", "the row confirms in place");
    assert.doesNotMatch(classOf(okButton), /is-failed/);
    await store.executeCheat("godlike crit", false);
});

test("a cheat that needs a value refuses on its row and pulses its value field", async () => {
    const row = CheatItem({ value: "fixture nested deep", message: "deep", needsParam: true });
    const [runButton, field] = row.childNodes;
    field.value = ""; // the fake DOM's input has no value of its own
    sent.length = 0;
    await runButton.listeners.click();
    await settle();
    assert.deepEqual(sent, [], "nothing ran");
    assert.equal(field.attributes["data-refused"], "", "the value field pulses");
    const said = find(runButton, (node) => /said--row/.test(classOf(node)))[0];
    assert.match(classOf(said), /said--refused/);
    assert.equal(text(said), "needs a value");
});

for (const [where, render] of [
    ["the sidebar", () => Sidebar()],
    ["Home", () => Home()],
]) {
    test(`clicking a cheat in ${where}'s active list turns exactly that cheat off, at any depth`, async () => {
        await game.cheat("fixture nested deep", true);
        await game.cheat("godlike crit", true);
        await store.loadCheatStates();
        const page = render();
        await settle();
        const items = find(page, (node) => node.attributes?.class === "active-cheat-item");
        const names = items.map((item) => item.childNodes[0].childNodes.map((text) => text.data ?? text).join(""));
        assert.deepEqual([...names].sort(), ["fixture nested deep", "godlike crit"]);

        sent.length = 0;
        await items[names.indexOf("fixture nested deep")].listeners.click();
        await items[names.indexOf("fixture nested deep")].listeners.click(); // a double click
        assert.deepEqual(sent, [
            ["fixture nested deep", false],
            ["fixture nested deep", false],
        ]);
        assert.equal(game.state.cheatState.fixture.nested.deep, false);
        assert.equal(crit(), true, "the other active cheat stays on");
    });
}

test("a failed turn-off is said until that cheat turns off; another cheat's failure stays", async (t) => {
    const results = [];
    t.mock.method(store, "executeCheat", async () => results.shift());
    const line = useSaid();

    results.push({ ok: false, message: "the game didn't answer" });
    await turnOff("godlike crit", line);
    assert.equal(line.said.val.text, "godlike crit: the game didn't answer");

    results.push({ ok: true, message: "done" });
    await turnOff("wide candy", line);
    assert.equal(line.said.val.text, "godlike crit: the game didn't answer", "another cheat working says nothing");

    results.push({ ok: true, message: "done" });
    await turnOff("godlike crit", line);
    assert.equal(line.said.val, null, "the retry worked, so the failure goes");
});

test("the version button says a failed update check, and says 'the latest' only after a check that worked", async (t) => {
    store.app.appInfo = { version: "3.0.0" };
    const sidebar = Sidebar();
    const version = find(sidebar, (node) => /brand-version-button/.test(classOf(node)))[0];
    const click = async () => {
        await version.listeners.click({ currentTarget: version });
        await settle();
    };

    // This fixture has no update route, so the check fails.
    await click();
    assert.match(version.attributes["aria-label"], /^Current version\. The update check failed: .*not registered/);
    assert.match(classOf(version), /is-failed/);
    assert.match(version.attributes.title, /^The update check failed: /, "said on hover too");

    t.mock.method(store, "openUpdateModal", async () => false);
    await click();
    assert.equal(version.attributes["aria-label"], "Current version: it's the latest");
    assert.doesNotMatch(classOf(version), /is-failed/);
});

test("two quick clicks on the version button share one update check, so an older answer can't land last", async () => {
    store.app.appInfo = { version: "3.0.0" };
    const sidebar = Sidebar();
    const version = find(sidebar, (node) => /brand-version-button/.test(classOf(node)))[0];
    const checks = () => requests.filter((line) => line.includes("/update/check")).length;
    const before = checks();

    await Promise.all([
        version.listeners.click({ currentTarget: version }),
        version.listeners.click({ currentTarget: version }),
    ]);
    assert.equal(checks() - before, 1, "the second click waited for the first check");
    await version.listeners.click({ currentTarget: version });
    assert.equal(checks() - before, 2, "a click after it ended checks again");
});
