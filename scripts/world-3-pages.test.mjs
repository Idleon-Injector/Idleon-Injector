// World 3 pages on the fake game (review sweep, world-3a): a change starts from what the game holds now, goes to the
// character or slot it was asked for, and its result shows where the player acted.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
const gga = game.gga;
globalThis.requestAnimationFrame ??= (fn) => setTimeout(fn, 0);

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => {
    const value = node?.attributes?.class;
    return String((typeof value === "function" ? value() : value) ?? "");
};
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));
const buttonIn = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const click = (node) => node.listeners.click({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 });

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root) && pageRead(root), `${file} to load`);
    return root;
};

// The game answers the write requests whose body matches with a failure, as when the connection drops.
const failWrites = (pattern) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && pattern.test(options.body)) {
            return new Response(JSON.stringify({ error: "the game refused" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        }
        return realFetch(url, options);
    };
    return () => (globalThis.fetch = realFetch);
};
const quietly = async (task) => {
    const realError = console.error;
    console.error = () => {};
    try {
        return await task();
    } finally {
        console.error = realError;
    }
};
const settledButton = (node) => /account-btn--(success|error)/.test(classes(node));
const writeCount = () => requests.filter((entry) => entry.includes("/write")).length;

// A row's Remove takes the item off the list, so it asks "Click again" first; the second press removes it.
const removeTwice = (node) => {
    click(node);
    return click(node);
};
// The first press only asks and writes nothing. The ask runs out after a few seconds like every "Click again",
// and the press after that asks again.
const removeAsksFirst = (t, remove, question) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
        const before = writeCount();
        click(remove);
        assert.equal(remove.attributes["data-again"], "Click again", "the first press asks");
        assert.equal(remove.attributes["aria-label"], `Click again to ${question}`);
        t.mock.timers.tick(4000);
        assert.equal(remove.attributes["data-again"], undefined, "the ask runs out");
        click(remove);
        assert.equal(remove.attributes["data-again"], "Click again", "the press after that asks again");
        assert.equal(writeCount(), before, "nothing was written");
    } finally {
        t.mock.timers.reset();
    }
};

const HAT_RACK = "src/ui/pages/world-3/hat-rack/hat-rack.js";
const hat = (n) => `EquipmentHatsPrem${n}`;
const rackRows = (root) => byClass(root, "hat-rack-row");
const rackRowFor = (root, itemId) =>
    rackRows(root).find((row) => text(byClass(row, "account-row__sub-label")[0]) === itemId);
const setRack = (rack, slab) => {
    gga.Spelunk[46] = rack;
    gga.Cards[1] = slab;
};

test("Hat Rack: Remove asks Click again first, and the second press takes the hat off the rack", async (t) => {
    setRack([hat(1), hat(2)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);
    const row = rackRowFor(root, hat(1));
    const remove = buttonIn(row, "Remove");

    removeAsksFirst(t, remove, `remove ${text(byClass(row, "account-row__name")[0])}.`);
    const other = buttonIn(rackRowFor(root, hat(2)), "Remove");
    click(other);
    assert.equal(other.attributes["data-again"], "Click again", "another row's Remove asks for its own hat");
    assert.deepEqual([...gga.Spelunk[46]], [hat(1), hat(2)], "both hats are still on the rack");

    click(remove);
    await until(() => settledButton(remove), "the second press to finish");
    assert.deepEqual([...gga.Spelunk[46]], [hat(2)]);
    assert.deepEqual([...gga.Cards[1]], []);
});

test("Hat Rack: Add all and Remove keep what the game added after the page read it", async () => {
    setRack([hat(1), hat(2)], [hat(6), hat(7)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);

    // The player keeps playing: the game adds loot to the Slab and a hat to the rack.
    gga.Cards[1].push("NewLoot");
    gga.Spelunk[46].push(hat(3));

    const addAll = buttonIn(root, "Add all");
    click(addAll);
    await until(() => settledButton(addAll), "Add all to finish");
    assert.match(classes(addAll), /account-btn--success/);
    assert.ok(gga.Cards[1].includes("NewLoot"), "the loot the game added stays in the Slab");
    assert.equal(gga.Spelunk[46][2], hat(3), "the hat the game added stays on the rack");

    gga.Cards[1].push("LaterLoot");
    gga.Spelunk[46].push("InGameHat");
    await until(() => rackRowFor(root, hat(1)), "the rack to show");
    const before = rackRows(root).length;
    removeTwice(buttonIn(rackRowFor(root, hat(1)), "Remove"));
    await until(() => !gga.Spelunk[46].includes(hat(1)) && rackRows(root).length === before, "Remove to finish");
    assert.ok(gga.Spelunk[46].includes("InGameHat"), "the hat the game added stays on the rack");
    assert.ok(gga.Cards[1].includes("LaterLoot"), "the loot the game added stays in the Slab");
});

test("Hat Rack: a half-done Add all shows the hats that landed, and the next Remove keeps them", async () => {
    setRack([hat(1), hat(2)], []);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);

    const restore = failWrites(/"gga\.Spelunk\[46\]\[4\]"/); // the third hat of Add all
    const addAll = buttonIn(root, "Add all");
    try {
        await quietly(async () => {
            click(addAll);
            await until(() => settledButton(addAll), "Add all to finish");
        });
    } finally {
        restore();
    }
    assert.match(classes(addAll), /account-btn--error/);
    const landed = gga.Spelunk[46].slice(2);
    assert.equal(landed.length, 2, "two hats landed before the refusal");
    await until(() => rackRows(root).length === 4, "the page to show what landed");

    removeTwice(buttonIn(rackRowFor(root, hat(1)), "Remove"));
    await until(() => !gga.Spelunk[46].includes(hat(1)), "Remove to finish");
    for (const itemId of landed) assert.ok(gga.Spelunk[46].includes(itemId), `${itemId} stays on the rack`);
});

test("Hat Rack: a removal the Slab refuses stays on its row, red, and can be pressed again", async () => {
    setRack([hat(1), hat(2)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);

    const restore = failWrites(/"gga\.Cards\[1\]"/);
    const row = rackRowFor(root, hat(1));
    const remove = buttonIn(row, "Remove");
    try {
        await quietly(async () => {
            removeTwice(remove);
            await until(() => settledButton(remove), "Remove to finish");
        });
    } finally {
        restore();
    }
    assert.match(classes(remove), /account-btn--error/);
    assert.ok(rackRows(root).includes(row), "the row that asked is still on the page");
    assert.deepEqual([...gga.Spelunk[46]], [hat(1), hat(2)], "the hat is still on the rack");

    await until(() => !classes(remove).includes("account-btn--error"), "the red to clear");
    removeTwice(remove);
    await until(() => !gga.Spelunk[46].includes(hat(1)), "the second press to remove it");
    assert.deepEqual([...gga.Cards[1]], []);
});

test("Hat Rack: a refused removal stays red on its row when the game changed the rack meanwhile", async () => {
    setRack([hat(1), hat(2)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);
    gga.Spelunk[46].push(hat(3));

    const restore = failWrites(/"gga\.Cards\[1\]"/);
    const row = rackRowFor(root, hat(1));
    const remove = buttonIn(row, "Remove");
    try {
        await quietly(async () => {
            removeTwice(remove);
            await until(() => settledButton(remove), "Remove to finish");
        });
    } finally {
        restore();
    }
    assert.match(classes(remove), /account-btn--error/);
    assert.equal(rackRows(root).length, 3, "the page shows the hat the game added");
    assert.ok(rackRows(root).includes(row), "the row that asked is still on the page");
    assert.ok(gga.Spelunk[46].includes(hat(1)), "the hat is still on the rack");
});

const SMITHY = "src/ui/pages/world-3/armor-smithy/armor-smithy.js";
const smithyRows = (root) => byClass(root, "smithy-row");

test("Smithy: Remove asks Click again first, and the second press removes the set", async (t) => {
    gga.OptionsListAccount[379] = "0,COPPER_SET,GOLD_SET";
    const root = await openPage(SMITHY, (r) => smithyRows(r).length === 2);
    const row = smithyRows(root).find((node) => text(node).includes("GOLD_SET"));
    const remove = buttonIn(row, "Remove");

    removeAsksFirst(t, remove, `remove ${text(byClass(row, "account-row__name")[0])}.`);
    const other = buttonIn(
        smithyRows(root).find((node) => text(node).includes("COPPER_SET")),
        "Remove"
    );
    click(other);
    assert.equal(other.attributes["data-again"], "Click again", "another row's Remove asks for its own set");
    assert.equal(gga.OptionsListAccount[379], "0,COPPER_SET,GOLD_SET", "both sets are still stored");

    click(remove);
    await until(() => settledButton(remove), "the second press to finish");
    assert.equal(gga.OptionsListAccount[379], "0,COPPER_SET");
});

test("Smithy: Remove and Add keep a set the game stored after the page read the list", async () => {
    gga.OptionsListAccount[379] = "0,COPPER_SET,GOLD_SET";
    const root = await openPage(SMITHY, (r) => smithyRows(r).length === 2);

    // In game, the player completes a set and the game stores it.
    gga.OptionsListAccount[379] += ",IRON_SET";
    const gold = smithyRows(root).find((row) => text(row).includes("GOLD_SET"));
    const remove = buttonIn(gold, "Remove");
    removeTwice(remove);
    await until(() => settledButton(remove), "Remove to finish");
    assert.equal(gga.OptionsListAccount[379], "0,COPPER_SET,IRON_SET");

    gga.OptionsListAccount[379] += ",PLATINUM_SET";
    const addAll = buttonIn(root, "Add all");
    click(addAll);
    await until(() => settledButton(addAll), "Add all to finish");
    for (const setKey of ["COPPER_SET", "IRON_SET", "PLATINUM_SET"]) {
        assert.ok(gga.OptionsListAccount[379].split(",").includes(setKey), `${setKey} stays stored`);
    }
});

test("Smithy: a Remove that can't read the stored sets stays red on its row", async () => {
    gga.OptionsListAccount[379] = "0,COPPER_SET,GOLD_SET";
    const root = await openPage(SMITHY, (r) => smithyRows(r).length === 2);

    const realFetch = globalThis.fetch;
    let failed = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/gga/read") && /OptionsListAccount\[379\]/.test(options.body) && failed++ === 0) {
            return new Response(JSON.stringify({ error: "the game is busy" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        }
        return realFetch(url, options);
    };
    const row = smithyRows(root).find((node) => text(node).includes("GOLD_SET"));
    const remove = buttonIn(row, "Remove");
    try {
        await quietly(async () => {
            removeTwice(remove);
            await until(() => settledButton(remove), "Remove to finish");
        });
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.match(classes(remove), /account-btn--error/);
    assert.ok(smithyRows(root).includes(row), "the row that asked is still on the page");
    assert.equal(gga.OptionsListAccount[379], "0,COPPER_SET,GOLD_SET");
});

// The game switches characters: the one in play saves its live copy, and the next one's copy becomes the live one.
const switchCharacter = (name) => {
    const db = gga.PlayerDATABASE.h;
    const from = gga.UserInfo[0];
    for (const key of Object.keys(db[from].h)) if (key in gga) db[from].h[key] = structuredClone(gga[key]);
    for (const key of Object.keys(db[name].h)) if (key in gga) gga[key] = structuredClone(db[name].h[key]);
    gga.UserInfo[0] = name;
};
const typeAndEnter = async (row, value) => {
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--(success|error)/.test(classes(byClass(row, "save-state")[0])), "the save to finish");
};

test("Death Note: a kill count saves to the character on its row, whoever is in play now", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    // The real game keeps numbers for the kill requirement.
    gga.CustomLists.h.MapDetails = gga.CustomLists.h.MapDetails.map((map) => [[Number(map[0][0]), 0, 0]]);
    const required = gga.CustomLists.h.MapDetails[0][0][0];
    const db = gga.PlayerDATABASE.h;
    gga.KillsLeft2Advance[0][0] = required - 2;
    db.Lumi_Main.h.KillsLeft2Advance[0][0] = required - 2;
    db.Lumi_Alt.h.KillsLeft2Advance[0][0] = required - 5;
    const root = await openPage("src/ui/pages/world-3/death-note/death-note.js", (r) =>
        byClass(r, "dn-player-row").some((row) => text(row).includes("(selected)"))
    );
    const firstRowOf = (name) =>
        byClass(root, "dn-player-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
    const mainRow = firstRowOf("Lumi_Main");
    const altRow = firstRowOf("Lumi_Alt");

    switchCharacter("Lumi_Alt");
    await typeAndEnter(mainRow, 7);
    assert.match(classes(byClass(mainRow, "save-state")[0]), /save-state--success/);
    assert.equal(db.Lumi_Main.h.KillsLeft2Advance[0][0], required - 7, "Main's kills changed");
    assert.equal(gga.KillsLeft2Advance[0][0], required - 5, "Alt, in play, keeps its kills");

    await typeAndEnter(altRow, 9);
    assert.equal(gga.KillsLeft2Advance[0][0], required - 9, "Alt's live kills, the copy the game keeps, changed");
    assert.equal(db.Lumi_Alt.h.KillsLeft2Advance[0][0], required - 9);
    switchCharacter("Lumi_Main");
});

test("Library: after a character switch, saves and Max books refuse instead of changing the new character", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    const root = await openPage("src/ui/pages/world-3/library/library.js", (r) =>
        byClass(r, "talent-row").some((row) => elements(row).some((node) => node.nodeName === "input"))
    );
    const row = byClass(root, "talent-row").find((r) => elements(r).some((node) => node.nodeName === "input"));
    const id = Number(text(byClass(row, "account-row__index")[0]).replace("#", ""));
    const mainBooks = structuredClone(gga.SkillLevelsMAX);

    // In game, the player switches to another character of the same class: its own books are live now.
    gga.UserInfo[0] = "Lumi_Alt";
    gga.SkillLevelsMAX = mainBooks.map((level) => (level > 0 ? 1 : level));
    const altBooks = structuredClone(gga.SkillLevelsMAX);

    await typeAndEnter(row, 5);
    assert.match(classes(byClass(row, "save-state")[0]), /save-state--error/);
    assert.match(text(byClass(row, "save-state__label")[0]), /another character is in play; press Refresh/);
    assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");

    const maxBooks = buttonIn(root, "Max books");
    click(maxBooks);
    await until(() => settledButton(maxBooks), "Max books to finish");
    assert.match(classes(maxBooks), /account-btn--error/);
    assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");

    // The page read the game again, so the next save goes to the character in play.
    await typeAndEnter(row, 5);
    await until(() => classes(byClass(row, "save-state")[0]).includes("save-state--success"), "the save to land");
    assert.equal(gga.SkillLevelsMAX[id], 5);
    gga.UserInfo[0] = "Lumi_Main";
    gga.SkillLevelsMAX = mainBooks;
});

// Review of #116: the live kills went to whoever was in play when the game wrote, checked only before the awaits.
test("Death Note: a switch while the live kills save leaves the new character's kills alone", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    gga.CustomLists.h.MapDetails = gga.CustomLists.h.MapDetails.map((map) => [[Number(map[0][0]), 0, 0]]);
    const required = gga.CustomLists.h.MapDetails[0][0][0];
    const db = gga.PlayerDATABASE.h;
    gga.KillsLeft2Advance[0][0] = required - 2;
    db.Lumi_Main.h.KillsLeft2Advance[0][0] = required - 2;
    db.Lumi_Alt.h.KillsLeft2Advance[0][0] = required - 5;
    const root = await openPage("src/ui/pages/world-3/death-note/death-note.js", (r) =>
        byClass(r, "dn-player-row").some((row) => text(row).includes("(selected)"))
    );
    const mainRow = byClass(root, "dn-player-row").find(
        (row) => text(byClass(row, "account-row__name")[0]) === "Lumi_Main"
    );
    const hold = holdWrites();
    try {
        const save = quietly(() => typeAndEnter(mainRow, 7));
        await until(() => hold.held() === 1, "the live kills to reach the game");
        switchCharacter("Lumi_Alt");
        hold.release();
        await save;
        assert.equal(gga.KillsLeft2Advance[0][0], required - 5, "Alt, in play now, keeps its kills");
    } finally {
        hold.release();
        switchCharacter("Lumi_Main");
    }
});

const openLibrary = async () => {
    const root = await openPage("src/ui/pages/world-3/library/library.js", (r) =>
        byClass(r, "talent-row").some((row) => elements(row).some((node) => node.nodeName === "input"))
    );
    const row = byClass(root, "talent-row").find((r) => elements(r).some((node) => node.nodeName === "input"));
    return { root, row, id: Number(text(byClass(row, "account-row__index")[0]).replace("#", "")) };
};

// Review of #116: a Refresh that failed after reading the new character still took it as the one the rows show.
test("Library: after a Refresh that fails on the new character, the old rows still refuse to save", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    const { root, row } = await openLibrary();
    const [mainClass, mainBooks] = [gga.CharacterClass, structuredClone(gga.SkillLevelsMAX)];
    gga.UserInfo[0] = "Lumi_Alt";
    gga.CharacterClass = 0; // a character the page can't show
    try {
        await quietly(async () => {
            click(buttonIn(root, "Refresh"));
            await until(() => /No active character/.test(text(root)), "the Refresh to fail");
        });
        await typeAndEnter(row, 5);
        assert.match(text(byClass(row, "save-state__label")[0]), /another character is in play; press Refresh/);
        assert.deepEqual(gga.SkillLevelsMAX, mainBooks, "the character in play keeps its books");
    } finally {
        [gga.UserInfo[0], gga.CharacterClass, gga.SkillLevelsMAX] = ["Lumi_Main", mainClass, mainBooks];
    }
});

// Review of #116: a Refresh that ended while the save checked who is in play made the check pass for the new one.
test("Library: a save whose check waits through a Refresh to another character refuses", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    const { root, row } = await openLibrary();
    const mainBooks = structuredClone(gga.SkillLevelsMAX);
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).endsWith("/gga/read") && ++held === 1) await gate;
        return realFetch(url, options);
    };
    try {
        const save = typeAndEnter(row, 5);
        await until(() => held === 1, "the save to check who is in play");
        // Another character of the same class: Refresh keeps the rows.
        gga.UserInfo[0] = "Lumi_Alt";
        gga.SkillLevelsMAX = mainBooks.map((level) => (level > 0 ? 1 : level));
        const altBooks = structuredClone(gga.SkillLevelsMAX);
        const refresh = buttonIn(root, "Refresh");
        click(refresh);
        await until(() => held > 1 && !isDisabled(refresh), "the Refresh to finish");
        release();
        await save;
        assert.match(text(byClass(row, "save-state__label")[0]), /another character is in play; press Refresh/);
        assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");
    } finally {
        globalThis.fetch = realFetch;
        release();
        gga.UserInfo[0] = "Lumi_Main";
        gga.SkillLevelsMAX = mainBooks;
    }
});

test("Buildings: a level save the game doesn't take leaves the level and its pending copy as they were", async () => {
    gga.TowerInfo[0] = 3;
    gga.TowerInfo[27] = 3;
    const root = await openPage("src/ui/pages/world-3/construction/buildings.js", (r) =>
        byClass(r, "account-row").some((row) => text(row).includes("#1"))
    );
    const row = byClass(root, "account-row").find((r) => text(byClass(r, "account-row__index")[0]) === "#1");

    const restore = failWrites(/"gga\.TowerInfo\[27\]"/);
    try {
        await quietly(() => typeAndEnter(row, 10));
    } finally {
        restore();
    }
    assert.match(classes(byClass(row, "save-state")[0]), /save-state--error/);
    assert.deepEqual([gga.TowerInfo[0], gga.TowerInfo[27]], [3, 3], "neither copy changed");

    await typeAndEnter(row, 10);
    await until(() => classes(byClass(row, "save-state")[0]).includes("save-state--success"), "the retry to land");
    assert.deepEqual([gga.TowerInfo[0], gga.TowerInfo[27]], [10, 10]);
});

const COGS = "src/ui/pages/world-3/construction/cogs.js";
globalThis.window = Object.assign(globalThis.window ?? {}, { innerWidth: 1280, innerHeight: 720 });
const openCogs = async () => {
    const root = await openPage(COGS, (r) => byClass(r, "cogs-slot").length > 0);
    const popup = byClass(globalThis.document.body, "cogs-popup").at(-1);
    const slot = (index) =>
        byClass(root, "cogs-slot").find((node) =>
            String(
                typeof node.attributes.title === "function" ? node.attributes.title() : node.attributes.title
            ).endsWith(`(Index ${index})`)
        );
    const open = (index) => slot(index).listeners.click({ clientX: 10, clientY: 10 });
    return { root, popup, open };
};
const statRow = (popup, code) =>
    byClass(popup, "cogs-cog-stat-row").find((row) => text(byClass(row, "cogs-cog-stat-row__code")[0]) === code);
const enterStat = async (row, value) => {
    const input = elements(row).find((node) => node.nodeName === "input");
    input.value = value;
    input.listeners.input?.({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--(success|error)/.test(classes(byClass(row, "save-state")[0])), "the save to finish");
};

test("Cogs: a stat that is a number refuses text that isn't one; the shape pattern still takes text", async () => {
    gga.CogOrder[1] = "Cog2B01";
    gga.CogMap[1].h = { a: 11, b: 1, h: "pattern" };
    const { popup, open } = await openCogs();
    open(1);
    await until(() => statRow(popup, "a") && statRow(popup, "h"), "the slot's stats to show");

    for (const typed of ["12,345", "abc", "1e999"]) {
        const row = statRow(popup, "a");
        await enterStat(row, typed);
        assert.match(classes(byClass(row, "save-state")[0]), /save-state--error/, typed);
        assert.equal(text(byClass(row, "save-state__label")[0]), "not a number", typed);
        assert.equal(gga.CogMap[1].h.a, 11, `${typed} isn't written`);
    }

    const shape = statRow(popup, "h");
    await enterStat(shape, "ring");
    assert.match(classes(byClass(shape, "save-state")[0]), /save-state--success/);
    assert.equal(gga.CogMap[1].h.h, "ring");
});

// Hold the game's writes until released, to act while one runs; `fail` answers them with a failure.
const holdWrites = ({ fail = false } = {}) => {
    const realFetch = globalThis.fetch;
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    let held = 0;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/write")) return realFetch(url, options);
        held++;
        await gate;
        if (!fail) return realFetch(url, options);
        return new Response(JSON.stringify({ error: "the game refused" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    return {
        held: () => held,
        release: () => {
            globalThis.fetch = realFetch;
            open();
        },
    };
};
const isDisabled = (node) =>
    Boolean(typeof node.attributes.disabled === "function" ? node.attributes.disabled() : node.attributes.disabled);

test("Cogs: a Lock's result shows on the slot it was for, not on the slot opened while it ran", async () => {
    for (const index of [3, 8]) {
        gga.FlagUnlock[index] = -11;
        gga.CogOrder[index] = "Blank";
    }
    const { popup, open } = await openCogs();
    const lock = buttonIn(popup, "Lock");
    const unlock = buttonIn(popup, "Unlock");
    open(3);
    await until(() => !isDisabled(lock), "slot 3's Lock");

    const hold = holdWrites({ fail: true });
    click(lock);
    await until(() => hold.held() === 1, "the Lock to reach the game");
    open(8);
    await until(() => !/account-btn--loading/.test(classes(lock)), "slot 8 to show");
    assert.ok(isDisabled(lock) && isDisabled(unlock), "no second Lock or Unlock while one runs");
    open(3);
    await until(() => /account-btn--loading/.test(classes(lock)), "slot 3 to show its Lock still running");

    await quietly(async () => {
        hold.release();
        await until(() => settledButton(lock), "the Lock to finish");
    });
    assert.match(classes(lock), /account-btn--error/);
    assert.equal(gga.FlagUnlock[3], -11);
    open(8);
    await until(() => !/account-btn--error/.test(classes(lock)), "slot 8 to show nothing of slot 3's Lock");
    assert.ok(!isDisabled(lock), "slot 8 can be locked now");
});

test("Cogs: a Lock that fails while another slot is open shows when its slot is opened again", async () => {
    for (const index of [4, 9]) {
        gga.FlagUnlock[index] = -11;
        gga.CogOrder[index] = "Blank";
    }
    const { popup, open } = await openCogs();
    const lock = buttonIn(popup, "Lock");
    open(4);
    await until(() => !isDisabled(lock), "slot 4's Lock");

    const hold = holdWrites({ fail: true });
    click(lock);
    await until(() => hold.held() === 1, "the Lock to reach the game");
    open(9);
    await quietly(async () => {
        hold.release();
        await until(() => !isDisabled(lock), "the Lock to finish");
    });
    // Longer than a result normally shows, so only a kept failure is still there.
    await new Promise((resolve) => setTimeout(resolve, 1300));
    assert.doesNotMatch(classes(lock), /account-btn--error/, "slot 9 shows nothing of it");
    open(4);
    await until(() => /account-btn--error/.test(classes(lock)), "slot 4 to show its failed Lock");
    assert.equal(gga.FlagUnlock[4], -11);
    await until(() => !/account-btn--error/.test(classes(lock)), "the red to clear once seen");
});

test("Cogs: a tiny cog save's saving and failure stay with the slot it was for", async () => {
    gga.FlagUnlock[96] = -11;
    gga.FlagUnlock[97] = -11;
    gga.CogOrder[228] = "CogSma0";
    gga.CogOrder[229] = "CogSmb1";
    const { popup, open } = await openCogs();
    const editor = () => byClass(popup, "cogs-tiny-editor")[0];
    const stateOf = (node) => classes(byClass(node, "save-state")[0]);
    open(96);
    await until(editor, "slot 96's tiny editor");
    const first = editor();
    const [typeInput] = elements(first).filter((node) => node.nodeName === "input");
    typeInput.value = "b";
    typeInput.listeners.input({ target: typeInput });

    const hold = holdWrites({ fail: true });
    first.listeners.keydown({ key: "Enter", target: typeInput, preventDefault() {} });
    await until(() => hold.held() === 1, "the save to reach the game");
    open(97);
    await until(() => editor() && editor() !== first, "slot 97's tiny editor");
    assert.doesNotMatch(stateOf(editor()), /save-state--(loading|success|error)/, "slot 97 shows nothing of it");

    await quietly(async () => {
        hold.release();
        open(96);
        await until(() => /save-state--error/.test(stateOf(editor())), "slot 96 to show its failure");
    });
    assert.equal(gga.CogOrder[228], "CogSma0");
    const shown = editor();
    open(97);
    await until(() => editor() && editor() !== shown, "slot 97's tiny editor");
    assert.doesNotMatch(stateOf(editor()), /save-state--(loading|success|error)/, "slot 97 shows nothing of it");
});

// Review of #116: the tier committed while the type saved was read from the fields after slot 97 opened, so dropped.
test("Cogs: a tiny cog tier committed while its type saves still saves after another slot opens", async () => {
    gga.FlagUnlock[96] = -11;
    gga.FlagUnlock[97] = -11;
    gga.CogOrder[228] = "CogSma0";
    gga.CogOrder[229] = "CogSmb1";
    const { popup, open } = await openCogs();
    const editor = () => byClass(popup, "cogs-tiny-editor")[0];
    open(96);
    await until(editor, "slot 96's tiny editor");
    const first = editor();
    const [typeInput, tierInput] = elements(first).filter((node) => node.nodeName === "input");
    const enter = (input, value) => {
        input.value = value;
        input.listeners.input({ target: input });
        first.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    };
    const hold = holdWrites();
    enter(typeInput, "b");
    await until(() => hold.held() === 1, "the type save to reach the game");
    enter(tierInput, "3");
    open(97);
    await until(() => editor() && editor() !== first, "slot 97's tiny editor");
    hold.release();
    await until(() => gga.CogOrder[228] === "CogSmb2", "the tier to save");
    assert.equal(gga.CogOrder[229], "CogSmb1", "slot 97 is left as it was");
});
