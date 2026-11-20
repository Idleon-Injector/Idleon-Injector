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
const typeAndEnter = (row, input, value) => {
    input.listeners.focus?.({ target: input });
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
};

test("saving a meal's Level keeps the Amount and Ribbon the game moved on since the page read them", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/2-meals.js");
    const row = rowByIndex(root, "#1");
    const [level] = byTag(row, "input");
    gga.Meals[2][1] = 50000;
    gga.Ribbon[29] = 9;
    typeAndEnter(row, level, 7);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Meals[0][1], 7);
    assert.equal(gga.Meals[2][1], 50000);
    assert.equal(gga.Ribbon[29], 9);
});

test("saving a pet's DNA keeps the Breedability and Shiny Days the game counted since the page read them", async () => {
    const root = await openPage("src/ui/pages/world-4/breeding/pets.js");
    const row = rowByIndex(root, "W2-3");
    const [dna] = byTag(row, "input");
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
});

test("saving a kitchen's Fire keeps a Speed level bought in game since the page read it", async () => {
    const root = await openPage("src/ui/pages/world-4/cooking/1-tables.js");
    const row = rowByIndex(root, "#1");
    const [, fire] = byTag(row, "input");
    gga.Cooking[0][6] += 5;
    const speed = gga.Cooking[0][6];
    typeAndEnter(row, fire, 3);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Cooking[0][7], 3);
    assert.equal(gga.Cooking[0][6], speed);
});

test("changing one chip slot keeps a chip swapped in game since the page read the slots", async () => {
    const root = await openPage("src/ui/pages/world-4/laboratory/chips.js");
    const row = byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === "Player 1");
    const [, secondSlot] = byTag(row, "select");
    gga.Lab[1][0] = 5;
    secondSlot.listeners.change({ target: { value: "2" } });
    row.listeners.focusout({ target: secondSlot, currentTarget: row, relatedTarget: null });
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Lab[1][1], 2);
    assert.equal(gga.Lab[1][0], 5);
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
