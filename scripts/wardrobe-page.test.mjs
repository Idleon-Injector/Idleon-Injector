// The Wardrobe page (#101, from VoidKitten's #2) on the fake game with the mage of scripts/wardrobe-fixture.mjs: picking
// a loadout previews it; Apply asks "Click again", then saves the plan as one action the change log can undo (after
// which the page works the stats out again); a write the game refuses is said where Apply was pressed; saved loadouts
// and the largest golden food stack are saved to the config file from a fresh read, as Pets saves its pets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";
import { wardrobeComputed, wardrobeDefinitions, wardrobeGga, wardrobeLists } from "./wardrobe-fixture.mjs";

const fixture = fakeGameData();
Object.assign(fixture.gga, wardrobeGga("Lumi_Main", "Lumi_Alt"));
Object.assign(fixture.gga.ItemDefinitionsGET.h, wardrobeDefinitions());
Object.assign(fixture.gga.CustomLists.h, wardrobeLists());
Object.assign(fixture.computed, wardrobeComputed());
const { router, game } = await createFakeApi(fixture);
// The cheats the page runs, and what it hands the config file save (the fake API's own save writes nothing).
const commands = [];
const saves = [];
const toggle = router.routes.POST.get("/api/toggle");
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action } = await req.json();
    commands.push(action);
    return toggle(req, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    saves.push(await req.json());
    res.json({ ok: true });
});
const { requests } = await loadUi(router);
// clickAgain shows its question in the menu's tooltip and reads it out from a live region on the page.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const gga = game.gga;
const { fetchChanges, fetchConfig } = await importRepo("src/ui/services/api.js");
const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
const PAGE = "src/ui/pages/account/player/3-wardrobe.js";

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
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
const button = (root, label) => elements(root).find((node) => node.nodeName === "button" && text(node) === label);
const click = (node) => node.listeners.click({ currentTarget: node, preventDefault() {} });
const after = (since, kind) => requests.slice(since).filter((entry) => entry.includes(kind));
const titles = (root) => byClass(root, "wardrobe-group__title").map(text);
const picker = (root) => elements(root).find((node) => node.attributes["aria-label"] === "Loadout");
const pick = (root, id) => picker(root).listeners.change({ target: { value: id } });
// The preview of the loadout picked, once it is on the page (VanJS draws on the next tick).
const previewShown = async (root = page) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await until(() => titles(root).includes("Tools"), "the preview");
};
const wardrobeConfig = async () => (await fetchConfig()).cheatConfig.wide.wardrobe;

const open = async () => {
    const root = (await importRepo(PAGE)).default.component();
    await until(() => titles(root).includes("Equipment & specials"), "the page to load its preview");
    return root;
};
const page = await open();

test("the page shows who is in play, the loadouts for a mage, and what the first one would change", () => {
    assert.match(text(page), /Lumi_Main · Mage · world 5 · food stacks: golden 25,000, other 1,500/);
    const options = elements(picker(page)).filter((node) => node.nodeName === "option");
    assert.equal(text(options[0]), "Rare Drops (DK / RG Primarily)");
    assert.deepEqual(titles(page).slice(0, 3), ["Equipment & specials", "Tools", "Food"]);
    assert.match(text(page), /Not available \(\d+\)/);
    assert.match(text(page), /Prehistoric Battlehair requires Character level 650/);
    assert.match(text(page), /Diabolical Wand/);
    assert.deepEqual(gga.EquipmentOrder[0][1], "EquipmentSword5", "the preview changes nothing");
});

test("the largest golden food stack seen is saved to the config file on open, from a fresh read", async () => {
    await until(() => saves.length, "the save");
    assert.deepEqual((await wardrobeConfig()).goldenfood, { Lumi_Main: 25000 });
    assert.deepEqual(saves.at(-1).cheatConfig.wide.wardrobe.goldenfood, { Lumi_Main: 25000 });
});

test("Apply asks Click again first, then saves the loadout as one action and works the stats out again", async () => {
    const apply = button(page, "Apply");
    const since = requests.length;
    const ran = commands.length;
    await click(apply);
    assert.equal(apply.attributes["data-again"], "Click again");
    assert.match(apply.attributes["aria-label"], /^Click again to replace Lumi_Main's gear, .* with Rare Drops/);
    assert.deepEqual(after(since, "write"), [], "the first click changes nothing");
    await click(apply);
    await until(() => /is on Lumi_Main/.test(text(page)), "the result to be said");
    assert.equal(gga.EquipmentOrder[0][1], "EquipmentWands9");
    assert.equal(gga.EquipmentQuantity[2][0], 25000, "golden food keeps its largest stack");
    assert.equal(gga.PlayerDATABASE.h.Lumi_Main.h.Prayers[0], gga.PrayersActive[0]);
    assert.deepEqual(after(since, "write"), ["POST /api/game/gga/write-many", "POST /api/game/gga/write-many"]);
    assert.deepEqual(commands.slice(ran), ["wide wardrobestats", "wide wardrobestats"]);
    const [action] = (await fetchChanges()).actions;
    assert.ok(action.entries.some(({ path }) => path === "EquipmentOrder[0][1]"));
    assert.ok(
        action.entries.some(({ path }) => path === "EquipmentQuantity[2][0]"),
        "the food sizes join it"
    );

    // Undo puts every value back, and the page works the stats out again.
    const before = commands.length;
    await undoAction(action.id);
    assert.equal(gga.EquipmentOrder[0][1], "EquipmentSword5");
    assert.equal(gga.EquipmentOrder[0][0], "EquipmentHats1");
    assert.deepEqual(gga.PrayersActive.slice(0, 2), [1, 2]);
    await until(() => commands.slice(before).includes("wide wardrobestats"), "the stats after the undo");
});

test("a game that changed since the preview shows the new plan instead of applying the old one", async () => {
    gga.Lv0[0] = 700;
    const since = requests.length;
    const apply = button(page, "Apply");
    await click(apply);
    await click(apply);
    await until(() => /changed since this preview/.test(text(page)), "the refusal to be said");
    assert.deepEqual(after(since, "write"), []);
    assert.equal(gga.EquipmentOrder[0][0], "EquipmentHats1");
    gga.Lv0[0] = 500;
    pick(page, "rare-drops");
    await previewShown();
});

test("a write the game refuses is said where Apply was pressed", async () => {
    const row = gga.EquipmentOrder[0];
    const kept = row[1];
    Object.defineProperty(row, 1, { get: () => kept, set() {}, configurable: true });
    try {
        const apply = button(page, "Apply");
        await click(apply);
        await click(apply);
        await until(() => /Write mismatch at EquipmentOrder\[0\]\[1\]/.test(text(page)), "the failure to be said");
        assert.ok(byClass(page, "said--failed").length, "said as a failure, in place");
        assert.equal(row[1], kept);
    } finally {
        Object.defineProperty(row, 1, { value: kept, writable: true, configurable: true });
    }
    // What landed is one action; Undo puts it back.
    const [action] = (await fetchChanges()).actions;
    await undoAction(action.id);
    assert.equal(gga.EquipmentOrder[0][0], "EquipmentHats1");
});

test("Save keeps what the character wears as a loadout, in the config file, and it can be picked and deleted", async () => {
    // The page reads the game again after the last undo; its buttons wait for that.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await previewShown();
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    const save = button(page, "Save");
    await save.listeners.click({ currentTarget: save, preventDefault() {} });
    await until(() => /Give the loadout a name first/.test(text(page)), "the refusal");
    name.listeners.input({ target: { value: "Drop farm" } });
    const count = saves.length;
    await save.listeners.click({ currentTarget: save, preventDefault() {} });
    await until(() => /Saved Drop farm from Lumi_Main/.test(text(page)), "the save to be said");
    const [loadout] = (await wardrobeConfig()).loadouts;
    assert.equal(loadout.name, "Drop farm");
    assert.equal(loadout.equipment[1], "EquipmentSword5");
    assert.ok(saves.length > count);
    assert.deepEqual(saves.at(-1).cheatConfig.wide.wardrobe.loadouts, [loadout], "the whole list goes to the file");
    // It is picked, previewed, and shows up again on a page opened later.
    await until(() => button(page, "Delete"), "the Delete button of a saved loadout");
    const again = await open();
    assert.ok(elements(picker(again)).some((node) => node.nodeName === "option" && text(node) === "Drop farm"));

    const remove = button(page, "Delete");
    await click(remove);
    assert.equal(remove.attributes["data-again"], "Click again");
    assert.deepEqual((await wardrobeConfig()).loadouts.length, 1, "the first click deletes nothing");
    await click(remove);
    await until(() => /Deleted Drop farm/.test(text(page)), "the delete to be said");
    assert.deepEqual((await wardrobeConfig()).loadouts, []);
    assert.deepEqual(saves.at(-1).cheatConfig.wide.wardrobe.loadouts, []);
});

test("Perfect Equipped asks Click again, rebuilds the gear as one action, and Undo puts the old rolls back", async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await previewShown();
    gga.EquipmentMap[0][0].h = { STR: 3 };
    const perfect = button(page, "Perfect Equipped");
    const since = requests.length;
    await click(perfect);
    assert.match(perfect.attributes["aria-label"], /^Click again to rebuild Lumi_Main's gear/);
    assert.deepEqual(after(since, "write"), []);
    await click(perfect);
    await until(() => /Rebuilt 2 items for WIS and raised 1 food stacks/.test(text(page)), "the result");
    assert.equal(gga.EquipmentMap[0][0].h.Defence, 10);
    assert.equal(gga.EquipmentQuantity[2][1], 1500);
    const [action] = (await fetchChanges()).actions;
    await undoAction(action.id);
    assert.equal(JSON.stringify(gga.EquipmentMap[0][0].h), JSON.stringify({ STR: 3 }));
    assert.equal(gga.EquipmentQuantity[2][1], 800);
});
