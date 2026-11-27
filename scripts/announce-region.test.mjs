// The screen-reader live region is on the page, empty, from the menu's start (#266): a screen reader can miss a
// region's first message when the region appears together with it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const regions = () => elements(globalThis.document.body).filter((node) => node.attributes.role === "status");

test("the live region is mounted empty before the first message, and every message reuses it", async () => {
    const { announce, mountAnnouncer } = await importRepo("src/ui/components/inPlace.js");
    assert.equal(regions().length, 0, "nothing before the menu starts");

    mountAnnouncer();
    mountAnnouncer();
    assert.equal(regions().length, 1, "one region, however often it's mounted");
    const [region] = regions();
    assert.ok(!region.textContent, "it starts empty");

    announce("Click again to disable 12 bribes.");
    announce("Done.");
    assert.deepEqual(regions(), [region], "the messages go into the region that was already there");
    assert.equal(region.textContent, "Done.");
});

test("the menu mounts the live region when it starts", () => {
    const app = readFileSync(new URL("../src/ui/components/App.js", import.meta.url), "utf8");
    const start = app.slice(app.indexOf("export const App = () => {"));
    assert.match(start.slice(0, start.indexOf("return ")), /\bmountAnnouncer\(\);/);
});
