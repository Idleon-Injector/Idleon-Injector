// The sidebar is one menu that drills down: a world shows its list and loads no page; an entry opens its page.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const { store } = await loadUi(new TinyRouter());

// What the sidebar asks of the browser beyond the minimal DOM: the window size, motion, frames and focus.
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.matchMedia = globalThis.window.matchMedia;
globalThis.document.addEventListener = () => {};
globalThis.document.querySelector = () => null;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
const proto = Object.getPrototypeOf(globalThis.document.createElement("div"));
const all = (node) => (node.childNodes ?? []).flatMap((child) => (child.nodeType === 1 ? [child, ...all(child)] : []));
const classes = (node) => String(node.attributes?.class ?? "").split(/\s+/);
Object.defineProperty(proto, "children", {
    get() {
        return this.childNodes.filter((child) => child.nodeType === 1);
    },
});
proto.querySelectorAll = function (selector) {
    const key = selector.match(/^\[data-key="(.+)"\]$/)?.[1];
    if (key !== undefined) return all(this).filter((node) => node.attributes["data-key"] === key);
    if (/^(\.[\w-]+)+$/.test(selector)) {
        const wanted = selector.slice(1).split(".");
        return all(this).filter((node) => wanted.every((name) => classes(node).includes(name)));
    }
    return [];
};
proto.querySelector = function (selector) {
    return this.querySelectorAll(selector)[0] ?? null;
};
proto.focus = function () {
    globalThis.document.activeElement = this;
};
proto.scrollIntoView = () => {};

const { definePage, buildMenuTree } = await importRepo("src/ui/menu/menuModel.js");
const { menuTree } = await importRepo("src/ui/menu/pageRegistry.js");
const { Sidebar } = await importRepo("src/ui/components/Sidebar.js");
const { Pages } = await importRepo("src/ui/components/views/Pages.js");
const { pageSection } = await importRepo("src/ui/components/views/account/tabShared.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Each page counts its loads: a page loads when its component first runs.
const loads = {};
const page = (id, world, system, extra = {}) =>
    definePage({
        id,
        world,
        system,
        description: "A test page.",
        component: () => {
            loads[id] = (loads[id] ?? 0) + 1;
            return globalThis.document.createElement("div");
        },
        ...extra,
    });
menuTree.val = buildMenuTree([
    page("w1.stamps", 1, "Stamps", {
        sections: [
            { id: "combat", label: "Combat" },
            { id: "skills", label: "Skills" },
        ],
    }),
    page("w1.anvil", 1, "Anvil"),
    page("w3.deathnote", 3, "Death Note", {
        sections: [
            { id: "w1", label: "World 1" },
            { id: "w2", label: "World 2" },
        ],
        sectionMode: "switch",
    }),
    page("w5.hole.opals", 5, "Hole", { tab: "Opals" }),
    page("w5.hole.well", 5, "Hole", { tab: "Well" }),
]);
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const listShown = (sidebar) =>
    all(sidebar)
        .filter((node) => classes(node).includes("menu-panel") && !classes(node).includes("is-leaving"))
        .pop();
const entry = (sidebar, label) =>
    all(listShown(sidebar)).find((node) => node.nodeName === "button" && text(node).trim() === label);
const worldRow = (sidebar, id) => all(listShown(sidebar)).find((node) => node.attributes["data-key"] === String(id));
const place = () => ({ tab: store.app.activeTab, world: store.app.menuWorld, page: store.app.menuPage });
const totalLoads = () => Object.values(loads).reduce((sum, n) => sum + n, 0);

store.openMenu({ view: "HOME" });
// The menu is built once the pages have loaded, as in the app.
await settle();
const sidebar = Sidebar();
const pages = Pages();
await settle();

test("picking a world only shows its list: the page on screen stays and nothing loads", async () => {
    const before = place();
    worldRow(sidebar, 1).listeners.click({ currentTarget: worldRow(sidebar, 1) });
    await settle();
    assert.equal(store.app.menuLevel, 1, "World 1's list shows");
    assert.deepEqual(place(), before, "the page didn't change");
    assert.equal(totalLoads(), 0, "no page loaded");
    assert.ok(entry(sidebar, "Stamps"), "the list holds World 1's systems");
    assert.equal(globalThis.document.activeElement, entry(sidebar, "Stamps"), "focus moved to the first entry");
    assert.ok(
        all(listShown(sidebar)).every((node) => !classes(node).includes("active")),
        "nothing in the list is marked: the page on screen isn't one of its entries"
    );
});

test("picking an entry opens its page, which loads once and is marked in the list", async () => {
    entry(sidebar, "Stamps").listeners.click({});
    await settle();
    assert.deepEqual(place(), { tab: "pages-tab", world: 1, page: "w1.stamps" });
    assert.equal(loads["w1.stamps"], 1);
    assert.ok(classes(entry(sidebar, "Stamps")).includes("active"), "the open system is marked");
    assert.ok(classes(entry(sidebar, "Combat")).includes("active"), "its first section is the one in view");
});

test("quick picks through every world and back load nothing and leave the page as it was", async () => {
    const before = place();
    const loaded = totalLoads();
    for (let round = 0; round < 3; round++) {
        // Each pick lands while the last list is still sliding (240 ms).
        for (const world of [1, 2, 3, 4, 5, 6, 7]) {
            store.showMenuLevel(null);
            await tick();
            worldRow(sidebar, world).listeners.click({});
            await tick();
        }
        store.showMenuLevel(null);
    }
    await settle();
    assert.equal(totalLoads(), loaded, "no page loaded");
    assert.deepEqual(place(), before);
    // Lists sliding out are gone, so they never stack.
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(sidebar.childNodes.flatMap(all).filter((node) => classes(node).includes("menu-panel")).length, 1);
    assert.ok(classes(worldRow(sidebar, 1)).includes("active"), "back on top, the showing page's world is marked");
});

test("Right opens a world's list and Escape or Left goes back, with focus on the world again", async () => {
    store.showMenuLevel(null);
    await settle();
    const w3 = worldRow(sidebar, 3);
    w3.listeners.keydown({
        key: "ArrowRight",
        preventDefault() {},
        currentTarget: { click: () => w3.listeners.click({}) },
    });
    await settle();
    assert.equal(store.app.menuLevel, 3);
    assert.equal(place().page, "w1.stamps", "still no page change");
    listShown(sidebar).listeners.keydown({ key: "Escape", preventDefault() {} });
    await settle();
    assert.equal(store.app.menuLevel, null);
    assert.equal(globalThis.document.activeElement, worldRow(sidebar, 3), "focus is back on World 3");
    worldRow(sidebar, 3).listeners.click({});
    await settle();
    listShown(sidebar).listeners.keydown({ key: "ArrowLeft", preventDefault() {} });
    await settle();
    assert.equal(store.app.menuLevel, null);
});

test("a section entry of a one-at-a-time page switches the page to it", async () => {
    worldRow(sidebar, 3).listeners.click({});
    await settle();
    entry(sidebar, "World 2").listeners.click({});
    await settle();
    assert.deepEqual(place(), { tab: "pages-tab", world: 3, page: "w3.deathnote" });
    assert.equal(pageSection("w3.deathnote", "w1").val, "w2");
    assert.ok(classes(entry(sidebar, "World 2")).includes("active"));
    assert.ok(!classes(entry(sidebar, "World 1")).includes("active"));
});

test("a system's pages are entries under it", async () => {
    store.showMenuLevel(5);
    await settle();
    entry(sidebar, "Well").listeners.click({});
    await settle();
    assert.equal(place().page, "w5.hole.well");
    assert.ok(classes(entry(sidebar, "Hole")).includes("active"));
    assert.ok(classes(entry(sidebar, "Well")).includes("active"));
    assert.ok(!classes(entry(sidebar, "Opals")).includes("active"));
});

test("a search jump or a link to a page opens it with its world's list showing", async () => {
    store.showMenuLevel(null);
    store.openMenu({ world: 1, page: "w1.anvil" });
    await settle();
    assert.equal(store.app.menuLevel, 1);
    assert.equal(place().page, "w1.anvil");
    assert.ok(classes(entry(sidebar, "Anvil")).includes("active"));
    store.openMenu({ view: "SEARCH" });
    assert.equal(store.app.menuLevel, "advanced", "Value search shows Advanced's list");
    store.openMenu({ view: "CHEATS" });
    assert.equal(store.app.menuLevel, null);
    assert.ok(pages, "the Pages view rendered");
});
