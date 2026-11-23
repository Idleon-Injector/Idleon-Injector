// World 4 pages on the fake game, driven the way the player drives them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

// The points-left read can be made to fail once, the way the game helper throws or the connection drops.
const fixture = fakeGameData();
let failPointsRead = false;
let failMealPointsRead = false;
fixture.computed._customBlock_Summoning2 = {
    ...(fixture.computed._customBlock_Summoning2 ?? {}),
    isMasteryUnlocked: 1,
    PtsLeftCook_P: () => {
        if (!failPointsRead) return 5;
        failPointsRead = false;
        throw new Error("game threw");
    },
    PtsLeftCook_Y: () => {
        if (!failMealPointsRead) return 3;
        failMealPointsRead = false;
        throw new Error("game threw");
    },
};
const { router, game } = await createFakeApi(fixture);
await loadUi(router);
const gga = game.gga;
const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
const { fetchChanges } = await importRepo("src/ui/services/api.js");
const { largeFormatter } = await importRepo("src/ui/components/views/account/accountShared.js");

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

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
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
async function openPage(file) {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root), `${file} to load`);
    return root;
}
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
const click = (node) => node.listeners.click({ preventDefault() {}, currentTarget: node, target: node, detail: 1 });
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const switchOf = (row) => elements(row).find((node) => node.nodeName === "input" && node.attributes.role === "switch");
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);

const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0]))?.[1] ?? null;
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
// What a field shows: a formatted field and typing set the property; a plain one binds the attribute.
const shown = (input) => input.value ?? String(input.attributes.value);
const typeAndEnter = (row, input, value) => {
    input.listeners.focus?.({ target: input });
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
};

test("saving a meal's Level keeps the Amount and Ribbon the game moved on since the page read them", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/2-meals.js");
    const row = rowNamed(root, "Egg");
    const [level, amount, ribbon] = byTag(row, "input");
    gga.Meals[2][1] = 50000;
    gga.Ribbon[29] = 9;
    typeAndEnter(row, level, 7);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Meals[0][1], 7);
    assert.equal(gga.Meals[2][1], 50000);
    assert.equal(gga.Ribbon[29], 9);
    // The fields beside the ✓ show what the game holds, not what the page read before.
    await until(() => shown(amount) === largeFormatter(50000) && shown(ribbon) === "9", "the game's Amount and Ribbon");
});

test("saving a pet's DNA keeps the Breedability and Shiny Days the game counted since the page read them", async () => {
    const root = await openPage("src/ui/pages/world-4/breeding/3-pets.js");
    const row = rowNamed(root, "Crabcake");
    const [dna, breedField, shinyField] = byTag(row, "input");
    gga.Breeding[14][2] += 777;
    gga.Breeding[23][2] += 1.5;
    const [breed, shiny] = [gga.Breeding[14][2], gga.Breeding[23][2]];
    dna.listeners.focus?.({ target: dna });
    dna.value = "17";
    dna.listeners.input({ target: dna });
    dna.listeners.blur?.({ target: dna });
    row.listeners.focusout({ target: dna, currentTarget: row, relatedTarget: null });
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Breeding[5][2], 17);
    assert.equal(gga.Breeding[14][2], breed);
    assert.equal(gga.Breeding[23][2], shiny);
    await until(
        () => shown(breedField) === largeFormatter(breed) && shown(shinyField) === largeFormatter(shiny),
        "the game's Breedability and Shiny Days"
    );
});

test("saving a kitchen's Fire keeps a Speed level bought in game since the page read it", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowNamed(root, "Kitchen 1");
    const [speedField, fire] = byTag(row, "input");
    gga.Cooking[0][6] += 5;
    const speed = gga.Cooking[0][6];
    typeAndEnter(row, fire, 3);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Cooking[0][7], 3);
    assert.equal(gga.Cooking[0][6], speed);
    await until(() => shown(speedField) === String(speed), "the game's Speed");
});

// Review of #117: the queued save saw the Speed it was committed with as an edit once the first save read Speed back.
test("a kitchen save queued behind another keeps the Speed the game moved on meanwhile", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowNamed(root, "Kitchen 3");
    const [, fire, luck] = byTag(row, "input");
    const realFetch = globalThis.fetch;
    let release;
    const held = new Promise((resolve) => (release = resolve));
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && ++writes === 1) await held;
        return realFetch(url, options);
    };
    try {
        typeAndEnter(row, fire, 5);
        await until(() => writes === 1, "the Fire save to reach the game");
        gga.Cooking[2][6] += 5;
        const speed = gga.Cooking[2][6];
        typeAndEnter(row, luck, 6);
        release();
        await until(() => gga.Cooking[2][8] === 6 && stateOf(row) === "success", "the Luck save");
        assert.deepEqual([gga.Cooking[2][7], gga.Cooking[2][8]], [5, 6]);
        assert.equal(gga.Cooking[2][6], speed, "the Speed bought in game isn't put back");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
});

// Review of #117, second round: a queued save of the value the field started at (1, save 2, then 1) was dropped.
test("a kitchen Fire set back to its first value while the change saves is saved too", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowNamed(root, "Kitchen 4");
    const [, fire] = byTag(row, "input");
    const first = gga.Cooking[3][7];
    const realFetch = globalThis.fetch;
    let release;
    const held = new Promise((resolve) => (release = resolve));
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && ++writes === 1) await held;
        return realFetch(url, options);
    };
    try {
        typeAndEnter(row, fire, first + 1);
        await until(() => writes === 1, "the first save to reach the game");
        typeAndEnter(row, fire, first);
        release();
        await until(() => writes === 2 && gga.Cooking[3][7] === first, "Fire to go back to its first value");
        await settled(row);
        assert.equal(stateOf(row), "success");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
});

// Review of #117, third round: Speed shown again after the first save's read-back counted as an edit in the third save.
test("a third kitchen save doesn't write the Speed an earlier save showed over a newer one", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowNamed(root, "Kitchen 5");
    const [, fire, luck] = byTag(row, "input");
    const realFetch = globalThis.fetch;
    const releases = [];
    const held = [1, 2].map(() => new Promise((resolve) => releases.push(resolve)));
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) {
            const n = ++writes;
            if (n <= 2) await held[n - 1];
        }
        return realFetch(url, options);
    };
    try {
        typeAndEnter(row, fire, 5);
        await until(() => writes === 1, "the first Fire save to reach the game");
        gga.Cooking[4][6] += 5;
        typeAndEnter(row, luck, 6);
        releases[0]();
        await until(() => writes === 2, "the Luck save to reach the game");
        gga.Cooking[4][6] += 5;
        const speed = gga.Cooking[4][6];
        typeAndEnter(row, fire, 7);
        releases[1]();
        await until(() => gga.Cooking[4][7] === 7 && stateOf(row) === "success", "the second Fire save");
        assert.equal(gga.Cooking[4][8], 6);
        assert.equal(gga.Cooking[4][6], speed, "the Speed bought in game isn't put back");
    } finally {
        globalThis.fetch = realFetch;
        releases.forEach((release) => release());
    }
});

// Review of #117, fourth round: the queued save moved Speed's stored value on but left the Speed the first save showed,
// so an edit after both saves wrote that old Speed back.
test("a kitchen edit after two saves shows and keeps the Speed the second save read", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowNamed(root, "Kitchen 6");
    const [speedField, fire, luck] = byTag(row, "input");
    const realFetch = globalThis.fetch;
    const releases = [];
    const held = [1, 2].map(() => new Promise((resolve) => releases.push(resolve)));
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) {
            const n = ++writes;
            if (n <= 2) await held[n - 1];
        }
        return realFetch(url, options);
    };
    let speed;
    try {
        typeAndEnter(row, fire, 5);
        await until(() => writes === 1, "the Fire save to reach the game");
        gga.Cooking[5][6] += 5;
        typeAndEnter(row, luck, 6);
        releases[0]();
        await until(() => writes === 2, "the Luck save to reach the game");
        gga.Cooking[5][6] += 5;
        speed = gga.Cooking[5][6];
        releases[1]();
        await until(() => gga.Cooking[5][8] === 6 && stateOf(row) === "success", "the Luck save");
        await settled(row);
        assert.equal(shown(speedField), String(speed), "the Speed the second save read is shown");
    } finally {
        globalThis.fetch = realFetch;
        releases.forEach((release) => release());
    }
    typeAndEnter(row, fire, 7);
    await until(() => gga.Cooking[5][7] === 7 && stateOf(row) === "success", "the second Fire save");
    assert.equal(gga.Cooking[5][6], speed, "the Speed bought in game isn't put back");
});

test("a kitchen save that landed shows ✓ even when reading back the other fields fails", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowNamed(root, "Kitchen 2");
    const [speedField, fire] = byTag(row, "input");
    const shownSpeed = shown(speedField);
    const speed = gga.Cooking[1][6];
    // A value the game can't send back makes that path's read fail.
    gga.Cooking[1][6] = {
        toJSON() {
            throw new Error("unreadable");
        },
    };
    try {
        typeAndEnter(row, fire, 4);
        await settled(row);
        assert.equal(stateOf(row), "success");
        assert.equal(gga.Cooking[1][7], 4);
        assert.equal(shown(speedField), shownSpeed);
    } finally {
        gga.Cooking[1][6] = speed;
    }
});

test("picking a chip for a slot saves that slot only, keeping a chip taken off in game since the page read them", async () => {
    const root = await openPage("src/ui/pages/world-4/laboratory/chips.js");
    const row = byClass(root, "account-row").find((node) =>
        text(byClass(node, "account-row__name")[0]).startsWith("Slot 2")
    );
    gga.Lab[1][0] = -1;
    const opener = byClass(row, "row-opener")[0];
    click(opener);
    const option = byClass(row, "pick-in-place__option").find((node) => text(node).startsWith("Potato Chip"));
    click(option);
    await until(() => gga.Lab[1][1] === 4 && stateOf(row) === "success", "the picked chip to save");
    assert.equal(gga.Lab[1][0], -1, "the chip taken off in game stays off");
    assert.match(text(opener), /Basic Attack spd %/, "the slot shows the chip by its bonus");
    assert.match(text(opener), /Slot 2 · Potato Chip/);
});

for (const [name, findRow, read] of [
    ["an upgrade", (rows) => rows.find((row) => /from rank [0-9]+/.test(text(row))), () => gga.CookMaster[2][0]],
    ["the Mastery rank", (rows) => rows.find((row) => /Mastery rank/.test(text(row))), () => gga.CookMaster[1][0] + 1],
]) {
    test(`a Mastery save of ${name} that landed shows ✓ even when the points-left read fails`, async () => {
        const root = await openPage("src/ui/pages/world-4/cooking/3-mastery.js");
        const row = findRow(byClass(root, "account-row"));
        const [input] = byTag(row, "input");
        failPointsRead = true;
        typeAndEnter(row, input, 9);
        await settled(row);
        assert.equal(failPointsRead, false, "the points read ran and failed");
        assert.equal(stateOf(row), "success");
        assert.equal(read(), 9);
    });
}

const titleTotal = (root) => text(byClass(root, "amount-left")[0] ?? "").trim();

test("a failed Mastery points read says beside the title that the points may be off, until the next good read", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/3-mastery.js");
    click(byClass(root, "tabbed-list__tab").find((node) => text(node) === "Upgrades"));
    await until(() => /^5 points left$/.test(titleTotal(root)), "the Upgrades tab's points beside the title");
    const row = byClass(root, "account-row").find((node) => /from rank [0-9]+/.test(text(node)));
    const [input] = byTag(row, "input");
    failPointsRead = true;
    typeAndEnter(row, input, 4);
    await settled(row);
    await until(() => titleTotal(root) === "Points may be off. Refresh.", "the points to say they may be off");
    typeAndEnter(row, input, 5);
    await until(() => titleTotal(root) === "5 points left", "the next good read to show the points again");
    click(byClass(root, "tabbed-list__tab").find((node) => text(node) === "Rank"));
    await until(() => titleTotal(root) === "", "the Rank tab to show no points");
});

test("a meal's Mastery saves from the Meals table, and its points left beside the title follow", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/2-meals.js");
    const row = rowNamed(root, "Salad");
    const [level, , , mastery] = byTag(row, "input");
    await until(() => titleTotal(root) === "3 mastery points left", "the meal mastery points");
    const levelBefore = gga.Meals[0][2];
    typeAndEnter(row, mastery, 7);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.CookMaster[0][2], 7);
    assert.equal(gga.Meals[0][2], levelBefore, "only the changed column is written");
    assert.equal(shown(level), String(levelBefore));
    failMealPointsRead = true;
    typeAndEnter(row, mastery, 8);
    await until(
        () => gga.CookMaster[0][2] === 8 && stateOf(row) === "success",
        "the save to land even though the points read fails"
    );
    await until(() => titleTotal(root) === "Points may be off. Refresh.", "the points to say they may be off");
});

test("Cape Vine never lists Lava Wings, and counts the capes on the vine", async () => {
    const root = await openPage("src/ui/pages/world-4/cape-vine/cape-vine.js");
    assert.equal(rowNamed(root, "Lava Wings"), undefined);
    assert.equal(trayLine(root), "All 13 capes · 5 on the vine");
});

test("a cape switched on goes on the vine, and Undo takes it back off", async () => {
    const root = await openPage("src/ui/pages/world-4/cape-vine/cape-vine.js");
    const before = [...gga.Spelunk[54]];
    const row = byClass(root, "cape-vine-row").find((node) => !before.includes(node.attributes["data-item"]));
    flip(row, true);
    await until(() => gga.Spelunk[54].length === before.length + 1, "the cape to be on the vine");
    // The vine's own write, not whichever action the log lists first.
    let added;
    for (let i = 0; i < 300 && !added; i++) {
        added = (await fetchChanges()).actions.find((action) =>
            action.entries.some((entry) => entry.path === "Spelunk[54]")
        );
        if (!added) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(added, "the change log lists the vine's write");
    await undoAction(added.id);
    assert.deepEqual([...gga.Spelunk[54]], before);
});

test("a cape switched off leaves the vine and the Slab, so the game won't put it back", async () => {
    const root = await openPage("src/ui/pages/world-4/cape-vine/cape-vine.js");
    const capeId = gga.Spelunk[54][0];
    gga.Cards[1] = [...(gga.Cards[1] ?? []), capeId];
    const row = byClass(root, "cape-vine-row").find((node) => node.attributes["data-item"] === capeId);
    flip(row, false);
    await until(() => !gga.Spelunk[54].includes(capeId) && !gga.Cards[1].includes(capeId), "the cape to leave both");
});

test("a Tome record with no field shows its value as plain text", async () => {
    const root = await openPage("src/ui/pages/world-4/tome/tome.js");
    const row = rowNamed(root, "Statue Total LV");
    assert.equal(byTag(row, "input").length, 0, "the Tome only counts it");
    assert.equal(text(byClass(row, "tome-row__value")[0]), "791");
    assert.ok(rowNamed(root, "Total Talent Max LV"), "the game's marks are taken off the names");
});

test("Eggs: Max all raises every egg in one press; Reset all asks in the tray first", async (t) => {
    const before = [...gga.Breeding[0]];
    t.after(() => (gga.Breeding[0] = before));
    gga.Breeding[0][0] = 15;
    const root = await openPage("src/ui/pages/world-4/breeding/1-eggs.js");
    assert.equal(trayLine(root), "All 8 eggs");
    click(buttonNamed(root, "Max all"));
    await until(() => gga.Breeding[0].every((egg) => egg === 11), "every egg at 11, the one above it too");
    click(buttonNamed(root, "Reset all"));
    await until(() => trayLine(root) === "Reset 8 eggs to 0?", "the question");
    assert.ok(
        gga.Breeding[0].every((egg) => egg === 11),
        "nothing written yet"
    );
    click(byClass(root, "tabbed-list__yes")[0]);
    await until(() => gga.Breeding[0].every((egg) => egg === 0), "the eggs at 0");
});

test("an egg saved while Max all is answered keeps showing the rarity it saved, even back to its old one (#222)", async (t) => {
    const before = [...gga.Breeding[0]];
    t.after(() => (gga.Breeding[0] = before));
    gga.Breeding[0] = gga.Breeding[0].map(() => 0);
    const root = await openPage("src/ui/pages/world-4/breeding/1-eggs.js");
    // The fake DOM keeps the typed text on the property; what the page binds since is the attribute.
    const bound = (name) => String(byTag(rowNamed(root, name), "input")[0].attributes.value);
    // Max all's writes land in the game, but its answer waits until the egg's own saves have landed and finished.
    const realFetch = globalThis.fetch;
    let release;
    const held = new Promise((resolve) => (release = resolve));
    let landed = false;
    globalThis.fetch = async (url, options) => {
        const answer = await realFetch(url, options);
        if (String(url).includes("/write") && String(options?.body ?? "").includes("Breeding[0][1]")) {
            landed = true;
            await held;
        }
        return answer;
    };
    let maxAll;
    try {
        maxAll = click(buttonNamed(root, "Max all"));
        await until(() => landed, "Max all's writes to land");
        const row = rowNamed(root, "Egg 1");
        typeAndEnter(row, byTag(row, "input")[0], 5);
        await until(() => gga.Breeding[0][0] === 5 && bound("Egg 1") === "5", "the egg's save of 5");
        // Back to the rarity it had when Max all started: its value alone can't tell it was saved.
        typeAndEnter(row, byTag(row, "input")[0], 0);
        await until(
            () => gga.Breeding[0][0] === 0 && bound("Egg 1") === "0" && stateOf(row) === "success",
            "the egg's save of 0"
        );
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await maxAll;
    await until(() => bound("Egg 2") === "11", "the others to show Max all's rarity");
    assert.equal(gga.Breeding[0][1], 11);
    assert.equal(gga.Breeding[0][0], 0, "the game holds the egg's own save");
    assert.equal(bound("Egg 1"), "0", "the row shows what the game holds");
});

test("an egg whose save fails while Max all is answered shows Max all's rarity, and Escape puts it back (#222)", async (t) => {
    const before = [...gga.Breeding[0]];
    t.after(() => (gga.Breeding[0] = before));
    gga.Breeding[0] = gga.Breeding[0].map(() => 0);
    const root = await openPage("src/ui/pages/world-4/breeding/1-eggs.js");
    const bound = (name) => String(byTag(rowNamed(root, name), "input")[0].attributes.value);
    // Max all's writes land, its answer waits; the egg's own save fails meanwhile, as when the connection drops.
    const realFetch = globalThis.fetch;
    let release;
    const held = new Promise((resolve) => (release = resolve));
    let landed = false;
    globalThis.fetch = async (url, options) => {
        const body = String(options?.body ?? "");
        const write = String(url).includes("/write");
        if (write && body.includes("Breeding[0][1]")) {
            const answer = await realFetch(url, options);
            landed = true;
            await held;
            return answer;
        }
        if (write && body.includes("Breeding[0][0]")) throw new Error("the connection dropped");
        return realFetch(url, options);
    };
    let maxAll;
    const row = rowNamed(root, "Egg 1");
    try {
        maxAll = click(buttonNamed(root, "Max all"));
        await until(() => landed, "Max all's writes to land");
        typeAndEnter(row, byTag(row, "input")[0], 5);
        await until(() => stateOf(row) === "error", "the egg's save to fail");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await maxAll;
    await until(() => bound("Egg 2") === "11", "the others to show Max all's rarity");
    assert.equal(gga.Breeding[0][0], 11, "the game holds Max all's rarity");
    row.listeners.keydown({ key: "Escape", target: byTag(row, "input")[0], preventDefault() {} });
    await until(() => bound("Egg 1") === "11", "Escape to put back the rarity the game holds");
});

test("Upgrades: bonus first, the filler slot's bonus is Breeding EXP, and Max all brings one above its max down", async (t) => {
    const before = [...gga.Breeding[2]];
    t.after(() => (gga.Breeding[2] = before));
    gga.Breeding[2][1] = 999;
    const root = await openPage("src/ui/pages/world-4/breeding/2-upgrades.js");
    const bonusOf = (name) => text(byClass(rowNamed(root, name), "account-row__bonus")[0]);
    assert.equal(bonusOf("No Upgrade Selected"), "Breeding EXP %");
    assert.equal(bonusOf("Egg Capacity"), "Egg Max");
    assert.equal(trayLine(root), "All 13 upgrades");
    click(buttonNamed(root, "Max all"));
    await until(() => gga.Breeding[2][1] === 50, "the upgrade above its max at 50");
    assert.equal(gga.Breeding[2][2], 100);
    click(buttonNamed(root, "Reset all"));
    await until(() => trayLine(root) === "Reset 13 upgrades to 0?", "the question");
    assert.equal(gga.Breeding[2][2], 100, "nothing written yet");
    click(byClass(root, "tabbed-list__yes")[0]);
    await until(() => gga.Breeding[2].every((level) => level === 0), "the upgrades at 0");
});

test("Jewels: a switch unlocks one jewel; Lock all asks first", async (t) => {
    const before = [...gga.Lab[14]];
    t.after(() => (gga.Lab[14] = before));
    const root = await openPage("src/ui/pages/world-4/laboratory/jewels.js");
    flip(rowNamed(root, "Amethyst Rhinestone"), true);
    await until(() => gga.Lab[14][0] === 1, "the jewel to unlock");
    click(buttonNamed(root, "Lock all"));
    await until(() => /^Lock \d+ jewels\?$/.test(trayLine(root)), "the question");
    assert.equal(gga.Lab[14][0], 1, "nothing locked yet");
    click(byClass(root, "tabbed-list__yes")[0]);
    await until(() => gga.Lab[14].every((jewel) => jewel === 0), "every jewel locked");
});

for (const [file, name, read, value] of [
    ["src/ui/pages/world-4/rift/rift.js", "Rift levels completed", () => gga.Rift[0], 31],
    ["src/ui/pages/world-4/cooking/4-spices.js", "Jungle Spice", () => gga.Meals[3][1], 500],
    ["src/ui/pages/world-4/breeding/4-territory.js", "Territories unlocked", () => gga.OptionsListAccount[85], 20],
    ["src/ui/pages/world-4/breeding/2-upgrades.js", "Dead cells", () => gga.Breeding[3][8], 60000],
    ["src/ui/pages/world-4/breeding/5-arena.js", "Best round", () => gga.OptionsListAccount[89], 80],
    ["src/ui/pages/world-4/breeding/5-arena.js", "Best Crucible round", () => gga.OptionsListAccount[628], 15],
]) {
    test(`${name} saves on Enter`, async () => {
        const root = await openPage(file);
        const row = rowNamed(root, name);
        typeAndEnter(row, byTag(row, "input")[0], value);
        await settled(row);
        assert.equal(stateOf(row), "success");
        assert.equal(read(), value);
    });
}

test("Territories unlocked refuses a count over the game's 26", async () => {
    const root = await openPage("src/ui/pages/world-4/breeding/4-territory.js");
    const row = rowNamed(root, "Territories unlocked");
    const before = gga.OptionsListAccount[85];
    typeAndEnter(row, byTag(row, "input")[0], 30);
    await settled(row);
    assert.equal(stateOf(row), "error");
    assert.equal(gga.OptionsListAccount[85], before);
});

// Review of #221: a write held at the server until `release`, for the paths `match` picks. `release.reached` resolves
// once such a write arrives.
const holdWrites = (match) => {
    const realFetch = globalThis.fetch;
    let release;
    let arrived;
    const held = new Promise((resolve) => (release = resolve));
    const reached = new Promise((resolve) => (arrived = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && match(String(options?.body ?? ""))) {
            arrived();
            await held;
        }
        return realFetch(url, options);
    };
    return Object.assign(
        () => {
            release();
            globalThis.fetch = realFetch;
        },
        { reached }
    );
};
// Requests whose body `match` picks fail, the way a dropped connection does.
const failRequests = (match) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (match(String(url), String(options?.body ?? ""))) throw new Error("the connection dropped");
        return realFetch(url, options);
    };
    return () => (globalThis.fetch = realFetch);
};

for (const [file, path, what] of [
    ["src/ui/pages/world-4/breeding/4-territory.js", 85, "the territories unlocked"],
    ["src/ui/pages/world-4/breeding/5-arena.js", 89, "the best round"],
    ["src/ui/pages/world-4/breeding/5-arena.js", 628, "the best crucible round"],
]) {
    test(`a value for ${what} that isn't a count is refused, not shown as an editable 0`, async (t) => {
        const before = gga.OptionsListAccount[path];
        t.after(() => (gga.OptionsListAccount[path] = before));
        gga.OptionsListAccount[path] = "invalid";
        const root = (await importRepo(file)).default.component();
        await until(
            () => text(root).includes(`Couldn't read ${what}. Refresh to try again.`),
            "the read to be refused"
        );
        gga.OptionsListAccount[path] = undefined;
        const fresh = await openPage(file);
        assert.ok(byTag(fresh, "input").length > 0, "an untouched option reads as 0");
    });
}

test("a cape whose Slab cleanup fails stays on the vine, and flipping it off again finishes", async () => {
    const root = await openPage("src/ui/pages/world-4/cape-vine/cape-vine.js");
    const capeId = gga.Spelunk[54][0];
    gga.Cards[1] = [...(gga.Cards[1] ?? []), capeId];
    const row = byClass(root, "cape-vine-row").find((node) => node.attributes["data-item"] === capeId);
    const restore = failRequests((url, body) => url.includes("/write") && body.includes("Cards[1]"));
    try {
        flip(row, false);
        await until(() => /connection dropped|Couldn't|failed/i.test(text(row)), "the switch to say the save failed");
        assert.ok(gga.Spelunk[54].includes(capeId), "the cape is still on the vine");
        assert.ok(gga.Cards[1].includes(capeId), "and on the Slab");
    } finally {
        restore();
    }
    flip(row, false);
    await until(() => !gga.Spelunk[54].includes(capeId) && !gga.Cards[1].includes(capeId), "the retry to finish");
});

test("a cape added whose vine can't be read again shows on and says to refresh", async () => {
    const root = await openPage("src/ui/pages/world-4/cape-vine/cape-vine.js");
    const before = [...gga.Spelunk[54]];
    const row = byClass(root, "cape-vine-row").find((node) => !before.includes(node.attributes["data-item"]));
    let written = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        const body = String(options?.body ?? "");
        if (String(url).includes("/write") && body.includes("Spelunk[54]")) {
            const answer = await realFetch(url, options);
            written = true;
            return answer;
        }
        if (written && String(url).includes("/read") && body.includes("Spelunk[54]")) throw new Error("dropped");
        return realFetch(url, options);
    };
    try {
        flip(row, true);
        await until(
            () => text(row).includes("Saved, but couldn't read the vine again. Refresh."),
            "the switch to say so"
        );
        assert.equal(gga.Spelunk[54].length, before.length + 1, "the cape is on the vine");
        assert.equal(switchOf(row).checked, true, "the switch shows it on");
    } finally {
        globalThis.fetch = realFetch;
        gga.Spelunk[54] = before;
    }
});

// The shown character's row for a chip slot ("Slot 3"); another character's rows are kept, hidden.
const slotRow = (root, slot) =>
    byClass(root, "chip-slot-row").find(
        (node) =>
            node.parentNode && !node.parentNode.hidden && text(byClass(node, "account-row__name")[0]).startsWith(slot)
    );
const pickCharacter = (root, index) => {
    click(byClass(root, "character-picker__opener")[0]);
    click(byClass(byClass(root, "character-picker__list")[0], "pick-in-place__option")[index]);
};
// The fake DOM says every node is in the page, but VanJS stops updating a node that isn't: `node` and everything in it
// say truly whether they are in `root`, the way a browser does.
const trackConnection = (node, root) => {
    if (typeof node !== "object") return; // plain text the fake keeps as a string
    Object.defineProperty(node, "isConnected", {
        get() {
            for (let at = this; at !== root; at = at.parentNode)
                if (!at.parentNode?.childNodes.includes(at)) return false;
            return true;
        },
    });
    for (const child of node.childNodes ?? []) trackConnection(child, root);
};
const pickWoodChip = (row) => {
    click(byClass(row, "row-opener")[0]);
    click(byClass(row, "pick-in-place__option").find((node) => text(node).startsWith("Wood Chip")));
};

test("a chip slot keeps its Undo when the character picker moves away and back", async () => {
    const root = await openPage("src/ui/pages/world-4/laboratory/chips.js");
    const row = slotRow(root, "Slot 3");
    pickWoodChip(row);
    await until(() => gga.Lab[1][2] === 14 && stateOf(row) === "success", "the pick to save");
    pickCharacter(root, 1);
    await until(() => slotRow(root, "Slot 3") !== row, "the second character's slots");
    pickCharacter(root, 0);
    await until(() => slotRow(root, "Slot 3") === row, "the first character's own row back");
    assert.ok(
        byTag(row, "button").some((node) => /Undo/.test(text(node))),
        "its Undo is still offered"
    );
});

test("a chip slot whose save ends while another character shows says so when it shows again", async (t) => {
    const before = gga.Lab[1][3];
    t.after(() => (gga.Lab[1][3] = before));
    const root = await openPage("src/ui/pages/world-4/laboratory/chips.js");
    const row = slotRow(root, "Slot 4");
    trackConnection(row, root);
    const release = holdWrites((body) => body.includes("Lab[1][3]"));
    try {
        pickWoodChip(row);
        await release.reached;
        pickCharacter(root, 1);
        await until(() => slotRow(root, "Slot 4") !== row, "the second character's slots");
    } finally {
        release();
    }
    // Still in the page while hidden, so it follows its save.
    await until(() => gga.Lab[1][3] === 14 && stateOf(row) === "success", "the hidden row to say it saved");
    pickCharacter(root, 0);
    await until(() => slotRow(root, "Slot 4") === row, "the first character's own row back");
    assert.match(text(byClass(row, "account-row__name")[0]), /Wood Chip/, "its title names the new chip");
    assert.ok(
        byTag(row, "button").some((node) => /Undo/.test(text(node))),
        "its Undo is offered"
    );
});

test("Unlock all waits for a jewel switched off just before, and unlocks it too", async (t) => {
    const before = [...gga.Lab[14]];
    t.after(() => (gga.Lab[14] = before));
    // Every jewel unlocked but one, so Unlock all has work to do.
    gga.Lab[14] = gga.Lab[14].map((_, i) => (i === 1 ? 0 : 1));
    const root = await openPage("src/ui/pages/world-4/laboratory/jewels.js");
    const release = holdWrites((body) => body.includes("Lab[14][0]"));
    try {
        flip(rowNamed(root, "Amethyst Rhinestone"), false);
        await new Promise((resolve) => setTimeout(resolve, 30));
        click(buttonNamed(root, "Unlock all"));
        await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
        release();
    }
    // Both saves have ended by now (the fake game answers at once): the switch's, then Unlock all's after it.
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(
        gga.Lab[14].map((jewel, i) => [i, jewel]).filter(([, jewel]) => jewel !== 1),
        [],
        "every jewel unlocked, the one switched off too"
    );
});
