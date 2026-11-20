// World 2 › Bubbles › Automation (#92) on the fake game: one section per cauldron, a row per bubble with its bonus,
// LV and % of max, next cost, stop-at, pay with (Materials / Particles) and switch, and one page-wide target %. Every
// edit saves cheatConfig.automation.bubbles = { target, items } to the game and the config file; a save the game
// refuses reads back what it holds and says why where it happened. The existing Bubbles page stays the first tab.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router } = await createFakeApi();
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const updates = [];
const saves = [];
let refuseUpdate = false;
let fileStartup = [];
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    res.json(switchAutomation(getAutomations().find(({ cheat }) => cheat === action).id, on));
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    updates.push(await req.json());
    if (refuseUpdate) return res.json({ message: "Config update failed", details: "the game is busy" });
    return update(req, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    saves.push(body);
    fileStartup = body.startupCheats ?? fileStartup;
    res.json({ ok: true });
});
const readConfig = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    let read;
    await readConfig(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    res.json(structuredClone({ ...read, startupCheats: [...fileStartup] }));
});
await loadUi(router);
globalThis.requestAnimationFrame = () => {};

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(typeof node.attributes.class === "function" ? "" : node.attributes.class);
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${typeof what === "function" ? what() : what}`);
}

const page = (await importRepo("src/ui/pages/world-2/bubbles/2-automation.js")).default;
const tab = page.component();
await until(() => byClass(tab, "automation-pick").length > 2, "the tab to load");

const row = (name) => byClass(tab, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
const checkbox = (name) => elements(row(name)).find((node) => node.attributes.type === "checkbox");
const dropdown = (name) => elements(row(name)).find((node) => node.nodeName === "select");
const notes = (name) => byClass(row(name), "account-row__sub-label").map(text);
const saveState = (name) => classes(byClass(row(name), "save-state")[0]);
const saved = () => updates.at(-1)?.cheatConfig.automation.bubbles;
const button = (label) =>
    elements(tab).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
const bubblesOn = () => getAutomations().find(({ cheat }) => cheat === "automation bubbles").on;
const targetInput = () => elements(row("Target")).find((node) => node.nodeName === "input");
async function typeTarget(value) {
    const input = targetInput();
    input.listeners.input({ target: { value } });
    const since = updates.length;
    byClass(row("Target"), "account-field-metric")[0].listeners.keydown({
        key: "Enter",
        target: input,
        preventDefault() {},
    });
    await until(() => updates.length > since || /save-state--error/.test(saveState("Target")), "the target save");
    await settle();
}

test("the existing Bubbles page stays the system's first tab, with its title, and Automation comes second", async () => {
    const { listPageFiles } = createRequire(import.meta.url)("../src/modules/server/routes/pages.js");
    const pagesDir = join(fileURLToPath(new URL("../", import.meta.url)), "src/ui/pages");
    const { modules } = await listPageFiles(pagesDir);
    const files = modules.filter((file) => file.startsWith("world-2/bubbles/"));
    const pages = await Promise.all(files.map(async (file) => (await importRepo(`src/ui/pages/${file}`)).default));
    const { buildMenuTree, pageTitle } = await importRepo("src/ui/menu/menuModel.js");
    const system = buildMenuTree(pages)
        .find(({ id }) => id === 2)
        .systems.find(({ name }) => name === "Bubbles");
    assert.deepEqual(
        system.pages.map((entry) => [entry.id, pageTitle(entry, system)]),
        [
            ["w2.bubbles", "Bubbles"],
            ["w2.bubbles.automation", "Automation"],
        ]
    );
});

test("one section per cauldron, each bubble with its bonus, LV and % of max, and next cost", () => {
    assert.deepEqual(byClass(tab, "account-section__title").map(text), [
        "SETTINGS",
        "POWER CAULDRON",
        "QUICC CAULDRON",
        "HIGH-IQ CAULDRON",
        "KAZAM CAULDRON",
    ]);
    assert.ok(row("Bubbles"), "the automation's own switch");
    assert.match(text(byClass(tab, "account-section__meta")[0]), /9 particles · 5 charges/);
    assert.equal(text(byClass(row("Copper Spark"), "account-row__badge")[0]), "LV 200 · 76.9%");
    assert.deepEqual(notes("Mossy Pebble"), ["+3.5% Frost Fang bonus", "Next level 122 Grand Drift, 5 Water Droplets"]);
    assert.match(notes("Copper Spark")[1], /· not enough Lucky Whisker$/);
    assert.equal(text(byClass(row("Frost Fang"), "account-row__badge")[0]), "LV 27 · no max");
    assert.equal(notes("Frost Fang")[1], "No max level: set a stop-at to raise it");
    assert.equal(notes("Ember Bramble")[1], "Not discovered yet; it can be switched on ahead");
    assert.equal(targetInput().attributes.value, "90");
});

test("pay with saves at once, shows the particle cost line, and Materials leaves nothing to keep", async () => {
    await dropdown("Copper Spark").listeners.change({ target: { value: "particles" } });
    await until(() => /save-state--success/.test(saveState("Copper Spark")), "the pay choice to save");
    assert.deepEqual(saved(), { target: 90, items: [{ id: "0:0", on: false, pay: "particles" }] });
    assert.deepEqual(saves.at(-1).cheatConfig.automation.bubbles, saved(), "the config file too");
    assert.equal(notes("Copper Spark")[1], "Not enough particles");

    await dropdown("Copper Spark").listeners.change({ target: { value: "materials" } });
    await until(() => saved().items.length === 0, "the default to save");
    assert.match(notes("Copper Spark")[1], /^Next level /);
});

test("switching a bubble on saves it and switches Bubbles on, now and at start", async () => {
    await checkbox("Mossy Pebble").listeners.change({ target: { checked: true } });
    await until(() => bubblesOn() && /save-state--success/.test(saveState("Mossy Pebble")), "Bubbles to go on");
    assert.deepEqual(saved().items, [{ id: "0:1", on: true }]);
    assert.deepEqual(commands.at(-1), ["automation bubbles", true]);
    assert.deepEqual(fileStartup, ["automation bubbles"]);
});

test("the target saves on Enter; one out of range is refused at its field and nothing is saved", async () => {
    await typeTarget("95.5");
    assert.equal(saved().target, 95.5);
    assert.deepEqual(saved().items, [{ id: "0:1", on: true }], "the picks travel with it");

    const before = updates.length;
    targetInput().listeners.input({ target: { value: "100" } });
    byClass(row("Target"), "account-field-metric")[0].listeners.keydown({
        key: "Enter",
        target: targetInput(),
        preventDefault() {},
    });
    await until(() => /save-state--error/.test(saveState("Target")), "the field to refuse");
    assert.equal(updates.length, before);
    assert.match(text(row("Target")), /0 to 99\.9/);
    byClass(row("Target"), "account-field-metric")[0].listeners.keydown({
        key: "Escape",
        target: targetInput(),
        preventDefault() {},
    });
    await settle();
});

test("a target or pay choice the game refuses reads back what the game holds and says why where it happened", async () => {
    refuseUpdate = true;
    await typeTarget("80");
    await until(() => /save-state--error/.test(saveState("Target")), "the failure at the field");
    assert.match(text(row("Target")), /busy/);
    await until(
        () => targetInput().attributes.value === "95.5",
        () => `the game's target back, not ${targetInput().attributes.value}`
    );

    // A pay choice the game refuses goes back to what the game holds, with the reason at its row.
    await dropdown("Mossy Pebble").listeners.change({ target: { value: "particles" } });
    await until(() => /save-state--error/.test(saveState("Mossy Pebble")), "the failure at the row");
    assert.equal(dropdown("Mossy Pebble").value, "materials");
    assert.match(text(row("Mossy Pebble")), /busy/);
    refuseUpdate = false;

    // The next save works and clears the failure.
    await typeTarget("85");
    await until(() => /save-state--success/.test(saveState("Target")), "the retry to save");
    assert.equal(saved().target, 85);
});

test("Enable all switches every bubble on in one save; Disable all asks Click again and keeps the rest", async () => {
    await dropdown("Frost Fang").listeners.change({ target: { value: "particles" } });
    await until(() => saved().items.some(({ id }) => id === "0:2"), "Frost Fang's pay to save");

    const before = updates.length;
    await button("Enable all").listeners.click({ preventDefault() {} });
    await until(() => updates.length > before && !button("Enable all"), "every bubble to go on");
    assert.equal(updates.length, before + 1, "one save");
    assert.equal(saved().items.length, byClass(tab, "automation-pick").length - 1, "every bubble, not the target");
    assert.ok(saved().items.every(({ on }) => on));

    const disable = button("Disable all");
    const since = updates.length;
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, since, "the first click saves nothing");
    await disable.listeners.click({ preventDefault() {} });
    await until(() => updates.length > since, "every bubble to go off");
    await settle();
    assert.deepEqual(saved(), { target: 85, items: [{ id: "0:2", on: false, pay: "particles" }] });
    await switchAutomation("w2.automation.bubbles", false);
});
