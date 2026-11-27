// The Wardrobe page (#101, from VoidKitten's #2) on the fake game with the mage of scripts/wardrobe-fixture.mjs: picking
// a loadout previews it; Equip asks in the tray, then saves the plan as one action the change log can undo (after
// which the page works the stats out again); a write the game refuses is said on the tray's line; saved loadouts
// and the largest golden food stack are saved to the config file from a fresh read, as Pets saves its pets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi, saveToSession } from "./page-shots/fake-api.mjs";
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
// While set, every wide wardrobestats waits until the release it is handed to `holdStats(release)` is called.
let holdStats = null;
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
    if (action === "wide wardrobestats" && holdStats) await new Promise((release) => holdStats(release));
    return toggle(req, res);
});
// How many of the next config file saves fail, and what runs before the next one fails (another tab saving).
let failSaves = 0;
let onFail = null;
router.routes.POST.set("/api/config/save", async (req, res) => {
    if (failSaves > 0) {
        failSaves--;
        const run = onFail;
        onFail = null;
        await run?.();
        return res.status(500).json({ error: "The config file is locked" });
    }
    const body = await req.json();
    saves.push(body);
    if (onSave) {
        const run = onSave;
        onSave = null;
        run();
    }
    // As the server's save does once the file is written: the session takes it.
    res.json(await saveToSession(router, body));
});
// What the page asks the game, in order: its Wardrobe reads ("wardrobe.preview"), the cheats it runs, and its writes.
// `holdPreview`: a promise the next preview read waits on. `holdPreviewAnswer`: the same, but the game works the plan
// out first, so it answers with the plan from before; `previewWorkedOut` turns true once it has. `failPreviews`: how
// many of the next preview reads fail.
const log = [];
let holdPreview = null;
let holdPreviewAnswer = null;
let previewWorkedOut = false;
let failPreviews = 0;
const computed = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { namespace, name } = await req.json();
    log.push(`${namespace}.${name}`);
    if (name === "preview" && holdPreview) {
        const held = holdPreview;
        holdPreview = null;
        await held;
    }
    if (name === "preview" && holdPreviewAnswer) {
        const held = holdPreviewAnswer;
        holdPreviewAnswer = null;
        const read = Object.create(res);
        read.json = (body) => {
            read.answer = body;
            previewWorkedOut = true;
            return read;
        };
        await computed(req, read);
        await held;
        return res.status(read.statusCode).json(read.answer);
    }
    if (name === "preview" && failPreviews > 0) {
        failPreviews--;
        return res.status(500).json({ error: "The game didn't answer" });
    }
    return computed(req, res);
});
const writeMany = router.routes.POST.get("/api/game/gga/write-many");
router.routes.POST.set("/api/game/gga/write-many", async (req, res) => {
    log.push("write-many");
    return writeMany(req, res);
});
// How many of the next session config reads fail.
let failConfigReads = 0;
const readConfig = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    if (failConfigReads > 0) {
        failConfigReads--;
        return res.status(500).json({ error: "The config can't be read" });
    }
    return readConfig(req, res);
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
const realButton = (root, label) => elements(root).find((node) => node.nodeName === "button" && text(node) === label);
// An attribute as it is now (VanJS keeps one that changes as a function).
const attrOf = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);
// The tray asks a question in place of its tools: its answer row shows.
const asking = (root) => {
    const answer = byClass(root, "tabbed-list__answer")[0];
    return Boolean(answer) && !attrOf(answer, "hidden");
};
// Equip, Delete and Perfect equipped ask in the tray, then run on its answer. In the tests they keep the shape the
// "Click again" buttons had: the first press asks (the question is the button's label), the second answers.
const asker = (root, label) => {
    const real = () => realButton(root, label);
    return {
        get attributes() {
            return {
                disabled: asking(root) ? false : attrOf(real(), "disabled"),
                "data-again": asking(root) ? "Click again" : undefined,
                "aria-label": asking(root) ? trayLine(root) : undefined,
                "aria-busy": attrOf(real(), "aria-busy"),
            };
        },
        listeners: {
            // The answer resolves once the run it started ends, as the second "Click again" press did.
            click: async () => {
                if (!asking(root))
                    return real().listeners.click({ currentTarget: real(), target: real(), preventDefault() {} });
                byClass(root, "tabbed-list__yes")[0].listeners.click({});
                await new Promise((resolve) => setTimeout(resolve, 10));
                await until(() => !real() || String(attrOf(real(), "aria-busy")) !== "true", "the answer's run to end");
                await new Promise((resolve) => setTimeout(resolve, 20));
            },
        },
    };
};
const NAMES = { Apply: "Equip", "Perfect Equipped": "Perfect equipped", Delete: "Delete", Save: "Add loadout" };
const button = (root, label) => {
    const now = NAMES[label] ?? label;
    if (!realButton(root, now)) return undefined;
    return ["Equip", "Perfect equipped", "Delete"].includes(now) ? asker(root, now) : realButton(root, now);
};
// A browser doesn't click a disabled button: wait until it is enabled (or fail), then click.
const click = async (node) => {
    await until(() => !attrOf(node, "disabled"), "the button to be enabled");
    return node.listeners.click({ currentTarget: node, preventDefault() {} });
};
const after = (since, kind) => requests.slice(since).filter((entry) => entry.includes(kind));
const titles = (root) => byClass(root, "account-section__title").map(text);
// The loadout is picked on the line under the title, in place: its options are buttons with the loadout's id.
const options = (root) =>
    elements(byClass(root, "account-page-toolbar")[0]).filter((node) => node.attributes.role === "option");
const optionLabel = (node) => text(byClass(node, "pick-in-place__option-label")[0] ?? node);
const pick = (root, id) =>
    options(root)
        .find((node) => node.attributes["data-id"] === id)
        .listeners.click({});
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

// Every page a test opened; each one reloads after an undo.
const pages = [];
const open = async () => {
    const root = (await importRepo(PAGE)).default.component();
    await until(() => titles(root).includes("Equipment & specials"), "the page to load its preview");
    pages.push(root);
    return root;
};
const page = await open();

test("the page shows who is in play, the loadouts for a mage, and what the first one would change", () => {
    assert.match(text(page), /Lumi_Main · Mage · World 5/);
    assert.match(text(page), /Stacks: golden 25,000, other 1,500/);
    assert.equal(optionLabel(options(page)[0]), "Rare Drops (DK / RG Primarily)");
    assert.deepEqual(titles(page).slice(0, 3), ["Equipment & specials", "Tools", "Food"]);
    assert.ok(titles(page).includes("Not available"));
    assert.match(text(page), /Prehistoric Battlehair requires Character level 650/);
    assert.match(text(page), /Diabolical Wand/);
    assert.deepEqual(gga.EquipmentOrder[0][1], "EquipmentSword5", "the preview changes nothing");
});

test("the largest golden food stack seen is saved to the config file on open, from a fresh read", async () => {
    await until(() => saves.length, "the save");
    assert.deepEqual((await wardrobeConfig()).goldenfood, { Lumi_Main: 25000 });
    assert.deepEqual(saves.at(-1).cheatConfig.wide.wardrobe.goldenfood, { Lumi_Main: 25000 });
});

test("Equip asks in the tray first, then saves the loadout as one action and works the stats out again", async () => {
    const apply = button(page, "Apply");
    const since = requests.length;
    const ran = commands.length;
    await click(apply);
    assert.equal(apply.attributes["data-again"], "Click again");
    assert.match(apply.attributes["aria-label"], /^Equip Rare Drops .* on Lumi_Main\? Gear, tools, .* are replaced\.$/);
    assert.deepEqual(after(since, "write"), [], "the first click changes nothing");
    await click(apply);
    await until(() => /Equipped .* on Lumi_Main/.test(text(page)), "the result to be said");
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
    await until(() => /The game changed\. This is the new plan/.test(text(page)), "the refusal to be said");
    assert.deepEqual(after(since, "write"), []);
    assert.equal(gga.EquipmentOrder[0][0], "EquipmentHats1");
    gga.Lv0[0] = 500;
    pick(page, "rare-drops");
    await previewShown();
});

test("a write the game refuses is said on the tray's line", async () => {
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
        await until(() => /Game kept old value/.test(text(page)), "the failure to be said");
        // What landed before the refusal counts: the stats are worked out again and the preview read again.
        await until(() => commands.slice(ran).includes("wide wardrobestats"), "the stats after the failure");
        await until(previewAfterWrite, "the preview read again after the refused write");
        assert.match(text(page), /Game kept old value/, "the failure stays said");
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
    await until(() => /Added Drop farm/.test(text(page)), "the save to be said");
    const [loadout] = (await wardrobeConfig()).loadouts;
    assert.equal(loadout.name, "Drop farm");
    assert.equal(loadout.equipment[1], "EquipmentSword5");
    assert.ok(saves.length > count);
    assert.deepEqual(saves.at(-1).cheatConfig.wide.wardrobe.loadouts, [loadout], "the whole list goes to the file");
    // Only the wardrobe settings: a whole config read before another page's change would put that change back.
    assert.deepEqual(Object.keys(saves.at(-1)), ["cheatConfig"]);
    assert.deepEqual(Object.keys(saves.at(-1).cheatConfig), ["wide"]);
    assert.deepEqual(Object.keys(saves.at(-1).cheatConfig.wide), ["wardrobe"]);
    // It is picked, previewed, and shows up again on a page opened later.
    await until(() => button(page, "Delete"), "the Delete button of a saved loadout");
    const again = await open();
    assert.ok(options(again).some((node) => optionLabel(node) === "Drop farm"));

    const remove = button(page, "Delete");
    await click(remove);
    assert.equal(remove.attributes["data-again"], "Click again");
    assert.deepEqual((await wardrobeConfig()).loadouts.length, 1, "the first click deletes nothing");
    await click(remove);
    await until(() => /Deleted Drop farm/.test(text(page)), "the delete to be said");
    assert.deepEqual((await wardrobeConfig()).loadouts, []);
    assert.deepEqual(saves.at(-1).cheatConfig.wide.wardrobe.loadouts, []);
});

test("Perfect equipped asks in the tray, rebuilds the gear as one action, and Undo puts the old rolls back", async () => {
    await settle();
    gga.EquipmentMap[0][0].h = { STR: 3 };
    const perfect = button(page, "Perfect Equipped");
    const since = requests.length;
    await click(perfect);
    assert.match(perfect.attributes["aria-label"], /^Rebuild Lumi_Main's worn gear\?/);
    assert.deepEqual(after(since, "write"), []);
    await click(perfect);
    await until(() => /Rebuilt 2 items for WIS, raised 1 food stacks/.test(text(page)), "the result");
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
    await until(() => /Equipped .* on Lumi_Main/.test(text(page)), "the loadout to land");
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
    await until(() => /food stacks weren't set: Character changed\. Refresh\./.test(text(page)), "the stop");
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
        assert.match(perfect.attributes["aria-label"], /Rebuild Lumi_Main's worn gear/);
        await click(perfect);
        await until(() => /Character changed\. Refresh\./.test(text(page)), "the refusal");
        assert.deepEqual(after(since, "write"), []);
    } finally {
        gga.UserInfo[0] = "Lumi_Main";
    }
});

// The page's requests still waiting on the fake API, and how many wardrobe previews the page has read: a refusal's
// catch-up and an undo's reload both end by reading the preview, so a test waits for that read and no request left.
let waiting = 0;
const answerFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
    waiting++;
    try {
        return await answerFetch(...args);
    } finally {
        waiting--;
    }
};
let previewReads = 0;
const computedRead = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { name } = await req.json();
    const answered = await computedRead(req, res);
    if (name === "preview") previewReads++;
    return answered;
});
const previewReadSince = (reads, what) => until(() => previewReads > reads && waiting === 0, what);

// The player is on Lumi_Alt just as a save reaches the game: after the page planned for Lumi_Main and the change log
// read the old values. The game checks who is in play in the same call as the writes. `skip`: writes that land first
// (1 lets the gear land and switches at the food). Resolves to the preview reads made before the switch.
const switchAtNextWrite = (skip = 0) =>
    new Promise((switched) => {
        const write = router.routes.POST.get("/api/game/gga/write-many");
        router.routes.POST.set("/api/game/gga/write-many", async (req, res) => {
            if (skip-- > 0) return write(req, res);
            router.routes.POST.set("/api/game/gga/write-many", write);
            switched(previewReads);
            gga.UserInfo[0] = "Lumi_Alt";
            try {
                return await write(req, res);
            } finally {
                gga.UserInfo[0] = "Lumi_Main";
            }
        });
    });

test("a player who switches characters as Apply writes gets no gear put on the new one", async () => {
    await until(() => waiting === 0, "the page to finish reading the game");
    const actions = (await fetchChanges()).actions.length;
    const switched = switchAtNextWrite();
    const apply = button(page, "Apply");
    await click(apply);
    await click(apply);
    await until(() => /Character changed\. Refresh\./.test(text(page)), "the refusal");
    assert.equal(gga.EquipmentOrder[0][1], "EquipmentSword5");
    assert.equal(gga.EquipmentOrder[0][0], "EquipmentHats1");
    assert.equal((await fetchChanges()).actions.length, actions, "nothing logged");
    await previewReadSince(await switched, "the page to read the game again");
});

test("a player who switches characters as Apply writes the food stacks is told the gear landed and no food was set", async () => {
    gga.EquipmentQuantity[2][0] = 30000;
    const switched = switchAtNextWrite(1);
    const apply = button(page, "Apply");
    await click(apply);
    await click(apply);
    const said =
        "Rare Drops (DK / RG Primarily) landed on Lumi_Main, but its food stacks weren't set: " +
        "Character changed. Refresh.";
    await until(() => text(page).includes(said), "the refusal");
    assert.equal(gga.EquipmentOrder[0][1], "EquipmentWands9", "the gear landed on Lumi_Main");
    assert.equal(gga.EquipmentQuantity[2][0], 30000, "no food stack set");
    await previewReadSince(await switched, "the page to read the game again");
    const [action] = (await fetchChanges()).actions;
    const reads = previewReads;
    await undoAction(action.id);
    await previewReadSince(reads, "the page to read the game after the undo");
    gga.EquipmentQuantity[2][0] = 25000;
});

test("a player who switches characters as Perfect Equipped writes gets no gear rebuilt on the new one", async () => {
    gga.EquipmentMap[0][0].h = { STR: 3 };
    const switched = switchAtNextWrite();
    const perfect = button(page, "Perfect Equipped");
    await click(perfect);
    await click(perfect);
    await until(() => /Character changed\. Refresh\./.test(text(page)), "the refusal");
    assert.equal(JSON.stringify(gga.EquipmentMap[0][0].h), JSON.stringify({ STR: 3 }));
    await previewReadSince(await switched, "the page to read the game again");
});

test("a name typed while a loadout saves stays in the field for the next one", async () => {
    await settle();
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    const save = button(page, "Save");
    name.listeners.input({ target: { value: "First" } });
    onSave = () => name.listeners.input({ target: { value: "Second" } });
    await save.listeners.click({ currentTarget: save, preventDefault() {} });
    await until(() => /Added First/.test(text(page)), "the save");
    // The fake DOM keeps a field's value as its attribute.
    await until(() => name.attributes.value === "Second", "the field to show the new name");
    await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
});

const changeLabel = (root) => byClass(root, "wardrobe-loadout")[0].attributes["data-change-label"];

// CodeRabbit on #103: two saved loadouts can share a name, so the question is about the plan, not its name.
test("Apply asks again for another saved loadout of the same name", async () => {
    await settle();
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    const save = button(page, "Save");
    for (let i = 0; i < 2; i++) {
        name.listeners.input({ target: { value: "Farm" } });
        await click(save);
        await until(() => /Added Farm/.test(text(page)), "Farm to be saved");
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
    const [first, second] = options(page).map((node) => node.attributes["data-id"]);
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
        await until(() => String(button(page, "Apply").attributes["aria-busy"]) === "false", "Equip to end");
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(changeLabel(page), secondLabel, "the newer pick's preview stays");
    } finally {
        release?.();
        gga.Lv0[0] = 500;
        pick(page, "rare-drops");
        await previewShown();
    }
});

// CodeRabbit on #110: an Apply whose recheck finds the same plan still stops quietly when another loadout was picked
// meanwhile, instead of writing the first one.
test("an Apply whose loadout was changed during its recheck writes nothing and says nothing", async () => {
    await settle();
    const [first, second] = options(page).map((node) => node.attributes["data-id"]);
    pick(page, first);
    await previewShown();
    let release;
    try {
        holdPreview = new Promise((resolve) => (release = resolve));
        const apply = button(page, "Apply");
        await click(apply);
        const since = requests.length;
        const pressed = click(apply);
        await until(() => holdPreview === null, "the recheck to wait");
        pick(page, second);
        await until(() => /^(?!Loadout$)/.test(changeLabel(page)), "the second pick's preview");
        release();
        await pressed;
        assert.deepEqual(after(since, "write"), [], "nothing was applied");
        assert.doesNotMatch(text(page), /is on Lumi_Main|changed since this preview/);
    } finally {
        release?.();
        pick(page, "rare-drops");
        await previewShown();
    }
});

// Re-read of #110: an Apply whose pick stayed isn't dropped quietly when a reload (after an undo) showed a newer preview
// during its recheck; it says the game changed since its preview.
test("an undo during an Apply's recheck leaves the Apply saying what happened", async () => {
    await settle();
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    // A change the undo puts back, which changes the plan: the preview below is made with it.
    await withAction({ label: "level" }, () => writeManyVerified([{ path: "Lv0[0]", value: 700 }]));
    const [action] = (await fetchChanges()).actions;
    await click(button(page, "Refresh"));
    await settle();
    let release;
    try {
        holdPreview = new Promise((resolve) => (release = resolve));
        const apply = button(page, "Apply");
        await click(apply);
        const pressed = click(apply);
        await until(() => holdPreview === null, "the recheck to wait");
        const previews = () => log.filter((entry) => entry === "wardrobe.preview").length;
        const before = previews();
        await undoAction(action.id);
        await until(() => previews() > before, "the reload's preview");
        release();
        await pressed;
        assert.match(text(page), /The game changed\. This is the new plan/);
    } finally {
        release?.();
        gga.Lv0[0] = 500;
        pick(page, "rare-drops");
        await previewShown();
    }
});

// #113 (CodeRabbit on #110): the recheck read the game before an undo landed, so its plan matched the preview, and
// Apply wrote the plan from before the undo.
test("an Apply whose recheck read the game before an undo writes nothing", async () => {
    await settle();
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    await withAction({ label: "level" }, () => writeManyVerified([{ path: "Lv0[0]", value: 700 }]));
    const [action] = (await fetchChanges()).actions;
    await click(button(page, "Refresh"));
    await settle();
    let release;
    const stats = [];
    try {
        previewWorkedOut = false;
        holdPreviewAnswer = new Promise((resolve) => (release = resolve));
        const apply = button(page, "Apply");
        await click(apply);
        const pressed = click(apply);
        await until(() => previewWorkedOut, "the recheck to work the plan out before the undo, and wait");
        // The reload after the undo waits on its first step (the stats), before it reads anything: the recheck
        // answers while it waits there.
        holdStats = (release) => stats.push(release);
        await undoAction(action.id);
        await until(() => stats.length > 0, "the reload after the undo to start");
        const writes = log.filter((entry) => entry === "write-many").length;
        release();
        await pressed;
        assert.equal(log.filter((entry) => entry === "write-many").length, writes, "nothing written");
        assert.match(text(page), /The game changed\. This is the new plan/);
    } finally {
        release?.();
        holdStats = null;
        stats.splice(0).forEach((go) => go());
        gga.Lv0[0] = 500;
        pick(page, "rare-drops");
        await previewShown();
    }
});

// CodeRabbit on #110: when the newer preview an undo started fails during an Apply's recheck, its failure stays said,
// not replaced by "Apply again" with no preview to apply.
test("a newer preview that failed during an Apply's recheck keeps its failure said", async () => {
    await settle();
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    await withAction({ label: "level" }, () => writeManyVerified([{ path: "Lv0[0]", value: 700 }]));
    const [action] = (await fetchChanges()).actions;
    await click(button(page, "Refresh"));
    await settle();
    let release;
    try {
        holdPreview = new Promise((resolve) => (release = resolve));
        const apply = button(page, "Apply");
        await click(apply);
        const pressed = click(apply);
        await until(() => holdPreview === null, "the recheck to wait");
        // Every open page reloads after the undo; their previews fail.
        failPreviews = pages.length;
        await undoAction(action.id);
        await until(() => failPreviews === 0 && /The game didn't answer/.test(text(page)), "the newer preview to fail");
        release();
        await pressed;
        assert.match(text(page), /The game didn't answer/);
        assert.doesNotMatch(text(page), /equip again/);
    } finally {
        release?.();
        failPreviews = 0;
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
        await until(() => /100 loadouts saved\. Delete one first\./.test(text(page)), "the refusal");
        assert.equal((await wardrobeConfig()).loadouts.length, 100);
        assert.equal(saves.length, count, "nothing went to the file");
    } finally {
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        await click(button(page, "Refresh"));
        await settle();
    }
});

// #113 (CodeRabbit on #110): the page read a full list, then another tab deleted one; Save counts the list as it is now.
test("Save goes ahead when another tab deleted a loadout from the full list the page read", async () => {
    await settle();
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `other-${i}`, name: `Other ${i}`, classes: [] }));
    await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: full } } } });
    try {
        await click(button(page, "Refresh"));
        await settle();
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: full.slice(1) } } } }); // another tab
        const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
        name.listeners.input({ target: { value: "One more" } });
        await click(button(page, "Save"));
        await until(() => /Added One more/.test(text(page)), "the save");
        assert.equal((await wardrobeConfig()).loadouts.length, 100);
    } finally {
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        await click(button(page, "Refresh"));
        await settle();
        pick(page, "rare-drops");
        await previewShown();
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
        const unsaved = (await wardrobeConfig()).loadouts.filter((loadout) => loadout.name === "Retry");
        assert.equal(unsaved.length, 0, "the failed save left the session's list as it was");
        await click(button(page, "Save"));
        await until(() => /Added Retry/.test(text(page)), "the retry");
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

// CodeRabbit on #110: a failed save sends nothing more (the file goes first, so there is nothing to put back), and a
// list another tab saved meanwhile stays as it is. Save pressed again then saves that loadout once.
test("a loadout another tab saved while this tab's file save failed stays in the session, alone", async () => {
    await settle();
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    name.listeners.input({ target: { value: "Mine" } });
    failSaves = 1;
    onFail = async () => {
        const { loadouts } = await wardrobeConfig();
        const theirs = { id: "other-tab", name: "Theirs", classes: ["Mage"] };
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [...loadouts, theirs] } } } });
    };
    try {
        await click(button(page, "Save"));
        await until(() => /The config file is locked/.test(text(page)), "the failure");
        const names = (await wardrobeConfig()).loadouts.map((loadout) => loadout.name);
        assert.deepEqual(names, ["Theirs"]);
        const labels = () => options(page).map(optionLabel);
        await until(() => labels().includes("Theirs"), "the page to read the list again");
        assert.ok(!labels().includes("Mine"), "the page shows the list the file holds");
        onFail = null;
        await settle();
        await click(button(page, "Save"));
        await until(() => /Added Mine/.test(text(page)), "the retry");
        const written = saves.at(-1).cheatConfig.wide.wardrobe.loadouts.map((loadout) => loadout.name);
        assert.deepEqual(written.sort(), ["Mine", "Theirs"], "the file gets one Mine");
    } finally {
        failSaves = 0;
        onFail = null;
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        pick(page, "rare-drops");
        await previewShown();
    }
});

// A failed save leaves the session as it was, even when the read after it fails.
test("a loadout whose file save failed isn't in the session, though the read after the failure failed", async () => {
    await settle();
    const before = (await wardrobeConfig()).loadouts;
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    name.listeners.input({ target: { value: "Unchecked" } });
    failSaves = 1;
    onFail = () => (failConfigReads = 1);
    try {
        await click(button(page, "Save"));
        await until(() => /The config file is locked/.test(text(page)), "the failure");
        assert.deepEqual((await wardrobeConfig()).loadouts, before);
    } finally {
        failSaves = 0;
        failConfigReads = 0;
        onFail = null;
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        pick(page, "rare-drops");
        await previewShown();
    }
});

// CodeRabbit on #103 and #110: after an undo, each open page reads its status once, after its own stat update has
// answered. Every stat update is held and they answer one at a time, so a page that read its status first, or
// without waiting for its own update, reads while its update is still held. A page that doesn't wait reads within
// one config read of sending its update; `twoReads()` lets two pass before counting.
test("after an undo each page reads its status once, after its own stat update", async () => {
    await settle();
    const apply = button(page, "Apply");
    await click(apply);
    await click(apply);
    await until(() => /Equipped .* on Lumi_Main/.test(text(page)), "the loadout to land");
    const [action] = (await fetchChanges()).actions;
    const since = log.length;
    const count = (entry) => log.slice(since).filter((logged) => logged === entry).length;
    const twoReads = async () => {
        await fetchConfig();
        await fetchConfig();
    };
    const held = [];
    holdStats = (release) => held.push(release);
    try {
        await undoAction(action.id);
        await until(() => held.length === pages.length, "every page's stat update");
        await twoReads();
        assert.equal(count("wardrobe.status"), 0, "no page read its status before its stat update answered");
        // One update answers at a time: only the page that sent it reads its status.
        for (const [index, release] of held.entries()) {
            release();
            await until(() => count("wardrobe.status") === index + 1, `the status read after update ${index + 1}`);
            await twoReads();
            assert.equal(count("wardrobe.status"), index + 1, "only the page whose update answered read its status");
        }
        await until(
            () => pages.every((root) => !button(root, "Refresh").attributes.disabled),
            "every page's reload to end"
        );
        assert.equal(count("wardrobe.status"), pages.length, "one status read per page");
        assert.equal(count("wide wardrobestats"), pages.length, "one stat update per page");
    } finally {
        holdStats = null;
        for (const release of held) release();
    }
});

// CodeRabbit on #147: the running game holds the whole config, so a save it kept its old settings for would be undone
// by the next read and the save after it; the page says so on the tray's line, as Pets and Attire Rack do.
test("a loadout save the running game kept its old settings for is said as a failure", async () => {
    await settle();
    const save = router.routes.POST.get("/api/config/save");
    router.routes.POST.set("/api/config/save", async (req, res) => {
        await save(req, { status: () => ({ json() {} }), json() {} });
        res.json({
            message:
                "Configuration saved to config.custom.js. The running game kept its old settings (The game is busy)",
        });
    });
    const name = elements(page).find((node) => node.attributes["aria-label"] === "Loadout name");
    name.listeners.input({ target: { value: "Kept old" } });
    try {
        await click(button(page, "Save"));
        await until(() => /The game is busy/.test(text(page)), "the reason on the tray's line");
        assert.doesNotMatch(text(page), /Added Kept old/);
    } finally {
        router.routes.POST.set("/api/config/save", save);
        await updateSessionConfig({ cheatConfig: { wide: { wardrobe: { loadouts: [] } } } });
        await click(button(page, "Refresh"));
        await settle();
    }
});
