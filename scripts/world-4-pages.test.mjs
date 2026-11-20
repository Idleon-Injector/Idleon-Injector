// World 4 pages on the fake game, driven the way the player drives them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

// The points-left read can be made to fail once, the way the game helper throws or the connection drops.
const fixture = fakeGameData();
let failPointsRead = false;
fixture.computed._customBlock_Summoning2 = {
    ...(fixture.computed._customBlock_Summoning2 ?? {}),
    isMasteryUnlocked: 1,
    PtsLeftCook_P: () => {
        if (!failPointsRead) return 5;
        failPointsRead = false;
        throw new Error("game threw");
    },
    PtsLeftCook_Y: 3,
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
const rowByIndex = (root, index) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__index")[0]) === index);

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
    const row = rowByIndex(root, "#1");
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
    const root = await openPage("src/ui/pages/world-4/breeding/pets.js");
    const row = rowByIndex(root, "W2-3");
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
    const row = rowByIndex(root, "#1");
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
    const row = rowByIndex(root, "#3");
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
    const row = rowByIndex(root, "#4");
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
    const row = rowByIndex(root, "#5");
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

test("a kitchen save that landed shows ✓ even when reading back the other fields fails", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowByIndex(root, "#2");
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

test("changing one chip slot keeps a chip taken off in game since the page read the slots", async () => {
    const root = await openPage("src/ui/pages/world-4/laboratory/chips.js");
    const row = byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === "Player 1");
    const [, secondSlot] = byTag(row, "select");
    gga.Lab[1][0] = -1;
    secondSlot.listeners.change({ target: { value: "2" } });
    row.listeners.focusout({ target: secondSlot, currentTarget: row, relatedTarget: null });
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Lab[1][1], 2);
    assert.equal(gga.Lab[1][0], -1);
    const equipped = gga.Lab[1].filter((slot) => slot >= 0).length;
    await until(
        () => text(byClass(row, "account-row__badge")[0]) === `${equipped} EQUIPPED`,
        "the badge to count the chip taken off in game"
    );
});

for (const [name, findRow, read] of [
    ["an upgrade", (rows) => rows.find((row) => /RANK [0-9]+ ·/.test(text(row))), () => gga.CookMaster[2][0]],
    ["the Mastery Rank", (rows) => rows.find((row) => /Mastery Rank/.test(text(row))), () => gga.CookMaster[1][0] + 1],
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

test("Undo after adding a cape takes it back off the vine", async () => {
    const root = await openPage("src/ui/pages/world-4/cape-vine/cape-vine.js");
    const before = [...gga.Spelunk[54]];
    const buttonsOf = (row) => byTag(row, "button").map((node) => text(node).trim());
    const row = byClass(root, "account-row").find((node) => buttonsOf(node).includes("Add"));
    byTag(row, "button")
        .find((node) => text(node).trim() === "Add")
        .listeners.click({ detail: 1, preventDefault() {} });
    await until(() => buttonsOf(row).includes("Remove"), "the cape to be on the vine");
    assert.equal(gga.Spelunk[54].length, before.length + 1);
    await undoAction((await fetchChanges()).actions[0].id);
    assert.deepEqual([...gga.Spelunk[54]], before);
});

test("a Tome record with no field shows its value", async () => {
    const root = await openPage("src/ui/pages/world-4/tome/tome.js");
    const readOnly = byClass(root, "account-row").filter((row) => byTag(row, "input").length === 0);
    assert.ok(readOnly.length > 0, "the page has read-only records");
    const row = rowByIndex(root, "#1");
    assert.equal(byTag(row, "input").length, 0, "#1 is read-only");
    assert.equal(text(byClass(row, "account-row__badge")[0]), "791");
});
