// An action button tells a screen reader how its press ended (#77): busy while it saves, then "done" or "failed"
// from the page's live region. The button itself only changes colour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;

const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (button) => button.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: button });

test("an action button says how its press ended, for screen readers", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const status = van.state(null);
    let finish;
    const button = ActionButton({
        label: "Add all",
        status,
        onClick: () => {
            status.val = "loading";
            return new Promise((resolve) => (finish = resolve));
        },
    });
    click(button);
    await settle();
    assert.equal(button.attributes["aria-busy"], "true", "busy while it saves");
    status.val = "success";
    finish();
    await settle(50);
    const region = elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    assert.equal(region.textContent, "Add all: done");
    assert.equal(button.attributes["aria-busy"], "false");

    status.val = null;
    const failing = ActionButton({
        label: "Add",
        status,
        onClick: async () => {
            status.val = "loading";
            await settle();
            status.val = "error";
        },
    });
    await click(failing);
    await settle(50);
    assert.equal(region.textContent, "Add: failed");
});
