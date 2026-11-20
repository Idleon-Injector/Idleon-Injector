// The Attire Rack page (#89) on the fake game: a card click saves the outfit choice like Pets (on at start too), an
// attire change lands in the change log and can be undone, giving everyone an outfit or no outfits asks "Click again"
// first, and a write the game refuses is said in its row. After a change and after its undo, the page runs
// wide attirestats so the game works the stats out again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

const fixture = fakeGameData();
const { router, game } = await createFakeApi(fixture);
// The cheats the page runs, and what it hands the config file save (the fake API's own save writes nothing). The
// fake game's cheat state follows the toggle, as the game's does.
const commands = [];
const saves = [];
const toggle = router.routes.POST.get("/api/toggle");
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push(action);
    if (action === "wide attire") fixture.cheatStates.wide.attire = on;
    return toggle(req, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    saves.push(await req.json());
    res.json({ ok: true });
});
const startup = () => saves.at(-1).startupCheats;
const { requests } = await loadUi(router);
// clickAgain shows its question in the menu's tooltip and reads it out from a live region on the page.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const gga = game.gga;
const { fetchChanges, fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
const PAGE = "src/ui/pages/account/player/2-attire-rack.js";

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

const card = (root, name) => byClass(root, "attire-card").find((node) => text(node).includes(name));
const pressed = (root, name) => String(card(root, name).attributes["aria-pressed"]) === "true";
const row = (root, name) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
const saveState = (node) => classes(byClass(node, "save-state")[0]);
// What a row's picker shows: its selected option.
const shown = (node) =>
    text(elements(node).find((entry) => entry.nodeName === "option" && entry.attributes.selected === true));

const open = async () => {
    const root = (await importRepo(PAGE)).default.component();
    await until(() => byClass(root, "attire-card").length === 8 && row(root, "Lumi_Third"), "the page to load");
    return root;
};
const page = await open();
const button = (root, label) => elements(root).find((node) => node.nodeName === "button" && text(node) === label);
const names = byClass(page, "tier-card__name").map(text);
const savedOutfits = async () => (await fetchConfig()).cheatConfig.wide.attire.outfits;
const after = (since, kind) => requests.slice(since).filter((entry) => entry.includes(kind));

// Pick an outfit in a character's row; resolves once the row's save ends.
async function pick(name, item) {
    const node = row(page, name);
    const [field] = elements(node).filter((entry) => entry.nodeName === "select");
    const since = requests.length;
    field.listeners.change({ target: { value: item } });
    // The fake game answers at once, so the row can go from its last ✓ to this save's end between two looks: wait
    // for the save's requests and a few ticks, then read how it ended.
    await until(() => after(since, "/api/").length >= 3, `${name}'s save to run`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await until(() => /save-state--(success|error)/.test(saveState(node)), `${name}'s save to end`);
    return saveState(node).includes("save-state--success") ? "success" : "error";
}

test("the cards are the outfits; with all saved and the cheat on, every bonus shows on", () => {
    assert.equal(names.length, 8, "EquipmentGown0 is no outfit");
    assert.equal(new Set(names).size, 8);
    assert.ok(names.every((name) => pressed(page, name)));
    assert.match(text(page), /Every outfit's bonus is on/);
    assert.match(text(card(page, names[2])), /worn/, "the outfit the character in play wears");
});

test("a card click turns its bonus off: session config, cheat and config file, as Pets saves", async () => {
    const since = requests.length;
    await card(page, names[0]).listeners.click({});
    await until(() => !pressed(page, names[0]), "the card to show off");
    const ids = Array.from({ length: 7 }, (_, i) => `EquipmentGown${i + 2}`).join(",");
    assert.equal(await savedOutfits(), ids);
    assert.deepEqual(
        requests.slice(since).filter((entry) => entry.startsWith("POST")),
        ["POST /api/config/update", "POST /api/toggle", "POST /api/config/save"]
    );
    assert.match(text(page), /7 of 8 outfit bonuses are on/);
    assert.deepEqual(startup(), ["wide attire"], "chosen outfits turn the cheat on at start");
});

test("clicking it again turns every outfit on, so outfits a game update adds count too", async () => {
    await card(page, names[0]).listeners.click({});
    await until(() => pressed(page, names[0]), "the card to show on");
    assert.equal(await savedOutfits(), "all");
});

test("no outfits asks Click again, then turns the cheat off, now and at start", async () => {
    const none = button(page, "No outfits");
    const since = requests.length;
    await none.listeners.click({ currentTarget: none, preventDefault() {} });
    assert.equal(none.attributes["data-again"], "CLICK AGAIN");
    assert.equal(none.attributes["aria-label"], "Click again to stop giving every outfit bonuses, now and at start.");
    assert.deepEqual(after(since, "/api/config"), [], "the first click changes nothing");
    await none.listeners.click({ currentTarget: none, preventDefault() {} });
    await until(() => !pressed(page, names[3]), "every card to show off");
    assert.equal(await savedOutfits(), "");
    assert.deepEqual(startup(), []);
    assert.equal(commands.at(-1), "wide attire");
    assert.equal(fixture.cheatStates.wide.attire, false);
    assert.match(text(page), /Off\. Click an outfit/);
    await card(page, names[3]).listeners.click({});
    await until(() => pressed(page, names[3]), "the card to show on");
    assert.equal(await savedOutfits(), "EquipmentGown4");
    assert.ok(names.filter((name) => name !== names[3]).every((name) => !pressed(page, name)));
    assert.deepEqual(startup(), ["wide attire"]);
});

test("while the cheat is off the cards show the saved choice, and a click edits it, as on Pets", async () => {
    fixture.cheatStates.wide.attire = false;
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "EquipmentGown2,EquipmentGown5" } } } });
    const root = await open();
    await until(() => pressed(root, names[1]) && pressed(root, names[4]), "the saved choice to show");
    assert.equal(pressed(root, names[2]), false);
    assert.match(text(root), /The cheat is off, so the chosen bonuses aren't given/);
    await card(root, names[2]).listeners.click({});
    await until(() => pressed(root, names[2]), "the card to show on");
    assert.equal(await savedOutfits(), "EquipmentGown2,EquipmentGown3,EquipmentGown5", "edited, not replaced");
    assert.equal(fixture.cheatStates.wide.attire, true, "and the cheat is on again");
    assert.deepEqual(startup(), ["wide attire"]);
});

test("with every account-wide cheat on at start, choosing adds nothing that would toggle it back off", async () => {
    await updateSessionConfig({ startupCheats: ["wide"] });
    const count = saves.length;
    await card(page, names[6]).listeners.click({});
    await until(() => saves.length > count, "the save");
    assert.deepEqual(startup(), ["wide"]);
    await updateSessionConfig({ startupCheats: [] });
});

test("a change of the character in play writes both its copies, logs one action, and works the stats out again", async () => {
    const since = requests.length;
    assert.equal(shown(row(page, "Lumi_Main")), names[2]);
    assert.equal(await pick("Lumi_Main", "EquipmentGown5"), "success");
    assert.equal(shown(row(page, "Lumi_Main")), names[4]);
    const saved = gga.PlayerDATABASE.h.Lumi_Main.h;
    for (const copy of [gga, saved]) {
        assert.equal(copy.EquipmentOrder[0][15], "EquipmentGown5");
        assert.equal(copy.EquipmentQuantity[0][15], 1);
        assert.equal(JSON.stringify(copy.EquipmentMap[0][15].h), "{}");
    }
    assert.equal(gga.EquipmentOrder[0][4], "item1", "only the attire slot changes");
    assert.deepEqual(after(since, "write"), ["POST /api/game/gga/write-many"]);
    assert.equal(commands.at(-1), "wide attirestats", "the game works the stats out again");
    const [action] = (await fetchChanges()).actions;
    assert.deepEqual(
        action.entries.map(({ path, before, after: value }) => [path, before, value]),
        [
            ["EquipmentOrder[0][15]", "EquipmentGown3", "EquipmentGown5"],
            ["EquipmentQuantity[0][15]", 1, 1],
            ["EquipmentMap[0][15].h", {}, {}],
            ["PlayerDATABASE.h[Lumi_Main].h.EquipmentOrder[0][15]", "EquipmentGown3", "EquipmentGown5"],
            ["PlayerDATABASE.h[Lumi_Main].h.EquipmentQuantity[0][15]", 1, 1],
            ["PlayerDATABASE.h[Lumi_Main].h.EquipmentMap[0][15].h", {}, {}],
        ]
    );

    // Undo (the row's, Undo all's and History's all run this) puts the old attire back and the page works the
    // stats out again.
    const ran = commands.length;
    await undoAction(action.id);
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown3");
    await until(() => commands.slice(ran).includes("wide attirestats"), "the stats worked out again after the undo");
    await until(() => shown(row(page, "Lumi_Main")) === names[2], "the row to show the old attire");
});

test("a saved character's change writes its saved copy only and leaves the stats alone", async () => {
    const ran = commands.length;
    assert.equal(await pick("Lumi_Alt", "EquipmentGown2"), "success");
    const saved = gga.PlayerDATABASE.h.Lumi_Alt.h;
    assert.equal(saved.EquipmentOrder[0][15], "EquipmentGown2");
    assert.equal(saved.EquipmentQuantity[0][15], 1);
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown3", "the character in play keeps its attire");
    assert.deepEqual(commands.slice(ran), [], "the character in play's stats are left alone");
    const [action] = (await fetchChanges()).actions;
    assert.ok(action.entries.every(({ path }) => path.startsWith("PlayerDATABASE.h[Lumi_Alt]")));
});

test("no attire empties the slot", async () => {
    assert.equal(await pick("Lumi_Alt", "Blank"), "success");
    assert.equal(gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15], "Blank");
    assert.equal(gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentQuantity[0][15], 0);
});

test("a write the game refuses is said in its row and changes nothing", async () => {
    const slot = gga.PlayerDATABASE.h.Lumi_Third.h.EquipmentOrder[0];
    const kept = slot[15];
    Object.defineProperty(slot, 15, { get: () => kept, set() {}, configurable: true });
    try {
        assert.equal(await pick("Lumi_Third", "EquipmentGown6"), "error");
        const node = row(page, "Lumi_Third");
        assert.equal(text(byClass(node, "save-state__label")[0]), "game kept old value");
        assert.equal(slot[15], kept);
        assert.equal(shown(node), names[5], "the picker keeps the pick, to try again");
    } finally {
        Object.defineProperty(slot, 15, { value: kept, writable: true, configurable: true });
    }
});

test("give everyone asks Click again, then gives every character the outfit as one action", async () => {
    const [everyone] = elements(page).filter(
        (node) => node.nodeName === "select" && node.attributes["aria-label"] === "Outfit for every character"
    );
    everyone.listeners.change({ target: { value: "EquipmentGown7" } });
    const give = elements(page).find((node) => node.nodeName === "button" && text(node) === "Give everyone");
    const since = requests.length;
    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    assert.equal(give.attributes["data-again"], "CLICK AGAIN");
    assert.match(give.attributes["aria-label"], /^Click again to give 3 characters .*not moved to storage\.$/);
    assert.deepEqual(after(since, "write"), [], "the first click writes nothing");

    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    await until(() => gga.PlayerDATABASE.h.Lumi_Third.h.EquipmentOrder[0][15] === "EquipmentGown7", "everyone");
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown7");
    assert.equal(gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15], "EquipmentGown7");
    assert.deepEqual(after(since, "write"), ["POST /api/game/gga/write-many"]);
    assert.equal(commands.at(-1), "wide attirestats", "the character in play's stats are worked out again");
    const [action] = (await fetchChanges()).actions;
    assert.equal(action.entries.length, 12, "both copies of the one in play, the saved copy of the other two");
});

test("give everyone says so when everyone already wears it", async () => {
    const give = elements(page).find((node) => node.nodeName === "button" && text(node) === "Give everyone");
    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    await until(() => /already wears/.test(text(page)), "the refusal to be said");
    assert.equal(give.attributes["data-again"], undefined);
});

test("an outfit choice the config refuses is said above the cards, and the card stays as it was", async () => {
    const routes = router.routes.POST;
    const update = routes.get("/api/config/update");
    routes.set("/api/config/update", (req, res) => res.status(500).json({ error: "Config is read-only" }));
    try {
        const before = pressed(page, names[1]);
        await card(page, names[1]).listeners.click({});
        await until(() => /Config is read-only/.test(text(page)), "the reason to be said");
        assert.equal(pressed(page, names[1]), before);
    } finally {
        routes.set("/api/config/update", update);
    }
});
