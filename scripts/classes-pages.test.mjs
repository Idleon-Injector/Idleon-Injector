// The Classes pages on the fake game (the game's real masterclass lists, classes-game.mjs), driven the way the player
// drives them: each masterclass is one sidebar entry with the game's screens as tabs, every save lands where the game
// keeps it, and a tool that takes things away asks in the tray first.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

const GRIMOIRE = "src/ui/pages/classes/grimoire/1-grimoire.js";
const GRIMOIRE_AUTOMATION = "src/ui/pages/classes/grimoire/2-automation.js";
const COMPASS = "src/ui/pages/classes/compass/compass.js";
const TESSERACT = "src/ui/pages/classes/tesseract/tesseract.js";
const ROYAL_ARMORY = "src/ui/pages/classes/royal-armory/royal-armory.js";

// The automation tab reads the game again every few seconds while one runs; that timer mustn't keep the file running.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router, game } = await createFakeApi(fakeGameData());
const { requests } = await loadUi(router);
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const gga = game.gga;
const unhandled = [];
process.on("unhandledRejection", (error) => unhandled.push(String(error?.message ?? error)));

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
const byTag = (root, tag) => elements(root).filter((node) => node.nodeName === tag);
const attr = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
const hidden = (node) => {
    for (let at = node; at; at = at.parentNode) if (at.attributes && attr(at, "hidden") === true) return true;
    return false;
};
const writes = () => requests.filter((entry) => /write/.test(entry)).length;
const copy = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const pageRead = (root) =>
    byClass(root, "account-row").length > 0 &&
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
const tabNamed = (root, label) =>
    elements(root).find((node) => node.attributes.role === "tab" && text(node).trim().startsWith(label));
const paneOf = (root, label) =>
    elements(root).find((node) => node.attributes.id === tabNamed(root, label).attributes["aria-controls"]);
const rowsIn = (pane) => byClass(pane, "account-row").filter((row) => !classes(row).includes("account-row--head"));
// A page opened on one of its tabs: the tab's own rows are its pane's.
const openPane = async (file, label) => {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root), `${file} to load`);
    tabNamed(root, label).listeners.click({});
    await until(() => rowsIn(paneOf(root, label)).length > 0, `the ${label} tab`);
    return { root, pane: paneOf(root, label) };
};
// A row by its name, or by its main line (the bonus) when it has one.
const rowNamed = (root, name) =>
    rowsIn(root).find((row) =>
        [byClass(row, "account-row__name")[0], byClass(row, "account-row__bonus")[0]].some(
            (node) => node && text(node).trim() === name
        )
    );
const names = (pane) => rowsIn(pane).map((row) => text(byClass(row, "account-row__name")[0]).trim());
const click = (node) =>
    (node.listeners.click ?? node.onclick)({ preventDefault() {}, currentTarget: node, target: node, detail: 1 });
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label && !hidden(node));
const switchOf = (row) => elements(row).find((node) => node.nodeName === "input" && node.attributes.role === "switch");
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label").find((node) => !hidden(node)));
const yes = (root) => click(byClass(root, "tabbed-list__yes").find((node) => !hidden(node)));
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0] ?? { attributes: {} }))?.[1];
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
const fieldsOf = (row) => byTag(row, "input").filter((node) => node.attributes.role !== "switch");
const focus = (input) => input.listeners.focus?.({ target: input });
const typeAndEnter = (row, value, input = fieldsOf(row)[0]) => {
    focus(input);
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
};
// A step picker's step by its word.
const stepNamed = (row, label) =>
    elements(row).find((node) => node.attributes.role === "radio" && text(node).trim() === label);
const picked = (row) =>
    text(
        elements(row).find((node) => node.attributes.role === "radio" && attr(node, "aria-checked") === "true")
    ).trim();
// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};
// Hold the game's writes until released, to act while a save runs.
const holdWrites = () => {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) await gate;
        return realFetch(url, options);
    };
    return () => {
        globalThis.fetch = realFetch;
        release();
    };
};
// Counts the times a node is taken out of the page, even to be put back: a browser then drops its focus and blurs it.
const watchTakenOut = (node) => {
    let count = 0;
    for (let at = node.parentNode; at; at = at.parentNode) {
        const own = at.replaceChildren;
        at.replaceChildren = function (...children) {
            count++;
            return own.apply(this, children);
        };
    }
    return () => count;
};

// ---- The menu ----------------------------------------------------------------------------------------------------

test("Classes is four systems, each with the game's screens as tabs; the Grimoire automation is its own entry", async () => {
    const { buildMenuTree } = await importRepo("src/ui/menu/menuModel.js");
    const pages = await Promise.all(
        [GRIMOIRE, GRIMOIRE_AUTOMATION, COMPASS, TESSERACT, ROYAL_ARMORY].map(
            async (file) => (await importRepo(file)).default
        )
    );
    const classesEntry = buildMenuTree(pages).find((entry) => entry.id === "classes");
    assert.deepEqual(
        classesEntry.systems.map((system) => [system.name, system.pages.length]),
        [
            ["Grimoire", 2],
            ["Compass", 1],
            ["Tesseract", 1],
            ["Royal Armory", 1],
        ]
    );
    const tabsOf = (id) => pages.find((page) => page.id === id).tabs.map((tab) => tab.label);
    assert.deepEqual(tabsOf("classes.grimoire"), ["Upgrades", "Bones"]);
    const grimoire = classesEntry.systems.find((system) => system.name === "Grimoire");
    assert.deepEqual(
        grimoire.pages.map((page) => page.tab),
        ["Grimoire", "Automation"]
    );
    assert.deepEqual(tabsOf("classes.compass"), [
        "Elemental",
        "Fighter",
        "Survival",
        "Nomadic",
        "Abominations",
        "Dust",
    ]);
    assert.deepEqual(tabsOf("classes.tesseract"), ["Upgrades", "Tachyons", "Map Bonuses"]);
    assert.deepEqual(tabsOf("classes.royalarmory"), [
        "Upgrades",
        "Resources",
        "Nodes",
        "Royal Statues",
        "Outposts",
        "Lil' Orblet Shop",
    ]);
    // The old page names still find the tab that holds them now.
    const words = (id, label) => pages.find((page) => page.id === id).tabs.find((tab) => tab.label === label).keywords;
    assert.ok(words("classes.tesseract", "Map Bonuses").includes("Map Crystals"));
    assert.ok(words("classes.royalarmory", "Nodes").includes("Resource nodes"));
    assert.ok(words("classes.royalarmory", "Lil' Orblet Shop").includes("Orblet Market"));
});

// ---- Upgrades ----------------------------------------------------------------------------------------------------

test("grimoire: the upgrades in the game's order, the bonus first, without the game's ripped pages", async () => {
    const { root, pane } = await openPane(GRIMOIRE, "Upgrades");
    const real = gga.CustomLists.h.GrimoireUpg.filter((def) => def[0] !== "Ripped_Page");
    assert.equal(rowsIn(pane).length, real.length);
    assert.ok(!names(pane).includes("Ripped Page"));
    const first = rowsIn(pane)[0];
    assert.equal(text(byClass(first, "account-row__bonus")[0]), "Base Damage in Wraith Form");
    assert.equal(text(byClass(first, "account-row__name")[0]), "Wraith Damage");
    assert.equal(trayLine(root), `All ${real.length} upgrades`);
});

test("grimoire: a level saves to the game and the game counts its levels again", async () => {
    const { pane } = await openPane(GRIMOIRE, "Upgrades");
    gga.DNSM.h.GrimoireTotLV = 1234;
    const row = rowNamed(pane, "Wraith Accuracy");
    typeAndEnter(row, 77);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Grimoire[1], 77);
    assert.equal(gga.DNSM.h.GrimoireTotLV, undefined, "the game's sum is gone, so it counts again");
});

// Lumi's call (2026-11-20): Max all brings a value above its max down to it, on one press. An upgrade without a max
// (999999 in the game's list) is left as it is.
test("grimoire: Max all fills the upgrades that have a max, lowers one above it, and leaves the rest", async () => {
    const saved = copy(gga.Grimoire);
    try {
        const { root, pane } = await openPane(GRIMOIRE, "Upgrades");
        gga.Grimoire[4] = 9; // Ribbon Shelf, max 1
        gga.Grimoire[5] = 3; // Ribbon Winning, max 50
        gga.Grimoire[0] = 12; // Wraith Damage, no max
        click(buttonNamed(root, "Refresh"));
        await until(() => fieldsOf(rowNamed(pane, "Ribbon Shelf"))[0].attributes.value !== undefined, "the read");
        const before = writes();
        await click(buttonNamed(root, "Max all"));
        await until(() => gga.Grimoire[5] === 50, "Ribbon Winning to its max");
        assert.ok(writes() > before);
        assert.equal(gga.Grimoire[4], 1, "brought down to its max");
        assert.equal(gga.Grimoire[0], 12, "no max: left as it is");
    } finally {
        saved.forEach((level, n) => (gga.Grimoire[n] = level));
    }
});

test("grimoire: Reset all asks in the tray, writes nothing until the answer, then resets", async () => {
    const saved = copy(gga.Grimoire);
    try {
        const { root } = await openPane(GRIMOIRE, "Upgrades");
        const before = writes();
        click(buttonNamed(root, "Reset all"));
        await tick();
        assert.match(trayLine(root), /^Reset \d+ upgrades to 0\?$/);
        assert.equal(writes(), before, "the press only asks");
        await yes(root);
        // The game's ripped pages (the last three) aren't on the page.
        await until(() => gga.Grimoire.slice(0, 52).every((level) => level === 0), "every level at 0");
    } finally {
        saved.forEach((level, n) => (gga.Grimoire[n] = level));
    }
});

test("grimoire: AFK Bones is a switch that saves", async () => {
    const { pane } = await openPane(GRIMOIRE, "Bones");
    assert.deepEqual(names(pane), ["Femur", "Ribcage", "Cranium", "Bovinae", "Bones collected", "AFK Bones"]);
    const row = rowNamed(pane, "AFK Bones");
    try {
        await flip(row, false);
        await until(() => gga.OptionsListAccount[367] === 0, "AFK Bones off in the game");
    } finally {
        gga.OptionsListAccount[367] = 1;
    }
});

test("compass: each path is its tab, and the abominations still to come stay out", async () => {
    const { root, pane } = await openPane(COMPASS, "Fighter");
    const fighter = gga.CustomLists.h.CompassUpg.filter((def) => def[10] === "1");
    assert.equal(rowsIn(pane).length, fighter.length);
    assert.ok(names(pane).includes("Fighter Path"));
    tabNamed(root, "Abominations").listeners.click({});
    const abominations = paneOf(root, "Abominations");
    await until(() => rowsIn(abominations).length, "the abominations");
    assert.equal(rowsIn(abominations).length, 35, "XXXVI to XLVI are the game's placeholders");
    assert.equal(text(byClass(rowsIn(abominations)[2], "account-row__bonus")[0]), "Tempest Move Speed %");
});

test("royal armory: the upgrades on the game's shelves, and the Lil' Orblet Shop in normal case", async () => {
    const { root, pane } = await openPane(ROYAL_ARMORY, "Upgrades");
    const order = gga.CustomLists.h.Research[43];
    assert.equal(rowsIn(pane).length, order.length);
    assert.equal(names(pane)[0], "Collect Resources Tool", "shelf 1 is ArmoryUpg 30");
    tabNamed(root, "Lil' Orblet Shop").listeners.click({});
    const shop = paneOf(root, "Lil' Orblet Shop");
    await until(() => rowsIn(shop).length, "the shop");
    assert.ok(names(shop).includes("Full Clear"));
    assert.ok(names(shop).includes("Stronk Rank"));
});

// ---- Tesseract › Map Bonuses -------------------------------------------------------------------------------------

const mapRow = (pane, m) => rowNamed(pane, gga.CustomLists.h.MapDispName[m].replace(/_/g, " "));

test("map bonuses: a crystal's kills save to the map, and the game works its sums out again", async () => {
    const before = copy(gga.MapBon[1]);
    try {
        const { pane } = await openPane(TESSERACT, "Map Bonuses");
        gga.DNSM.h.ArcMultBon = [75];
        const row = mapRow(pane, 1);
        typeAndEnter(row, 4000, fieldsOf(row)[1]);
        await settled(row);
        assert.equal(gga.MapBon[1][1], 4000);
        assert.equal(gga.DNSM.h.ArcMultBon, undefined);
    } finally {
        gga.MapBon[1] = before;
    }
});

test("map bonuses: Set all raising runs on one press; lowering asks in the tray first", async () => {
    const saved = copy(gga.MapBon);
    try {
        const { root } = await openPane(TESSERACT, "Map Bonuses");
        const setAll = () => click(buttonNamed(root, "Set all"));
        const kills = byClass(root, "account-setall-row").find((node) => !hidden(node));
        const input = byTag(kills, "input")[0];
        input.value = "99000000";
        input.listeners.input({ target: input });
        await setAll();
        await until(() => gga.MapBon[1][0] === 99000000, "every crystal raised");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        input.value = "5";
        input.listeners.input({ target: input });
        const before = writes();
        setAll();
        await tick();
        assert.match(trayLine(root), /^Lower the kills on \d+ maps\?$/);
        assert.equal(writes(), before, "nothing lowered yet");
        await yes(root);
        await until(() => gga.MapBon[1][2] === 5, "lowered on the answer");
    } finally {
        saved.forEach((entry, m) => (gga.MapBon[m] = entry));
    }
});

test("map bonuses: a Set all that fails partway shows what the game holds", async () => {
    const saved = copy(gga.MapBon);
    const { root, pane } = await openPane(TESSERACT, "Map Bonuses");
    const shown = () => fieldsOf(mapRow(pane, 1)).map((node) => String(node.attributes.value ?? node.value));
    const realFetch = globalThis.fetch;
    let batches = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).endsWith("/game/gga/write-many") && ++batches === 2)
            return new Response(JSON.stringify({ error: "the game refused" }), { status: 500 });
        return realFetch(url, options);
    };
    try {
        const input = byTag(
            byClass(root, "account-setall-row").find((node) => !hidden(node)),
            "input"
        )[0];
        input.value = "20000000";
        input.listeners.input({ target: input });
        await click(buttonNamed(root, "Set all"));
        assert.equal(batches, 2, "the second batch was refused");
        assert.deepEqual([...gga.MapBon[1]], [20000000, 20000000, 20000000], "the first batch landed");
        await until(() => shown().every((value) => value === shown()[0] && value !== "0"), "map 1 to show its kills");
    } finally {
        globalThis.fetch = realFetch;
        saved.forEach((entry, m) => (gga.MapBon[m] = entry));
    }
});

test("map bonuses: a reload leaves the rows in the page", async () => {
    const { root, pane } = await openPane(TESSERACT, "Map Bonuses");
    const row = mapRow(pane, 1);
    const takenOut = watchTakenOut(row);
    await click(buttonNamed(root, "Refresh"));
    await until(() => pageRead(root), "the reload");
    assert.ok(mapRow(pane, 1) === row, "the row is the same row");
    assert.equal(takenOut(), 0, "the row was not taken out and put back");
});

// ---- Royal Armory ------------------------------------------------------------------------------------------------

test("royal statues: the four statues by their bonus, the game's placeholders left out", async () => {
    const { pane } = await openPane(ROYAL_ARMORY, "Royal Statues");
    assert.deepEqual(names(pane), ["Total Damage", "Drop Rate", "Extra Kills", "Class EXP"]);
    assert.equal(text(byClass(rowNamed(pane, "Extra Kills"), "account-row__badge")[0]).trim(), "Locked");
});

test("resources: only the kinds the nodes give, by world", async () => {
    const { pane } = await openPane(ROYAL_ARMORY, "Resources");
    const kinds = new Set(gga.CustomLists.h.RoyalResources.map((node) => node[3]).filter((r) => r >= 0));
    assert.equal(rowsIn(pane).length, kinds.size);
    const row = rowsIn(pane)[0];
    typeAndEnter(row, 4321);
    await settled(row);
    assert.equal(gga.RoyalG[1][0], 4321);
});

test("nodes: Empty all asks in the tray; Refill all runs on one press; a typed amount fills an empty node", async () => {
    const saved = copy(gga.RoyalG[4]);
    try {
        const { root, pane } = await openPane(ROYAL_ARMORY, "Nodes");
        const first = rowsIn(pane)[0];
        assert.equal(text(byClass(first, "account-row__badge")[0]).trim(), "Empty", "node 1 is empty (-1)");
        typeAndEnter(first, 10, fieldsOf(first)[1]);
        await settled(first);
        assert.equal(gga.RoyalG[4][0], 10);
        assert.equal(text(byClass(first, "account-row__badge")[0]).trim(), "");

        await click(buttonNamed(root, "Refill all"));
        await until(() => gga.RoyalG[4].slice(0, 16).every((amount) => amount === 0), "W1's nodes full");
        const before = writes();
        click(buttonNamed(root, "Empty all"));
        await tick();
        assert.match(trayLine(root), /^Empty \d+ nodes\?$/);
        assert.equal(writes(), before);
        await yes(root);
        await until(() => gga.RoyalG[4][0] === -1, "emptied on the answer");
    } finally {
        saved.forEach((amount, i) => (gga.RoyalG[4][i] = amount));
    }
});

// ---- Royal Armory › Outposts -------------------------------------------------------------------------------------

const unitArrays = () => copy([6, 7, 8, 9, 10, 11, 12, 13].map((index) => gga.RoyalG[index]));
const putUnitArrays = (saved) => [6, 7, 8, 9, 10, 11, 12, 13].forEach((index, i) => (gga.RoyalG[index] = saved[i]));
const openOutposts = () => openPane(ROYAL_ARMORY, "Outposts");
// A built outpost's line (its opener names the map), with what opens under it.
const outpostRow = (pane, name) =>
    byClass(pane, "account-row").find((row) => {
        const opener = byClass(row, "row-opener")[0];
        return opener && row.parentNode && text(byClass(opener, "account-row__bonus")[0] ?? opener).trim() === name;
    });
const lineIn = (row, label) =>
    byClass(byClass(row, "row-detail")[0], "account-row").find(
        (node) => text(byClass(node, "account-row__name")[0]).trim() === label
    );
const says = (row) => text(byClass(row, "said")[0]);
// Opens a line's detail (an outpost's, a map's Build), so its buttons are on the page.
const opened = (row) => {
    const opener = byClass(row, "row-opener")[0];
    if (attr(opener, "aria-expanded") !== "true") click(opener);
    return row;
};

test("outposts: a slot picked while another slot saves keeps both picks", async () => {
    const before = gga.RoyalMaps[1][11];
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const release = holdWrites();
    try {
        const picks = [click(stepNamed(lineIn(outpost, "Slot 1"), "Trader"))];
        await tick();
        picks.push(click(stepNamed(lineIn(outpost, "Slot 2"), "Guard")));
        await tick();
        release();
        await Promise.all(picks);
        await until(() => gga.RoyalMaps[1][11] === 342211111, "both picks in the game");
        assert.equal(picked(lineIn(outpost, "Slot 1")), "Trader");
        assert.equal(picked(lineIn(outpost, "Slot 2")), "Guard");
    } finally {
        release();
        gga.RoyalMaps[1][11] = before;
    }
});

test("outposts: a refused slot or type pick goes back to what the game holds and says why", async () => {
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    let restore = refuseWrites(gga.RoyalMaps[1], 11);
    try {
        click(stepNamed(lineIn(outpost, "Slot 1"), "Surveyor"));
        await until(() => /Slot 1 not saved: game kept old value/.test(says(outpost)), "the reason");
        assert.equal(picked(lineIn(outpost, "Slot 1")), "Worker", "the slot shows the Worker the game kept");
    } finally {
        restore();
    }
    restore = refuseWrites(gga.RoyalMaps[1], 10);
    try {
        await click(stepNamed(lineIn(outpost, "Type"), "Savage"));
        await until(() => picked(lineIn(outpost, "Type")) === "Support Camp", "the type the game kept");
        assert.match(says(outpost), /Type not saved: game kept old value/);
    } finally {
        restore();
    }
});

// #191: the save reads the game again, so a pick the game took isn't said as failed.
test("outposts: a slot pick whose answer is lost shows what the game holds, not said as failed", async () => {
    const before = gga.RoyalMaps[1][11];
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (!String(url).includes("/write")) return response;
        return new Response(JSON.stringify({ error: "the connection dropped" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    try {
        click(stepNamed(lineIn(outpost, "Slot 1"), "Surveyor"));
        await until(() => String(gga.RoyalMaps[1][11])[0] === "5", "the game to take it");
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(picked(lineIn(outpost, "Slot 1")), "Surveyor");
        assert.doesNotMatch(says(outpost), /not saved/);
    } finally {
        globalThis.fetch = realFetch;
        gga.RoyalMaps[1][11] = before;
    }
});

test("outposts: a slot the barracks hasn't opened says so in its place", async () => {
    const { pane } = await openOutposts();
    const slot = lineIn(opened(outpostRow(pane, "Grassy Path")), "Slot 4");
    assert.equal(text(byClass(slot, "outpost-pick__locked")[0]), "Opens at Barracks 3");
});

test("outposts: an add waits behind a remove on the same map, and adds the kind pressed", async () => {
    const saved = unitArrays();
    gga.RoyalG[6] = [4];
    gga.RoyalG[7] = [1];
    try {
        const { root, pane } = await openOutposts();
        click(buttonNamed(root, "Refresh"));
        // Opened once: the line stays the same line through the reloads.
        const path = opened(outpostRow(pane, "Grassy Path"));
        const outpost = () => path;
        await until(() => lineIn(outpost(), "Unit 1") && !lineIn(outpost(), "Unit 2"), "one unit on Grassy Path");
        const release = holdWrites();
        try {
            const removing = click(buttonNamed(lineIn(outpost(), "Unit 1"), "Remove"));
            await tick();
            const adding = click(buttonNamed(lineIn(outpost(), "Add a unit"), "Knight"));
            await tick();
            release();
            await Promise.all([removing, adding]);
            assert.deepEqual([...gga.RoyalG[6]], [6], "the Remove, then the Knight");
        } finally {
            release();
        }
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: two quick Removes on one map remove both of its units, not another map's", async () => {
    const saved = unitArrays();
    gga.RoyalG[6] = [4, 4, 5];
    gga.RoyalG[7] = [1, 1, 2];
    try {
        const { root, pane } = await openOutposts();
        click(buttonNamed(root, "Refresh"));
        const outpost = opened(outpostRow(pane, "Grassy Path"));
        await until(() => lineIn(outpost, "Unit 2"), "two units on Grassy Path");
        const release = holdWrites();
        try {
            const presses = [click(buttonNamed(lineIn(outpost, "Unit 1"), "Remove"))];
            await tick();
            presses.push(click(buttonNamed(lineIn(outpost, "Unit 2"), "Remove")));
            await tick();
            release();
            await Promise.all(presses);
            await until(() => JSON.stringify(gga.RoyalG[6]) === "[5]", "both militia removed");
            assert.deepEqual([...gga.RoyalG[7]], [2], "Grassy Hollow's commander stays");
        } finally {
            release();
        }
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: a unit's kind saves on the pick, and the line follows the game after a reload", async () => {
    const saved = unitArrays();
    gga.RoyalG[6] = [4];
    gga.RoyalG[7] = [1];
    try {
        const { root, pane } = await openOutposts();
        click(buttonNamed(root, "Refresh"));
        const outpost = opened(outpostRow(pane, "Grassy Path"));
        await until(() => lineIn(outpost, "Unit 1") && !lineIn(outpost, "Unit 2"), "one unit");
        await click(stepNamed(lineIn(outpost, "Unit 1"), "Commander"));
        await until(() => gga.RoyalG[6][0] === 5, "the pick landed");
        // What History's Undo does: the old value goes back, then the page reads the game again.
        gga.RoyalG[6] = [4];
        await click(buttonNamed(root, "Refresh"));
        await until(
            () => picked(lineIn(outpost, "Unit 1")) === "Militia",
            "the unit to show the Militia the game holds"
        );
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: a reload after a unit change keeps the other outposts and what is typed in them", async () => {
    const saved = unitArrays();
    try {
        const { pane } = await openOutposts();
        const first = opened(outpostRow(pane, "Grassy Path"));
        const input = fieldsOf(first)[0];
        const takenOut = watchTakenOut(first);
        const hollowRow = opened(outpostRow(pane, "Grassy Hollow"));
        const hollow = () => hollowRow;
        await new Promise((resolve) => setTimeout(resolve, 50));
        const unitsBefore = byClass(byClass(hollow(), "row-detail")[0], "outpost-pick").length;
        focus(input);
        input.value = "4";
        input.listeners.input({ target: input });
        await click(buttonNamed(lineIn(hollow(), "Add a unit"), "Priest"));
        await until(
            () => byClass(byClass(hollow(), "row-detail")[0], "outpost-pick").length === unitsBefore + 1,
            "the added unit"
        );
        assert.ok(outpostRow(pane, "Grassy Path") === first, "Grassy Path's line is the same line");
        assert.equal(takenOut(), 0, "it stayed in the page");
        assert.equal(input.value, "4", "with what is typed in it");
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: Populate adds on one press; when it would remove units it asks in the tray first", async () => {
    const saved = unitArrays();
    try {
        gga.RoyalG[6] = [];
        gga.RoyalG[7] = [];
        const { root } = await openOutposts();
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        await click(buttonNamed(root, "Populate"));
        await until(() => gga.RoyalG[6].length === 22, "W1's two outposts populated");

        gga.RoyalG[6] = Array(30).fill(4);
        gga.RoyalG[7] = Array(30).fill(1);
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        const before = writes();
        click(buttonNamed(root, "Populate"));
        await tick();
        assert.match(trayLine(root), /^Populate removes \d+ map units\. Go on\?$/);
        assert.equal(writes(), before, "the press only asks");
        await yes(root);
        await until(() => gga.RoyalG[6].length === 22, "populated on the answer");
    } finally {
        putUnitArrays(saved);
    }
});

// Review of #120: Populate asked about the units it last read, then removed the ones the game added since unasked.
test("outposts: Populate removes no units the game added since the page read them, unasked", async () => {
    const saved = unitArrays();
    gga.RoyalG[6] = [...Array(10).fill(4), ...Array(8).fill(6)];
    gga.RoyalG[7] = Array(18).fill(1);
    try {
        const { root } = await openOutposts();
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        // Units added in game: Populate's counts no longer keep them all.
        gga.RoyalG[6] = Array(30).fill(4);
        gga.RoyalG[7] = Array(30).fill(1);
        const populate = buttonNamed(root, "Populate");
        await click(populate);
        await until(() => /account-btn--(success|error)/.test(classes(populate)), "Populate to finish");
        assert.equal(gga.RoyalG[6].length, 30, "no unit is taken away");
        assert.match(classes(populate), /account-btn--error/);
    } finally {
        putUnitArrays(saved);
    }
});

test("outposts: Reset to the game's asks in the tray first", async () => {
    const { root } = await openOutposts();
    const before = writes();
    click(buttonNamed(root, "Reset to the game's"));
    await tick();
    assert.equal(trayLine(root), "Put every map unit back where the game puts it?");
    assert.equal(writes(), before);
    click(buttonNamed(root, "Cancel"));
});

test("outposts: a refused Glorified flip says why on the outpost", async () => {
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const restore = refuseWrites(gga.RoyalMaps[1], 12);
    try {
        await flip(lineIn(outpost, "Glorified"), false);
        await until(() => /Glorified not saved: game kept old value/.test(says(outpost)), "the reason");
    } finally {
        restore();
    }
});

test("outposts: a map's kills save toward building, and a refused Build says why", async () => {
    const before = copy(gga.RoyalMaps[3]);
    const { pane } = await openOutposts();
    const row = opened(rowNamed(pane, "Grassy Ridge"));
    try {
        typeAndEnter(row, 100);
        await settled(row);
        assert.deepEqual([...gga.RoyalMaps[3]], [100]);
        const restore = refuseWrites(gga.RoyalMaps, 3);
        try {
            await click(buttonNamed(row, "Build"));
            await until(() => /Not built: game kept old value/.test(says(row)), "the reason");
            assert.deepEqual(unhandled, []);
        } finally {
            restore();
        }
    } finally {
        gga.RoyalMaps[3] = before;
    }
});
