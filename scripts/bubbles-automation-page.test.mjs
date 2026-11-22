// World 2 › Alchemy › Automation (#92) on the fake game: Bubbles' switch and the page-wide target, then one section
// per cauldron, each bubble with its bonus, level, % of max, next cost, what it pays with, a stop-at and a switch. A
// change saves cheatConfig.automation.bubbles (a plain list) or bubblesTarget; switching a bubble on switches Bubbles
// on; the tab reads the game again after every save.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, fileSent, selected, status, until } = kit;
const tab = (await importRepo("src/ui/pages/world-2/alchemy/5-automation.js")).default.component();
const row = (name) => kit.row(tab, name);
const notes = (name) => [...byClass(row(name), "automation-pick__detail")[0].childNodes].map(text);
await until(() => row("Copper Spark"), "the tab to load");

test("Alchemy's tabs are Bubbles, Cauldrons, Vials, Sigils, then Automation", async () => {
    const { listPageFiles } = createRequire(import.meta.url)("../src/modules/server/routes/pages.js");
    const pagesDir = join(fileURLToPath(new URL("../", import.meta.url)), "src/ui/pages");
    const { modules } = await listPageFiles(pagesDir);
    const files = modules.filter((file) => file.startsWith("world-2/alchemy/"));
    const pages = await Promise.all(files.map(async (file) => (await importRepo(`src/ui/pages/${file}`)).default));
    const { buildMenuTree, pageTitle } = await importRepo("src/ui/menu/menuModel.js");
    const system = buildMenuTree(pages)
        .find(({ id }) => id === 2)
        .systems.find(({ name }) => name === "Alchemy");
    assert.deepEqual(
        system.pages.map((entry) => [entry.id, pageTitle(entry, system)]),
        [
            ["w2.bubbles", "Bubbles"],
            ["w2.cauldrons", "Cauldrons"],
            ["w2.vials", "Vials"],
            ["w2.sigils", "Sigils"],
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
    assert.equal(status(tab, "Bubbles"), "Off");
    assert.match(text(byClass(tab, "account-section__meta")[0]), /9 particles · 5 charges/);
    assert.equal(text(byClass(row("Copper Spark"), "account-row__badge")[0]), "LV 200 · 76.9%");
    assert.deepEqual(notes("Mossy Pebble"), ["+3.5% Frost Fang bonus", "Next level 122 Grand Drift, 5 Water Droplets"]);
    assert.match(notes("Copper Spark")[1], /· not enough Lucky Whisker$/);
    assert.equal(text(byClass(row("Frost Fang"), "account-row__badge")[0]), "LV 27 · no max");
    assert.equal(notes("Frost Fang")[1], "No max level: set a stop-at to raise it");
    assert.equal(notes("Ember Bramble")[1], "Not discovered yet; it can be switched on ahead");
    assert.equal(String(kit.field(row("Target")).attributes.value), "90");
    assert.equal(selected(row("Copper Spark")), "Materials");
});

test("pay with saves at once, shows the particle cost line, and Materials leaves nothing to keep", async () => {
    await kit.choose(row("Copper Spark"), "pay with", 1);
    assert.deepEqual(sent("bubbles"), [{ id: "0:0", on: false, pay: "particles" }]);
    assert.deepEqual(fileSent("bubbles"), sent("bubbles"), "the config file too");
    assert.equal(notes("Copper Spark")[1], "Not enough particles");
    await kit.choose(row("Copper Spark"), "pay with", 0);
    assert.deepEqual(sent("bubbles"), []);
    assert.match(notes("Copper Spark")[1], /^Next level /);
});

test("switching a bubble on saves it and switches Bubbles on, now and at start", async () => {
    await kit.flip(row("Mossy Pebble"), true);
    assert.deepEqual(sent("bubbles"), [{ id: "0:1", on: true }]);
    assert.equal(kit.running("automation bubbles"), true);
    assert.deepEqual(kit.fake.startup, ["automation bubbles"]);
});

test("the target saves on Enter with one decimal; one out of range is refused at its field", async () => {
    await kit.type(row("Target"), "95.5");
    assert.equal(sent("bubblesTarget"), 95.5);
    assert.equal(fileSent("bubblesTarget"), 95.5);
    for (const typed of ["100", "95.55"]) {
        const before = kit.updates.length;
        await kit.type(row("Target"), typed);
        assert.equal(kit.updates.length, before, `${typed} isn't sent`);
        assert.match(text(row("Target")), /0 to 99\.9/);
    }
});

test("a pay choice the game refuses reads back what the game holds and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.choose(row("Mossy Pebble"), "pay with", 1);
    assert.equal(selected(row("Mossy Pebble")), "Materials");
    assert.match(text(row("Mossy Pebble")), /the game is busy/);
});

test("Enable all switches every bubble on in one save; Disable all asks Click again and keeps the rest", async () => {
    await kit.type(row("Frost Fang"), "40");
    await kit.button(tab, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.ok(sent("bubbles").length > 3 && sent("bubbles").every(({ on }) => on));
    await kit.clickTwice(tab, "Disable all");
    assert.ok(sent("bubbles").every(({ on }) => !on));
    assert.ok(
        sent("bubbles").some(({ stopAt }) => stopAt === 40),
        "the stop-at stays"
    );
});
