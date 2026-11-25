// The Cheats area in the page's own pieces: its nine groups as the shared tabs, each cheat a cheats-panel row with a
// short name and its command under it, Dangerous last and asking before a command runs, the top bar as its search.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
const { store, requests } = await loadUi(router);
globalThis.requestAnimationFrame = () => 0;
// A browser's field always holds text; the fake DOM's has none until it's set.
Object.getPrototypeOf(globalThis.document.createElement("input")).value = "";
await store.loadCheats();

const { Cheats } = await importRepo("src/ui/components/views/Cheats.js");
const { CHEAT_NAMES } = await importRepo("src/ui/menu/cheatNames.js");
const { CATEGORY_ORDER } = await importRepo("src/ui/state/constants.js");
const { isPageCheat } = await importRepo("src/ui/menu/pageCheats.js");
const { valueCommandOf } = await importRepo("src/ui/menu/valueCommands.js");

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await settle();
    }
    assert.fail(`timed out waiting for ${what}`);
}

const area = store.data.cheats.filter((cheat) => !isPageCheat(cheat.value));
const page = Cheats();
await until(() => page.querySelectorAll(".tabbed-list__tab").length > 0, "the tabs");
const rowOf = (command) => elements(page).find((el) => el.attributes["data-cheat"] === command);

test("the nine groups are the shared list's tabs, in their order, with Dangerous last and marked", () => {
    const tabs = page.querySelectorAll(".tabbed-list__tab");
    assert.deepEqual(tabs.map(text), CATEGORY_ORDER);
    assert.equal(CATEGORY_ORDER.at(-1), "Dangerous");
    assert.equal(text(page.querySelector(".tabbed-list__tab .cheats-danger-word")), "Dangerous");
    assert.equal(page.querySelectorAll(".tab-btn").length, 0, "no tab style of its own");
    assert.equal(page.querySelectorAll(".global-search-input").length, 0, "the top bar is its search");
    assert.equal(page.attributes["data-page"], "cheats", "the top bar's This page finds it");
});

test("every cheat of the area is one row: its short name, its command small under it", () => {
    const shown = page.querySelectorAll(".cheats-rows .system-cheats__row").map((row) => row.attributes["data-cheat"]);
    const commands = new Set(area.map((cheat) => valueCommandOf(cheat.value) || cheat.value));
    assert.equal(shown.length, commands.size, "one row each");
    assert.deepEqual(new Set(shown), commands, "every cheat is reachable");
    const reach = rowOf("godlike reach");
    assert.equal(text(reach.querySelector(".account-row__bonus")), "Reach 666");
    assert.equal(text(reach.querySelector(".account-row__name")), "godlike reach");
});

test("the short names are real cheats of the area, on one line, and a cheat that takes a value has its hint", () => {
    for (const [command, { label }] of Object.entries(CHEAT_NAMES)) {
        assert.ok(
            area.some((cheat) => cheat.value === command),
            `${command} is a cheat of the Cheats area`
        );
        assert.ok(label.length <= 30, `"${label}" fits on one line`);
    }
    for (const cheat of area.filter((c) => c.needsParam && CHEAT_NAMES[c.value]))
        assert.ok(CHEAT_NAMES[cheat.value].hint, `${cheat.value} says what its value is`);
});

test("Dangerous says what it can do, and its commands ask on their button before they run", async () => {
    assert.match(text(page.querySelector(".cheats-rows .cheats-warning")), /wipe parts of your save/);
    assert.equal(page.querySelectorAll(".warning-banner").length, 0, "a plain line, not a box");
    const run = rowOf("wipe inv").querySelector(".system-cheats__run");
    assert.match(String(run.attributes.class), /btn-danger/);
    requests.length = 0;
    await run.listeners.click({ currentTarget: run });
    assert.equal(run.attributes["data-again"], "Click again");
    assert.ok(!requests.includes("POST /api/toggle"), "one press didn't run it");
    await run.listeners.click({ currentTarget: run });
    await until(() => requests.includes("POST /api/toggle"), "the second press to run it");
});

test("another tab drops a Click again that waits", async () => {
    const run = rowOf("wipe chest").querySelector(".system-cheats__run");
    await run.listeners.click({ currentTarget: run });
    assert.equal(run.attributes["data-again"], "Click again");
    const tab = (name) => page.querySelectorAll(".tabbed-list__tab").find((el) => text(el) === name);
    tab("Tools").listeners.click();
    await until(() => run.attributes["data-again"] === undefined, "the question to go");
});

test("a value field's hint starts with a capital, and what it can't take is said before anything is sent", async () => {
    const row = rowOf("qnty inv");
    const field = row.querySelector(".system-cheats__value");
    assert.equal(field.attributes.placeholder ?? field.placeholder, "Amount");
    const run = row.querySelector(".system-cheats__run");
    const said = () => text(row.querySelector(".system-cheats__said"));
    for (const [typed, reason] of [
        ["", "Needs a number"],
        ["abc", "Not a number."],
        ["5abc", "Not a number."],
        ["1e999", "Not a number."],
        ["-1", "0 or more."],
    ]) {
        field.value = typed;
        requests.length = 0;
        await run.listeners.click({ currentTarget: run });
        await until(() => said() === reason, `"${typed}" to say ${reason}`);
        assert.ok(!requests.includes("POST /api/toggle"), `"${typed}" isn't sent`);
    }
    field.value = "5";
    await run.listeners.click({ currentTarget: run });
    await until(() => requests.includes("POST /api/toggle"), "a number to run");

    // A value that is words isn't held to numbers.
    const exp = rowOf("wipe exp");
    const button = exp.querySelector(".system-cheats__run");
    requests.length = 0;
    await button.listeners.click({ currentTarget: button });
    await until(() => text(exp.querySelector(".system-cheats__said")) === "Needs a skill", "the skill to be asked for");
    exp.querySelector(".system-cheats__value").value = "all";
    await button.listeners.click({ currentTarget: button });
    await button.listeners.click({ currentTarget: button });
    await until(() => requests.includes("POST /api/toggle"), "words to run");
});

test("a run keeps nothing in the browser: no favorites, no recents", () => {
    assert.equal(store.data.favoriteCheats, undefined);
    assert.equal(store.data.recentCheats, undefined);
    assert.equal(page.querySelectorAll(".cheats-star").length, 0);
});
