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
const { store } = await loadUi(router);
const { CheatItem } = await importRepo("src/ui/components/CheatItem.js");
// The Sidebar reads the window size when it loads, and its notification bell listens on the document.
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.document.addEventListener = () => {};
const { Sidebar } = await importRepo("src/ui/components/Sidebar.js");
const { Home } = await importRepo("src/ui/components/views/Home.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const button = (cheat) => CheatItem({ value: cheat, message: cheat }).childNodes[0];
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
    await store.executeCheat("fixture nested deep 5", "a value");
    await store.executeCheat("fixture broken", "a cheat that throws");
    assert.deepEqual(sent, [
        ["fixture", true],
        ["fixture nested deep 5", undefined],
        ["fixture broken", undefined],
    ]);
    assert.equal(game.state.cheatState.fixtures, true);
    await store.executeCheat("fixture", "fixture", false);
});

test("a failed cheat shows an error toast and its button flashes red, not green", async () => {
    const item = button("fixture broken");
    await item.listeners.click();
    await settle();

    const { type, message } = store.app.toast;
    assert.deepEqual(
        { type, message },
        { type: "error", message: "Error executing 'fixture broken': game value missing" }
    );
    assert.match(item.className ?? item.attributes.class, /feedback-error/);
    assert.doesNotMatch(item.className ?? item.attributes.class, /feedback-success/);

    const ok = button("godlike crit");
    await ok.listeners.click();
    await settle();
    assert.equal(store.app.toast.type, "success");
    assert.match(ok.className ?? ok.attributes.class, /feedback-success/);
    await store.executeCheat("godlike crit", "", false);
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
