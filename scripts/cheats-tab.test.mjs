// The Cheats area in the page's own pieces: its nine groups as the shared tabs, each cheat a cheats-panel row with a
// short name and its command under it, Dangerous last and asking before a command runs, the top bar as its search,
// and Favorites and Recent beside the list.
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
    assert.match(text(page.querySelector(".cheats-rows .warning-banner")), /wipe parts of your save/);
    const run = rowOf("wipe inv").querySelector(".system-cheats__run");
    assert.match(String(run.attributes.class), /btn-danger/);
    requests.length = 0;
    await run.listeners.click({ currentTarget: run });
    assert.equal(run.attributes["data-again"], "Click again");
    assert.ok(!requests.includes("POST /api/toggle"), "one press didn't run it");
    await run.listeners.click({ currentTarget: run });
    await until(() => requests.includes("POST /api/toggle"), "the second press to run it");
});

test("a row's star keeps what it would run, with its value, under Favorites; pressing it there runs it", async () => {
    const row = rowOf("multiply damage");
    const field = row.querySelector(".system-cheats__value");
    const star = row.querySelector(".cheats-star");
    field.value = "7";
    row.listeners.input();
    await star.listeners.click();
    await until(() => star.attributes["aria-pressed"] === "true", "the star to light");
    assert.ok(store.isFavorite("multiply damage 7"));

    // A favorite of several words (a command and its value) is one row of its own.
    store.toggleFavorite("w7 sushitools knowledge 3 500");
    const quick = () => elements(page).filter((el) => el.attributes["data-quick"]);
    await until(() => quick().length === 2, "both favorites to show");
    const several = quick().find((el) => el.attributes["data-quick"] === "w7 sushitools knowledge 3 500");
    assert.equal(text(several.querySelector(".my-cheat__name")), "w7 sushitools knowledge 3 500");

    requests.length = 0;
    await several.querySelector(".my-cheat__name").listeners.click();
    await until(() => requests.includes("POST /api/toggle"), "the favorite to run");

    // It ran, so Recent has it too; "remove" takes it out of Favorites only.
    await several.querySelector(".my-cheat__move").listeners.click();
    const favorites = () => quick().filter((el) => el.querySelector(".my-cheat__move"));
    await until(() => favorites().length === 1, "remove");
    assert.ok(
        quick().some((el) => el.attributes["data-quick"] === "w7 sushitools knowledge 3 500"),
        "still in Recent"
    );
    store.toggleFavorite("multiply damage 7");
});
