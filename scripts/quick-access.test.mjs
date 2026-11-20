// Cheats › Favorites and Recent show a cheat starred or run with a value of several words, labelled with that value.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
const { store } = await loadUi(router);
globalThis.requestAnimationFrame = () => {};

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(typeof node.attributes.class === "function" ? "" : (node.attributes.class ?? ""));
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));

async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

test("a favorite whose value has a space shows as a chip", async () => {
    await store.loadCheats();
    const base = "w7 sushitools knowledge";
    assert.ok(
        store.data.cheats.some((c) => c.value === base && c.needsParam),
        `${base} takes a value`
    );
    const { Cheats } = await importRepo("src/ui/components/views/Cheats.js");
    const page = Cheats();
    // What the row's star stores: the command and the value typed beside it ("<tier> <quantity>").
    store.toggleFavorite(`${base} 3 500`);
    store.toggleFavorite("multiply damage 3");
    const chips = () => byClass(page, "is-favorite-btn");
    await until(() => chips().length === 2, "both favorites to show");
    const chip = chips().find((b) => text(byClass(b, "quick-access-btn-text")[0]) === `${base} 3 500`);
    assert.ok(chip, "the several-word favorite is a chip");
    assert.match(String(chip.attributes.title), /\(3 500\)$/, "its tooltip names the whole value");
});
