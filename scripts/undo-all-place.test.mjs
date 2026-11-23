// Where Undo all lands in a tray whose tools wrap onto two lines (#241): a phone at 400 px, after a Set all.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
const { place } = await importRepo("src/ui/components/views/account/UndoAllOffer.js");

// A box as the browser measures it; the tray's corner is the page's, so offsets equal page coordinates.
const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("at 400 px, Undo all after Set all goes to the tray's line, never over the level field", () => {
    // Measured on Stamps at 400 px: the tray's line, Set all (field and button) on the first line of tools, Exalt
    // all | Unexalt all wrapped onto the second; the tools end at 365.
    const said = box(95, 489, 125, 20);
    const setAllRow = box(95, 515, 221, 36);
    const group = box(95, 559, 155, 36);
    const label = {};
    const field = { tagName: "DIV", offsetLeft: 95, offsetTop: 515, offsetHeight: 36, offsetWidth: 150 };
    const tools = {
        children: [{ getBoundingClientRect: () => setAllRow }, { getBoundingClientRect: () => group }],
        getBoundingClientRect: () => box(95, 515, 270, 80),
        previousElementSibling: label,
    };
    const parent = { clientWidth: 400 };
    const anchor = {
        offsetParent: parent,
        offsetLeft: 250,
        offsetTop: 515,
        offsetHeight: 36,
        offsetWidth: 66,
        previousElementSibling: Object.assign(field, { offsetParent: parent }),
        querySelector: () => null,
        closest: (selector) => (selector === "[data-undo-at-end]" ? tools : null),
        getBoundingClientRect: () => box(250, 515, 66, 36),
    };
    const style = { setProperty() {} };
    const node = { offsetParent: parent, offsetWidth: 113, style };
    // The tray's line ends where its words do.
    globalThis.document.createRange = () => ({
        selectNodeContents: (element) => assert.equal(element, label),
        getBoundingClientRect: () => said,
    });

    assert.equal(place(node, anchor), false, "it covers nothing");
    assert.equal(style.top, "499px", "on the tray's line (its middle), not on Set all's");
    assert.equal(style.left, "252px", "at that line's free right end");
});
