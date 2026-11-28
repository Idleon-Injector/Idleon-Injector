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
game.defineCheat({ name: "fixture ok", message: "a cheat that runs", fn: () => "it ran" });
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
// The Sidebar reads the window size when it loads, the pins listen for the window's focus, and the Sidebar's status line
// listens on the document for outside clicks.
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
globalThis.document.addEventListener = () => {};
const { CheatRow } = await importRepo("src/ui/components/SystemCheats.js");
const { default: van } = await importRepo("src/ui/vendor/van-1.6.0.js");
// The cheat list as the Cheats area gets it, which tells a row whether its cheat switches on and off.
store.data.cheats = [
    { value: "godlike crit", toggle: true },
    { value: "fixture", toggle: true },
    { value: "multiply damage", toggle: true, needsParam: true },
    { value: "fixture broken" },
    { value: "fixture ok" },
    { value: "fixture nested deep", needsParam: true },
];
// A browser's field always holds text; the fake DOM's has none until it's set.
Object.getPrototypeOf(globalThis.document.createElement("input")).value = "";
const { Sidebar } = await importRepo("src/ui/components/Sidebar.js");
const { Home } = await importRepo("src/ui/components/views/Home.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
// A cheat's row, as the Cheats area and a page's cheats panel show it: a switch for an on/off cheat, else Run.
const rowFor = (cheat, more = {}) =>
    CheatRow({ cheat, label: cheat, ...more }, { openId: van.state(null), config: van.state(null) });
const switchOf = (row) => find(row, (node) => node.attributes?.role === "switch")[0];
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const runOf = (row) => find(row, (node) => /system-cheats__run/.test(classOf(node)))[0];
const run = (row) => runOf(row).listeners.click({ currentTarget: runOf(row) });
const saidOf = (row) => find(row, (node) => /system-cheats__said/.test(classOf(node)))[0];
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const classOf = (node) => node.className ?? node.attributes?.class ?? "";
const crit = () => game.state.cheatState.godlike.crit;

test("a cheat's switch sets the state the player asked for, so a double flip can't turn it back", async () => {
    await store.loadCheatStates();
    assert.equal(crit(), false);
    sent.length = 0;

    const row = rowFor("godlike crit");
    await Promise.all([flip(row, true), flip(row, true)]); // both flips saw it off
    assert.ok(sent.length > 0 && sent.every((call) => call[0] === "godlike crit" && call[1] === true), sent.join(" "));
    assert.equal(crit(), true, "the cheat stays on");

    await store.loadCheatStates();
    sent.length = 0;
    await flip(rowFor("godlike crit"), false); // now it shows on, and the switch turns it off
    assert.deepEqual(sent, [["godlike crit", false]]);
    assert.equal(crit(), false);
});

test("a parent's row sets its own flag; a cheat with a value or no state still runs as before", async () => {
    await store.loadCheatStates();
    sent.length = 0;
    const parent = rowFor("fixture");
    await (switchOf(parent) ? flip(parent, true) : run(parent));
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

test("a failed cheat says why on a line under its name, and a cheat that ran says so there", async () => {
    const row = rowFor("fixture broken");
    await run(row);
    await settle();
    const line = saidOf(row);
    assert.equal(line.attributes.role, "status", "screen readers hear it");
    assert.match(classOf(line), /said--failed/);
    assert.equal(text(line), "game value missing", "the reason, in place, without the toast's prefix");
    assert.equal(runOf(row).attributes["data-confirmed"], undefined, "a failure doesn't confirm");

    const okRow = rowFor("fixture ok");
    await run(okRow);
    await settle();
    assert.match(classOf(saidOf(okRow)), /said--done/);
    assert.ok(text(saidOf(okRow)).length > 0, "the cheat's own words show on its row");
    assert.equal(runOf(okRow).attributes["data-confirmed"], "", "the row confirms in place");
});

test("a cheat that needs a value refuses on its row and pulses its value field", async () => {
    const row = rowFor("fixture nested deep", { hint: "value" });
    const field = find(row, (node) => /system-cheats__value/.test(classOf(node)))[0];
    sent.length = 0;
    await run(row);
    await settle();
    assert.deepEqual(sent, [], "nothing ran");
    assert.equal(field.attributes["data-refused"], "", "the value field pulses");
    assert.match(classOf(saidOf(row)), /said--refused/);
    assert.equal(text(saidOf(row)), "Needs a value");
});

// In-game check: a multiply cheat that was on said "needs a value" when its row was clicked to turn it off.
test("a cheat that takes a value turns off from its own row without one", async () => {
    await store.executeCheat("multiply damage 2");
    await store.loadCheatStates();
    assert.equal(game.state.cheatState.multiply.damage, true);
    const row = rowFor("multiply damage", { hint: "times" });
    sent.length = 0;
    await flip(row, false);
    await settle();
    assert.deepEqual(sent, [["multiply damage", false]], "turned off, not refused");
    assert.equal(game.state.cheatState.multiply.damage, false);

    await store.loadCheatStates();
    sent.length = 0;
    await flip(row, true);
    await settle();
    assert.deepEqual(sent, [], "off, it still needs a value to turn on");
});

// My cheats is Home's right column: a cheat row per cheat, with its real switch.
test("My cheats lists the cheats that are on, and its switch turns exactly that cheat off", async () => {
    await game.cheat("godlike crit", true);
    await store.loadCheatStates();
    const home = Home();
    await settle();
    const rows = find(home, (node) => node.attributes?.["data-cheat"]);
    const names = rows.map((row) => row.attributes["data-cheat"]);
    assert.ok(names.includes("godlike crit"), names.join(", "));

    sent.length = 0;
    await flip(rows[names.indexOf("godlike crit")], false);
    await settle();
    assert.deepEqual(sent, [["godlike crit", false]]);
    assert.equal(crit(), false);
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
