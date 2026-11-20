// Bulk removals ask in place (#25): the first click only arms "Click again" and writes nothing; bulk additions run
// on one click.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// The tooltip that says "Click again to …" places itself on the next frame.
globalThis.requestAnimationFrame = () => {};
const { router } = await createFakeApi();
const { requests } = await loadUi(router);
// The question is read out once, from a live region on the page.
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const buttonsNamed = (root, label) =>
    elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === label);
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const writes = () => requests.filter((entry) => /write/.test(entry)).length;

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${what}`);
}

const click = (button) => button.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: button });

async function openPage(file, label, open = null) {
    const root = (await importRepo(file)).default.component();
    if (open) {
        await until(() => buttonsNamed(root, open).length, `${open} on ${file}`);
        await click(buttonsNamed(root, open)[0]);
    }
    const ready = () => buttonsNamed(root, label).some((node) => !node.attributes.disabled);
    await until(ready, `${label} on ${file}`);
    await settle(100);
    return buttonsNamed(root, label).find((node) => !node.attributes.disabled);
}

test("an action button with a question asks in place, and runs only on the second click", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    let ran = 0;
    const button = ActionButton({ label: "Reset all", confirm: "reset every upgrade to 0.", onClick: () => ran++ });
    await click(button);
    assert.equal(ran, 0, "the first click only asks");
    assert.equal(button.attributes["data-again"], "Click again");
    await click(button);
    assert.equal(ran, 1, "the second click runs it");
    assert.equal(button.attributes["data-again"], undefined);
});

test("an action button whose question is null runs on one click", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    let ran = 0;
    const button = ActionButton({ label: "Apply", confirm: () => null, onClick: () => ran++ });
    await click(button);
    assert.equal(ran, 1);
});

// Royal Armory and Map bonuses ask about "this world": a world picked after the first press asks again.
test("a press whose targets changed since the question asks again instead of running", async () => {
    const { ActionButton } = await importRepo("src/ui/components/views/account/components/ActionButton.js");
    const world = { val: 1 };
    let ran = 0;
    const button = ActionButton({
        label: "Deplete all",
        confirm: "deplete every node in this world.",
        confirmTargets: world,
        onClick: () => ran++,
    });
    await click(button);
    world.val = 2;
    await click(button);
    assert.equal(ran, 0, "the second press asked about W2 instead");
    assert.equal(button.attributes["data-again"], "Click again");
    await click(button);
    assert.equal(ran, 1, "and a third runs it");
});

const removals = [
    ["src/ui/pages/world-2/arcade-shop/arcade-shop.js", "Reset all"],
    ["src/ui/pages/world-3/atom-collider/atom-collider.js", "Reset all"],
    ["src/ui/pages/world-3/salt-lick/salt-lick.js", "Reset all"],
    ["src/ui/pages/world-2/post-office/post-office.js", "Reset"],
    ["src/ui/pages/world-1/star-signs/star-signs.js", "Reset all"],
    ["src/ui/pages/world-4/breeding/general.js", "Zero all"],
    ["src/ui/pages/classes/grimoire/grimoire.js", "Reset all"],
    ["src/ui/pages/classes/royal-armory/3-resources.js", "Deplete all"],
    ["src/ui/pages/classes/royal-armory/4-outposts.js", "Reset to vanilla", "UNITS"],
    ["src/ui/pages/world-1/pets/pets.js", "Clear all"],
    ["src/ui/pages/world-1/pets/pets.js", "Clear Pets+"],
];

for (const [file, label, open] of removals) {
    test(`${file.split("/").pop()}: ${label} asks in place and writes nothing on the first click`, async () => {
        const button = await openPage(file, label, open);
        const before = writes();
        await click(button);
        await settle(100);
        assert.equal(button.attributes["data-again"], "Click again", "the button asks");
        assert.equal(writes(), before, "nothing was written");
    });
}

test("map bonuses: Clear world asks in place once a world is picked", async () => {
    const root = (await importRepo("src/ui/pages/classes/tesseract/2-map-bonuses.js")).default.component();
    await until(() => buttonsNamed(root, "W1").length, "the world tabs");
    await click(buttonsNamed(root, "W1")[0]);
    await until(() => buttonsNamed(root, "Clear world (0)").some((node) => !node.attributes.disabled), "Clear world");
    await settle(100);
    const button = buttonsNamed(root, "Clear world (0)").find((node) => !node.attributes.disabled);
    const before = writes();
    await click(button);
    await settle(100);
    assert.equal(button.attributes["data-again"], "Click again");
    assert.equal(writes(), before);
});

test("rat king: removing crowns asks in place; adding them runs on one click", async () => {
    const root = (await importRepo("src/ui/pages/world-5/gaming/2-rat-king.js")).default.component();
    const enabled = (label) => buttonsNamed(root, label).find((node) => !node.attributes.disabled);
    await until(() => enabled("Apply"), "Apply");
    await settle(100);
    const apply = enabled("Apply");
    const field = elements(apply.parentNode).find((node) => node.nodeName === "input");
    const asks = async (button, what) => {
        const before = writes();
        await click(button);
        await settle(100);
        assert.equal(button.attributes["data-again"], "Click again", `${what} asks`);
        assert.equal(writes(), before, `${what} wrote nothing`);
    };

    let before = writes();
    await click(enabled("Max all (100)"));
    await until(() => writes() > before && enabled("Apply"), "Max all to land");
    await settle(100);

    await asks(enabled("Clear all (0)"), "Clear all");
    await asks(enabled("Clear"), "a plant's Clear");
    field.listeners.input({ target: { value: "40" } });
    await asks(apply, "lowering the count");

    before = writes();
    await click(enabled("Clear all (0)")); // the second click clears them
    await until(() => writes() > before && enabled("Apply"), "the crowns to clear");
    await settle(100);
    field.listeners.input({ target: { value: "10" } });
    before = writes();
    await click(enabled("Apply"));
    await until(() => writes() > before, "the raise to land");
    assert.equal(enabled("Apply").attributes["data-again"], undefined, "raising didn't ask");
});

test("value search: clearing the saved list asks in place first", async () => {
    const { SavedResultsSection } = await importRepo("src/ui/components/views/search/sections.js");
    const vanX = await importRepo("src/ui/vendor/van-x-0.6.3.js").catch(() => null);
    const reactive = vanX?.reactive ?? ((value) => value);
    let cleared = 0;
    const ui = reactive({
        savedResults: [{ path: "OptionsListAccount[5]", value: 1, monitorEnabled: false }],
        savedFilter: "",
        savedFilterApplied: false,
        savedRefreshError: "",
        isRefreshingSavedResults: false,
        savedEdit: { path: null, draft: "", error: "" },
    });
    const handlers = {
        clearSavedResults: () => cleared++,
        getFilteredSavedResults: () => ui.savedResults,
        refreshSavedResults() {},
        handleSavedFilterInput() {},
        clearSavedFilter() {},
    };
    const section = SavedResultsSection({ ui, handlers });
    const clear = buttonsNamed(section, "Clear")[0];
    await click(clear);
    assert.equal(cleared, 0, "the first click only asks");
    assert.equal(clear.attributes["data-again"], "Click again");
    await click(clear);
    assert.equal(cleared, 1, "the second click clears it");
});

test("bribes: Disable all, which asks in its own handler, still runs on the second click", async () => {
    const enable = await openPage("src/ui/pages/world-1/bribes/bribes.js", "Enable all");
    let before = writes();
    await click(enable);
    await until(() => writes() > before, "Enable all to write");
    await settle(100);
    const root = enable.parentNode;
    const disable = buttonsNamed(root, "Disable all").find((node) => !node.attributes.disabled);
    before = writes();
    await click(disable);
    await settle(100);
    assert.equal(disable.attributes["data-again"], "Click again", "the first click asks");
    assert.equal(writes(), before);
    await click(disable);
    await until(() => writes() > before, "the second click to write");
});

for (const [file, label] of [
    ["src/ui/pages/world-1/bribes/bribes.js", "Enable all"],
    ["src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", "Enable all"],
    ["src/ui/pages/world-3/prayers/prayers.js", "Unlock all"],
]) {
    test(`${file.split("/").pop()}: ${label} adds on one click`, async () => {
        const button = await openPage(file, label);
        const before = writes();
        await click(button);
        await until(() => writes() > before, `${label} to write`);
        assert.equal(button.attributes["data-again"], undefined, "it didn't ask");
    });
}

test("bundles: Buy all asks in place with the inventory warning beside it, and buys on the second press", async () => {
    const root = (await importRepo("src/ui/pages/account/bundles/bundles.js")).default.component();
    const buyAll = () =>
        elements(root).find((node) => node.nodeName === "button" && /^Buy all \(\d+\)$/.test(text(node).trim()));
    await until(() => buyAll() && !buyAll().attributes.disabled && text(buyAll()) !== "Buy all (0)", "Buy all");
    await settle(100);
    const button = buyAll();
    const warning = () => text(elements(root).find((node) => /said--buy-all/.test(node.attributes.class ?? "")));
    const buys = () => requests.filter((entry) => entry === "POST /api/toggle").length;

    const before = buys();
    await click(button);
    await settle(100);
    assert.equal(button.attributes["data-again"], "Click again", "the first press asks");
    assert.match(warning(), /Free up inventory space first, or items may be lost\./, "and warns beside it");
    assert.equal(buys(), before, "nothing was bought");

    click(button);
    await until(() => buys() > before, "the second press to buy");
    assert.equal(button.attributes["data-again"], undefined);
    assert.equal(warning(), "", "the warning goes once it buys");
});

// "Click again to deplete every node in this world.": the world picked between the two clicks is another question.
for (const [file, label] of [
    ["src/ui/pages/classes/royal-armory/3-resources.js", "Deplete all"],
    ["src/ui/pages/classes/tesseract/2-map-bonuses.js", "Clear world (0)"],
]) {
    test(`${file.split("/").pop()}: ${label} asks again for a world picked after the first click`, async () => {
        const root = (await importRepo(file)).default.component();
        const enabled = () => buttonsNamed(root, label).find((node) => !node.attributes.disabled);
        const pickWorld = async (name) => {
            await until(() => buttonsNamed(root, name).length, name);
            await click(buttonsNamed(root, name)[0]);
            await until(enabled, `${label} in ${name}`);
            await settle(100);
        };
        await pickWorld("W1");
        const button = enabled();
        const before = writes();
        await click(button);
        await pickWorld("W2");
        await click(button);
        await settle(100);
        assert.equal(writes(), before, "W2 was not changed on W1's question");
        assert.equal(button.attributes["data-again"], "Click again", "it asks about W2");
    });
}
