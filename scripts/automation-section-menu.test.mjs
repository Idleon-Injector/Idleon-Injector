// The sidebar's Automation entry (#249, Lumi's picks on #255): it opens like the worlds, its list only, and its code
// column shows its drawing instead of "AUT".
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");

const router = new TinyRouter();
// The sidebar's My cheats reads the startup cheats from the config.
router.get("/api/config", (req, res) => res.json({ startupCheats: [] }));
const { store } = await loadUi(router);
// The Sidebar reads the window size when it loads, the pins listen for the window's focus, and the Sidebar's status line
// listens on the document for outside clicks.
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
globalThis.document.addEventListener = () => {};
const { Sidebar } = await importRepo("src/ui/components/Sidebar.js");
const { menuLevel } = await importRepo("src/ui/components/MenuLevels.js");
const { menuTree } = await importRepo("src/ui/menu/pageRegistry.js");
const { buildMenuTree, definePage } = await importRepo("src/ui/menu/menuModel.js");
// One page in World 2 and the Automation section, so each has a list to open.
const page = (id, world, system) => definePage({ id, world, system, description: "x", component: () => null });
menuTree.val = buildMenuTree([page("w2.bubbles", 2, "Alchemy"), page("automation.overview", "automation", "Overview")]);

const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const entry = (sidebar, key) => find(sidebar, (node) => node.attributes?.["data-key"] === String(key))[0];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const place = () => ({ tab: store.app.activeTab, world: store.app.menuWorld, page: store.app.menuPage });

for (const [key, first] of [
    [2, "Alchemy"],
    ["automation", "Overview"],
]) {
    test(`picking ${key === 2 ? "World 2" : "Automation"} opens its list and leaves the open page as it was`, async () => {
        store.openMenu({ view: "HOME" });
        await settle();
        menuLevel.val = null;
        const before = place();
        globalThis.document.activeElement = null; // not left from the test before
        // The list renders all the way: a render that throws is only logged.
        const errors = [];
        const log = console.error;
        console.error = (...args) => errors.push(args.join(" "));
        try {
            entry(Sidebar(), key).listeners.click();
            await settle();
        } finally {
            console.error = log;
        }
        assert.deepEqual(errors, []);
        assert.equal(menuLevel.val, key, "its list shows");
        assert.deepEqual(place(), before, "no page opened");
        const focused = globalThis.document.activeElement;
        assert.match(focused.className ?? focused.attributes.class, /drill-item/, "focus on an entry of the list");
        assert.equal(text(focused), first, "its first entry");
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
