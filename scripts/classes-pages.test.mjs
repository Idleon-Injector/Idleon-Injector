// The Classes pages on the fake game (the game's real masterclass lists, classes-game.mjs), driven the way the player
// drives them: each masterclass is one sidebar entry with the game's screens as tabs, every save lands where the game
// keeps it, and a tool that takes things away asks in the tray first.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

const GRIMOIRE = "src/ui/pages/classes/grimoire/1-grimoire.js";
const MASTERCLASS_AUTOMATION = "src/ui/pages/automation/masterclasses/masterclasses.js";
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
const { requestLimit } = await importRepo("src/ui/services/api.js");
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
// What a field shows now (a big number short, as the row writes it: "20M").
const showing = (input) => String(input.value ?? attr(input, "value"));
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
// With `landing`, a write lands as landing(value) instead: the level changes, but not to what was asked.
const refuseWrites = (list, index, landing = null) => {
    let kept = list[index];
    const set = (value) => landing && (kept = landing(value));
    Object.defineProperty(list, index, { get: () => kept, set, configurable: true });
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
// Reads of one game path come back with no value, until restored.
const emptyReadsOf = (path) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) =>
        String(url).includes("/gga/read") && JSON.parse(options?.body ?? "{}").path === `gga.${path}`
            ? new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
            : realFetch(url, options);
    return () => (globalThis.fetch = realFetch);
};
// The requests to one route fail, until restored.
const failRoute = (route) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) =>
        String(url).includes(route)
            ? new Response(JSON.stringify({ error: "the game refused" }), { status: 500 })
            : realFetch(url, options);
    return () => (globalThis.fetch = realFetch);
};
// Writes whose request matches `match` (url, body) wait until released; `reads` logs the reads made meanwhile.
// While held, no request times out: on a busy machine a long hold would fail the held write while it still lands, and
// the page then goes on as if it hadn't, which is what the request limit is for in the game, not here.
const holdWritesTo = (match) => {
    const realFetch = globalThis.fetch;
    const limit = requestLimit.timeoutMs;
    requestLimit.timeoutMs = 0;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    const reads = [];
    const bodies = [];
    globalThis.fetch = async (url, options) => {
        const body = String(options?.body ?? "");
        if (String(url).includes("/write") && match(String(url), body)) {
            held++;
            bodies.push(body);
            await gate;
        } else if (held && String(url).includes("/read")) reads.push(body);
        return realFetch(url, options);
    };
    return {
        held: () => held,
        reads,
        bodies,
        release: () => {
            globalThis.fetch = realFetch;
            requestLimit.timeoutMs = limit;
            release();
        },
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

test("Classes is four systems, each with the game's screens as tabs; their automation is in Automation", async () => {
    const { buildMenuTree } = await importRepo("src/ui/menu/menuModel.js");
    const pages = await Promise.all(
        [GRIMOIRE, MASTERCLASS_AUTOMATION, COMPASS, TESSERACT, ROYAL_ARMORY].map(
            async (file) => (await importRepo(file)).default
        )
    );
    const classesEntry = buildMenuTree(pages).find((entry) => entry.id === "classes");
    assert.deepEqual(
        classesEntry.systems.map((system) => [system.name, system.pages.length]),
        [
            ["Grimoire", 1],
            ["Compass", 1],
            ["Tesseract", 1],
            ["Royal Armory", 1],
        ]
    );
    const tabsOf = (id) => pages.find((page) => page.id === id).tabs.map((tab) => tab.label);
    assert.deepEqual(tabsOf("classes.grimoire"), ["Upgrades", "Bones"]);
    const automation = pages.find((page) => page.id === "automation.masterclasses");
    assert.equal(automation.world, "automation", "the masterclass automation lives in the Automation section");
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
        await click(buttonNamed(root, "Refresh"));
        await until(
            () => showing(fieldsOf(rowNamed(pane, "Ribbon Shelf"))[0]) === "9",
            "Ribbon Shelf to show the 9 the game holds"
        );
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

// Review of #239: a failed save that still changed the level clears the game's level total; one that changed
// nothing leaves it.
test("grimoire: a refused level save says why, and the game counts its levels again only if it changed", async () => {
    const { pane } = await openPane(GRIMOIRE, "Upgrades");
    const row = rowNamed(pane, "Wraith Accuracy");
    const level = gga.Grimoire[1];
    gga.DNSM.h.GrimoireTotLV = 1234;
    let restore = refuseWrites(gga.Grimoire, 1);
    try {
        typeAndEnter(row, 66);
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.equal(gga.DNSM.h.GrimoireTotLV, 1234, "nothing changed: the total stays");
        restore();
        restore = refuseWrites(gga.Grimoire, 1, (value) => value + 1);
        typeAndEnter(row, 67);
        await until(() => gga.Grimoire[1] === 68, "the save to land as 68");
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.equal(
            gga.DNSM.h.GrimoireTotLV,
            undefined,
            "the level changed: the total is gone though the save failed"
        );
    } finally {
        restore();
        gga.Grimoire[1] = level;
    }
});

// Master's Set all (#240) on a masterclass list: each line saves through its row, so the game's total goes too.
test("grimoire: Set all gives the lines without a max the number, Stop at max the capped ones their max", async () => {
    const saved = copy(gga.Grimoire);
    try {
        const { root } = await openPane(GRIMOIRE, "Upgrades");
        gga.DNSM.h.GrimoireTotLV = 1234;
        const row = byClass(root, "account-setall-row").find((node) => !attr(node, "hidden"));
        const field = elements(row).find((node) => node.nodeName === "input");
        field.value = "70";
        field.listeners.input({ target: field });
        await click(buttonNamed(row, "Set all"));
        await click(buttonNamed(root, "Stop at max"));
        await until(() => gga.Grimoire[0] === 70, "Wraith Damage (no max) to 70");
        assert.equal(gga.Grimoire[4], 1, "Ribbon Shelf stops at its max");
        assert.equal(gga.Grimoire[5], 50, "Ribbon Winning stops at its max");
        assert.equal(gga.DNSM.h.GrimoireTotLV, undefined, "the game counts its levels again");
    } finally {
        saved.forEach((level, n) => (gga.Grimoire[n] = level));
    }
});

// Review of #239 round 3: a read back with no value is one that can't be read, not level 0, so the total goes.
test("grimoire: a refused save whose level can't be read back still clears the game's total", async () => {
    const level = gga.Grimoire[1];
    gga.Grimoire[1] = 0;
    const { pane } = await openPane(GRIMOIRE, "Upgrades");
    const row = rowNamed(pane, "Wraith Accuracy");
    await until(() => showing(fieldsOf(row)[0]) === "0", "the level the game holds");
    gga.DNSM.h.GrimoireTotLV = 1234;
    const restore = refuseWrites(gga.Grimoire, 1);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) =>
        String(url).includes("/gga/read") && JSON.parse(options?.body ?? "{}").path === "gga.Grimoire"
            ? new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
            : realFetch(url, options);
    try {
        typeAndEnter(row, 5);
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.equal(gga.DNSM.h.GrimoireTotLV, undefined, "unknown level: the total goes");
    } finally {
        globalThis.fetch = realFetch;
        restore();
        gga.Grimoire[1] = level;
    }
});

// Review of #239: a Max all with nothing to change writes nothing and leaves the game's total alone.
test("grimoire: Max all with every upgrade at its max writes nothing", async () => {
    const saved = copy(gga.Grimoire);
    try {
        const { root } = await openPane(GRIMOIRE, "Upgrades");
        await click(buttonNamed(root, "Max all"));
        await until(() => gga.Grimoire[5] === 50, "the first Max all");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        gga.DNSM.h.GrimoireTotLV = 77;
        const before = writes();
        await click(buttonNamed(root, "Max all"));
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(writes(), before, "nothing written");
        assert.equal(gga.DNSM.h.GrimoireTotLV, 77, "the game's total stays");
    } finally {
        saved.forEach((level, n) => (gga.Grimoire[n] = level));
    }
});

// #252: a row save and Max all take turns, so a level a row save lowers while Max all waits is filled again, and the
// game counts its levels again after Max all's own write.
test("grimoire: Max all pressed while a row save runs waits for it, then fills that upgrade too", async () => {
    const saved = copy(gga.Grimoire);
    try {
        const { root, pane } = await openPane(GRIMOIRE, "Upgrades");
        await click(buttonNamed(root, "Max all"));
        await until(() => gga.Grimoire[5] === 50, "every capped upgrade at its max");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const row = rowNamed(pane, "Ribbon Winning");
        const from = requests.length;
        const hold = holdWritesTo((url, body) => url.endsWith("/gga/write") && body.includes("Grimoire[5]"));
        try {
            typeAndEnter(row, 3);
            await until(() => hold.held() === 1, "the row save to reach the game");
            click(buttonNamed(root, "Max all"));
            await tick();
        } finally {
            hold.release();
        }
        await until(() => gga.Grimoire[5] === 50, "Max all to fill it again after the row save");
        await until(() => stateOf(row) === "success", "the row save to end");
        // The row's write, then Max all's, then the total goes after it.
        const after = requests.slice(from).filter((entry) => /\/gga\/(write|write-many|delete)$/.test(entry));
        const bulk = after.findIndex((entry) => entry.endsWith("/write-many"));
        assert.ok(after.findIndex((entry) => entry.endsWith("/gga/write")) < bulk, "the row save first");
        await until(
            () => requests.slice(from).filter((entry) => entry.endsWith("/gga/delete")).length >= 2,
            "the total to go after Max all's write too"
        );
    } finally {
        saved.forEach((level, n) => (gga.Grimoire[n] = level));
    }
});

// #252: a Max all that saved the levels but couldn't clear the game's total clears it on the next press.
test("grimoire: a total Max all couldn't clear is cleared by the next Max all, with no level to change", async () => {
    const saved = copy(gga.Grimoire);
    try {
        const { root } = await openPane(GRIMOIRE, "Upgrades");
        gga.Grimoire[5] = 3;
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        gga.DNSM.h.GrimoireTotLV = 77;
        const restore = failRoute("/gga/delete");
        const maxAll = buttonNamed(root, "Max all");
        try {
            click(maxAll);
            await until(() => /account-btn--error/.test(classes(maxAll)), "Max all to fail");
        } finally {
            restore();
        }
        assert.equal(gga.Grimoire[5], 50, "the levels saved");
        assert.equal(gga.DNSM.h.GrimoireTotLV, 77, "the total stayed");
        await click(maxAll);
        await until(() => gga.DNSM.h.GrimoireTotLV === undefined, "the next press to clear it");
    } finally {
        saved.forEach((level, n) => (gga.Grimoire[n] = level));
    }
});

// #252: when Max all's write and the clearing of the total both fail, the write's failure is the one said.
test("grimoire: a Max all whose write and clearing both fail says the write's failure", async () => {
    const saved = copy(gga.Grimoire);
    try {
        const { root } = await openPane(GRIMOIRE, "Upgrades");
        gga.Grimoire[4] = 0;
        gga.Grimoire[5] = 3;
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        const refuse = refuseWrites(gga.Grimoire, 5);
        const restore = failRoute("/gga/delete");
        const maxAll = buttonNamed(root, "Max all");
        try {
            click(maxAll);
            await until(() => /account-btn--error/.test(classes(maxAll)), "Max all to fail");
            await tick();
            assert.match(text(root), /Write mismatch at Grimoire\[5\]/, "the refused write is said");
            assert.doesNotMatch(text(root), /the game refused/, "not the clearing's failure");
        } finally {
            restore();
            refuse();
        }
    } finally {
        saved.forEach((level, n) => (gga.Grimoire[n] = level));
    }
});

// #252: the shared Set all waits for a read that works, as the tabs' own tools do.
test("grimoire: Set all waits while the page's read failed", async () => {
    const { root } = await openPane(GRIMOIRE, "Upgrades");
    const setAll = buttonNamed(
        byClass(root, "account-setall-row").find((node) => !attr(node, "hidden")),
        "Set all"
    );
    const restore = failRoute("/gga/read");
    try {
        click(buttonNamed(root, "Refresh"));
        await until(() => attr(setAll, "aria-disabled") === "true", "Set all to wait");
        assert.equal(attr(buttonNamed(root, "Max all"), "aria-disabled"), "true", "as Max all does");
    } finally {
        restore();
    }
    await click(buttonNamed(root, "Refresh"));
    await until(() => attr(setAll, "aria-disabled") === "false", "a read that works to let it go");
});

// #252: an Undo of a Grimoire level (or a map's kills) clears the game's total built from it, as a save does.
test("an undo of a Grimoire level or a map bonus clears the game's total built from it", async () => {
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const [level, kills] = [gga.Grimoire[1], gga.MapBon[1][0]];
    try {
        for (const [path, value, cache] of [
            ["Grimoire[1]", level + 1, "GrimoireTotLV"],
            ["MapBon[1][0]", kills + 1, "ArcMultBon"],
        ]) {
            await withAction({ label: path }, () => writeVerified(path, value));
            const [action] = (await fetchChanges()).actions;
            gga.DNSM.h[cache] = 99;
            await undoAction(action.id);
            assert.equal(gga.DNSM.h[cache], undefined, `${cache} is cleared`);
        }
        assert.equal(gga.Grimoire[1], level);
        assert.equal(gga.MapBon[1][0], kills);
    } finally {
        gga.Grimoire[1] = level;
        gga.MapBon[1][0] = kills;
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

// Review of #239 round 2: a shelf that adds map units (28) rebuilds them only when its level changed.
const REBUILD_SHELF = 28;
const armoryUnits = () => {
    gga.RoyalG[6] = [...gga.RoyalG[6], 4];
    gga.RoyalG[7] = [...gga.RoyalG[7], 1];
    return unitArrays();
};

test("royal armory: a refused save on a unit shelf leaves the units where they are", async () => {
    const saved = unitArrays();
    const n = gga.CustomLists.h.Research[43][REBUILD_SHELF - 1];
    const restore = refuseWrites(gga.RoyalG[2], n);
    try {
        const { pane } = await openPane(ROYAL_ARMORY, "Upgrades");
        const placed = armoryUnits();
        const row = rowsIn(pane)[REBUILD_SHELF - 1];
        typeAndEnter(row, Number(gga.RoyalG[2][n] ?? 0) === 0 ? 1 : 0);
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.deepEqual(unitArrays(), placed, "the units stay as placed");
    } finally {
        restore();
        putUnitArrays(saved);
    }
});

test("royal armory: a failed save that still changed a unit shelf builds the units again", async () => {
    const saved = unitArrays();
    const n = gga.CustomLists.h.Research[43][REBUILD_SHELF - 1];
    const level = gga.RoyalG[2][n];
    const maps = copy(gga.RoyalMaps); // the rebuild also sets the slots each Barracks opens
    const restore = refuseWrites(gga.RoyalG[2], n, (value) => value + 1);
    try {
        const { pane } = await openPane(ROYAL_ARMORY, "Upgrades");
        const placed = armoryUnits();
        const row = rowsIn(pane)[REBUILD_SHELF - 1];
        typeAndEnter(row, 1);
        await settled(row);
        assert.equal(stateOf(row), "error");
        await until(() => JSON.stringify(unitArrays()) !== JSON.stringify(placed), "the units built again");
    } finally {
        restore();
        gga.RoyalG[2][n] = level;
        gga.RoyalMaps = maps;
        putUnitArrays(saved);
    }
});

// Review of #239 round 6: "changed" is measured against the game's level just before the save, not the one shown.
test("royal armory: a refused save on a unit shelf the game moved meanwhile leaves the units", async () => {
    const saved = unitArrays();
    const n = gga.CustomLists.h.Research[43][REBUILD_SHELF - 1];
    const level = Number(gga.RoyalG[2][n] ?? 0);
    try {
        const { pane } = await openPane(ROYAL_ARMORY, "Upgrades");
        const row = rowsIn(pane)[REBUILD_SHELF - 1];
        gga.RoyalG[2][n] = level + 1; // the game moved it; the page still shows the old level
        const restore = refuseWrites(gga.RoyalG[2], n);
        const placed = armoryUnits();
        try {
            typeAndEnter(row, level + 2);
            await settled(row);
            assert.equal(stateOf(row), "error");
            assert.deepEqual(unitArrays(), placed, "the refused save changed nothing: the units stay");
        } finally {
            restore();
        }
    } finally {
        gga.RoyalG[2][n] = level;
        putUnitArrays(saved);
    }
});

test("royal armory: Max all leaves the units where they are when no unit shelf changes", async () => {
    const { UNIT_REBUILD_DISPLAY_SHELVES } = await importRepo("src/ui/components/views/account/royalGuardDomain.js");
    const saved = unitArrays();
    const levels = copy(gga.RoyalG[2]);
    const order = gga.CustomLists.h.Research[43];
    const maxOf = (n) => Number(gga.CustomLists.h.ArmoryUpg[n][4]);
    try {
        order.forEach((n) => maxOf(n) < 999999 && (gga.RoyalG[2][n] = maxOf(n)));
        const lowered = order.find(
            (n, position) => !UNIT_REBUILD_DISPLAY_SHELVES.has(position + 1) && maxOf(n) > 1 && maxOf(n) < 999999
        );
        gga.RoyalG[2][lowered] = 0;
        const { root } = await openPane(ROYAL_ARMORY, "Upgrades");
        await click(buttonNamed(root, "Refresh"));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const placed = armoryUnits();
        await click(buttonNamed(root, "Max all"));
        await until(() => gga.RoyalG[2][lowered] === maxOf(lowered), "the lowered upgrade to its max");
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.deepEqual(unitArrays(), placed, "the units stay as placed");
    } finally {
        gga.RoyalG[2] = levels;
        putUnitArrays(saved);
    }
});

// ---- Tesseract › Map Bonuses -------------------------------------------------------------------------------------

const killsSetAll = (root) =>
    byClass(root, "account-setall-row").find((node) => byTag(node, "input")[0]?.attributes?.placeholder === "Kills");
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

// Review of #239: a save that can't clear the game's crystal sums fails, and the line says so.
test("map bonuses: a save whose sums the game can't clear says so on its line", async () => {
    const before = copy(gga.MapBon[1]);
    const { pane } = await openPane(TESSERACT, "Map Bonuses");
    const row = mapRow(pane, 1);
    const restore = failRoute("/gga/delete");
    try {
        typeAndEnter(row, 4321, fieldsOf(row)[2]);
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.equal(gga.MapBon[1][2], 4321, "the kills saved; only the sums didn't clear");
    } finally {
        restore();
        gga.MapBon[1] = before;
    }
});

// #252: a refused save that still changed the kills clears the sums too, and the save's failure is said.
test("map bonuses: a refused save that still changed the kills clears the game's sums", async () => {
    const before = copy(gga.MapBon[1]);
    const { pane } = await openPane(TESSERACT, "Map Bonuses");
    const row = mapRow(pane, 1);
    const restore = refuseWrites(gga.MapBon[1], 0, (value) => value - 2);
    try {
        gga.DNSM.h.ArcMultBon = [75];
        typeAndEnter(row, 4000, fieldsOf(row)[0]);
        await settled(row);
        assert.equal(stateOf(row), "error");
        assert.equal(gga.MapBon[1][0], 3998, "the game kept another number");
        assert.equal(gga.DNSM.h.ArcMultBon, undefined, "the sums are gone");
    } finally {
        restore();
        gga.MapBon[1] = before;
    }
});

test("map bonuses: Set all raising runs on one press; lowering asks in the tray first", async () => {
    const saved = copy(gga.MapBon);
    try {
        const { root } = await openPane(TESSERACT, "Map Bonuses");
        // The map bonuses' own Set all (three kills a line); the shared one stays hidden on this tab.
        const kills = killsSetAll(root);
        const setAll = () => click(buttonNamed(kills, "Set all"));
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
    const { largeFormatter } = await importRepo("src/ui/components/views/account/accountShared.js");
    const shown = () => fieldsOf(mapRow(pane, 1)).map(showing);
    const realFetch = globalThis.fetch;
    let batches = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).endsWith("/game/gga/write-many") && ++batches === 2)
            return new Response(JSON.stringify({ error: "the game refused" }), { status: 500 });
        return realFetch(url, options);
    };
    try {
        const kills = killsSetAll(root);
        const input = byTag(kills, "input")[0];
        input.value = "20000000";
        input.listeners.input({ target: input });
        await click(buttonNamed(kills, "Set all"));
        assert.equal(batches, 2, "the second batch was refused");
        assert.deepEqual([...gga.MapBon[1]], [20000000, 20000000, 20000000], "the first batch landed");
        await until(
            () => JSON.stringify(shown()) === JSON.stringify([...gga.MapBon[1]].map(largeFormatter)),
            "map 1 to show the three kills the game holds"
        );
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
        await until(() => showing(fieldsOf(first)[1]) === "", "the emptied node's box blank");
    } finally {
        saved.forEach((amount, i) => (gga.RoyalG[4][i] = amount));
    }
});

// Empty is already the lowest: − on an Empty node's blank box leaves it Empty; + takes it to 1.
test("nodes: − leaves an Empty node Empty, + fills it to 1", async () => {
    const saved = copy(gga.RoyalG[4]);
    try {
        gga.RoyalG[4][0] = -1;
        const { root, pane } = await openPane(ROYAL_ARMORY, "Nodes");
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        const first = rowsIn(pane)[0];
        const box = fieldsOf(first)[1];
        await until(() => showing(box) === "", "node 1's blank box");
        const press = (label) =>
            elements(box.parentNode)
                .find((node) => node.nodeName === "button" && node.attributes["aria-label"] === label)
                .listeners.click({ preventDefault() {}, currentTarget: null });
        const before = writes();
        focus(box);
        press("Lower");
        first.listeners.keydown({ key: "Enter", target: box, preventDefault() {} });
        await tick();
        assert.equal(showing(box), "");
        assert.equal(writes(), before, "nothing written");
        assert.equal(gga.RoyalG[4][0], -1);

        press("Raise");
        first.listeners.keydown({ key: "Enter", target: box, preventDefault() {} });
        await until(() => gga.RoyalG[4][0] === 1, "+ to fill it to 1");
    } finally {
        saved.forEach((amount, i) => (gga.RoyalG[4][i] = amount));
    }
});

// An Empty node's Collected box is blank (0 is full): left blank it keeps the node Empty, and 0 typed in fills it.
test("nodes: an Empty node shows a blank box; its grade saves alone, and 0 typed in fills it", async () => {
    const saved = copy(gga.RoyalG[4]);
    const grades = copy(gga.RoyalG[5]);
    try {
        gga.RoyalG[4][0] = -1;
        const { root, pane } = await openPane(ROYAL_ARMORY, "Nodes");
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        const first = rowsIn(pane)[0];
        await until(() => showing(fieldsOf(first)[1]) === "", "node 1's blank box");
        assert.equal(text(byClass(first, "account-row__badge")[0]).trim(), "Empty");

        // The grade typed, the blank box left: the node stays Empty.
        typeAndEnter(first, 3, fieldsOf(first)[0]);
        await settled(first);
        assert.equal(stateOf(first), "success");
        assert.equal(gga.RoyalG[5][0], 3);
        assert.equal(gga.RoyalG[4][0], -1);
        assert.equal(showing(fieldsOf(first)[1]), "");

        typeAndEnter(first, 0, fieldsOf(first)[1]);
        await until(() => gga.RoyalG[4][0] === 0, "0 to fill it");
        await until(() => showing(fieldsOf(first)[1]) === "0", "the full node's 0");
        assert.equal(text(byClass(first, "account-row__badge")[0]).trim(), "");
    } finally {
        saved.forEach((amount, i) => (gga.RoyalG[4][i] = amount));
        grades.forEach((grade, i) => (gga.RoyalG[5][i] = grade));
    }
});

// #252: a node whose own save failed while Refill all ran shows the amount the game holds after it, not a full node.
test("nodes: a node saved meanwhile shows the amount the game holds after Refill all", async () => {
    const saved = copy(gga.RoyalG[4]);
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    try {
        const { root, pane } = await openPane(ROYAL_ARMORY, "Nodes");
        const row = rowsIn(pane)[1];
        await until(() => showing(fieldsOf(row)[1]) === "97", "node 2's 97");
        globalThis.fetch = async (url, options) => {
            const body = String(options?.body ?? "");
            if (!String(url).endsWith("/write-many") || !body.includes("RoyalG[4][1]")) return realFetch(url, options);
            // Node 2's own save never reaches the game.
            if (!body.includes("RoyalG[4][2]"))
                return new Response(JSON.stringify({ error: "the connection dropped" }), { status: 500 });
            // Refill all's write lands, then the game collects 2 from node 2 before the page reads it.
            held++;
            await gate;
            const response = await realFetch(url, options);
            gga.RoyalG[4][1] = 2;
            return response;
        };
        const refill = buttonNamed(root, "Refill all");
        click(refill);
        await until(() => held === 1, "Refill all's write to reach the game");
        typeAndEnter(row, 50, fieldsOf(row)[1]);
        await settled(row);
        assert.equal(stateOf(row), "error");
        release();
        await until(() => /account-btn--(success|error)/.test(classes(refill)), "Refill all to finish");
        // Escape puts the line back on what it holds for the node (the failed save left the typed 50).
        row.listeners.keydown({ key: "Escape", target: fieldsOf(row)[1], preventDefault() {} });
        await until(() => showing(fieldsOf(row)[1]) === "2", "node 2 to show the 2 the game holds");
    } finally {
        globalThis.fetch = realFetch;
        release();
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
        const line = lineIn(outpost, "Slot 1");
        click(stepNamed(line, "Surveyor"));
        // The pick's save has ended, its lost answer handled, before it is checked.
        await until(() => /account-row--(success|error)/.test(attr(line, "class")), "the pick's save to end");
        assert.match(attr(line, "class"), /account-row--success/);
        assert.equal(String(gga.RoyalMaps[1][11])[0], "5", "the game took it");
        assert.equal(picked(line), "Surveyor");
        assert.doesNotMatch(says(outpost), /not saved/);
    } finally {
        globalThis.fetch = realFetch;
        gga.RoyalMaps[1][11] = before;
    }
});

// Review of #239 round 4: a slot picked while a lower Barracks locks it is refused, not written past the lock.
test("outposts: a slot picked while the Barracks goes down stays locked", async () => {
    const before = copy(gga.RoyalMaps[1]);
    gga.RoyalMaps[1][0] = 1;
    gga.RoyalMaps[1][11] = 221111111;
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const hold = holdWritesTo((url, body) => body.includes("RoyalMaps[1][11]"));
    try {
        typeAndEnter(outpost, 0);
        await until(() => hold.held() === 1, "the slot fix for Barracks 0 to start");
        const picking = click(stepNamed(lineIn(outpost, "Slot 2"), "Guard"));
        await tick();
        hold.release();
        await picking;
        await until(() => /Opens at Barracks 1/.test(says(outpost)), "the pick refused");
        assert.equal(gga.RoyalMaps[1][11], 211111111, "slot 2 stays locked");
    } finally {
        hold.release();
        gga.RoyalMaps[1] = before;
    }
});

// Review of #239 round 4: a unit shelf's rebuild and an outpost's unit change take turns.
test("outposts: Add waits for a unit shelf's rebuild, then adds to the rebuilt lists", async () => {
    const saved = unitArrays();
    const maps = copy(gga.RoyalMaps);
    const n = gga.CustomLists.h.Research[43][REBUILD_SHELF - 1];
    const level = gga.RoyalG[2][n];
    const hold = holdWritesTo((url, body) => url.endsWith("/write-many") && body.includes("RoyalG["));
    try {
        const { root, pane } = await openPane(ROYAL_ARMORY, "Upgrades");
        armoryUnits(); // a placement the rebuild changes, so a stale copy would show
        const row = rowsIn(pane)[REBUILD_SHELF - 1];
        typeAndEnter(row, Number(level ?? 0) + 1);
        await until(() => hold.held() === 1, "the rebuild to start");
        tabNamed(root, "Outposts").listeners.click({});
        const outpost = opened(outpostRow(paneOf(root, "Outposts"), "Grassy Hollow"));
        await new Promise((resolve) => setTimeout(resolve, 50));
        const adding = click(buttonNamed(lineIn(outpost, "Add a unit"), "Knight"));
        await new Promise((resolve) => setTimeout(resolve, 300));
        hold.release();
        await adding;
        await settled(row);
        // Each list ends as the rebuild wrote it, and the two Add changed have its Knight (6) on Grassy Hollow (2) last.
        const listOf = (path) => gga.RoyalG[Number(/RoyalG\[(\d+)\]$/.exec(path)[1])];
        const rebuilt = JSON.parse(hold.bodies[0]).writes.filter(({ path }) => /RoyalG\[\d+\]$/.test(path));
        const grownNow = () => rebuilt.filter(({ path, value }) => listOf(path).length === value.length + 1);
        await until(() => grownNow().length === 2, "Add's two lists: the rebuilt ones with one more unit");
        const grown = grownNow();
        grown.forEach(({ path, value }) =>
            assert.deepEqual([...listOf(path)].slice(0, -1), value, `${path} keeps what the rebuild wrote`)
        );
        assert.deepEqual(grown.map(({ path }) => listOf(path).at(-1)).sort(), [2, 6], "the Knight on Grassy Hollow");
    } finally {
        hold.release();
        gga.RoyalG[2][n] = level;
        gga.RoyalMaps = maps;
        putUnitArrays(saved);
    }
});

// Review of #239 round 5: a Barracks save that landed but failed still locks the slots it no longer opens.
test("outposts: a failed Barracks save that landed still locks the slots", async () => {
    const before = copy(gga.RoyalMaps[1]);
    gga.RoyalMaps[1][0] = 1;
    gga.RoyalMaps[1][11] = 241111111;
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        return String(url).includes("/write") && String(options?.body ?? "").includes("RoyalMaps[1][0]")
            ? new Response(JSON.stringify({ error: "the connection dropped" }), { status: 500 })
            : response;
    };
    try {
        typeAndEnter(outpost, 0);
        await until(() => gga.RoyalMaps[1][0] === 0, "the Barracks save to land");
        await until(() => gga.RoyalMaps[1][11] === 211111111, "slot 2 locked again");
    } finally {
        globalThis.fetch = realFetch;
        gga.RoyalMaps[1] = before;
    }
});

// Review of #239 round 6: a Barracks read with no value never locks slots.
test("outposts: a Barracks save whose level can't be read back leaves the slots", async () => {
    const before = copy(gga.RoyalMaps[1]);
    gga.RoyalMaps[1][0] = 1;
    gga.RoyalMaps[1][11] = 241111111;
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const restore = emptyReadsOf("RoyalMaps[1][0]");
    try {
        typeAndEnter(outpost, 2);
        await until(() => gga.RoyalMaps[1][0] === 2, "Barracks 2 saved");
        await settled(outpost);
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(String(gga.RoyalMaps[1][11])[1], "4", "slot 2 keeps its Guard");
    } finally {
        restore();
        gga.RoyalMaps[1] = before;
    }
});

// Review of #239 round 6: Add changes the unit lists only when both read back.
test("outposts: Add with a unit list that can't be read writes nothing", async () => {
    const saved = unitArrays();
    try {
        const { pane } = await openOutposts();
        const outpost = opened(outpostRow(pane, "Grassy Hollow"));
        await new Promise((resolve) => setTimeout(resolve, 50));
        const before = unitArrays();
        const restore = emptyReadsOf("RoyalG[6]");
        try {
            await click(buttonNamed(lineIn(outpost, "Add a unit"), "Knight"));
            await until(() => /Couldn't read the units/.test(says(outpost)), "the reason");
            assert.deepEqual(unitArrays(), before, "both lists stay as they were");
        } finally {
            restore();
        }
    } finally {
        putUnitArrays(saved);
    }
});

// Review of #239: the slots followed the Barracks level from before the save.
test("outposts: Barracks opens and locks the slots with the level just saved", async () => {
    const before = copy(gga.RoyalMaps[1]);
    try {
        const { pane } = await openOutposts();
        const outpost = opened(outpostRow(pane, "Grassy Path"));
        typeAndEnter(outpost, 5);
        await until(() => gga.RoyalMaps[1][11] === 222222111, "Barracks 5 to open six slots");
        await settled(outpost);
        await new Promise((resolve) => setTimeout(resolve, 1300));
        typeAndEnter(outpost, 0);
        await until(() => gga.RoyalMaps[1][11] === 211111111, "Barracks 0 to lock all but the first");
        assert.equal(gga.RoyalMaps[1][0], 0);
    } finally {
        gga.RoyalMaps[1] = before;
    }
});

// Review of #239: the game keeps its unit totals per map; a unit change clears them so it counts again.
test("outposts: adding or removing a unit clears the game's unit totals", async () => {
    const saved = unitArrays();
    try {
        const { pane } = await openOutposts();
        const outpost = opened(outpostRow(pane, "Grassy Hollow"));
        await new Promise((resolve) => setTimeout(resolve, 50));
        gga.DNSM.h.TotUnitzAllMapz = { h: { 2: [1, 0, 0, 0] } };
        await click(buttonNamed(lineIn(outpost, "Add a unit"), "Knight"));
        await until(() => gga.DNSM.h.TotUnitzAllMapz === undefined, "the totals to go after Add");
        gga.DNSM.h.TotUnitzAllMapz = { h: { 2: [1, 0, 0, 0] } };
        await until(() => lineIn(outpost, "Unit 2"), "the added unit");
        await click(buttonNamed(lineIn(outpost, "Unit 2"), "Remove"));
        await until(() => gga.DNSM.h.TotUnitzAllMapz === undefined, "the totals to go after Remove");
    } finally {
        putUnitArrays(saved);
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
    assert.equal(trayLine(root), "Reset map units to the game's?");
    assert.equal(writes(), before);
    click(buttonNamed(root, "Cancel"));
});

// Review of #239 round 5: Reset builds the units from the shelf levels; a read without them writes nothing.
test("outposts: Reset with no upgrade levels read back writes nothing", async () => {
    const saved = unitArrays();
    const { root } = await openOutposts();
    armoryUnits();
    const placed = unitArrays();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) =>
        String(url).includes("/gga/read") && JSON.parse(options?.body ?? "{}").path === "gga.RoyalG"
            ? new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
            : realFetch(url, options);
    try {
        const before = writes();
        click(buttonNamed(root, "Reset to the game's"));
        await tick();
        await yes(root);
        await until(() => /upgrade levels/.test(trayLine(root) + text(root)), "the reason");
        assert.equal(writes(), before, "nothing written");
        assert.deepEqual(unitArrays(), placed, "the units stay");
    } finally {
        globalThis.fetch = realFetch;
        putUnitArrays(saved);
    }
});

// #252: an older type pick that fails after a newer one saved says nothing over the newer one.
test("outposts: an older type pick that fails after a newer one saved says nothing over it", async () => {
    const before = gga.RoyalMaps[1][10];
    const { pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const line = lineIn(outpost, "Type");
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let first = true;
    // The older pick's read back, once its write was refused: its save ends right after.
    let readBack = false;
    globalThis.fetch = async (url, options) => {
        const body = String(options?.body ?? "");
        if (String(url).endsWith("/gga/write") && body.includes("RoyalMaps[1][10]") && first) {
            first = false;
            await gate;
            return new Response(JSON.stringify({ error: "the game refused" }), { status: 500 });
        }
        if (!first && String(url).endsWith("/gga/read") && body.includes("RoyalMaps[1][10]")) readBack = true;
        return realFetch(url, options);
    };
    try {
        click(stepNamed(line, "Resource Depot"));
        await tick();
        click(stepNamed(line, "Savage"));
        await until(() => gga.RoyalMaps[1][10] === 2, "the newer pick to save");
        release();
        await until(() => readBack, "the older pick's save to read the game back");
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.doesNotMatch(attr(line, "class"), /account-row--error/, "the line isn't shown failed");
        assert.doesNotMatch(says(outpost), /not saved/, "the older failure isn't said");
        assert.equal(picked(line), "Savage");
    } finally {
        globalThis.fetch = realFetch;
        release();
        gga.RoyalMaps[1][10] = before;
    }
});

// #252: Reset to the game's and a slot pick take turns, so the pick isn't put back by Reset's slot value.
test("outposts: a slot pick made while Reset to the game's saves runs after it, and keeps the pick", async () => {
    const saved = unitArrays();
    const before = copy(gga.RoyalMaps[1]);
    gga.RoyalMaps[1][0] = 1;
    gga.RoyalMaps[1][11] = 211111111;
    const { root, pane } = await openOutposts();
    const outpost = opened(outpostRow(pane, "Grassy Path"));
    const hold = holdWritesTo((url, body) => url.endsWith("/write-many") && body.includes("RoyalMaps[1][11]"));
    try {
        click(buttonNamed(root, "Reset to the game's"));
        await tick();
        await yes(root);
        await until(() => hold.held() === 1, "Reset's write to reach the game");
        click(stepNamed(lineIn(outpost, "Slot 1"), "Trader"));
        await new Promise((resolve) => setTimeout(resolve, 100));
        hold.release();
        await until(() => gga.RoyalMaps[1][11] === 321111111, "the pick on top of Reset's slots");
    } finally {
        hold.release();
        gga.RoyalMaps[1] = before;
        putUnitArrays(saved);
    }
});

// #252: Reset says how many units it takes away, as Populate does, and stops when more would go by the time it runs.
test("outposts: Reset says how many units it removes, and stops when more would go by then", async () => {
    const saved = unitArrays();
    const maps = copy(gga.RoyalMaps);
    try {
        gga.RoyalG[6] = Array(30).fill(4);
        gga.RoyalG[7] = Array(30).fill(1);
        const { root } = await openOutposts();
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        click(buttonNamed(root, "Reset to the game's"));
        await tick();
        assert.match(trayLine(root), /^Reset map units to the game's\? \d+ units will be removed\.$/);
        gga.RoyalG[6] = Array(40).fill(4);
        gga.RoyalG[7] = Array(40).fill(1);
        const placed = unitArrays();
        await yes(root);
        const reset = buttonNamed(root, "Reset to the game's");
        await until(() => /account-btn--(success|error)/.test(classes(reset)), "Reset to finish");
        assert.match(classes(reset), /account-btn--error/);
        assert.deepEqual(unitArrays(), placed, "no unit is taken away");
    } finally {
        gga.RoyalMaps = maps;
        putUnitArrays(saved);
    }
});

// #252: Populate counts what it removes from the unit counts, and refuses a huge count before it builds anything.
test("outposts: Populate refuses more than 100 of a kind per outpost, and writes nothing", async () => {
    const saved = unitArrays();
    try {
        const { root } = await openOutposts();
        const field = elements(root).find(
            (node) => node.nodeName === "input" && /per outpost$/.test(String(node.attributes["aria-label"] ?? ""))
        );
        field.value = "1000000";
        field.listeners.input({ target: field });
        const before = writes();
        const populate = buttonNamed(root, "Populate");
        click(populate);
        await until(() => /account-btn--(success|error)/.test(classes(populate)), "Populate to finish");
        assert.match(classes(populate), /account-btn--error/);
        assert.match(text(root), /max 100 of each/);
        assert.equal(writes(), before, "nothing written");
    } finally {
        putUnitArrays(saved);
    }
});

// #252: Populate takes the outposts built when it runs, not those of the page's last read.
test("outposts: Populate puts units on an outpost built since the page read them", async () => {
    const saved = unitArrays();
    const maps = copy(gga.RoyalMaps);
    try {
        gga.RoyalG[6] = [];
        gga.RoyalG[7] = [];
        const { root } = await openOutposts();
        await click(buttonNamed(root, "Refresh"));
        await until(() => pageRead(root), "the reload");
        gga.RoyalMaps[3] = [...gga.RoyalMaps[1]];
        await click(buttonNamed(root, "Populate"));
        await until(() => gga.RoyalG[7].includes(3), "units on the new outpost");
        assert.equal(gga.RoyalG[6].length, 33, "eleven on each of the three outposts");
    } finally {
        gga.RoyalMaps = maps;
        putUnitArrays(saved);
    }
});

// Review of #239 round 5: a Build pressed again on the old row leaves the built outpost alone.
test("outposts: Build on a map built meanwhile leaves the outpost as it is", async () => {
    const before = copy(gga.RoyalMaps[3]);
    const { pane } = await openOutposts();
    const row = opened(rowNamed(pane, "Grassy Ridge"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const build = buttonNamed(row, "Build");
    try {
        await click(build);
        await until(() => gga.RoyalMaps[3].length > 1, "the outpost built");
        gga.RoyalMaps[3][0] = 7;
        await click(build);
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(gga.RoyalMaps[3][0], 7, "the Barracks level stays");
    } finally {
        gga.RoyalMaps[3] = before;
    }
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

// Review of #239 round 4: a kills save waits for Build, then stops, as [0] is the Barracks level now.
test("outposts: a kills save made while Build saves never lands on the Barracks", async () => {
    const before = copy(gga.RoyalMaps[3]);
    const { pane } = await openOutposts();
    const row = opened(rowNamed(pane, "Grassy Ridge"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const hold = holdWritesTo((url, body) => body.includes("RoyalMaps[3]"));
    try {
        const building = click(buttonNamed(row, "Build"));
        await until(() => hold.held() === 1, "Build to start");
        typeAndEnter(row, 100);
        await new Promise((resolve) => setTimeout(resolve, 100));
        hold.release();
        await building;
        await until(() => gga.RoyalMaps[3].length > 1, "the outpost built");
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.equal(gga.RoyalMaps[3][0], 0, "the Barracks level stays 0");
    } finally {
        hold.release();
        gga.RoyalMaps[3] = before;
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
