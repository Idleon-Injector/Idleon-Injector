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
// Run once at the next wide wardrobestats (a player switching characters) and at the next config file save.
let onStats = null;
let onSave = null;
const toggle = router.routes.POST.get("/api/toggle");
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action } = await req.json();
    commands.push(action);
    log.push(action);
    if (action === "wide wardrobestats" && onStats) {
        const run = onStats;
        onStats = null;
        run();
    }
    return toggle(req, res);
});
// How many of the next config file saves fail.
let failSaves = 0;
router.routes.POST.set("/api/config/save", async (req, res) => {
    if (failSaves > 0) {
        failSaves--;
        return res.status(500).json({ error: "The config file is locked" });
    }
    saves.push(await req.json());
    if (onSave) {
        const run = onSave;
        onSave = null;
        run();
    }
    res.json({ ok: true });
});
// What the page asks the game, in order: its Wardrobe reads ("wardrobe.preview"), the cheats it runs, and its writes.
// `holdPreview`: a promise the next preview read waits on.
const log = [];
let holdPreview = null;
const computed = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { namespace, name } = await req.json();
    log.push(`${namespace}.${name}`);
    if (name === "preview" && holdPreview) {
        const held = holdPreview;
        holdPreview = null;
        await held;
    }
    return computed(req, res);
});
const writeMany = router.routes.POST.get("/api/game/gga/write-many");
router.routes.POST.set("/api/game/gga/write-many", async (req, res) => {
    log.push("write-many");
    return writeMany(req, res);
});
const { requests } = await loadUi(router);
// clickAgain shows its question in the menu's tooltip and reads it out from a live region on the page.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const gga = game.gga;
const { fetchChanges, fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
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
// A browser doesn't click a disabled button: wait until it is enabled (or fail), then click.
const click = async (node) => {
    await until(() => !node.attributes.disabled, `${text(node)} to be enabled`);
    return node.listeners.click({ currentTarget: node, preventDefault() {} });
};
const after = (since, kind) => requests.slice(since).filter((entry) => entry.includes(kind));
const titles = (root) => byClass(root, "wardrobe-group__title").map(text);
const picker = (root) => elements(root).find((node) => node.attributes["aria-label"] === "Loadout");
const pick = (root, id) => picker(root).listeners.change({ target: { value: id } });
// The preview of the loadout picked, once it is on the page (VanJS draws on the next tick).
const previewShown = async (root = page) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await until(() => titles(root).includes("Tools"), "the preview");
};
// After an undo or a failure the page reads the game again; its buttons wait for that.
const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await previewShown();
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
    await settle();
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
    const ran = commands.length;
    const sinceFail = log.length;
    // The preview read after the refused write (Apply's own recheck comes before it).
    const previewAfterWrite = () => {
        const tail = log.slice(sinceFail);
        const write = tail.indexOf("write-many");
        return write >= 0 && tail.indexOf("wardrobe.preview", write) > write;
    };
    try {
        const apply = button(page, "Apply");
        await click(apply);
        await click(apply);
        await until(() => /Write mismatch at EquipmentOrder\[0\]\[1\]/.test(text(page)), "the failure to be said");
        assert.ok(byClass(page, "said--failed").length, "said as a failure, in place");
        // What landed before the refusal counts: the stats are worked out again and the preview read again.
        await until(() => commands.slice(ran).includes("wide wardrobestats"), "the stats after the failure");
        await until(previewAfterWrite, "the preview read again after the refused write");
        assert.match(text(page), /Write mismatch at EquipmentOrder\[0\]\[1\]/, "the failure stays said");
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
    await settle();
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
    await settle();
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

test("a larger golden stack saved meanwhile (another tab, the Config page) is kept, not lowered", async () => {
    await settle();
    // Behind the page's back: 90,000 is saved; the page still remembers 25,000.
    await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { goldenfood: { Lumi_Main: 90000 } } } } });
    gga.EquipmentQuantity[2][0] = 30000;
    const apply = button(page, "Apply");
    await click(apply);
    await click(apply);
    await until(() => /is on Lumi_Main/.test(text(page)), "the loadout to land");
    assert.equal((await wardrobeConfig()).goldenfood.Lumi_Main, 90000);
    assert.equal(saves.at(-1).cheatConfig.wide.wardrobe.goldenfood.Lumi_Main, 90000);
    const [action] = (await fetchChanges()).actions;
    await undoAction(action.id);
    gga.EquipmentQuantity[2][0] = 25000;
});

test("a player who switches characters while Apply runs gets no food stacks set for the planned one", async () => {
    await settle();
    const since = requests.length;
    const remembered = (await wardrobeConfig()).goldenfood.Lumi_Main;
    onStats = () => (gga.UserInfo[0] = "Lumi_Alt");
    const apply = button(page, "Apply");
    await click(apply);
    await click(apply);
    await until(() => /food stacks weren't set: Lumi_Alt is in play now, not Lumi_Main/.test(text(page)), "the stop");
    assert.deepEqual(after(since, "write"), ["POST /api/game/gga/write-many"], "the gear, and no food");
    assert.equal((await wardrobeConfig()).goldenfood.Lumi_Main, remembered, "nothing recorded for Lumi_Main");
    gga.UserInfo[0] = "Lumi_Main";
    const [action] = (await fetchChanges()).actions;
    await undoAction(action.id);
    await settle();
});

test("Perfect Equipped refuses before writing when another character is in play than the one it asked about", async () => {
    const since = requests.length;
    gga.UserInfo[0] = "Lumi_Alt";
    try {
        const perfect = button(page, "Perfect Equipped");
        await click(perfect);
        assert.match(perfect.attributes["aria-label"], /rebuild Lumi_Main's gear/);
        await click(perfect);
        await until(() => /Lumi_Alt is in play now, not Lumi_Main/.test(text(page)), "the refusal");
        assert.deepEqual(after(since, "write"), []);
    } finally {
        gga.UserInfo[0] = "Lumi_Main";
    }
});

test("a name typed while a loadout saves stays in the field for the next one", async () => {
    await settle();
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    const save = button(page, "Save");
    name.listeners.input({ target: { value: "First" } });
    onSave = () => name.listeners.input({ target: { value: "Second" } });
    await save.listeners.click({ currentTarget: save, preventDefault() {} });
    await until(() => /Saved First from Lumi_Main/.test(text(page)), "the save");
    // The fake DOM keeps a field's value as its attribute.
    await until(() => name.attributes.value === "Second", "the field to show the new name");
    await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
});

const options = (root) =>
    elements(picker(root)).filter((node) => node.nodeName === "option" && !node.attributes.hidden);
const changeLabel = (root) => byClass(root, "wardrobe-loadout")[0].attributes["data-change-label"];

// CodeRabbit on #103: two saved loadouts can share a name, so the question is about the plan, not its name.
test("Apply asks again for another saved loadout of the same name", async () => {
    await settle();
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    const save = button(page, "Save");
    for (let i = 0; i < 2; i++) {
        name.listeners.input({ target: { value: "Farm" } });
        await click(save);
        await until(() => /Saved Farm from Lumi_Main/.test(text(page)), "Farm to be saved");
        await settle();
    }
    const farms = (await wardrobeConfig()).loadouts.filter((loadout) => loadout.name === "Farm");
    assert.equal(farms.length, 2);
    try {
        pick(page, farms[0].id);
        await previewShown();
        const apply = button(page, "Apply");
        const since = requests.length;
        await click(apply);
        assert.equal(apply.attributes["data-again"], "Click again");
        pick(page, farms[1].id);
        await previewShown();
        await click(apply);
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.deepEqual(after(since, "write"), [], "the second Farm wasn't applied on the first one's question");
        assert.equal(apply.attributes["data-again"], "Click again", "it asks about the second Farm");
    } finally {
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        pick(page, "rare-drops");
        await previewShown();
    }
});

// CodeRabbit on #103: an Apply's recheck that comes back after a newer pick's preview doesn't replace it.
test("an older Apply recheck doesn't put its plan under a loadout picked meanwhile", async () => {
    await settle();
    const [first, second] = options(page).map((node) => node.attributes.value);
    pick(page, first);
    await previewShown();
    const firstLabel = changeLabel(page);
    let release;
    gga.Lv0[0] = 700; // the game changed since the preview, so the recheck finds a new plan
    try {
        holdPreview = new Promise((resolve) => (release = resolve));
        const apply = button(page, "Apply");
        await click(apply);
        void click(apply);
        await until(() => holdPreview === null, "the recheck to wait");
        pick(page, second);
        await until(() => /^(?!Loadout$)/.test(changeLabel(page)), "the second pick's preview");
        const secondLabel = changeLabel(page);
        assert.notEqual(secondLabel, firstLabel);
        release();
        await until(() => button(page, "Apply").attributes["aria-busy"] === "false", "Apply to end");
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(changeLabel(page), secondLabel, "the newer pick's preview stays");
    } finally {
        release?.();
        gga.Lv0[0] = 500;
        pick(page, "rare-drops");
        await previewShown();
    }
});

// CodeRabbit on #103: the limit is counted on the list read just before the save, not on the page's older one.
test("Save is refused when another tab filled the list since the page read it", async () => {
    await settle();
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `other-${i}`, name: `Other ${i}`, classes: [] }));
    await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: full } } } });
    const count = saves.length;
    try {
        const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
        name.listeners.input({ target: { value: "One more" } });
        await click(button(page, "Save"));
        await until(() => /100 loadouts are saved; delete one first/.test(text(page)), "the refusal");
        assert.equal((await wardrobeConfig()).loadouts.length, 100);
        assert.equal(saves.length, count, "nothing went to the file");
    } finally {
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        await click(button(page, "Refresh"));
        await settle();
    }
});

// CodeRabbit on #103: a file save that failed leaves nothing in the session, so trying again saves it once.
test("a loadout whose file save failed is saved once when Save is pressed again", async () => {
    await settle();
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    name.listeners.input({ target: { value: "Retry" } });
    failSaves = 1;
    try {
        await click(button(page, "Save"));
        await until(() => /The config file is locked/.test(text(page)), "the failure");
        await settle();
        await click(button(page, "Save"));
        await until(() => /Saved Retry from Lumi_Main/.test(text(page)), "the retry");
        const retries = (await wardrobeConfig()).loadouts.filter((loadout) => loadout.name === "Retry");
        assert.equal(retries.length, 1);
        assert.equal(saves.at(-1).cheatConfig.wide.wardrobe.loadouts.length, 1);
    } finally {
        failSaves = 0;
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        pick(page, "rare-drops");
        await previewShown();
    }
});

// CodeRabbit on #103: after an undo, one load reads the page, after the game worked the stats out again.
test("after an undo the page reads its status once, after the stats are worked out", async () => {
    await settle();
    const apply = button(page, "Apply");
    await click(apply);
    await click(apply);
    await until(() => /is on Lumi_Main/.test(text(page)), "the loadout to land");
    const [action] = (await fetchChanges()).actions;
    const since = log.length;
    await undoAction(action.id);
    const count = (entry) => log.slice(since).filter((logged) => logged === entry).length;
    // The reloads have ended once every stat update has a preview read after it and nothing more is asked for a while.
    let seen = -1;
    let quietSince = 0;
    await until(() => {
        if (!count("wide wardrobestats") || count("wardrobe.preview") < count("wide wardrobestats")) return false;
        if (log.length !== seen) {
            seen = log.length;
            quietSince = Date.now();
            return false;
        }
        return Date.now() - quietSince > 150;
    }, "the reloads after the undo to end");
    const tail = log.slice(since);
    // Every page open on the fake game (an earlier test opened a second one) reloads once, after its stat update.
    const reads = count("wardrobe.status");
    const stats = count("wide wardrobestats");
    assert.equal(reads, stats, `one status read per page: ${tail.join(", ")}`);
    assert.ok(tail.indexOf("wardrobe.status") > tail.indexOf("wide wardrobestats"), "read after the stats");
});
