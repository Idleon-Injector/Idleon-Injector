// World 3 pages on the fake game (review sweep, world-3a): a change starts from what the game holds now, goes to the
// character or slot it was asked for, and its result shows where the player acted.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
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

// A hat or a set is one row with a switch: flipping it saves at once, and a refused save says why on the switch.
const switchOf = (row) => elements(row).find((node) => node.nodeName === "input" && node.attributes.role === "switch");
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const switchFailed = (row) => classes(byClass(row, "state-switch")[0]).includes("is-failed");

const HAT_RACK = "src/ui/pages/world-3/hat-rack/hat-rack.js";
const { PREMIUM_HATS } = await import("./page-shots/data/world-3-game.mjs");
const hat = (n) => PREMIUM_HATS[n - 1][0];
const rackRows = (root) => byClass(root, "hat-rack-row");
const rackRowFor = (root, itemId) => rackRows(root).find((row) => row.attributes["data-item"] === itemId);
const setRack = (rack, slab) => {
    gga.Spelunk[46] = rack;
    gga.Cards[1] = slab;
};

test("Hat Rack: every premium hat is a row, and its switch takes it off the rack and the Slab at once", async () => {
    setRack([hat(1), hat(2)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 12);
    flip(rackRowFor(root, hat(1)), false);
    await until(() => !gga.Spelunk[46].includes(hat(1)), "the hat to come off");
    assert.deepEqual([...gga.Spelunk[46]], [hat(2)]);
    assert.deepEqual([...gga.Cards[1]], []);

    flip(rackRowFor(root, hat(5)), true);
    await until(() => gga.Spelunk[46].includes(hat(5)), "the hat to go on");
    assert.deepEqual([...gga.Spelunk[46]], [hat(2), hat(5)]);
    // Every premium hat on the rack goes in the Slab with an add, the one already there too.
    assert.deepEqual([...gga.Cards[1]], [hat(2), hat(5)]);
});

test("Hat Rack: Add all and a switch keep what the game added after the page read it", async () => {
    setRack([hat(1), hat(2)], [hat(6), hat(7)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 12);

    // The player keeps playing: the game adds loot to the Slab and a hat to the rack.
    gga.Cards[1].push("NewLoot");
    gga.Spelunk[46].push(hat(3));

    const addAll = buttonIn(root, "Add all");
    click(addAll);
    await until(() => settledButton(addAll), "Add all to finish");
    assert.match(classes(addAll), /account-btn--success/);
    assert.ok(gga.Cards[1].includes("NewLoot"), "the loot the game added stays in the Slab");
    assert.equal(gga.Spelunk[46][2], hat(3), "the hat the game added stays on the rack");
    assert.equal(gga.Spelunk[46].length, 12, "every premium hat is on the rack");

    gga.Cards[1].push("LaterLoot");
    gga.Spelunk[46].push("InGameHat");
    flip(rackRowFor(root, hat(1)), false);
    await until(() => !gga.Spelunk[46].includes(hat(1)), "the hat to come off");
    assert.ok(gga.Spelunk[46].includes("InGameHat"), "the hat the game added stays on the rack");
    assert.ok(gga.Cards[1].includes("LaterLoot"), "the loot the game added stays in the Slab");
    await until(() => rackRowFor(root, "InGameHat"), "the page to show the other hat the rack holds");
});

// Review of #207: a hat the game added rebuilt every row, so a switch lost its focus and its save's state.
test("Hat Rack: a hat the game adds gets its own row and the other rows stay as they are", async () => {
    setRack([hat(1), hat(2)], [hat(1), hat(2)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 12);
    const before = rackRowFor(root, hat(1));

    gga.Spelunk[46].push("InGameHat");
    click(buttonIn(root, "Refresh"));
    await until(() => rackRowFor(root, "InGameHat"), "the page to show the hat the game added");
    assert.equal(rackRowFor(root, hat(1)), before, "the first hat keeps its row");
    assert.equal(rackRows(root).at(-1), rackRowFor(root, "InGameHat"), "the new hat comes last");
});

test("Hat Rack: a half-done Add all shows the hats that landed, and the next switch keeps them", async () => {
    setRack([hat(1), hat(2)], []);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 12);

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

    flip(rackRowFor(root, hat(1)), false);
    await until(() => !gga.Spelunk[46].includes(hat(1)), "the hat to come off");
    for (const itemId of landed) assert.ok(gga.Spelunk[46].includes(itemId), `${itemId} stays on the rack`);
});

test("Hat Rack: a hat a flip put on the rack but couldn't put in the Slab goes there with the next add", async () => {
    setRack([hat(1)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 12);
    const row = rackRowFor(root, hat(2));

    const restore = failWrites(/"gga\.Cards\[1\]"/);
    try {
        await quietly(async () => {
            flip(row, true);
            await until(() => switchFailed(row), "the switch to say why");
        });
    } finally {
        restore();
    }
    assert.ok(gga.Spelunk[46].includes(hat(2)), "the hat landed on the rack");
    assert.ok(!gga.Cards[1].includes(hat(2)), "the Slab refused it");

    flip(rackRowFor(root, hat(3)), true);
    await until(() => gga.Cards[1].includes(hat(3)), "the next add to finish");
    assert.ok(gga.Cards[1].includes(hat(2)), "the earlier hat is in the Slab now");
});

test("Hat Rack: loot the game adds to the Slab while a flip writes it is kept", async () => {
    setRack([hat(1)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 12);
    const row = rackRowFor(root, hat(2));
    const realFetch = globalThis.fetch;
    let added = false;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && /"gga\.Cards\[1\]"/.test(options.body) && !added) {
            added = true;
            gga.Cards[1].push("NewLoot"); // the game found loot after the page read the Slab
        }
        return realFetch(url, options);
    };
    try {
        await quietly(async () => {
            flip(row, true);
            await until(() => switchFailed(row), "the Slab write to be refused");
        });
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.ok(gga.Cards[1].includes("NewLoot"), "the loot stays in the Slab");

    flip(rackRowFor(root, hat(3)), true);
    await until(() => gga.Cards[1].includes(hat(2)), "the next add to put the earlier hat in the Slab");
    assert.ok(gga.Cards[1].includes("NewLoot"), "the loot is still there");
});

test("Hat Rack: a removal the Slab refuses says why on its switch, and the next flip takes it off", async () => {
    setRack([hat(1), hat(2)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 12);
    gga.Spelunk[46].push(hat(3)); // the game changed the rack meanwhile

    const restore = failWrites(/"gga\.Cards\[1\]"/);
    const row = rackRowFor(root, hat(1));
    try {
        await quietly(async () => {
            flip(row, false);
            await until(() => switchFailed(row), "the switch to say why");
        });
    } finally {
        restore();
    }
    assert.deepEqual([...gga.Spelunk[46]], [hat(1), hat(2), hat(3)], "the hats are still on the rack");

    flip(row, false);
    await until(() => !gga.Spelunk[46].includes(hat(1)), "the next flip to take it off");
    assert.deepEqual([...gga.Spelunk[46]], [hat(2), hat(3)]);
    assert.deepEqual([...gga.Cards[1]], []);
    await until(() => !switchFailed(row), "the reason to go");
});

const SMITHY = "src/ui/pages/world-3/armor-smithy/armor-smithy.js";
const smithyRows = (root) => byClass(root, "smithy-row");
const smithyRowFor = (root, setKey) => smithyRows(root).find((row) => row.attributes["data-set"] === setKey);

test("Smithy: every set is a row, and its Unlocked switch takes it out of the Smithy at once", async () => {
    gga.OptionsListAccount[379] = "0,COPPER_SET,GOLD_SET";
    const root = await openPage(SMITHY, (r) => smithyRows(r).length === 4);
    flip(smithyRowFor(root, "GOLD_SET"), false);
    await until(() => gga.OptionsListAccount[379] === "0,COPPER_SET", "the set to come out");
    flip(smithyRowFor(root, "IRON_SET"), true);
    await until(() => gga.OptionsListAccount[379] === "0,COPPER_SET,IRON_SET", "the set to go in");
});

test("Smithy: a switch and Unlock all keep a set the game stored after the page read the list", async () => {
    gga.OptionsListAccount[379] = "0,COPPER_SET,GOLD_SET";
    const root = await openPage(SMITHY, (r) => smithyRows(r).length === 4);

    // In game, the player completes a set and the game stores it.
    gga.OptionsListAccount[379] += ",IRON_SET";
    flip(smithyRowFor(root, "GOLD_SET"), false);
    await until(() => gga.OptionsListAccount[379] === "0,COPPER_SET,IRON_SET", "the set to come out");

    gga.OptionsListAccount[379] += ",PLATINUM_SET";
    const unlockAll = buttonIn(root, "Unlock all");
    click(unlockAll);
    await until(() => settledButton(unlockAll), "Unlock all to finish");
    for (const setKey of ["COPPER_SET", "IRON_SET", "PLATINUM_SET", "GOLD_SET", "AMAROK_SET"]) {
        assert.ok(gga.OptionsListAccount[379].split(",").includes(setKey), `${setKey} is stored`);
    }
});

test("Smithy: a switch that can't read the stored sets says why on its row, and nothing changes", async () => {
    gga.OptionsListAccount[379] = "0,COPPER_SET,GOLD_SET";
    const root = await openPage(SMITHY, (r) => smithyRows(r).length === 4);

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
    const row = smithyRowFor(root, "GOLD_SET");
    try {
        await quietly(async () => {
            flip(row, false);
            await until(() => switchFailed(row), "the switch to say why");
        });
    } finally {
        globalThis.fetch = realFetch;
    }
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
        byClass(r, "dn-player-row").some((row) => text(row).includes("In play"))
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

// A talent is named once in the game's list, so its name finds its id; a book row is one with a field.
const { normalCase } = await importRepo("src/ui/components/views/account/accountShared.js");
const talentNames = gga.CustomLists.h.TalentIconNames.map(normalCase);
const talentIdOf = (row) => talentNames.indexOf(text(byClass(row, "account-row__name")[0]));
const bookRow = (root) =>
    byClass(root, "talent-row").find(
        (r) =>
            elements(r).some((node) => node.nodeName === "input") &&
            talentNames.filter((name) => name === text(byClass(r, "account-row__name")[0])).length === 1
    );

test("Library: after a character switch, saves and Max books refuse instead of changing the new character", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    const root = await openPage("src/ui/pages/world-3/library/library.js", (r) =>
        byClass(r, "talent-row").some((row) => elements(row).some((node) => node.nodeName === "input"))
    );
    const row = bookRow(root);
    const id = talentIdOf(row);
    const mainBooks = structuredClone(gga.SkillLevelsMAX);

    // In game, the player switches to another character of the same class: its own books are live now.
    gga.UserInfo[0] = "Lumi_Alt";
    gga.SkillLevelsMAX = mainBooks.map((level) => (level > 0 ? 1 : level));
    const altBooks = structuredClone(gga.SkillLevelsMAX);

    await typeAndEnter(row, 5);
    assert.match(classes(byClass(row, "save-state")[0]), /save-state--error/);
    assert.match(text(byClass(row, "save-state__label")[0]), /^Character changed\. Refresh\.$/);
    assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");

    const maxBooks = buttonIn(root, "Max books");
    click(maxBooks);
    await until(() => settledButton(maxBooks), "Max books to finish");
    assert.match(classes(maxBooks), /account-btn--error/);
    assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");

    // The page read the game again and drew the rows for the character in play, so the next save goes to it.
    const altRow = byClass(root, "talent-row").find((r) => talentIdOf(r) === id);
    assert.notEqual(altRow, row, "the rows are the new character's");
    await typeAndEnter(altRow, 5);
    await until(() => classes(byClass(altRow, "save-state")[0]).includes("save-state--success"), "the save to land");
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
        byClass(r, "dn-player-row").some((row) => text(row).includes("In play"))
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
    const row = bookRow(root);
    return { root, row, id: talentIdOf(row) };
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
            await until(() => /No character in play\./.test(text(root)), "the Refresh to fail");
        });
        await typeAndEnter(row, 5);
        assert.match(text(byClass(row, "save-state__label")[0]), /^Character changed\. Refresh\.$/);
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
        assert.match(text(byClass(row, "save-state__label")[0]), /^Character changed\. Refresh\.$/);
        assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");
    } finally {
        globalThis.fetch = realFetch;
        release();
        gga.UserInfo[0] = "Lumi_Main";
        gga.SkillLevelsMAX = mainBooks;
    }
});

// Review of #116, second round: a save queued behind another wrote to the character a Refresh switched to meanwhile.
test("Library: a save queued behind another keeps to the character it was entered for", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    const { root, row } = await openLibrary();
    const mainBooks = structuredClone(gga.SkillLevelsMAX);
    const hold = holdWrites();
    let altBooks;
    try {
        const [input] = elements(row).filter((node) => node.nodeName === "input");
        const enter = (value) => {
            input.value = String(value);
            input.listeners.input({ target: input });
            row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        };
        enter(4);
        await until(() => hold.held() === 1, "the first save to reach the game");
        enter(6);
        // In game, the player switches to another character of the same class, then presses Refresh.
        gga.UserInfo[0] = "Lumi_Alt";
        gga.SkillLevelsMAX = mainBooks.map((level) => (level > 0 ? 1 : level));
        altBooks = structuredClone(gga.SkillLevelsMAX);
        const refresh = buttonIn(root, "Refresh");
        click(refresh);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await until(() => !isDisabled(refresh), "the Refresh to finish");
    } finally {
        await quietly(async () => {
            hold.release();
            await new Promise((resolve) => setTimeout(resolve, 300));
        });
    }
    assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");
    gga.UserInfo[0] = "Lumi_Main";
    gga.SkillLevelsMAX = mainBooks;
});

// Review of #116, third round: Max books checked the character, then wrote to whoever was in play when the game wrote.
test("Library: a switch while Max books writes leaves the new character's books alone", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    const { root } = await openLibrary();
    const mainBooks = structuredClone(gga.SkillLevelsMAX);
    const hold = holdWrites();
    let altBooks;
    try {
        const maxBooks = buttonIn(root, "Max books");
        click(maxBooks);
        await until(() => hold.held() === 1, "Max books to reach the game");
        gga.UserInfo[0] = "Lumi_Alt";
        gga.SkillLevelsMAX = mainBooks.map((level) => (level > 0 ? 1 : level));
        altBooks = structuredClone(gga.SkillLevelsMAX);
        await quietly(async () => {
            hold.release();
            await until(() => settledButton(maxBooks), "Max books to finish");
        });
        assert.match(classes(maxBooks), /account-btn--error/);
        assert.deepEqual(gga.SkillLevelsMAX, altBooks, "the character in play keeps its books");
    } finally {
        hold.release();
        gga.UserInfo[0] = "Lumi_Main";
        gga.SkillLevelsMAX = mainBooks;
    }
});

test("Buildings: a level save the game doesn't take leaves the level and its pending copy as they were", async () => {
    gga.TowerInfo[0] = 3;
    gga.TowerInfo[27] = 3;
    const first = gga.CustomLists.h.TowerInfo[0][0].replace(/_/g, " ");
    const nameOf = (r) => text(byClass(r, "account-row__name")[0]);
    const root = await openPage("src/ui/pages/world-3/construction/1-buildings.js", (r) =>
        byClass(r, "account-row").some((row) => nameOf(row) === first)
    );
    const row = byClass(root, "account-row").find((r) => nameOf(r) === first);

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

// #216: the penguins from a past limited gem shop sale have their row on Equinox.
test("Equinox: the Pingy penguins row saves the count the game reads", async (t) => {
    const before = gga.OptionsListAccount[320];
    t.after(() => (gga.OptionsListAccount[320] = before));
    gga.OptionsListAccount[320] = 2;
    const nameOf = (r) => text(byClass(r, "account-row__name")[0]);
    const root = await openPage("src/ui/pages/world-3/equinox/equinox.js", (r) =>
        byClass(r, "account-row").some((row) => nameOf(row) === "Pingy penguins")
    );
    const row = byClass(root, "account-row").find((r) => nameOf(r) === "Pingy penguins");
    const shown = elements(row).find((node) => node.nodeName === "input").attributes.value;
    assert.equal(String(typeof shown === "function" ? shown() : shown), "2");
    await typeAndEnter(row, 7);
    assert.match(classes(byClass(row, "save-state")[0]), /save-state--success/);
    assert.equal(gga.OptionsListAccount[320], 7);
});

// CodeRabbit on #226: a count saved while the fill rate couldn't be read again said nothing, and the bar kept its old
// rate; an odd value in the slot showed as 0.
const EQUINOX = "src/ui/pages/world-3/equinox/equinox.js";
const penguinRow = (root) => byClass(root, "account-row").find((r) => text(r).includes("Pingy penguins"));
const rowWarning = (row) => {
    const warning = byClass(row, "account-row__warning")[0];
    return !warning || warning.attributes.hidden ? "" : text(warning).trim();
};

test("Equinox: a penguin count saved while the fill rate can't be read says so on its row, until a read works", async (t) => {
    const before = gga.OptionsListAccount[320];
    t.after(() => (gga.OptionsListAccount[320] = before));
    gga.OptionsListAccount[320] = 0;
    const root = await openPage(EQUINOX, penguinRow);
    const row = penguinRow(root);
    const realFetch = globalThis.fetch;
    t.after(() => (globalThis.fetch = realFetch));
    globalThis.fetch = async (url, options) =>
        String(url).includes("/computed/read") && String(options?.body).includes("BarFillRate")
            ? new Response(JSON.stringify({ error: "the game refused" }), {
                  status: 500,
                  headers: { "content-type": "application/json" },
              })
            : realFetch(url, options);
    await quietly(() => typeAndEnter(row, 4));
    assert.match(classes(byClass(row, "save-state")[0]), /save-state--success/, "the count itself saved");
    assert.equal(gga.OptionsListAccount[320], 4);
    await until(() => rowWarning(row) !== "", "the row to say the rate wasn't read");
    globalThis.fetch = realFetch;
    click(buttonIn(root, "Refresh"));
    await until(() => rowWarning(row) === "", "a read that works to clear it");
});

for (const odd of ["broken", "", " ", true, false, -1, "-1", 1.5, "1.5"]) {
    test(`Equinox: a penguin count of ${JSON.stringify(odd)} is a read error, not 0`, async (t) => {
        const before = gga.OptionsListAccount[320];
        t.after(() => (gga.OptionsListAccount[320] = before));
        gga.OptionsListAccount[320] = odd;
        const root = (await importRepo(EQUINOX)).default.component();
        await quietly(() => until(() => text(root).includes("penguin count"), "the read to fail and say why"));
    });
}

for (const [stored, shows] of [
    [0, "0"],
    [null, "0"],
    [undefined, "0"],
    ["0", "0"],
    ["3", "3"],
]) {
    test(`Equinox: a penguin count of ${JSON.stringify(stored)} shows as ${shows}`, async (t) => {
        const before = gga.OptionsListAccount[320];
        t.after(() => (gga.OptionsListAccount[320] = before));
        gga.OptionsListAccount[320] = stored;
        const root = await openPage(EQUINOX, penguinRow);
        const shown = elements(penguinRow(root)).find((node) => node.nodeName === "input").attributes.value;
        assert.equal(String(typeof shown === "function" ? shown() : shown), shows);
    });
}

const COGS = "src/ui/pages/world-3/construction/1-buildings.js";
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

// Review of #207: one tab's failed read hid the whole Workbench, the other tab's rows with it.
for (const { failing, works, said } of [
    { failing: "CogOrder", works: "account-row", said: "Couldn't read the cog board" },
    { failing: "TowerInfo", works: "cogs-slot", said: "Couldn't read the buildings" },
]) {
    test(`Workbench: when the ${failing} read fails, its tab says so and the other tab still shows`, async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url, options) =>
            String(url).includes("/read") && String(options?.body).includes(failing)
                ? new Response(JSON.stringify({ error: "the game refused" }), {
                      status: 500,
                      headers: { "content-type": "application/json" },
                  })
                : realFetch(url, options);
        try {
            const root = await quietly(() => openPage(COGS, (r) => byClass(r, works).length > 0));
            assert.ok(text(root).includes(said), "the failed tab says it failed");
        } finally {
            globalThis.fetch = realFetch;
        }
    });
}

// #217: a read of the board made the open cog's stats a new object, so the editor built its fields again and the one
// being typed in went away, with its draft.
test("Cogs: a Refresh while a stat is typed keeps the field and its draft; the other stats follow the game", async (t) => {
    const before = { order: gga.CogOrder[1], stats: gga.CogMap[1].h };
    t.after(() => {
        gga.CogOrder[1] = before.order;
        gga.CogMap[1].h = before.stats;
    });
    gga.CogOrder[1] = "Cog2B01";
    gga.CogMap[1].h = { a: 11, b: 1 };
    const { root, popup, open } = await openCogs();
    click(buttonIn(root, "Cogs"));
    open(1);
    await until(() => statRow(popup, "a") && statRow(popup, "b"), "the slot's stats to show");
    const field = (code) => elements(statRow(popup, code)).find((node) => node.nodeName === "input");
    const typed = field("a");
    typed.value = "50";
    typed.listeners.input?.({ target: typed });

    gga.CogMap[1].h = { a: 11, b: 2 }; // the game moves on
    click(buttonIn(root, "Refresh"));
    await until(() => field("b").attributes.value === "2", "the read to show the game's newer stat");
    assert.equal(field("a"), typed, "the field being typed in stays");
    assert.equal(typed.value, "50", "with its draft");
});

test("Workbench: leaving the Cogs tab closes the cog editor", async () => {
    const { root, open } = await openCogs();
    const overlay = byClass(globalThis.document.body, "cogs-popup-overlay").at(-1);
    const shut = () => classes(overlay).includes("cogs-popup-overlay--hidden");
    click(buttonIn(root, "Cogs"));
    open(1);
    await until(() => !shut(), "the editor to open");
    click(buttonIn(root, "Buildings"));
    await until(shut, "the editor to close");
});

// CodeRabbit on #225: the stat field compared its draft with the value it last showed, not the one saved or read.
const openStat = async (stats) => {
    gga.CogOrder[1] = "Cog2B01";
    gga.CogMap[1].h = stats;
    const { root, popup, open } = await openCogs();
    click(buttonIn(root, "Cogs"));
    open(1);
    await until(() => statRow(popup, "a") && statRow(popup, "b"), "the slot's stats to show");
    const row = statRow(popup, "a");
    const field = elements(row).find((node) => node.nodeName === "input");
    const type = (value) => {
        field.value = value;
        field.listeners.input?.({ target: field });
    };
    const key = (name) => row.listeners.keydown({ key: name, target: field, preventDefault() {} });
    return { root, popup, row, field, type, key };
};
const keepCog = (t) => {
    const before = { order: gga.CogOrder[1], stats: gga.CogMap[1].h };
    t.after(() => {
        gga.CogOrder[1] = before.order;
        gga.CogMap[1].h = before.stats;
    });
};

test("Cogs: the old stat typed back while a save runs is the next Enter's save", async (t) => {
    keepCog(t);
    const { row, type, key } = await openStat({ a: 11, b: 1 });
    const hold = holdWrites();
    type("50");
    key("Enter");
    await until(() => hold.held() === 1, "the save to reach the game");
    type("11");
    hold.release();
    await until(() => /save-state--success/.test(classes(byClass(row, "save-state")[0])), "the save's ✓");
    assert.equal(gga.CogMap[1].h.a, 50);
    key("Enter");
    await until(() => gga.CogMap[1].h.a === 11, "the typed-back 11 to be saved");
});

test("Cogs: Escape after a Refresh puts back the game's newer stat", async (t) => {
    keepCog(t);
    const { root, popup, field, type, key } = await openStat({ a: 11, b: 1 });
    type("50");
    gga.CogMap[1].h = { a: 20, b: 2 }; // the game moves on
    click(buttonIn(root, "Refresh"));
    const other = elements(statRow(popup, "b")).find((node) => node.nodeName === "input");
    await until(() => other.attributes.value === "2", "the read to show the game's stats");
    assert.equal(field.value, "50", "the draft stays through the read");
    key("Escape");
    assert.equal(field.value, "20");
});

test("Cogs: a read back to the shown stat clears text the game caught up with and then left", async (t) => {
    keepCog(t);
    const { root, popup, field, type, key } = await openStat({ a: 11, b: 1 });
    const other = () => elements(statRow(popup, "b")).find((node) => node.nodeName === "input");
    type("50");
    gga.CogMap[1].h = { a: 50, b: 2 }; // the game reaches what was typed: no draft left
    click(buttonIn(root, "Refresh"));
    await until(() => other().attributes.value === "2", "the first read");
    gga.CogMap[1].h = { a: 11, b: 3 }; // and moves back to the value the field last showed
    click(buttonIn(root, "Refresh"));
    await until(() => other().attributes.value === "3", "the second read");
    assert.equal(field.value, "11", "the field shows what the game holds");
    key("Enter");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(gga.CogMap[1].h.a, 11, "Enter has nothing to save");
});

// #217: the editor sits on the page's body, so opening another page from the menu left it over that page.
test("Workbench: opening another page from the menu closes the cog editor", async () => {
    const store = (await importRepo("src/ui/state/store.js")).default;
    const { menuTree } = await importRepo("src/ui/menu/pageRegistry.js");
    const { buildMenuTree } = await importRepo("src/ui/menu/menuModel.js");
    const pages = await Promise.all(
        [COGS, "src/ui/pages/world-3/atom-collider/atom-collider.js"].map(
            async (file) => (await importRepo(file)).default
        )
    );
    menuTree.val = buildMenuTree(pages);
    const { Pages } = await importRepo("src/ui/components/views/Pages.js");
    const view = Pages();
    store.openMenu({ world: 3, page: "w3.construction.buildings" });
    await until(() => byClass(view, "cogs-slot").length > 0, "the Workbench to show");
    const overlay = byClass(globalThis.document.body, "cogs-popup-overlay").at(-1);
    const shut = () => classes(overlay).includes("cogs-popup-overlay--hidden");
    click(buttonIn(view, "Cogs"));
    byClass(view, "cogs-slot")[1].listeners.click({ clientX: 10, clientY: 10 });
    await until(() => !shut(), "the editor to open");
    store.openMenu({ world: 3, page: "w3.atomcollider" });
    await until(shut, "the editor to close");
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
    const hold = {
        held: () => held,
        release: () => {
            globalThis.fetch = realFetch;
            open();
        },
    };
    holding = hold;
    return hold;
};
// A test that fails while it holds writes still lets them go, so the next test doesn't hang on them.
let holding = null;
afterEach(() => {
    holding?.release();
    holding = null;
});
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

// Review of #207: after a failed first read every slot read as locked with no flags, so Unlock on a slot with a flag
// left the flag behind.
test("Cogs: Lock and Unlock wait for a read of the board that works", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) =>
        String(url).includes("/read") && String(options?.body).includes("CogOrder")
            ? new Response(JSON.stringify({ error: "the game refused" }), {
                  status: 500,
                  headers: { "content-type": "application/json" },
              })
            : realFetch(url, options);
    let root;
    try {
        root = await quietly(() => openPage(COGS, (r) => byClass(r, "account-row").length > 0));
    } finally {
        globalThis.fetch = realFetch;
    }
    const popup = byClass(globalThis.document.body, "cogs-popup").at(-1);
    const lock = buttonIn(popup, "Lock");
    const unlock = buttonIn(popup, "Unlock");
    click(buttonIn(root, "Cogs"));
    const flagged = gga.FlagsPlaced[0];
    byClass(root, "cogs-slot")
        .find((node) => {
            const title = node.attributes.title;
            return String(typeof title === "function" ? title() : title).endsWith(`(Index ${flagged})`);
        })
        .listeners.click({ clientX: 10, clientY: 10 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(isDisabled(lock) && isDisabled(unlock), "no Lock or Unlock on a board that wasn't read");

    click(buttonIn(root, "Refresh"));
    await until(() => !isDisabled(unlock), "a read that works to free Unlock");
    assert.ok(!text(root).includes("Couldn't read the cog board"), "the board's failure clears");
});

// Review of #207: the status line was left out until the first Lock or Unlock, and then never came back.
test("Cogs: the editor's status line says the Lock is saved", async () => {
    const before = gga.FlagUnlock[5];
    gga.FlagUnlock[5] = -11;
    gga.CogOrder[5] = "Blank";
    try {
        const { popup, open } = await openCogs();
        const status = byClass(popup, "write-status")[0];
        assert.ok(status, "the status line is there before any Lock");
        assert.equal(status.attributes.role, "status");
        open(5);
        const lock = buttonIn(popup, "Lock");
        await until(() => !isDisabled(lock), "slot 5's Lock");
        click(lock);
        await until(() => text(status) === "Saved", "the status line to say Saved");
        assert.equal(gga.FlagUnlock[5], 0);
    } finally {
        gga.FlagUnlock[5] = before;
    }
});

// Review of #207: Unlock wrote the slot before its flag, so a flag the game didn't take stayed on an unlocked slot, and
// Unlock couldn't be pressed again.
test("Cogs: Unlock takes the flag off first, and either half failing leaves Unlock to try again", async () => {
    const flagged = gga.FlagsPlaced[0];
    const [flagsBefore, slotBefore, cogBefore] = [[...gga.FlagsPlaced], gga.FlagUnlock[flagged], gga.CogOrder[flagged]];
    gga.FlagUnlock[flagged] = 2000;
    gga.CogOrder[flagged] = "Blank";
    try {
        const { popup, open } = await openCogs();
        open(flagged);
        const unlock = buttonIn(popup, "Unlock");
        await until(() => !isDisabled(unlock), "the flagged slot's Unlock");
        const pressFailing = async (pattern) => {
            // A failure shows for a moment; the next press waits for it to clear, so its own result is the one seen.
            await until(() => !/account-btn--error/.test(classes(unlock)), "the last failure to clear");
            const restore = failWrites(pattern);
            try {
                await quietly(async () => {
                    click(unlock);
                    await until(() => settledButton(unlock), "the Unlock to finish");
                });
            } finally {
                restore();
            }
            assert.match(classes(unlock), /account-btn--error/);
        };

        await pressFailing(/FlagsPlaced/);
        assert.deepEqual([gga.FlagsPlaced[0], gga.FlagUnlock[flagged]], [flagged, 2000], "nothing changed");
        assert.ok(!isDisabled(unlock), "Unlock can be pressed again");

        await pressFailing(/FlagUnlock/);
        assert.deepEqual([gga.FlagsPlaced[0], gga.FlagUnlock[flagged]], [-1, 2000], "the flag is off, the slot not");
        await until(() => !isDisabled(unlock), "Unlock to be free again");

        click(unlock);
        await until(() => gga.FlagUnlock[flagged] === -11, "the retried Unlock");
        assert.equal(gga.FlagsPlaced[0], -1);
    } finally {
        gga.FlagsPlaced.splice(0, flagsBefore.length, ...flagsBefore);
        gga.FlagUnlock[flagged] = slotBefore;
        gga.CogOrder[flagged] = cogBefore;
    }
});

// Review of #207 and #217: Max all and a row's save wrote the level and its pending copy over each other, so the game
// could end with the row's level and Max all's pending copy. They now write in turn, and Max all plans from the game.
const openBuildings = async () => {
    const first = gga.CustomLists.h.TowerInfo[0][0].replace(/_/g, " ");
    const nameOf = (r) => text(byClass(r, "account-row__name")[0]);
    const root = await openPage(COGS, (r) => byClass(r, "account-row").some((row) => nameOf(row) === first));
    click(buttonIn(root, "Buildings"));
    const row = byClass(root, "account-row").find((r) => nameOf(r) === first);
    const field = elements(row).find((node) => node.nodeName === "input");
    const shown = () => {
        const value = field.attributes.value;
        return String(typeof value === "function" ? value() : value);
    };
    return { root, row, field, shown, maxAll: buttonIn(root, "Max all") };
};
// Type a level and press Enter, without waiting for the save.
const enterLevel = (row, field, value) => {
    field.value = String(value);
    field.listeners.input({ target: field });
    row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
};
const rowSettled = (row) => /save-state--(success|error)/.test(classes(byClass(row, "save-state")[0]));
// The first building's max: what Max all writes.
const firstMax = async () => {
    const { maxAll } = await openBuildings();
    click(maxAll);
    await until(() => settledButton(maxAll), "Max all");
    return gga.TowerInfo[0];
};

test("Buildings: a level saved while Max all writes saves after it, in the game and the field", async (t) => {
    const levels = gga.TowerInfo.slice(0, 54);
    t.after(() => gga.TowerInfo.splice(0, levels.length, ...levels));
    gga.TowerInfo[0] = gga.TowerInfo[27] = 3;
    const { row, field, shown, maxAll } = await openBuildings();
    const hold = holdWrites();
    click(maxAll);
    await until(() => hold.held() === 1, "Max all to reach the game");
    enterLevel(row, field, 5);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(hold.held(), 1, "the row's save waits for Max all");
    hold.release();
    await until(() => settledButton(maxAll) && rowSettled(row), "Max all and the row's save");
    assert.deepEqual([gga.TowerInfo[0], gga.TowerInfo[27]], [5, 5]);
    assert.equal(shown(), "5");
});

test("Buildings: Max all waits for a level save that started before it, and plans from the game", async (t) => {
    const levels = gga.TowerInfo.slice(0, 54);
    t.after(() => gga.TowerInfo.splice(0, levels.length, ...levels));
    const max = await firstMax(); // the building is at its max: Max all only checks its pending copy
    assert.notEqual(max, 5);
    const { row, field, shown, maxAll } = await openBuildings();
    const hold = holdWrites();
    enterLevel(row, field, 5);
    await until(() => hold.held() === 1, "the row's save to reach the game");
    click(maxAll);
    hold.release();
    await until(() => settledButton(maxAll) && rowSettled(row), "the row's save and Max all");
    assert.deepEqual([gga.TowerInfo[0], gga.TowerInfo[27]], [max, max], "Max all wrote both copies");
    assert.equal(shown(), String(max));
});

test("Buildings: after Max all's write is refused in part, the rows show what the game holds", async (t) => {
    const levels = gga.TowerInfo.slice(0, 54);
    t.after(() => gga.TowerInfo.splice(0, levels.length, ...levels));
    const max = await firstMax();
    gga.TowerInfo[0] = gga.TowerInfo[27] = 3;
    const { shown, maxAll } = await openBuildings();
    assert.equal(shown(), "3");
    // The game takes the level and refuses its pending copy.
    const realFetch = globalThis.fetch;
    t.after(() => (globalThis.fetch = realFetch));
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/write-many")) return realFetch(url, options);
        const body = JSON.parse(options.body);
        const refused = body.writes.filter((entry) => entry.path === "gga.TowerInfo[27]");
        body.writes = body.writes.filter((entry) => !refused.includes(entry));
        const answer = await (await realFetch(url, { ...options, body: JSON.stringify(body) })).json();
        answer.results.push(...refused.map(({ path }) => ({ path, ok: false, error: "the game refused" })));
        return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
    };
    await quietly(async () => {
        click(maxAll);
        await until(() => settledButton(maxAll), "Max all");
    });
    globalThis.fetch = realFetch;
    assert.match(classes(maxAll), /account-btn--error/);
    assert.deepEqual([gga.TowerInfo[0], gga.TowerInfo[27]], [max, 3]);
    await until(() => shown() === String(max), "the row to show the level the game took");
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

// Review of #116: the first failure's timer cleared the second one before its slot was opened.
test("Cogs: a shown Lock failure's timer doesn't clear another slot's later failure", async () => {
    for (const index of [5, 10, 11]) {
        gga.FlagUnlock[index] = -11;
        gga.CogOrder[index] = "Blank";
    }
    const { popup, open } = await openCogs();
    const lock = buttonIn(popup, "Lock");
    open(5);
    await until(() => !isDisabled(lock), "slot 5's Lock");
    await quietly(async () => {
        const first = holdWrites({ fail: true });
        click(lock);
        await until(() => first.held() === 1, "slot 5's Lock to reach the game");
        first.release();
        await until(() => /account-btn--error/.test(classes(lock)), "slot 5 to show its failed Lock");
    });

    open(10);
    await until(() => !isDisabled(lock), "slot 10's Lock");
    const second = holdWrites({ fail: true });
    click(lock);
    await until(() => second.held() === 1, "slot 10's Lock to reach the game");
    open(11);
    await quietly(async () => {
        second.release();
        await until(() => !isDisabled(lock), "slot 10's Lock to finish");
    });
    // Past the moment slot 5's failure clears.
    await new Promise((resolve) => setTimeout(resolve, 1300));
    open(10);
    await until(() => /account-btn--error/.test(classes(lock)), "slot 10 to show its failed Lock");
    assert.equal(gga.FlagUnlock[10], -11);
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

// Review of #116, second round: reopening the slot while its tier saved showed the old tier, and leaving wrote it back.
test("Cogs: reopening a slot while its tiny cog saves shows the tier being saved, and leaving keeps it", async () => {
    gga.FlagUnlock[96] = -11;
    gga.FlagUnlock[97] = -11;
    gga.CogOrder[228] = "CogSma0";
    gga.CogOrder[229] = "CogSmb1";
    const { popup, open } = await openCogs();
    const editor = () => byClass(popup, "cogs-tiny-editor")[0];
    const fields = () => elements(editor()).filter((node) => node.nodeName === "input");
    open(96);
    await until(editor, "slot 96's tiny editor");
    const first = editor();
    const [, tierInput] = fields();
    tierInput.value = "2";
    tierInput.listeners.input({ target: tierInput });
    const hold = holdWrites();
    try {
        first.listeners.keydown({ key: "Enter", target: tierInput, preventDefault() {} });
        await until(() => hold.held() === 1, "the tier save to reach the game");
        open(97);
        await until(() => editor() && editor() !== first, "slot 97's tiny editor");
        open(96);
        await until(() => editor() && fields()[1].attributes.value !== undefined, "slot 96's tiny editor again");
        const value = (node) =>
            String(typeof node.attributes.value === "function" ? node.attributes.value() : node.attributes.value);
        assert.equal(value(fields()[1]), "2", "the tier being saved shows");
    } finally {
        hold.release();
    }
    await until(() => gga.CogOrder[228] === "CogSma1", "tier 2 to save");
    const again = editor();
    const [, tier] = fields();
    again.listeners.focusout?.({ target: tier, currentTarget: again, relatedTarget: null });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(gga.CogOrder[228], "CogSma1", "leaving the field keeps tier 2");
});

test("Atom Collider: Max all and Reset all wait while the levels are read again, and after that read fails", async () => {
    const root = await openPage("src/ui/pages/world-3/atom-collider/atom-collider.js", (r) =>
        Boolean(buttonIn(r, "Max all"))
    );
    const [maxAll, resetAll] = [buttonIn(root, "Max all"), buttonIn(root, "Reset all")];
    const enabled = (node) => node.attributes.disabled !== true && node.attributes.disabled !== "";
    assert.ok(enabled(maxAll) && enabled(resetAll), "both are usable once the levels are read");

    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/gga/read") || !/"gga\.Atoms"/.test(options.body)) return realFetch(url, options);
        await gate;
        return new Response(JSON.stringify({ error: "the game is busy" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    try {
        await quietly(async () => {
            click(buttonIn(root, "Refresh"));
            await until(() => !enabled(maxAll), "Max all to wait for the read");
            assert.ok(!enabled(resetAll), "Reset all waits too");
            release();
            await until(() => text(root).includes("the game is busy"), "the failed read to say why");
        });
        assert.ok(!enabled(maxAll) && !enabled(resetAll), "both wait for a read that works");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    click(buttonIn(root, "Refresh"));
    await until(() => enabled(maxAll) && enabled(resetAll), "a read that works to free them");
});

// Review of #207: the panel's own Up and Down ran too, so Down from the first name went to the sixth, not the fifth.
test("Character picker: Down moves one line down the columns, once", async (t) => {
    const { createCharacterSelector } = await importRepo(
        "src/ui/components/views/account/components/CharacterSelector.js"
    );
    // What the browser does here: a focus, the columns the list is laid out in, and a key going up from the name.
    const proto = Object.getPrototypeOf(globalThis.document.createElement("div"));
    proto.querySelectorAll = function (selector) {
        return elements(this).filter((node) => node !== this && classes(node).split(" ").includes(selector.slice(1)));
    };
    proto.querySelector = function (selector) {
        return this.querySelectorAll(selector)[0] ?? null;
    };
    proto.focus = function () {
        globalThis.document.activeElement = this;
    };
    globalThis.getComputedStyle = () => ({ gridTemplateColumns: "1fr 1fr 1fr 1fr" });
    t.after(() => {
        delete proto.querySelectorAll;
        delete proto.querySelector;
        delete proto.focus;
        delete globalThis.getComputedStyle;
        delete globalThis.document.activeElement;
    });
    const press = (from, key) => {
        let stopped = false;
        const event = { key, target: from, preventDefault() {}, stopPropagation: () => (stopped = true) };
        for (let node = from; node && !stopped; node = node.parentNode) {
            (node.handlers?.keydown ?? []).forEach((handler) => handler(event));
        }
    };

    const picker = createCharacterSelector({
        id: "test-character",
        selected: { val: "" },
        onChange() {},
        info: null,
    });
    picker.setCharacters(gga.GetPlayersUsernames);
    await until(() => byClass(picker.node, "pick-in-place__option").length > 5, "the names to show");
    const options = byClass(picker.node, "pick-in-place__option");
    options[0].focus();
    press(options[0], "ArrowDown");
    assert.equal(globalThis.document.activeElement, options[4], "the name one line down");
});
