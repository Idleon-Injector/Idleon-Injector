// The Attire Rack page (#89) on the fake game: a card click saves the outfit choice like Pets (on at start too), an
// attire change lands in the change log and can be undone, giving everyone an outfit or All off asks in the tray
// first, and a write the game refuses is said in its row. After a change and after its undo, the page runs
// wide attirestats so the game works the stats out again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi, saveToSession } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";
import { PLAYERS } from "./page-shots/data/shared.mjs";

const fixture = fakeGameData();
const { router, game } = await createFakeApi(fixture);
// The cheats the page runs, and what it hands the config file save (the fake API's own save writes nothing). The
// fake game's cheat state follows the toggle, as the game's does.
const commands = [];
const saves = [];
// How many of the next wide attirestats (and wide attire) runs the game refuses.
let refuseStats = 0;
let refuseAttire = 0;
// While set, every wide attirestats the game would run waits until the release handed to `holdStats(release)` is
// called; `release(answer)` answers with that instead of running it.
let holdStats = null;
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
    if (action === "wide attirestats" && holdStats) {
        const answer = await new Promise((release) => holdStats(release));
        if (answer) return res.json(answer);
    }
    return toggle(req, res);
});
// The fake save writes no file, and takes what it's sent into the session, as the server's save does.
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    saves.push(body);
    res.json(await saveToSession(router, body));
});
// `holdWrite`: a promise the next attire write (write-many) waits on before it runs. `failReadAfterWrite`: the next
// status read after the next write fails.
let holdWrite = null;
let failReadAfterWrite = false;
let failNextStatus = false;
// `holdStatusAnswer`: a promise the next status read's answer, read from the game at once, waits on before it's sent.
let holdStatusAnswer = null;
const computedRead = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { name } = await req.json();
    if (name === "status" && failNextStatus) {
        failNextStatus = false;
        return res.status(500).json({ error: "The game didn't answer" });
    }
    if (name === "status" && holdStatusAnswer) {
        const held = holdStatusAnswer;
        holdStatusAnswer = null;
        const read = Object.create(res);
        read.json = (body) => ((read.answer = body), read);
        await computedRead(req, read);
        await held;
        return res.status(read.statusCode).json(read.answer);
    }
    return computedRead(req, res);
});
const writeMany = router.routes.POST.get("/api/game/gga/write-many");
router.routes.POST.set("/api/game/gga/write-many", async (req, res) => {
    if (holdWrite) {
        const held = holdWrite;
        holdWrite = null;
        await held;
    }
    if (failReadAfterWrite) {
        failReadAfterWrite = false;
        failNextStatus = true;
    }
    return writeMany(req, res);
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

// An outfit's line, by its name, and its switch: on gives the outfit's bonus.
const outfitRow = (root, name) =>
    byClass(root, "attire-outfit-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
const switchOf = (root, name) => elements(outfitRow(root, name)).find((node) => node.attributes.role === "switch");
// An attribute as it is now (VanJS keeps one that changes as a function).
const attrOf = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
const pressed = (root, name) => {
    const box = switchOf(root, name);
    return Boolean(attrOf(box, "checked") ?? box.checked);
};
// The player flips an outfit's switch: the browser has moved the box, then reports the change.
const flipCard = (root, name) => {
    const on = pressed(root, name);
    return switchOf(root, name).listeners.change({ target: { checked: !on } });
};
const row = (root, name) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
const saveState = (node) => classes(byClass(node, "save-state")[0]);
// What a character's line shows it wears: the quiet line under its name.
const shown = (node) => text(byClass(node, "account-row__note")[0]).split(" · ")[0];
// A character's attire pick opens in place under its line; picking an option there saves it. Kept in the old
// picker's shape (`change` with the item's id), so the tests read as before.
const pickerOf = (node) => [
    {
        listeners: {
            change: ({ target }) =>
                elements(node)
                    .find((entry) => entry.nodeName === "button" && entry.attributes["data-id"] === target.value)
                    .listeners.click({}),
        },
    },
];
// The tray's line, its answer, and the open tab (a tray says only its own tab's line).
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);
const answerYes = (root) => byClass(root, "tabbed-list__yes")[0].listeners.click({});
const showTab = (root, label) =>
    byClass(root, "tabbed-list__tab")
        .find((node) => text(node).trim() === label)
        .listeners.click({});
// Give everyone: the outfit picked in the tray's list, which then asks there.
const giveEveryone = async (root, item) => {
    showTab(root, "Appearance");
    const list = byClass(root, "attire-everyone__list")[0];
    elements(list)
        .find((entry) => entry.nodeName === "button" && entry.attributes["data-id"] === item)
        .listeners.click({});
    await new Promise((resolve) => setTimeout(resolve, 30));
};

const open = async () => {
    const root = (await importRepo(PAGE)).default.component();
    await until(() => byClass(root, "attire-outfit-row").length === 8 && row(root, "Lumi_Third"), "the page to load");
    showTab(root, "Outfit bonuses");
    return root;
};
const page = await open();
const button = (root, label) => elements(root).find((node) => node.nodeName === "button" && text(node) === label);
const names = byClass(page, "attire-outfit-row").map((node) => text(byClass(node, "account-row__name")[0]));
const savedOutfits = async () => (await fetchConfig()).cheatConfig.wide.attire.outfits;
const after = (since, kind) => requests.slice(since).filter((entry) => entry.includes(kind));

// Pick an outfit in a character's row; resolves once the row's save ends.
async function pick(name, item) {
    const node = row(page, name);
    const [field] = pickerOf(node);
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
    assert.match(trayLine(page), /every bonus on, new outfits too/);
    assert.match(text(outfitRow(page, names[2])), /Worn/, "the outfit the character in play wears");
});

// One config save, which writes the file first, so a save that fails there changes nothing, and then takes the choice
// into the session (and the game); then the cheat.
test("a card click turns its bonus off: config file, session config and cheat, as Pets saves", async () => {
    const since = requests.length;
    await flipCard(page, names[0]);
    await until(() => !pressed(page, names[0]), "the card to show off");
    const ids = Array.from({ length: 7 }, (_, i) => `EquipmentGown${i + 2}`).join(",");
    assert.equal(await savedOutfits(), ids);
    assert.deepEqual(
        requests.slice(since).filter((entry) => entry.startsWith("POST")),
        ["POST /api/config/save", "POST /api/toggle"]
    );
    assert.match(trayLine(page), /^All 8 outfits · 7 on$/);
    assert.deepEqual(startup(), ["wide attire"], "chosen outfits turn the cheat on at start");
    // Only what it changed: a whole config read before another page's change would put that change back.
    assert.deepEqual(saves.at(-1).cheatConfig, { wide: { attire: { outfits: ids } } });
    assert.equal(saves.at(-1).injectorConfig, undefined);
});

test("clicking it again turns every outfit on, so outfits a game update adds count too", async () => {
    // Run alone, the card is still on: the test before turns it off.
    if (pressed(page, names[0])) {
        await flipCard(page, names[0]);
        await until(() => !pressed(page, names[0]), "the card to show off first");
    }
    await flipCard(page, names[0]);
    await until(() => pressed(page, names[0]), "the card to show on");
    assert.equal(await savedOutfits(), "all");
});

test("All off asks in the tray, then turns the cheat off, now and at start", async () => {
    const none = button(page, "All off");
    const since = requests.length;
    await none.listeners.click({ currentTarget: none, preventDefault() {} });
    assert.equal(trayLine(page), "Stop giving every outfit bonus, now and at start?");
    assert.deepEqual(after(since, "/api/config"), [], "the first click changes nothing");
    await answerYes(page);
    await until(() => !pressed(page, names[3]), "every card to show off");
    assert.equal(await savedOutfits(), "");
    assert.deepEqual(startup(), []);
    assert.equal(commands.at(-1), "wide attire");
    assert.equal(fixture.cheatStates.wide.attire, false);
    assert.match(trayLine(page), /^All 8 outfits · 0 on$/);
    await flipCard(page, names[3]);
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
    assert.match(trayLine(root), /^Off, so the chosen bonuses aren't given/);
    await flipCard(root, names[2]);
    await until(() => pressed(root, names[2]), "the card to show on");
    assert.equal(await savedOutfits(), "EquipmentGown2,EquipmentGown3,EquipmentGown5", "edited, not replaced");
    assert.equal(fixture.cheatStates.wide.attire, true, "and the cheat is on again");
    assert.deepEqual(startup(), ["wide attire"]);
});

test("with every account-wide cheat on at start, choosing adds nothing that would toggle it back off", async () => {
    await updateSessionConfig({ startupCheats: ["wide"] });
    const count = saves.length;
    await flipCard(page, names[6]);
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

test("give everyone asks in the tray, then gives every character the outfit as one action", async () => {
    const since = requests.length;
    await giveEveryone(page, "EquipmentGown7");
    await until(() => /\?/.test(trayLine(page)), "the question");
    assert.match(
        trayLine(page),
        new RegExp(`^Give ${PLAYERS.length} characters .*What they wear now isn't stored\\.$`)
    );
    assert.deepEqual(after(since, "write"), [], "the pick writes nothing");

    await answerYes(page);
    await until(() => gga.PlayerDATABASE.h.Lumi_Third.h.EquipmentOrder[0][15] === "EquipmentGown7", "everyone");
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown7");
    assert.equal(gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15], "EquipmentGown7");
    assert.deepEqual(after(since, "write"), ["POST /api/game/gga/write-many"]);
    assert.equal(commands.at(-1), "wide attirestats", "the character in play's stats are worked out again");
    const [action] = (await fetchChanges()).actions;
    // Both copies of the one in play and the saved copy of every other, three entries each.
    assert.equal(action.entries.length, 3 * (PLAYERS.length + 1), "every copy of every character");
});

test("give everyone says so when everyone already wears it", async () => {
    // Everyone wears EquipmentGown7, and it is the outfit picked for everyone (the test before does this).
    gga.EquipmentOrder[0][15] = "EquipmentGown7";
    for (const name of PLAYERS) gga.PlayerDATABASE.h[name].h.EquipmentOrder[0][15] = "EquipmentGown7";
    await giveEveryone(page, "EquipmentGown7");
    await until(() => /already wears/.test(trayLine(page)), "the refusal to be said");
    assert.doesNotMatch(trayLine(page), /\?/, "nothing to ask");
});

test("an outfit choice the config refuses is said on its switch, and the switch stays as it was", async () => {
    showTab(page, "Outfit bonuses");
    const routes = router.routes.POST;
    const save = routes.get("/api/config/save");
    routes.set("/api/config/save", (req, res) => res.status(500).json({ error: "Config is read-only" }));
    try {
        const before = pressed(page, names[1]);
        await flipCard(page, names[1]);
        await until(() => /Config is read-only/.test(text(outfitRow(page, names[1]))), "the reason to be said");
        assert.equal(pressed(page, names[1]), before);
    } finally {
        routes.set("/api/config/save", save);
    }
});

// A click a test holds at the config save until it calls the returned release().
const holdConfigSave = () => {
    const routes = router.routes.POST;
    const save = routes.get("/api/config/save");
    let release;
    const held = new Promise((resolve) => (release = resolve));
    routes.set("/api/config/save", async (req, res) => {
        await held;
        return save(req, res);
    });
    return () => {
        routes.set("/api/config/save", save);
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

test("while an outfit choice saves, the switches stay enabled and their list says it is busy", async () => {
    const group = byClass(page, "attire-outfit-row")[0].parentNode;
    const updates = () => requests.filter((entry) => entry === "POST /api/config/save").length;
    const before = updates();
    const release = holdConfigSave();
    try {
        flipCard(page, names[5]);
        await until(() => updates() === before + 1, "the save to start");
        await until(() => attrOf(group, "aria-busy") === true, "the list to say it's busy");
        assert.notEqual(attrOf(switchOf(page, names[5]), "disabled"), true, "focus stays on the switch");
    } finally {
        release();
    }
    await until(() => attrOf(group, "aria-busy") === false, "the list to settle");
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
    refuseStats = 1;
    await giveEveryone(page, "EquipmentGown1");
    await until(() => /\?/.test(trayLine(page)), "the question");
    await answerYes(page);
    await until(() => /The game is busy/.test(trayLine(page)), "the refusal to be said");
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown1", "the attire landed");
    const ran = commands.length;
    await giveEveryone(page, "EquipmentGown1");
    await until(() => commands.length > ran, "the stat update");
    assert.deepEqual(commands.slice(ran), ["wide attirestats"], "one pick, nothing to ask: no attire changes");
    assert.doesNotMatch(trayLine(page), /already wears/);
});

// Attire review F1: a click does what its card shows, and a failed save reads the choice again.
test("a card click does what the card shows, though the choice changed behind the page", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    // The Config page turns the first outfit off; this page still shows it on.
    const rest = Array.from({ length: 7 }, (_, i) => `EquipmentGown${i + 2}`).join(",");
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: rest } } } });
    await flipCard(root, names[0]);
    await until(() => !pressed(root, names[0]), "the card to show off");
    assert.equal(await savedOutfits(), rest, "turned off, as the card asked, not flipped back on");
});

test("an outfit choice that failed after the session took it shows what the session holds", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    refuseAttire = 1;
    await flipCard(root, names[0]);
    await until(() => /The game is busy/.test(text(root)), "the failure to be said");
    assert.notEqual(await savedOutfits(), "all", "the session took the choice");
    await until(() => !pressed(root, names[0]), "the card to show what the session holds");
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
});

// Attire review F2: the write landed and the stat update was refused; the row and badge follow the game.
test("a stat update refused after the attire landed leaves the badge and the line on what the game wears", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = pickerOf(node);
    const was = gga.EquipmentOrder[0][15];
    const next = was === "EquipmentGown5" ? "EquipmentGown6" : "EquipmentGown5";
    const nextName = names[Number(next.slice(-1)) - 1];
    refuseStats = 1;
    field.listeners.change({ target: { value: next } });
    await until(() => /The game is busy/.test(text(node)), "the refusal in the row");
    assert.equal(gga.EquipmentOrder[0][15], next, "the attire landed");
    await until(() => /Worn/.test(text(outfitRow(root, nextName))), "the worn badge on what the game wears");
    assert.equal(shown(node), nextName, "the line shows what the game wears");
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
    const [field] = pickerOf(alt);
    const wears = gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15];
    field.listeners.change({ target: { value: wears === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4" } });
    await until(() => /save-state--success/.test(saveState(alt)), "the row change");
    const [action] = (await fetchChanges()).actions;

    const reloads = holdReloads();
    const releaseUpdate = holdConfigSave();
    // A wait that fails lets both held requests go, so later tests don't wait on them.
    try {
        void flipCard(root, names[0]);
        await until(() => requests.at(-1) === "POST /api/config/save", "the card save to wait");
        reloads.hold();
        await undoAction(action.id);
        await until(() => reloads.holding() > 0, "the reload to read the choice");
        await new Promise((resolve) => setTimeout(resolve, 30));
        reloads.passNew();
        releaseUpdate();
        await until(() => !pressed(root, names[0]), "the card save to end");
        await reloads.release();
        assert.equal(pressed(root, names[0]), false, "the older answer is dropped");
        assert.notEqual(await savedOutfits(), "all");
    } finally {
        releaseUpdate();
        await reloads.release();
    }
});

// The same with a card save the game refused after the session took it: the read after the failure is the newer one.
test("a reload that read the choice before a refused card save doesn't put the card back", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    const alt = row(root, "Lumi_Alt");
    const [field] = pickerOf(alt);
    const wears = gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15];
    field.listeners.change({ target: { value: wears === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4" } });
    await until(() => /save-state--success/.test(saveState(alt)), "the row change");
    const [action] = (await fetchChanges()).actions;

    const reloads = holdReloads();
    const releaseUpdate = holdConfigSave();
    // A wait that fails lets both held requests go, so later tests don't wait on them.
    try {
        refuseAttire = 1;
        void flipCard(root, names[0]);
        await until(() => requests.at(-1) === "POST /api/config/save", "the card save to wait");
        reloads.hold();
        await undoAction(action.id);
        await until(() => reloads.holding() > 0, "the reload to read the choice");
        await new Promise((resolve) => setTimeout(resolve, 30));
        reloads.passNew(); // the read after the failure isn't held
        releaseUpdate();
        await until(() => /The game is busy/.test(text(root)), "the failure");
        await until(() => !pressed(root, names[0]), "the card to show what the session holds");
        await reloads.release();
        assert.equal(pressed(root, names[0]), false, "the older answer is dropped");
    } finally {
        releaseUpdate();
        await reloads.release();
        refuseAttire = 0;
        await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    }
});

// Attire review F4: the cards' saves show on the cards, not on the header buttons.
test("a switch's flip leaves All on and All off quiet", async () => {
    const root = await open();
    await until(() => !button(root, "Refresh").attributes.disabled, "the page's first read to end");
    const header = ["All on", "All off"].map((label) => button(root, label));
    const lit = () => header.some((node) => /account-btn--(loading|success|error)/.test(classes(node)));
    const group = byClass(root, "attire-outfit-row")[0].parentNode;
    const was = pressed(root, names[1]);
    const release = holdConfigSave();
    let saved;
    try {
        saved = flipCard(root, names[1]);
        // The cards say they're busy in the same redraw that would light a header button.
        await until(() => attrOf(group, "aria-busy") === true, "the switch's save to run");
        assert.equal(lit(), false, "quiet while the card saves");
    } finally {
        release();
    }
    await saved;
    await until(() => attrOf(group, "aria-busy") === false && pressed(root, names[1]) !== was, "the switch to change");
    assert.equal(lit(), false, "quiet once the card saved");
    await flipCard(root, names[1]);
});

// Attire review F5: the press that only asks says its question, not the last press's done.
test("All off pressed right after All on asks in the tray, and says nothing of All on's done", async () => {
    const root = await open();
    const all = button(root, "All on");
    const none = button(root, "All off");
    await flipCard(root, names[0]); // so All on has something to turn on
    await all.listeners.click({ currentTarget: all, preventDefault() {} });
    await until(() => /account-btn--success/.test(classes(all)), "All on to say done");
    await new Promise((resolve) => setTimeout(resolve, 30));
    await none.listeners.click({ currentTarget: none, preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.match(trayLine(root), /^Stop giving every outfit bonus/);
    assert.doesNotMatch(classes(none), /account-btn--success/, "the asking button isn't green");
    byClass(root, "tabbed-list__answer")[0].childNodes.at(-1).listeners.click({}); // Cancel
});

// Attire review F6: the live copy landed and the saved copy was refused; the stat update is owed.
test("a change of the character in play that partly landed owes its stat update, and leaving the field runs it", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = pickerOf(node);
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
    const [field] = pickerOf(node);
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    field.listeners.change({ target: { value: next } });
    await until(() => /save-state--success/.test(saveState(node)), "the change");
    const [action] = (await fetchChanges()).actions;
    // Every open page works the stats out after the undo; the game refuses them all.
    refuseStats = 100;
    try {
        await undoAction(action.id);
        showTab(root, "Appearance");
        await until(() => /Undone, but the stats weren't worked out again/.test(trayLine(root)), "the failure");
    } finally {
        refuseStats = 0;
    }
    const ran = commands.length;
    await button(root, "Refresh").listeners.click({});
    await until(() => commands.slice(ran).includes("wide attirestats"), "Refresh to run the owed stat update");
    await until(() => !/Undone, but the stats/.test(trayLine(root)), "the failure line to go");
});

// Reader of the leftovers, 4: once Refresh ran the owed stat update, the lines that said it failed go.
test("Refresh clears Give everyone's stat failure and the row's reason once the owed update runs", async () => {
    const root = await open();
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown2" ? "EquipmentGown3" : "EquipmentGown2";
    refuseStats = 1;
    await giveEveryone(root, next);
    await until(() => /\?/.test(trayLine(root)), "the question");
    await answerYes(root);
    await until(() => /The game is busy/.test(trayLine(root)), "Give everyone's stat failure");
    await button(root, "Refresh").listeners.click({});
    await until(() => !/The game is busy/.test(trayLine(root)), "the line to go once the stats ran");

    // A row's pick whose stat update was refused: its reason goes too.
    const node = row(root, "Lumi_Main");
    const [field] = pickerOf(node);
    refuseStats = 1;
    field.listeners.change({ target: { value: next === "EquipmentGown2" ? "EquipmentGown3" : "EquipmentGown2" } });
    await until(() => /save-state--error/.test(saveState(node)), "the row's reason");
    await button(root, "Refresh").listeners.click({});
    await until(() => !/save-state--error/.test(saveState(node)), "the row's reason to go once the stats ran");
});

// Second reader of the leftovers, 1: a change the saved copy refused stays shown after Refresh ran the owed stat
// update, and leaving the field finishes it.
test("a change the saved copy refused stays shown after Refresh, and leaving the field finishes it", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = pickerOf(node);
    const slot = gga.PlayerDATABASE.h.Lumi_Main.h.EquipmentOrder[0];
    const kept = slot[15];
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    Object.defineProperty(slot, 15, { get: () => kept, set() {}, configurable: true });
    try {
        field.listeners.change({ target: { value: next } });
        await until(() => /save-state--error/.test(saveState(node)), "the refusal in the row");
    } finally {
        Object.defineProperty(slot, 15, { value: kept, writable: true, configurable: true });
    }
    const ran = commands.length;
    const refresh = button(root, "Refresh");
    await refresh.listeners.click({});
    await until(() => commands.slice(ran).includes("wide attirestats"), "Refresh to run the owed stat update");
    await until(() => !refresh.attributes.disabled, "the reload to end");
    assert.match(saveState(node), /save-state--error/, "the saved copy still lacks the pick, so the reason stays");
    node.listeners.focusout({ relatedTarget: null, target: {}, currentTarget: node });
    await until(() => slot[15] === next, "leaving the field to write the saved copy");
    await until(() => /save-state--success/.test(saveState(node)), "the row to say it saved");
});

// Second reader of the leftovers, 1: Give everyone counts a character whose saved copy still lacks the outfit.
test("give everyone writes a saved copy that still lacks the outfit the live copy wears", async () => {
    const root = await open();
    const item = "EquipmentGown6";
    gga.EquipmentOrder[0][15] = item;
    gga.PlayerDATABASE.h.Lumi_Main.h.EquipmentOrder[0][15] = "EquipmentGown2";
    for (const name of PLAYERS.slice(1)) gga.PlayerDATABASE.h[name].h.EquipmentOrder[0][15] = item;
    await giveEveryone(root, item);
    await until(() => /\?/.test(trayLine(root)), "the question");
    assert.match(trayLine(root), /^Give 1 character /);
    await answerYes(root);
    await until(() => gga.PlayerDATABASE.h.Lumi_Main.h.EquipmentOrder[0][15] === item, "the saved copy");
});

// CodeRabbit on #110: a stat update Give everyone started, answering after a newer one from a row's pick was refused,
// doesn't clear the debt the newer one left: leaving the field runs the update again. Give everyone leaves the rows
// enabled while its update runs, so the test uses it. After an undo the reload usually waits for the update, but that
// depends on the order VanJS runs the page's listeners; the fix covers that path too.
test("an older stat update that answers after a newer one failed leaves the newer one owed", async () => {
    const root = await open();
    const worn = gga.EquipmentOrder[0][15];
    const item = worn === "EquipmentGown5" ? "EquipmentGown6" : "EquipmentGown5";
    const held = [];
    try {
        await giveEveryone(root, item);
        await until(() => /\?/.test(trayLine(root)), "the question");
        holdStats = (release) => held.push(release);
        answerYes(root);
        const given = () => until(() => /^All \d+ characters$/.test(trayLine(root)), "Give everyone to end");
        await until(() => held.length === 1, "Give everyone's stat update to wait");
        holdStats = null;
        // The pick of the character in play lands; its own stat update is refused.
        const node = row(root, "Lumi_Main");
        const [field] = pickerOf(node);
        const next = item === "EquipmentGown5" ? "EquipmentGown6" : "EquipmentGown5";
        refuseStats = 1;
        field.listeners.change({ target: { value: next } });
        await until(() => /The game is busy/.test(text(node)), "the row's stat update to be refused");
        assert.equal(gga.EquipmentOrder[0][15], next, "the pick landed");
        // The older update answers now; Give everyone ends once the page took its answer.
        held[0]();
        await given();
        const ran = commands.length;
        node.listeners.focusout({ relatedTarget: null, target: {}, currentTarget: node });
        await until(() => commands.slice(ran).includes("wide attirestats"), "leaving the field to run the owed update");
        await until(() => /save-state--success/.test(saveState(node)), "the row to say it saved");
    } finally {
        holdStats = null;
        refuseStats = 0;
        for (const release of held) release();
    }
});

// CodeRabbit on #110: an older stat update the game refuses after a newer one worked says nothing over that success.
test("an older stat update refused after a newer one worked says no failure", async () => {
    const root = await open();
    const item = gga.EquipmentOrder[0][15] === "EquipmentGown5" ? "EquipmentGown6" : "EquipmentGown5";
    const held = [];
    try {
        await giveEveryone(root, item);
        await until(() => /\?/.test(trayLine(root)), "the question");
        holdStats = (release) => held.push(release);
        answerYes(root);
        await until(() => held.length === 1, "Give everyone's stat update to wait");
        holdStats = null;
        // The pick of the character in play lands, and its own stat update works.
        const node = row(root, "Lumi_Main");
        const [field] = pickerOf(node);
        field.listeners.change({ target: { value: item === "EquipmentGown5" ? "EquipmentGown6" : "EquipmentGown5" } });
        await until(() => /save-state--success/.test(saveState(node)), "the row's pick to save");
        // The older update is refused now.
        held[0]({ ok: false, message: "The game is busy" });
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert.doesNotMatch(trayLine(root), /The game is busy/);
    } finally {
        holdStats = null;
        for (const release of held) release();
    }
});

// Local CodeRabbit review of #110: a Refresh while a pick of the character in play saves can't settle the stat update
// that pick owes once it lands in part.
test("a Refresh during a pick's save leaves its stat update owed when the pick lands in part", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = pickerOf(node);
    const slot = gga.PlayerDATABASE.h.Lumi_Main.h.EquipmentOrder[0];
    const kept = slot[15];
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    const refresh = button(root, "Refresh");
    let release;
    Object.defineProperty(slot, 15, { get: () => kept, set() {}, configurable: true });
    try {
        holdWrite = new Promise((resolve) => (release = resolve));
        field.listeners.change({ target: { value: next } });
        await until(() => holdWrite === null, "the pick's write to wait");
        await refresh.listeners.click({});
        release();
        await until(() => /save-state--error/.test(saveState(node)), "the saved copy's refusal in the row");
    } finally {
        release?.();
        holdWrite = null;
        Object.defineProperty(slot, 15, { value: kept, writable: true, configurable: true });
    }
    const ran = commands.length;
    await refresh.listeners.click({});
    await until(() => commands.slice(ran).includes("wide attirestats"), "Refresh to run the owed stat update");
});

// Local CodeRabbit review of #110: a pick that landed but whose page couldn't read the game again says so in its row,
// instead of a ✓ beside attire the page may still show as before.
test("a pick that landed but couldn't be read back says so in its row", async () => {
    const wears = gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15];
    failReadAfterWrite = true;
    try {
        assert.equal(await pick("Lumi_Alt", wears === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4"), "error");
        assert.match(text(row(page, "Lumi_Alt")), /couldn't read the game again/);
    } finally {
        failReadAfterWrite = false;
        failNextStatus = false;
    }
});

// CodeRabbit on #110: a pick planned for the character in play writes nothing when she switched characters before the
// write ran, and its row says the character changed.
test("a pick for the character in play writes nothing on the one she switched to meanwhile", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = pickerOf(node);
    const live = gga.EquipmentOrder[0][15];
    const next = live === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    // Main's saved copy: its ID, quantity and upgrade map.
    const savedCopy = () => {
        const saved = gga.PlayerDATABASE.h.Lumi_Main.h;
        return JSON.stringify([saved.EquipmentOrder[0][15], saved.EquipmentQuantity[0][15], saved.EquipmentMap[0][15]]);
    };
    const savedBefore = savedCopy();
    let release;
    try {
        holdWrite = new Promise((resolve) => (release = resolve));
        field.listeners.change({ target: { value: next } });
        await until(() => holdWrite === null, "the pick's write to wait");
        gga.UserInfo[0] = "Lumi_Alt"; // she switches characters in the game
        release();
        await until(() => /save-state--error/.test(saveState(node)), "the refusal in the row");
        assert.match(text(node), /Character changed\. Refresh\./);
        assert.equal(gga.EquipmentOrder[0][15], live, "nothing was written on the character now in play");
        assert.equal(savedCopy(), savedBefore, "nor on Main's saved copy: the whole batch was refused");
    } finally {
        release?.();
        holdWrite = null;
        gga.UserInfo[0] = "Lumi_Main";
    }
});

// CodeRabbit on #110: a stat update owed for one character stays owed while another one's update works, and Refresh
// runs it once that character is in play again.
test("a stat update one character owes isn't cleared by another character's update", async () => {
    const root = await open();
    const main = row(root, "Lumi_Main");
    const [mainField] = pickerOf(main);
    const live = gga.EquipmentOrder[0][15];
    const next = live === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    refuseStats = 1;
    mainField.listeners.change({ target: { value: next } });
    await until(() => /The game is busy/.test(text(main)), "Main's stat failure in its row");
    try {
        gga.UserInfo[0] = "Lumi_Alt"; // she switches characters in the game
        await button(root, "Refresh").listeners.click({});
        const alt = row(root, "Lumi_Alt");
        const [altField] = pickerOf(alt);
        const ran = commands.length;
        altField.listeners.change({
            target: { value: next === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4" },
        });
        await until(() => /save-state--success/.test(saveState(alt)), "Alt's pick and its stat update");
        assert.deepEqual(commands.slice(ran), ["wide attirestats"]);
    } finally {
        gga.UserInfo[0] = "Lumi_Main";
        gga.EquipmentOrder[0][15] = next; // the fake game has one live copy: Main's pick is back in it
    }
    const ran = commands.length;
    await button(root, "Refresh").listeners.click({});
    await until(() => commands.slice(ran).includes("wide attirestats"), "Refresh to run Main's owed stat update");
    await until(() => !/save-state--error/.test(saveState(main)), "Main's reason to go once its stats ran");
    gga.EquipmentOrder[0][15] = live;
});

// Review of #147: a click built its change from the choice it read before the save's turn, so a choice saved in
// between (the Config page, another tab) was lost; it's now built from the config read in the save's turn.
test("a card click keeps an outfit choice saved elsewhere between its read and its save", async (t) => {
    await saveToSession(router, { cheatConfig: { wide: { attire: { outfits: "EquipmentGown4" } } } });
    const root = await open();
    const config = router.routes.GET.get("/api/config");
    let reads = 0;
    router.routes.GET.set("/api/config", async (req, res) => {
        let answer;
        const capture = { status: () => capture, json: (data) => (answer = structuredClone(data)) };
        await config(req, capture);
        // The click's first read has its answer; another page's save lands before the save's turn reads again.
        if (++reads === 1)
            await saveToSession(router, {
                cheatConfig: { wide: { attire: { outfits: "EquipmentGown4,EquipmentGown5" } } },
            });
        return res.json(answer);
    });
    t.after(() => router.routes.GET.set("/api/config", config));

    await flipCard(root, names[2]);
    await until(() => pressed(root, names[2]), "the card to show on");
    assert.equal(await savedOutfits(), "EquipmentGown3,EquipmentGown4,EquipmentGown5");
});

// #113 (CodeRabbit on #110): two row saves at once; the first one's read of the game answers after the second one's
// newer read, and put the second row back to the attire it wore before its save.
test("an older read of the game that answers last doesn't put back what a newer one showed", async () => {
    const root = await open();
    const main = row(root, "Lumi_Main");
    const alt = row(root, "Lumi_Alt");
    const live = gga.EquipmentOrder[0][15];
    const mainNext = live === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    const altBefore = gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15];
    const altNext = altBefore === "EquipmentGown2" ? "EquipmentGown5" : "EquipmentGown2";
    const mainSaved = gga.PlayerDATABASE.h.Lumi_Main.h.EquipmentOrder[0][15];
    let answer;
    let release;
    try {
        holdStatusAnswer = new Promise((resolve) => (answer = resolve));
        const [mainField] = pickerOf(main);
        mainField.listeners.change({ target: { value: mainNext } }); // its read waits
        await until(() => holdStatusAnswer === null, "Main's read to wait");
        const [altField] = pickerOf(alt);
        altField.listeners.change({ target: { value: altNext } });
        await until(() => /save-state--success/.test(saveState(alt)), "Alt's save");
        const altShown = shown(alt);
        holdWrite = new Promise((resolve) => (release = resolve)); // Main's write waits after its read lands
        answer();
        await until(() => holdWrite === null, "Main's read to land and its write to wait");
        assert.equal(shown(alt), altShown, "Alt still shows its new attire");
        assert.equal(gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15], altNext);
    } finally {
        answer?.();
        release?.();
        holdStatusAnswer = holdWrite = null;
    }
    await until(() => /save-state--(success|error)/.test(saveState(main)), "Main's save to end");
    gga.EquipmentOrder[0][15] = live;
    gga.PlayerDATABASE.h.Lumi_Main.h.EquipmentOrder[0][15] = mainSaved;
    gga.PlayerDATABASE.h.Lumi_Alt.h.EquipmentOrder[0][15] = altBefore;
});

// #113 (CodeRabbit on #110): the read after a failed card save and a Refresh after it have the same `choiceSaves`;
// the recovery read answered last and put back the choice from before the Refresh.
test("the read after a failed card save doesn't overwrite a newer Refresh", async () => {
    await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    const root = await open();
    await until(() => names.every((name) => pressed(root, name)), "every card on");
    const onCount = () => names.filter((name) => pressed(root, name)).length;
    const reloads = holdReloads();
    const releaseUpdate = holdConfigSave();
    try {
        refuseAttire = 1;
        void flipCard(root, names[0]);
        await until(() => requests.at(-1) === "POST /api/config/save", "the card save to wait");
        reloads.hold(); // the read after the failure waits
        releaseUpdate();
        await until(() => reloads.holding() > 0, "the read after the failure");
        await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "EquipmentGown4" } } } }); // another tab
        reloads.passNew();
        await button(root, "Refresh").listeners.click({});
        await until(() => onCount() === 1, "Refresh to show the newer choice");
        await reloads.release();
        assert.equal(onCount(), 1, "the older read's answer is dropped");
    } finally {
        releaseUpdate();
        await reloads.release();
        refuseAttire = 0;
        await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: "all" } } } });
    }
});

// #113 (CodeRabbit on #110): an undo's stat update failed after the player switched characters, and its failure line
// was tagged to the character now in play, so the owing character's update didn't take it away.
test("an undo's stat failure belongs to the character it ran for, though another is in play when it fails", async () => {
    const root = await open();
    const node = row(root, "Lumi_Main");
    const [field] = pickerOf(node);
    const next = gga.EquipmentOrder[0][15] === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    field.listeners.change({ target: { value: next } });
    await until(() => /save-state--success/.test(saveState(node)), "the change");
    const [action] = (await fetchChanges()).actions;
    const held = [];
    holdStats = (release) => held.push(release); // every stat update waits from here
    let mainLive;
    try {
        await undoAction(action.id);
        await until(() => held.length > 0, "the undo's stat update to wait");
        mainLive = gga.EquipmentOrder[0][15];
        gga.UserInfo[0] = "Lumi_Alt"; // she switches characters in the game, and picks attire for Alt
        const alt = row(root, "Lumi_Alt");
        const [altField] = pickerOf(alt);
        const waiting = held.length;
        altField.listeners.change({
            target: { value: next === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4" },
        });
        await until(() => held.length > waiting, "Alt's pick to read Alt in play and wait on its stat update");
        holdStats = null;
        held.splice(0).forEach((release) => release({ ok: false, message: "The game is busy" }));
        showTab(root, "Appearance");
        await until(() => /Undone, but the stats weren't worked out again/.test(trayLine(root)), "the undo's failure");
    } finally {
        holdStats = null;
        held.splice(0).forEach((release) => release());
        gga.UserInfo[0] = "Lumi_Main";
        if (mainLive !== undefined) gga.EquipmentOrder[0][15] = mainLive; // one live copy in the fake game: Main's again
    }
    const ran = commands.length;
    await button(root, "Refresh").listeners.click({}); // Main in play again: Refresh runs the update it owes
    await until(() => commands.slice(ran).includes("wide attirestats"), "Refresh to run Main's owed stat update");
    await until(() => !/Undone, but the stats/.test(trayLine(root)), "the failure line to go once Main's update ran");
});

// #113 (CodeRabbit on #110): a stat update that worked takes back a row's failure only when that character owed it.
// Main's pick landed but couldn't be read back, so no update is owed; Give everyone's update for Main leaves it.
test("a stat update a character didn't owe leaves its row's failure", async () => {
    const root = await open();
    const main = row(root, "Lumi_Main");
    const [field] = pickerOf(main);
    const live = gga.EquipmentOrder[0][15];
    const picked = live === "EquipmentGown4" ? "EquipmentGown3" : "EquipmentGown4";
    failReadAfterWrite = true;
    try {
        field.listeners.change({ target: { value: picked } });
        await until(() => /couldn't read the game again/.test(text(main)), "Main's failure in its row");
    } finally {
        failReadAfterWrite = false;
        failNextStatus = false;
    }
    const ran = commands.length;
    await giveEveryone(root, "EquipmentGown2");
    await until(() => /\?/.test(trayLine(root)), "the question");
    await answerYes(root);
    await until(() => commands.slice(ran).includes("wide attirestats"), "Give everyone's stat update for Main");
    await until(() => gga.EquipmentOrder[0][15] === "EquipmentGown2", "Main to wear it");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(text(main), /couldn't read the game again/, "the failure stays");
    gga.EquipmentOrder[0][15] = live;
});

// CodeRabbit on #319: Give everyone reads the attire again on the answer. A character given the outfit from its own
// row while the question waited keeps its attire's upgrades, and the tray says no one is left to give it.
test("give everyone answered after a character already got the outfit leaves that character's attire alone", async () => {
    const root = await open();
    const item = "EquipmentGown5";
    const db = gga.PlayerDATABASE.h;
    const before = {
        live: gga.EquipmentOrder[0][15],
        saved: Object.fromEntries(PLAYERS.map((name) => [name, db[name].h.EquipmentOrder[0][15]])),
    };
    gga.EquipmentOrder[0][15] = item;
    for (const name of PLAYERS) db[name].h.EquipmentOrder[0][15] = name === "Lumi_Third" ? "EquipmentGown1" : item;
    try {
        await giveEveryone(root, item);
        await until(() => /\?/.test(trayLine(root)), "the question");
        assert.match(trayLine(root), /^Give 1 character /);
        // Meanwhile Lumi_Third gets the outfit in game, and an upgrade on it.
        db.Lumi_Third.h.EquipmentOrder[0][15] = item;
        db.Lumi_Third.h.EquipmentMap[0][15].h = { STR: 5 };
        await answerYes(root);
        await until(() => /already wears/.test(trayLine(root)), "the tray to say everyone wears it");
        assert.equal(
            JSON.stringify(db.Lumi_Third.h.EquipmentMap[0][15].h),
            JSON.stringify({ STR: 5 }),
            "its upgrade stays"
        );
    } finally {
        db.Lumi_Third.h.EquipmentMap[0][15].h = {};
        gga.EquipmentOrder[0][15] = before.live;
        for (const name of PLAYERS) db[name].h.EquipmentOrder[0][15] = before.saved[name];
    }
});
