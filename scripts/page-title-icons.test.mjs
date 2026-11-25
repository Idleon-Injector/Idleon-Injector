// A page's title shows its system's drawing, the one beside its entry in the sidebar, whatever the page is called:
// Breeding's Pets shows Breeding's, not World 1 Pets', and Alchemy's Bubbles shows Alchemy's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";
import { byClass, loadPage, pageFiles } from "./page-standards/checks.mjs";

// An automation page follows the game on an interval for the whole session; here that may not keep the run open.
const everyInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => everyInterval(...args).unref();

const { router } = await createFakeApi(fakeGameData());
await loadUi(router);
const { Icons } = await importRepo("src/ui/assets/icons.js");

// A drawing as its shapes, so two drawings compare by what they draw.
const shapes = (node) =>
    JSON.stringify(
        (node?.childNodes ?? []).filter((el) => el.nodeType === 1).map((el) => [el.nodeName, el.attributes])
    );

test("every page's title shows its system's drawing, or none when the system has none", async () => {
    const wrong = [];
    let drawn = 0;
    for (const file of pageFiles()) {
        const page = await loadPage(file);
        const header = byClass(page.component(), "account-tab-header")[0];
        if (!header) continue;
        const shown = byClass(header, "account-tab-header__icon")[0]?.childNodes[0] ?? null;
        const drawing = Icons.System({ name: page.system });
        if (drawing) drawn++;
        if (shapes(shown) !== shapes(drawing)) wrong.push(`${page.id}: not ${page.system}'s drawing`);
    }
    assert.deepEqual(wrong, []);
    assert.ok(drawn > 60, `only ${drawn} titles with a drawing were checked`);
});

test("a view outside the menu still finds its drawing by its title", async () => {
    const { AccountTabHeader } = await importRepo("src/ui/components/views/account/components/AccountTabHeader.js");
    const icon = byClass(AccountTabHeader({ title: "Save copies" }), "account-tab-header__icon")[0];
    assert.equal(shapes(icon.childNodes[0]), shapes(Icons.System({ name: "Save copies" })));
});
