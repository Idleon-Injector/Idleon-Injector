// Review fixes on the menu's shared pieces (#168): tabs linked to their panes, Escape on the tray showing, a tray
// question dropped when the page search changes, the search skipping rows a hidden box holds, and the sidebar's
// section tracking ignoring the page's own scroll.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.requestAnimationFrame = () => 0;

// The fake document drops page-wide listeners; these tests press keys and scroll on it.
const docListeners = {};
globalThis.document.addEventListener = (type, listener) => (docListeners[type] ??= []).push(listener);
const fire = (type, event) => (docListeners[type] ?? []).forEach((listener) => listener(event));

const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const { TabbedList } = await importRepo("src/ui/components/views/account/tabShared.js");
const { searchHits, createPageSearch, shownBySearch, isSearching } = await importRepo("src/ui/menu/pageSearch.js");
const { button } = van.tags;

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const byClass = (root, name) =>
    elements(root).filter((node) =>
        String(node.attributes.class ?? "")
            .split(" ")
            .includes(name)
    );
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

// A tabbed list whose tool asks a question; `shown` says whether its page is on screen.
const listWithQuestion = (name, shown = true) => {
    let ask;
    const list = TabbedList({
        name,
        tabs: [
            { id: "a", label: "A", content: "first" },
            { id: "b", label: "B", content: "second" },
        ],
        tools: (_, givenAsk) => {
            ask = givenAsk;
            return button({ type: "button" }, "Set all");
        },
        toolsLabel: () => "All rows",
    });
    const tray = byClass(list, "tabbed-list__tools")[0];
    tray.getClientRects = () => (shown ? [{}] : []);
    const label = () => text(byClass(list, "tabbed-list__tools-label")[0]);
    const open = async () => {
        ask({ question: `Change ${name}?`, confirmLabel: "Change", from: button(), onConfirm: () => {} });
        await tick();
        assert.equal(label(), `Change ${name}?`);
    };
    return { list, label, open };
};

test("each tab names its pane and each pane its tab, with ids no other list uses", () => {
    const ids = [];
    for (const name of ["Linked one", "Linked two"]) {
        const { list } = listWithQuestion(name);
        const tabs = elements(list).filter((node) => node.attributes.role === "tab");
        const panes = elements(list).filter((node) => node.attributes.role === "tabpanel");
        assert.equal(tabs.length, 2);
        assert.equal(panes.length, 2);
        tabs.forEach((tab, i) => {
            assert.ok(tab.attributes.id);
            assert.equal(tab.attributes["aria-controls"], panes[i].attributes.id);
            assert.equal(panes[i].attributes["aria-labelledby"], tab.attributes.id);
            ids.push(tab.attributes.id, panes[i].attributes.id);
        });
    }
    assert.equal(new Set(ids).size, ids.length);
});

test("Escape drops the question on the page showing, even while a page in the background has one open", async () => {
    const behind = listWithQuestion("Behind", false);
    const front = listWithQuestion("Front", true);
    await behind.open();
    await front.open();
    const event = {
        key: "Escape",
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
    };
    fire("keydown", event);
    await tick();
    assert.equal(front.label(), "All rows");
    assert.equal(behind.label(), "Change Behind?");
});

test("a question is dropped when the page search changes, and still when the tab changes", async () => {
    const { list, label, open } = listWithQuestion("Searched");
    await open();
    searchHits.val = new Set();
    await tick();
    assert.equal(label(), "All rows");

    await open();
    searchHits.val = null;
    await tick();
    assert.equal(label(), "All rows");

    await open();
    elements(list)
        .find((node) => node.attributes.role === "tab" && text(node) === "B")
        .listeners.click();
    await tick();
    assert.equal(label(), "All rows");
});

test("the page search skips a row whose box the page hides", () => {
    // Just what the search reads: the rows, the boxes around them and their computed display.
    const box = (display, parentElement, cls = "") => ({
        display,
        parentElement,
        classList: { contains: (name) => cls.split(" ").includes(name) },
        contains(node) {
            for (let at = node; at; at = at.parentElement) if (at === this) return true;
            return false;
        },
    });
    const notes = [];
    const pane = box("block", null);
    const row = (name, parent) => {
        const node = box("flex", parent, "account-row");
        node.setAttribute = () => {};
        node.querySelector = () => ({ textContent: name, data: name, parentElement: { closest: () => null } });
        return node;
    };
    const egg = row("Egg", box("none", pane));
    const sword = row("Sword", pane);
    pane.append = (node) => notes.push(node);
    pane.querySelector = () => egg;
    pane.querySelectorAll = (selector) => (selector === ".account-row:not(.account-row--head)" ? [egg, sword] : []);
    globalThis.document.querySelector = () => pane;
    globalThis.document.createTreeWalker = (info) => {
        let done = false;
        return { nextNode: () => (done ? null : ((done = true), info)) };
    };
    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    globalThis.getComputedStyle = (node) => ({ display: node.display });

    const search = createPageSearch();
    search.follow("page");
    search.search("egg");
    assert.ok(isSearching());
    assert.equal(shownBySearch(egg), false);
    assert.equal(notes.length, 1, "the list says nothing matches");
    search.follow("");
});

test("the sidebar ignores the page's own scroll, whose target is the document", async () => {
    globalThis.window ??= globalThis;
    globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {} });
    globalThis.Element ??= class {};
    await importRepo("src/ui/components/MenuLevels.js");
    globalThis.document.querySelectorAll = () => [{ getBoundingClientRect: () => ({ top: 0 }), dataset: {} }];
    globalThis.document.contains = () => true;
    assert.doesNotThrow(() => fire("scroll", { target: globalThis.document }));
});
