// The update modal in the desktop app, where the release link opens through the injector.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");

Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Electron" } });
// No routes: opening the link and preparing the update both fail.
const { store } = await loadUi(new TinyRouter());
const { UpdateModal } = await importRepo("src/ui/components/UpdateModal.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const find = (node, test) => (test(node) ? [node] : (node.childNodes ?? []).flatMap((child) => find(child, test)));
const text = (node) => (typeof node === "string" ? node : (node.data ?? (node.childNodes ?? []).map(text).join("")));
const classOf = (node) => String(node.attributes?.class ?? "");
const event = { preventDefault() {}, stopPropagation() {} };

test("a release link that didn't open is said under the link, and never hides Accept's result", async (t) => {
    t.mock.method(console, "error", () => {}); // the failed requests log
    store.app.updateInfo = { updateAvailable: true, url: "https://example.invalid", canApplyUpdate: true };
    store.app.updateModalOpen = true;
    const modal = UpdateModal();
    const [linkLine, resultLine] = find(modal, (node) => /update-modal-result/.test(classOf(node)));
    const link = find(modal, (node) => /update-release-link/.test(classOf(node)))[0];
    const byId = (id) => find(modal, (node) => node.attributes?.id === id)[0];

    await link.listeners.click(event);
    await settle();
    assert.match(text(linkLine), /^The release page didn't open: /);
    assert.equal(text(resultLine), "");

    await byId("modal-accept").listeners.click(event);
    await settle();
    assert.match(text(resultLine), /not registered/, "Accept's failure shows");
    assert.doesNotMatch(text(resultLine), /release page/);

    byId("modal-cancel").listeners.click(event);
    await settle();
    assert.equal(text(linkLine), "", "closing takes the link's failure back");
});
