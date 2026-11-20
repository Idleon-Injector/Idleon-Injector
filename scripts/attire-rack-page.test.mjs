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
// How many of the next wide attirestats (and wide attire) runs the game refuses.
let refuseStats = 0;
let refuseAttire = 0;
const toggle = router.routes.POST.get("/api/toggle");
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push(action);
    if (action === "wide attirestats" && refuseStats > 0) {
        refuseStats--;
        return res.json({ ok: false, message: "The game is busy" });
    }
    if (action === "wide attire" && refuseAttire > 0) {
        refuseAttire--;
        return res.json({ ok: false, message: "The game is busy" });
    }
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
    // (two at least: a retry that only owes the stat update reads the game, then runs it).
    await until(() => after(since, "/api/").length >= 2, `${name}'s save to run`);
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
    // Run alone, the card is still on: the test before turns it off.
    if (pressed(page, names[0])) {
        await card(page, names[0]).listeners.click({});
        await until(() => !pressed(page, names[0]), "the card to show off first");
    }
    await card(page, names[0]).listeners.click({});
    await until(() => pressed(page, names[0]), "the card to show on");
    assert.equal(await savedOutfits(), "all");
});

test("no outfits asks Click again, then turns the cheat off, now and at start", async () => {
    const none = button(page, "No outfits");
    const since = requests.length;
    await none.listeners.click({ currentTarget: none, preventDefault() {} });
    assert.equal(none.attributes["data-again"], "Click again");
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
    // Run alone, Lumi_Alt wears no attire yet: the test before dresses it.
    if (gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15] === "Blank")
        assert.equal(await pick("Lumi_Alt", "EquipmentGown2"), "success");
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
    assert.equal(give.attributes["data-again"], "Click again");
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
    // Everyone wears EquipmentGown7, and it is the outfit picked for everyone (the test before does this).
    gga.EquipmentOrder[0][15] = "EquipmentGown7";
    for (const name of ["Lumi_Main", "Lumi_Alt", "Lumi_Third"])
        gga.PlayerDATABASE.h[name].h.EquipmentOrder[0][15] = "EquipmentGown7";
    const [everyone] = elements(page).filter(
        (node) => node.nodeName === "select" && node.attributes["aria-label"] === "Outfit for every character"
    );
    everyone.listeners.change({ target: { value: "EquipmentGown7" } });
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

// A click a test holds at the config update until it calls the returned release().
const holdConfigUpdate = () => {
    const routes = router.routes.POST;
    const update = routes.get("/api/config/update");
    let release;
    const held = new Promise((resolve) => (release = resolve));
    routes.set("/api/config/update", async (req, res) => {
        await held;
        return update(req, res);
    });
    return () => {
        routes.set("/api/config/update", update);
        release();
    };
};

// Holds the cheat-state reads (the choice reads of reloads) a test starts after hold(), until release(), which resolves
// once every held read has answered and the page had a few ticks to take it. Reads after passNew() aren't held.
const holdReloads = () => {
    const states = router.routes.GET.get("/api/cheat-states");
    let open;
    const held = new Promise((resolve) => (open = resolve));
    let holding = 0;
    let answered = 0;
    let passing = false;
    return {
        hold: () =>
            router.routes.GET.set("/api/cheat-states", async (req, res) => {
                if (passing) return states(req, res);
                holding++;
                await held;
                const result = await states(req, res);
                answered++;
                return result;
            }),
        holding: () => holding,
        passNew: () => (passing = true),
        release: async () => {
            router.routes.GET.set("/api/cheat-states", states);
            open();
            await until(() => answered === holding, "the held reloads to answer");
            await new Promise((resolve) => setTimeout(resolve, 20));
        },
    };
};

test("while an outfit choice saves, the cards stay enabled and their group says it is busy", async () => {
    const group = elements(page).find((node) => node.attributes["aria-label"] === "Outfit bonuses");
    const updates = () => requests.filter((entry) => entry === "POST /api/config/update").length;
    const before = updates();
    const release = holdConfigUpdate();
    try {
        card(page, names[5]).listeners.click({});
        await until(() => updates() === before + 1, "the save to start");
        await until(() => group.attributes["aria-busy"] === true, "the cards to say they're busy");
        assert.notEqual(card(page, names[5]).attributes.disabled, true, "focus stays on the card");
        card(page, names[6]).listeners.click({});
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(updates(), before + 1, "a click while it saves starts nothing");
    } finally {
        release();
    }
    await until(() => group.attributes["aria-busy"] === false, "the cards to settle");
});

test("a stat update the game refused after the attire landed runs again when the pick is retried", async () => {
    refuseStats = 1;
    assert.equal(await pick("Lumi_Main", "EquipmentGown8"), "error");
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown8", "the attire landed");
    assert.match(text(row(page, "Lumi_Main")), /The game is busy/);
    const ran = commands.length;
    assert.equal(await pick("Lumi_Main", "EquipmentGown8"), "success");
    assert.deepEqual(commands.slice(ran), ["wide attirestats"]);
    // Owed no more: picking what the game holds again does nothing.
    const after = commands.length;
    row(page, "Lumi_Main").listeners.focusout({
        relatedTarget: null,
        target: {},
        currentTarget: row(page, "Lumi_Main"),
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(commands.slice(after), []);
});

test("a stat update refused after giving everyone an outfit runs again on the next give", async () => {
    const [everyone] = elements(page).filter(
        (node) => node.nodeName === "select" && node.attributes["aria-label"] === "Outfit for every character"
    );
    everyone.listeners.change({ target: { value: "EquipmentGown1" } });
    const give = button(page, "Give everyone");
    refuseStats = 1;
    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    await until(() => /The game is busy/.test(text(page)), "the refusal to be said");
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown1", "the attire landed");
    const ran = commands.length;
    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    await until(() => commands.length > ran, "the stat update");
    assert.deepEqual(commands.slice(ran), ["wide attirestats"], "one click, nothing to ask: no attire changes");
    assert.doesNotMatch(text(page), /already wears/);
});

// Attire review F1: a click does what its card shows, and a failed save reads the choice again.
test("a card click does what the card shows, though the choice changed behind the page", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    // The Config page turns the first outfit off; this page still shows it on.
    const rest = Array.from({ length: 7 }, (_, i) => `EquipmentGown${i + 2}`).join(",");
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: rest } } } });
    await card(root, names[0]).listeners.click({});
    await until(() => !pressed(root, names[0]), "the card to show off");
    assert.equal(await savedOutfits(), rest, "turned off, as the card asked, not flipped back on");
});

test("an outfit choice that failed after the session took it shows what the session holds", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    refuseAttire = 1;
    await card(root, names[0]).listeners.click({});
    await until(() => /The game is busy/.test(text(root)), "the failure to be said");
    assert.notEqual(await savedOutfits(), "all", "the session took the choice");
    await until(() => !pressed(root, names[0]), "the card to show what the session holds");
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
});

// Attire review F2: the write landed and the stat update was refused; the row and badge follow the game.
test("a stat update refused after the attire landed leaves the badge and Escape on what the game wears", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = elements(node).filter((entry) => entry.nodeName === "select");
    const was = gga.EquipmentOrder[0][15];
    const next = was === "EquipmentGown5" ? "EquipmentGown6" : "EquipmentGown5";
    const nextName = names[Number(next.slice(-1)) - 1];
    refuseStats = 1;
    field.listeners.change({ target: { value: next } });
    await until(() => /The game is busy/.test(text(node)), "the refusal in the row");
    assert.equal(gga.EquipmentOrder[0][15], next, "the attire landed");
    await until(() => /worn/.test(text(card(root, nextName))), "the worn badge on what the game wears");
    node.listeners.keydown({ key: "Escape", target: field, preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(shown(node), nextName, "Escape shows what the game wears");
    // The stats are still owed: leaving the field runs them.
    const ran = commands.length;
    node.listeners.focusout({ relatedTarget: null, target: {}, currentTarget: node });
    await until(() => commands.slice(ran).includes("wide attirestats"), "the owed stat update");
    await until(() => /save-state--success/.test(saveState(node)), "the row to say it saved");
});

// Attire review F3: a reload (after an undo) that read the choice before a card save ended doesn't put it back.
test("a reload that read the choice before a card save ended doesn't undo the card save", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    // A row change to undo (a saved character, so no stat update).
    const alt = row(root, "Lumi_Alt");
    const [field] = elements(alt).filter((entry) => entry.nodeName === "select");
    const wears = gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15];
    field.listeners.change({ target: { value: wears === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4" } });
    await until(() => /save-state--success/.test(saveState(alt)), "the row change");
    const [action] = (await fetchChanges()).actions;

    const reloads = holdReloads();
    const releaseUpdate = holdConfigUpdate();
    try {
        void card(root, names[0]).listeners.click({});
        await until(() => requests.at(-1) === "POST /api/config/update", "the card save to wait");
        reloads.hold();
        await undoAction(action.id);
        await until(() => reloads.holding() > 0, "the reload to read the choice");
        await new Promise((resolve) => setTimeout(resolve, 30));
        reloads.passNew();
    } finally {
        releaseUpdate();
    }
    await until(() => !pressed(root, names[0]), "the card save to end");
    await reloads.release();
    assert.equal(pressed(root, names[0]), false, "the older answer is dropped");
    assert.notEqual(await savedOutfits(), "all");
});

// The same with a card save the game refused after the session took it: the read after the failure is the newer one.
test("a reload that read the choice before a refused card save doesn't put the card back", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    const alt = row(root, "Lumi_Alt");
    const [field] = elements(alt).filter((entry) => entry.nodeName === "select");
    const wears = gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15];
    field.listeners.change({ target: { value: wears === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4" } });
    await until(() => /save-state--success/.test(saveState(alt)), "the row change");
    const [action] = (await fetchChanges()).actions;

    const reloads = holdReloads();
    const releaseUpdate = holdConfigUpdate();
    try {
        refuseAttire = 1;
        void card(root, names[0]).listeners.click({});
        await until(() => requests.at(-1) === "POST /api/config/update", "the card save to wait");
        reloads.hold();
        await undoAction(action.id);
        await until(() => reloads.holding() > 0, "the reload to read the choice");
        await new Promise((resolve) => setTimeout(resolve, 30));
        reloads.passNew(); // the read after the failure isn't held
    } finally {
        releaseUpdate();
    }
    await until(() => /The game is busy/.test(text(root)), "the failure");
    await until(() => !pressed(root, names[0]), "the card to show what the session holds");
    await reloads.release();
    assert.equal(pressed(root, names[0]), false, "the older answer is dropped");
    refuseAttire = 0;
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
});

// Attire review F4: the cards' saves show on the cards, not on the header buttons.
test("a card click leaves All outfits and No outfits quiet", async () => {
    const root = await open();
    const header = ["All outfits", "No outfits"].map((label) => button(root, label));
    const lit = () => header.some((node) => /account-btn--(loading|success|error)/.test(classes(node)));
    let seen = false;
    const look = setInterval(() => (seen ||= lit()), 2);
    try {
        await card(root, names[1]).listeners.click({});
        await new Promise((resolve) => setTimeout(resolve, 60));
    } finally {
        clearInterval(look);
    }
    assert.equal(seen, false);
    await card(root, names[1]).listeners.click({});
});

// Attire review F5: the press that only asks says its question, not the last press's done.
test("No outfits pressed right after All outfits asks, and says nothing of All outfits' done", async () => {
    const root = await open();
    const all = button(root, "All outfits");
    const none = button(root, "No outfits");
    await all.listeners.click({ currentTarget: all, preventDefault() {} });
    await until(() => /account-btn--success/.test(classes(all)), "All outfits to say done");
    await new Promise((resolve) => setTimeout(resolve, 30));
    await none.listeners.click({ currentTarget: none, preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const region = elements(globalThis.document.body).find((node) => node.attributes.role === "status");
    assert.match(region.textContent, /^Click again to stop giving/);
    assert.doesNotMatch(classes(none), /account-btn--success/, "the asking button isn't green");
});

// Attire review F6: the live copy landed and the saved copy was refused; the stat update is owed.
test("a change of the character in play that partly landed owes its stat update, and leaving the field runs it", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = elements(node).filter((entry) => entry.nodeName === "select");
    const slot = gga.PlayerDATABASE.h.Lumi_Main.h.EquipmentOrder[0];
    const kept = slot[15];
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    const ran = commands.length;
    Object.defineProperty(slot, 15, { get: () => kept, set() {}, configurable: true });
    try {
        field.listeners.change({ target: { value: next } });
        await until(() => /save-state--error/.test(saveState(node)), "the refusal in the row");
        assert.equal(gga.EquipmentOrder[0][15], next, "the live copy landed");
        assert.deepEqual(commands.slice(ran), [], "no stat update yet");
    } finally {
        Object.defineProperty(slot, 15, { value: kept, writable: true, configurable: true });
    }
    // Upgrades the live copy got meanwhile (an undo can put some back) stay: only the saved copy is written.
    gga.EquipmentMap[0][15].h = { STR: 5 };
    node.listeners.focusout({ relatedTarget: null, target: {}, currentTarget: node });
    await until(() => commands.slice(ran).includes("wide attirestats"), "the owed stat update");
    await until(() => /save-state--success/.test(saveState(node)), "the row to say it saved");
    assert.equal(slot[15], next, "the saved copy gets the pick too");
    assert.equal(JSON.stringify(gga.EquipmentMap[0][15].h), JSON.stringify({ STR: 5 }));
    gga.EquipmentMap[0][15].h = {};
});

// Attire review F7: the undo's stat failure goes once an owed update runs, and Refresh runs it.
test("Refresh runs a stat update an undo left owed, and its failure line goes once it runs", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = elements(node).filter((entry) => entry.nodeName === "select");
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    field.listeners.change({ target: { value: next } });
    await until(() => /save-state--success/.test(saveState(node)), "the change");
    const [action] = (await fetchChanges()).actions;
    // Every open page works the stats out after the undo; the game refuses them all.
    refuseStats = 100;
    try {
        await undoAction(action.id);
        await until(() => /Undone, but the stats weren't worked out again/.test(text(root)), "the failure");
    } finally {
        refuseStats = 0;
    }
    const ran = commands.length;
    await button(root, "Refresh").listeners.click({});
    await until(() => commands.slice(ran).includes("wide attirestats"), "Refresh to run the owed stat update");
    await until(() => !/Undone, but the stats/.test(text(root)), "the failure line to go");
});

// Reader of the leftovers, 4: once Refresh ran the owed stat update, the lines that said it failed go.
test("Refresh clears Give everyone's stat failure and the row's reason once the owed update runs", async () => {
    const root = await open();
    const [everyone] = elements(root).filter(
        (node) => node.nodeName === "select" && node.attributes["aria-label"] === "Outfit for every character"
    );
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown2" ? "EquipmentGown3" : "EquipmentGown2";
    everyone.listeners.change({ target: { value: next } });
    const give = button(root, "Give everyone");
    refuseStats = 1;
    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    await give.listeners.click({ currentTarget: give, preventDefault() {} });
    await until(() => /The game is busy/.test(text(root)), "Give everyone's stat failure");
    await button(root, "Refresh").listeners.click({});
    await until(() => !/The game is busy/.test(text(root)), "the line to go once the stats ran");

    // A row's pick whose stat update was refused: its reason goes too.
    const node = row(root, "Lumi_Main");
    const [field] = elements(node).filter((entry) => entry.nodeName === "select");
    refuseStats = 1;
    field.listeners.change({ target: { value: next === "EquipmentGown2" ? "EquipmentGown3" : "EquipmentGown2" } });
    await until(() => /save-state--error/.test(saveState(node)), "the row's reason");
    await button(root, "Refresh").listeners.click({});
    await until(() => !/save-state--error/.test(saveState(node)), "the row's reason to go once the stats ran");
});
