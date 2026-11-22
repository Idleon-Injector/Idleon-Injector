// A system's pages in groups (the Hole's Villagers, then its Caverns): a page declares its group, and the sidebar's
// list heads each group with a quiet label where the group changes. The label is words only: nothing to press or focus.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.window ??= globalThis;
globalThis.window.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.Element ??= class {};

const { buildMenuTree, definePage } = await importRepo("src/ui/menu/menuModel.js");
const { menuTree } = await importRepo("src/ui/menu/pageRegistry.js");
const { LevelItems } = await importRepo("src/ui/components/MenuLevels.js");

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const classOf = (node) =>
    String(typeof node.attributes.class === "function" ? node.attributes.class() : node.attributes.class);

const page = (id, tab, group) =>
    definePage({ id: `w5.${id}`, world: 5, system: "Hole", tab, group, description: "A page.", component: () => null });

test("definePage takes a group and refuses an empty one", () => {
    assert.equal(page("a", "A", "Caverns").group, "Caverns");
    assert.equal(page("b", "B").group, undefined);
    assert.throws(() => page("c", "C", " "), /group must be a non-empty string/);
    assert.throws(() => page("d", "D", 5), /group must be a non-empty string/);
});

test("the sidebar heads a system's pages with their group where it changes, and only there", () => {
    menuTree.val = buildMenuTree([
        page("villagers", "Villagers", "Villagers"),
        page("opals", "Opals", "Villagers"),
        page("well", "The Well", "Caverns"),
        page("den", "The Den", "Caverns"),
    ]);
    const items = LevelItems(5);
    const shown = items.map((node) => (classOf(node).includes("drill-group") ? `# ${text(node)}` : text(node).trim()));
    assert.deepEqual(shown, ["Hole", "# Villagers", "Villagers", "Opals", "# Caverns", "The Well", "The Den"]);
    // A heading is words: not a button, not in the tab order.
    for (const heading of items.filter((node) => classOf(node).includes("drill-group"))) {
        assert.equal(heading.nodeName, "div");
        assert.equal(heading.attributes.tabindex, undefined);
        assert.equal(heading.listeners.click, undefined);
    }
});

test("a system without groups lists its pages as before, with no headings", () => {
    menuTree.val = buildMenuTree([page("x", "X"), page("y", "Y")]);
    assert.deepEqual(
        LevelItems(5).map((node) => text(node).trim()),
        ["Hole", "X", "Y"]
    );
});

test("every Hole page says its group: the villagers' screens, then the caverns", async () => {
    const { readdirSync } = await import("node:fs");
    const dir = new URL("../src/ui/pages/world-5/hole/", import.meta.url);
    const files = readdirSync(dir)
        .filter((file) => file.endsWith(".js"))
        .sort();
    const groups = [];
    for (const file of files) groups.push((await importRepo(`src/ui/pages/world-5/hole/${file}`)).default.group);
    assert.deepEqual(groups.slice(0, 6), Array(6).fill("Villagers"));
    assert.deepEqual(groups.slice(6), Array(files.length - 6).fill("Caverns"));
});

test("the group heading is quiet: no hover, no focus ring, no pointer", () => {
    const css = readFileSync(new URL("../src/ui/styles/menu.css", import.meta.url), "utf8");
    assert.match(css, /^\.drill-group \{/m);
    assert.doesNotMatch(css, /\.drill-group[^{]*:(hover|focus)/);
    assert.doesNotMatch(css.match(/^\.drill-group \{([^}]*)\}/m)[1], /cursor:\s*pointer/);
});
