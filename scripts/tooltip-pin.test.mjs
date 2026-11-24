// The sidebar's Keys list opens on a click and stays until a click elsewhere, Escape or a second click (Lumi's pick).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
await loadUi(new TinyRouter());
const pageListeners = {};
globalThis.document.addEventListener = (type, listener) => (pageListeners[type] = listener);
globalThis.document.removeEventListener = (type, listener) =>
    pageListeners[type] === listener && delete pageListeners[type];
const { withTooltip, TooltipContainer } = await importRepo("src/ui/components/Tooltip.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const label = TooltipContainer();
const shown = async () => (await settle(), /\bvisible\b/.test(label.attributes.class));
const keys = withTooltip(globalThis.document.createElement("button"), "Ctrl+K search", "right", true, true);
const elsewhere = globalThis.document.createElement("div");

test("a click opens the list and keeps it past the pointer leaving", async () => {
    assert.equal(keys.attributes["aria-expanded"], "false");
    keys.listeners.click();
    keys.listeners.mouseleave();
    keys.listeners.blur();
    assert.equal(keys.attributes["aria-expanded"], "true");
    assert.ok(await shown());
});

test("a click elsewhere closes it; a click on the button doesn't", async () => {
    pageListeners.pointerdown({ target: keys });
    assert.ok(await shown());
    pageListeners.pointerdown({ target: elsewhere });
    assert.equal(keys.attributes["aria-expanded"], "false");
    assert.ok(!(await shown()));
    assert.equal(pageListeners.pointerdown, undefined);
});

test("Tab to another control closes it", async () => {
    keys.listeners.click();
    assert.equal(keys.attributes["aria-expanded"], "true");
    keys.listeners.blur({ relatedTarget: elsewhere });
    assert.equal(keys.attributes["aria-expanded"], "false");
    assert.ok(!(await shown()));
});

test("Escape closes it", async () => {
    keys.listeners.click();
    pageListeners.keydown({ key: "Tab" });
    assert.ok(await shown());
    pageListeners.keydown({ key: "Escape" });
    assert.equal(keys.attributes["aria-expanded"], "false");
    assert.ok(!(await shown()));
});

test("a second click closes it, and hover still shows and hides it", async () => {
    keys.listeners.click();
    keys.listeners.click();
    assert.equal(keys.attributes["aria-expanded"], "false");
    assert.ok(!(await shown()));
    keys.listeners.mouseenter();
    assert.ok(await shown());
    keys.listeners.mouseleave();
    assert.ok(!(await shown()));
});

test("while it's open, another label waits", async () => {
    const other = withTooltip(globalThis.document.createElement("button"), "Collapse sidebar", "right");
    keys.listeners.click();
    other.listeners.mouseenter();
    other.listeners.mouseleave();
    await settle();
    assert.equal(label.childNodes.map((node) => node.data).join(""), "Ctrl+K search");
    assert.ok(await shown());
    pageListeners.keydown({ key: "Escape" });
});
