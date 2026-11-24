// Automation › Masterclasses on the fake game, one tab per masterclass. The Grimoire tab (first): what each bone type
// owns beside the title, a line per bone type while the automation runs (what it is doing), the saving %, and every
// upgrade with its level, next cost, a stop-at, "Save for it" and a switch. A change saves
// cheatConfig.automation.grimoire (a plain list) or grimoireSaving; switching an upgrade on switches the Grimoire
// automation on; the page reads the game again after every save. The other tabs work the same way with their own
// currencies; the Compass marks the upgrades it doesn't show yet, and the Royal Armory adds its statues.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { text, byClass, sent, fileSent, status, until } = kit;
const { readComputed } = await importRepo("src/ui/services/api.js");
const game = await readComputed("automation", "grimoire");
const page = (await importRepo("src/ui/pages/automation/masterclasses/masterclasses.js")).default.component();
const row = (name) => kit.row(page, name);
const pick = (id) =>
    row(
        game.upgrades
            .find((upgrade) => upgrade.id === id)
            // The game's name before its mark ("Knockout!_(#)_製"), as the row shows it.
            .name.replace(/製.*$/, "")
            .replace(/_/g, " ")
            .replace(/[{}]/g, "")
            .trim()
    );
const boneLine = (name) => text(byClass(row(name), "automation-row__status")[0]);
const detail = (node) => text(byClass(node, "automation-pick__detail")[0]);
// A read-only value of a row, by its column ("Level", "Next level").
const value = (node, column) =>
    text(
        byClass(node, "value-cell")
            .find((cell) => text(byClass(cell, "value-cell__label")[0]) === column)
            ?.childNodes.at(-1)
    );
const saved = (node) => kit.saveSwitch(node).attributes.checked;
await until(() => row("Femur") && byClass(page, "automation-pick").length, "the Grimoire automation tab to load");
const femurUpgrade = game.upgrades.find(
    ({ open, level, max, currency }) => currency === "femur" && open && level < (max ?? Infinity)
);

test("the tab shows the switch, the bones beside the title, the saving %, and every upgrade with its level", () => {
    assert.equal(status(page, "Grimoire"), "Off");
    assert.match(text(page), /48\.2K femur · 9\.1K ribcage · 650 cranium · 0 bovinae/);
    assert.deepEqual(
        ["Femur", "Ribcage", "Cranium", "Bovinae"].map(boneLine),
        ["", "", "", ""],
        "switched off, the bone lines say nothing (and hide)"
    );
    const grimoireTab = byClass(page, "automation-rows")[0];
    assert.equal(byClass(grimoireTab, "automation-pick").length, game.upgrades.length);
    assert.ok(row("While saving"));
    assert.match(value(pick(femurUpgrade.id), "Next level"), /^[\d.,KMB]+ femur$/);
    const locked = game.upgrades.find(({ open }) => !open);
    assert.match(detail(pick(locked.id)), /^Unlocks at [\d.,K]+ total levels$/);
    assert.equal(value(pick(locked.id), "Next level"), "Locked");
    const maxed = game.upgrades.find(({ level, max }) => max !== null && level >= max);
    assert.equal(value(pick(maxed.id), "Next level"), "Max");
});

test("small amounts show whole, like the game: a cost rounded up, the bones held rounded down", async () => {
    const block = kit.fixture.computed._customBlock_Summoning;
    const cost = block.GrimoireUpgCost;
    const femur = kit.gga.OptionsListAccount[330];
    block.GrimoireUpgCost = (i, ...rest) => (i === femurUpgrade.id ? 99.2 : cost(i, ...rest));
    kit.gga.OptionsListAccount[330] = 149.36;
    try {
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
        assert.equal(value(pick(femurUpgrade.id), "Next level"), "100 femur");
        assert.match(text(page), /149 femur/);
    } finally {
        block.GrimoireUpgCost = cost;
        kit.gga.OptionsListAccount[330] = femur;
        await kit.button(page, "Refresh").listeners.click({ preventDefault() {} });
        await kit.idle();
    }
});

test("switching an upgrade on saves the list and turns the Grimoire automation on, now and at start", async () => {
    await kit.flip(pick(femurUpgrade.id), true);
    assert.deepEqual(sent("grimoire"), [{ id: String(femurUpgrade.id), on: true }]);
    assert.deepEqual(fileSent("grimoire"), sent("grimoire"));
    assert.equal(kit.running("automation grimoire"), true);
    assert.deepEqual(kit.fake.startup, ["automation grimoire"]);
    await until(
        () => boneLine("Femur") === "Buying cheapest first",
        () => `the femur line: ${boneLine("Femur")}`
    );
});

test("Save for it saves, and the bone line reads what it now saves for from the game", async () => {
    await kit.flipSave(pick(femurUpgrade.id), true);
    assert.equal(sent("grimoire")[0].save, true);
    assert.equal(saved(pick(femurUpgrade.id)), true);
    await until(
        () => /^Saving for /.test(boneLine("Femur")),
        () => `the femur goal: ${boneLine("Femur")}`
    );
});

test("the saving % saves on Enter to its own key, and a value over 100 is refused at its field", async () => {
    await kit.type(row("While saving"), "40");
    assert.equal(sent("grimoireSaving"), 40);
    const before = kit.updates.length;
    await kit.type(row("While saving"), "101");
    assert.equal(kit.updates.length, before);
    assert.match(text(row("While saving")), /0 to 100/);
});

test("a refused save puts the game's choice back and says why at the row", async () => {
    kit.fake.refuseNextUpdates = 1;
    await kit.flipSave(pick(femurUpgrade.id), false);
    assert.equal(saved(pick(femurUpgrade.id)), true);
    assert.match(text(pick(femurUpgrade.id)), /the game is busy/);
});

test("Enable all switches every upgrade on; Disable all asks in the tray and keeps Save for it", async () => {
    await kit.button(page, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("grimoire").filter(({ on }) => on).length, game.upgrades.length);
    await kit.askAndConfirm(page, "Disable all", `Disable ${game.upgrades.length} Grimoire upgrades?`);
    assert.ok(sent("grimoire").every(({ on }) => !on));
    assert.equal(sent("grimoire").find(({ id }) => id === String(femurUpgrade.id)).save, true);
});

// ---- The other tabs ----------------------------------------------------------------------------------------------

const openTab = async (label) => {
    const tab = kit.byTag(page, "button").find((node) => node.attributes.role === "tab" && text(node) === label);
    await tab.listeners.click({});
    await kit.idle();
};
// Each tab's list (Grimoire, Compass, Tesseract, Royal Armory), then the Armory's statues inside it.
const tabRows = (i) => byClass(page, "automation-rows")[i];
const named = (root, name) => kit.row(root, name);
const cleanUpgrade = (name) => name.replace(/製.*$/, "").replace(/_/g, " ").replace(/[{}]/g, "").trim();

test("each masterclass has its own tab, switch and saving %, and the title holds the open tab's currencies", async () => {
    for (const name of ["Grimoire", "Compass", "Tesseract", "Royal Armory"]) assert.ok(row(name), `${name}'s switch`);
    assert.equal(byClass(page, "automation-setting").length, 4, "one saving % per tab");
    await openTab("Compass");
    assert.match(text(page), /182K stardust · 41\.5K moondust · 7\.3K solardust · 980 cooldust · 12 novadust/);
    await openTab("Tesseract");
    assert.match(text(page), /820K purple tachyons · 155K brown tachyons/);
    await openTab("Grimoire");
});

test("the Compass tab marks what it doesn't show yet; those can still be switched on", async () => {
    const compass = await readComputed("automation", "compass");
    const hidden = compass.upgrades.find(({ open, level, max }) => !open && level < (max ?? Infinity));
    const shown = compass.upgrades.find(({ open }) => open);
    const compassTab = tabRows(1);
    const hiddenRow = named(compassTab, cleanUpgrade(hidden.name));
    assert.equal(detail(hiddenRow), "Not shown in the Compass yet");
    assert.equal(value(hiddenRow, "Next level"), "Hidden");
    assert.equal(detail(named(compassTab, cleanUpgrade(shown.name))), "");
    await kit.flip(hiddenRow, true);
    assert.deepEqual(sent("compass"), [{ id: String(hidden.id), on: true }]);
    assert.equal(kit.running("automation compass"), true);
});

test("the Tesseract tab names its tachyons in the cost, and its saving % saves to its own key", async () => {
    const tesseract = await readComputed("automation", "tesseract");
    const buyable = tesseract.upgrades.find(({ open, level, max }) => open && level < (max ?? Infinity));
    const tesseractTab = tabRows(2);
    assert.match(
        value(named(tesseractTab, cleanUpgrade(buyable.name)), "Next level"),
        new RegExp(`^[0-9.,KMB]+ ${buyable.currency} tachyons$`)
    );
    await kit.type(named(tesseractTab, "While saving"), "30");
    assert.equal(sent("tesseractSaving"), 30);
});

test("the Royal Armory tab lists the statues with their odds; Enable all covers upgrades and statues", async () => {
    const armory = await readComputed("automation", "armory");
    const statueRows = byClass(tabRows(4), "automation-pick");
    assert.equal(statueRows.length, armory.statues.length);
    const at = (statue) => statueRows[armory.statues.indexOf(statue)];
    assert.match(value(at(armory.statues.find(({ level }) => level > 0)), "Odds"), /^1 in [0-9,]+$/);
    const locked = at(armory.statues.find(({ level }) => level === 0));
    assert.equal(value(locked, "Odds"), "Locked");
    assert.equal(detail(locked), "Locked");

    await openTab("Royal Armory");
    const total = armory.upgrades.length + armory.statues.length;
    // The open tab's tools; the other tabs' stay in the tray, hidden.
    const tools = byClass(page, "automation-tools")[3];
    await kit.button(tools, "Enable all").listeners.click({ preventDefault() {} });
    await kit.idle();
    assert.equal(sent("armory").filter(({ on }) => on).length, armory.upgrades.length);
    assert.equal(sent("statues").filter(({ on }) => on).length, armory.statues.length);
    assert.equal(kit.running("automation armory"), true);
    assert.match(text(page), /parchments/, "with a statue on, the parchments held show beside the title");
    await kit.button(tools, "Disable all").listeners.click({ preventDefault() {} });
    await kit.settle();
    const asked = byClass(page, "tabbed-list__tools-label")
        .map(text)
        .find((line) => line.endsWith("?"));
    assert.equal(asked, `Disable ${total} upgrades and statues?`);
    await byClass(page, "tabbed-list__yes")[0].listeners.click({});
    await kit.idle();
    assert.ok(sent("statues").every(({ on }) => !on));
    await openTab("Grimoire");
});
