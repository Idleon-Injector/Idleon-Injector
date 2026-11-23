// The sidebar's Automation entry (#249, Lumi's picks on #255): it opens like the worlds, its list only, and its code
// column shows its drawing instead of "AUT".
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");

const { store } = await loadUi(new TinyRouter());
// The Sidebar reads the window size when it loads, and its status line listens on the document for outside clicks.
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.document.addEventListener = () => {};
const { Sidebar } = await importRepo("src/ui/components/Sidebar.js");
const { menuLevel } = await importRepo("src/ui/components/MenuLevels.js");

const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const entry = (sidebar, key) => find(sidebar, (node) => node.attributes?.["data-key"] === String(key))[0];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const place = () => ({ tab: store.app.activeTab, world: store.app.menuWorld, page: store.app.menuPage });

for (const key of [2, "automation"]) {
    test(`picking ${key === 2 ? "World 2" : "Automation"} opens its list and leaves the open page as it was`, async () => {
        store.openMenu({ view: "HOME" });
        await settle();
        menuLevel.val = null;
        const before = place();
        entry(Sidebar(), key).listeners.click();
        await settle();
        assert.equal(menuLevel.val, key, "its list shows");
        assert.deepEqual(place(), before, "no page opened");
    });
}

test("Automation's code column shows its drawing, not AUT, in the menu and atop its list", async () => {
    const codeOf = (node) =>
        find(node, (el) => /menu-nav-code/.test(el.className ?? el.attributes?.class ?? ""))[0].childNodes[0];
    menuLevel.val = null;
    await settle();
    assert.equal(codeOf(entry(Sidebar(), "automation")).nodeName, "svg");
    assert.equal(
        String(codeOf(entry(Sidebar(), 2)).data ?? codeOf(entry(Sidebar(), 2))),
        "W2",
        "a world keeps its code"
    );
    menuLevel.val = "automation";
    await settle();
    const head = find(Sidebar(), (el) => /drill-title/.test(el.className ?? el.attributes?.class ?? ""))[0];
    assert.equal(codeOf(head).nodeName, "svg");
});
