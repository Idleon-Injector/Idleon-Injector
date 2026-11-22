// World 5 pages on the fake game, driven the way the player drives them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";
import { COSMO_UPGRADES, FOUNTAIN_UPGRADES, RANDO_LISTO_2 } from "./page-shots/data/world-5-game.mjs";

const VILLAGERS = "src/ui/pages/world-5/hole/1-villagers.js";
const CAVERNS = "src/ui/pages/world-5/hole/2-caverns.js";
const SAILING = "src/ui/pages/world-5/sailing/sailing.js";
const GAMING = "src/ui/pages/world-5/gaming/gaming.js";
const DIVINITY = "src/ui/pages/world-5/divinity/god.js";

const { router, game } = await createFakeApi(fakeGameData());
await loadUi(router);
const gga = game.gga;
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
// An attribute as the page shows it now (VanJS binds a function for one that changes).
const attr = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];

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
async function openPage(file) {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root), `${file} to load`);
    return root;
}
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
const click = (node) =>
    (node.listeners.click ?? node.onclick)({ preventDefault() {}, currentTarget: node, target: node, detail: 1 });
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const switchOf = (row) => elements(row).find((node) => node.nodeName === "input" && node.attributes.role === "switch");
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);
const yes = (root) => click(byClass(root, "tabbed-list__yes")[0]);
const radio = (root, label) => elements(root).find((node) => node.attributes.role === "radio" && text(node) === label);
const openTab = (root, label) =>
    elements(root)
        .find((node) => node.attributes.role === "tab" && text(node).trim().startsWith(label))
        .listeners.click({});

const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0]))?.[1] ?? null;
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
const typeAndEnter = (row, input, value) => {
    input.listeners.focus?.({ target: input });
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
};

test("Boats: saving a boat's Loot Value keeps a Speed level bought in game since the page read it", async () => {
    const { root } = await openPane(SAILING, "Boats");
    const row = rowNamed(root, "Boat 1");
    const [loot] = byTag(row, "input");
    gga.Boats[0][5] += 4;
    const speed = gga.Boats[0][5];
    typeAndEnter(row, loot, 77);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Boats[0][3], 77);
    assert.equal(gga.Boats[0][5], speed);
});

test("Boats: Davey Jones Training saves its buys and refuses more than the shop's 8", async () => {
    const { root } = await openPane(SAILING, "Boats");
    const row = rowNamed(root, "Davey Jones Training");
    assert.equal(
        text(byClass(row, "account-row__bonus")[0]),
        "1.50x Boat Speed, Loot Value, Artifact Find and Captain EXP each"
    );
    typeAndEnter(row, byTag(row, "input")[0], 8);
    await settled(row);
    assert.equal(gga.GemItemsPurchased[8], 8);
    typeAndEnter(row, byTag(row, "input")[0], 9);
    await until(() => stateOf(row) === "error", "the refusal");
    assert.equal(gga.GemItemsPurchased[8], 8);
});

test("Captains: a captain's name opens its bonus kinds, and a pick saves that kind", async () => {
    const { root } = await openPane(SAILING, "Captains");
    const row = rowNamed(root, "Captain 1");
    const opener = byClass(row, "row-opener")[0];
    const detail = byClass(row, "row-detail")[0];
    assert.equal(attr(detail, "hidden"), true);
    click(opener);
    await until(() => attr(detail, "hidden") === false, "the bonus kinds to open");
    assert.equal(attr(opener, "aria-expanded"), "true");
    const first = byClass(detail, "account-row")[0];
    click(radio(first, "Loot Value"));
    await until(() => gga.Captains[0][1] === 1, "the first bonus kind to save");
    await until(() => text(byClass(opener, "account-row__bonus")[0]).startsWith("Loot Value ·"), "the title to follow");
});

// Review of #123: a captain's save handed back the EXP read before it, so the row showed old EXP over a newer read.
test("Captains: saving a captain's level keeps the EXP a voyage gave since the page read it", async () => {
    const { root } = await openPane(SAILING, "Captains");
    const row = rowNamed(root, "Captain 2");
    const [, level, exp] = byTag(row, "input");
    const bonus = gga.Captains[1][5];
    gga.Captains[1][4] = 9999;
    typeAndEnter(row, level, 77);
    await until(() => gga.Captains[1][3] === 77, "the level to save");
    assert.equal(gga.Captains[1][4], 9999, "the EXP the game holds stays");
    assert.equal(gga.Captains[1][5], bonus, "an untouched bonus amount stays");
    await until(
        () => (exp.value ?? String(exp.attributes.value)) === largeFormatter(9999),
        "the EXP field to show the game's EXP"
    );
});

test("Islands: a switch unlocks one island; Lock all asks first", async (t) => {
    const before = [...gga.Sailing[0]];
    t.after(() => (gga.Sailing[0] = before));
    const { root } = await openPane(SAILING, "Islands");
    flip(rowNamed(root, "Cloudy Quay"), true);
    await until(() => gga.Sailing[0][9] === -1, "Cloudy Quay to unlock");
    click(buttonNamed(root, "Lock all"));
    await until(() => /^Lock \d+ islands\?$/.test(trayLine(root)), "the question");
    assert.equal(gga.Sailing[0][9], -1, "nothing locked yet");
    yes(root);
    await until(() => gga.Sailing[0].every((island) => island !== -1), "every island locked");
});

test("Artifacts: Max all brings every tier to Verisimilitude, one above it too; Reset all asks first", async (t) => {
    const before = [...gga.Sailing[3]];
    t.after(() => (gga.Sailing[3] = before));
    gga.Sailing[3][0] = 9;
    const { root } = await openPane(SAILING, "Artifacts");
    assert.equal(trayLine(root), `All ${before.length} artifacts`);
    click(buttonNamed(root, "Max all"));
    await until(() => gga.Sailing[3].every((tier) => tier === 7), "every artifact at 7");
    click(buttonNamed(root, "Reset all"));
    await until(() => trayLine(root) === `Reset ${before.length} artifacts to not found?`, "the question");
    assert.equal(gga.Sailing[3][1], 7, "nothing written yet");
    yes(root);
    await until(() => gga.Sailing[3].every((tier) => tier === 0), "every artifact at 0");
});

test("Garden: a plant's Log Book count saves its letter and keeps a plant found in game since", async () => {
    const { root } = await openPane(GAMING, "Garden");
    const row = rowNamed(root, "Plant 7");
    gga.Gaming[11] = "ajjhhe";
    typeAndEnter(row, byTag(row, "input")[0], 4);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Gaming[11], "ajjhhed");
});

test("Rat King: a crown's switch keeps a crown reclaimed in game since; Clear all asks first", async (t) => {
    const before = [...gga.Research[11]];
    t.after(() => (gga.Research[11] = before));
    const { root, pane } = await openPane(GAMING, "Rat King");
    // The Garden's Log Book has a "Plant 5" too: this one is the Rat King's.
    const plant = rowNamed(pane, "Plant 5");
    click(byClass(plant, "row-opener")[0]);
    gga.Research[11] = [...gga.Research[11], "9i"];
    flip(rowNamed(plant, "Base form"), true);
    await until(() => gga.Research[11].includes("4_"), "plant 5's base crown");
    assert.ok(gga.Research[11].includes("9i"), "the crown reclaimed in game stays");
    assert.ok(gga.Research[11].indexOf("4_") < gga.Research[11].indexOf("9i"), "kept in the game's order");
    click(buttonNamed(root, "Clear all"));
    await until(() => /^Clear \d+ reclaimed crowns\?$/.test(trayLine(root)), "the question");
    yes(root);
    await until(() => gga.Research[11].length === 0, "no crowns left");
});

test("Superbits: a flip keeps a superbit unlocked in game since; Lock all asks, then locks every board", async (t) => {
    const before = gga.Gaming[12];
    t.after(() => (gga.Gaming[12] = before));
    const { root, pane } = await openPane(GAMING, "Superbits");
    assert.deepEqual(byClass(pane, "account-section__title").map(text), ["Superbits", "Duperbits", "Zuperbits"]);
    // Superbit 4, the game's "d": locked on the fake game.
    const row = byClass(pane, "account-row")[4];
    gga.Gaming[12] += "Z";
    flip(row, true);
    await until(() => gga.Gaming[12].includes("d"), "the superbit to unlock");
    assert.ok(gga.Gaming[12].includes("Z"), "the one unlocked in game stays");
    click(buttonNamed(root, "Lock all"));
    await until(() => /^Lock \d+ superbits\?$/.test(trayLine(root)), "the question");
    yes(root);
    await until(() => gga.Gaming[12] === "", "every superbit locked");
});

test("Palette: a Black Stars pick saves at once", async () => {
    const { root } = await openPane(GAMING, "Palette");
    const row = rowNamed(root, "Olive Green");
    gga.Spelunk[49][0] = 0;
    click(radio(row, "★★"));
    await until(() => gga.Spelunk[49][0] === 2, "two Black Stars");
});

// A tab's pane: the rows of one cavern or villager screen (two tabs can hold a row of the same name).
const paneOf = (root, label) => {
    const tab = elements(root).find((node) => node.attributes.role === "tab" && text(node).trim().startsWith(label));
    return elements(root).find((node) => node.attributes.id === tab.attributes["aria-controls"]);
};
const openPane = async (file, label) => {
    const root = await openPage(file);
    openTab(root, label);
    await until(() => rowsIn(paneOf(root, label)), `the ${label} tab`);
    return { root, pane: paneOf(root, label) };
};
const rowsIn = (pane) => byClass(pane, "account-row").length > 0;

test("Villagers: saving a villager's level keeps the EXP it earned in game since", async () => {
    const { pane } = await openPane(VILLAGERS, "Villagers");
    const row = rowNamed(pane, "Explorer");
    gga.Holes[2][0] += 500;
    const exp = gga.Holes[2][0];
    typeAndEnter(row, byTag(row, "input")[0], 15);
    await settled(row);
    assert.equal(gga.Holes[1][0], 15);
    assert.equal(gga.Holes[2][0], exp);
});

test("Villagers › Engineer: a switch unlocks one schematic; Lock all asks first, on the Engineer's tab only", async (t) => {
    const before = [...gga.Holes[13]];
    t.after(() => (gga.Holes[13] = before));
    const { root, pane } = await openPane(VILLAGERS, "Engineer");
    flip(rowNamed(pane, "Better Buckets"), true);
    await until(() => gga.Holes[13][1] === 1, "Better Buckets to unlock");
    click(buttonNamed(root, "Lock all"));
    await until(() => /^Lock \d+ schematics\?$/.test(trayLine(root)), "the question");
    yes(root);
    await until(() => gga.Holes[13].every((built) => built === 0), "every schematic locked");
});

test("Caverns: a tab per cavern in the game's order, and Fountain's parts are groups in its list, not tabs", async () => {
    const root = await openPage(CAVERNS);
    const tabs = elements(root)
        .filter((node) => node.attributes.role === "tab")
        .map((node) => text(node).trim());
    assert.deepEqual(tabs, [
        "The Well",
        "Motherlode",
        "The Den",
        "Bravery",
        "The Bell",
        "The Harp",
        "The Lamp",
        "The Hive",
        "Grotto",
        "Justice",
        "The Jars",
        "Evertree",
        "Wisdom",
        "Gambit",
        "Temple",
        "Fountain",
        "Trench",
        "The Cove",
    ]);
    openTab(root, "Fountain");
    const pane = paneOf(root, "Fountain");
    assert.equal(elements(pane).filter((node) => node.attributes.role === "tab").length, 0, "no tabs in a tab");
    assert.deepEqual(byClass(pane, "account-section__title").map(text), [
        "Coins",
        "Lucky coins",
        "Water",
        "Blue Water upgrades",
        "Yellow Water upgrades",
        "Green Water upgrades",
    ]);
});

test("Caverns › Fountain: a water upgrade's level saves and keeps the marbles put in it in game since", async () => {
    const { pane } = await openPane(CAVERNS, "Fountain");
    const row = rowNamed(pane, FOUNTAIN_UPGRADES[0][1][0].replace(/_/g, " "));
    gga.Holes[32][0][1] = 7;
    typeAndEnter(row, byTag(row, "input")[0], 30);
    await settled(row);
    assert.equal(gga.Holes[31][0][1], 30);
    assert.equal(gga.Holes[32][0][1], 7);
});

test("Slab: Missing only shows what isn't in, Register all adds them; Unregister all asks first", async (t) => {
    const before = gga.Cards[1];
    t.after(() => (gga.Cards[1] = before));
    const root = await openPage("src/ui/pages/world-5/slab/slab.js");
    const missingOnly = byTag(root, "input").find((node) => node.attributes.type === "checkbox");
    missingOnly.listeners.change({ target: { checked: true } });
    await until(() => /^\d+ shown items?$/.test(trayLine(root)), "the tray to count the shown items");
    click(buttonNamed(root, "Register all"));
    await until(() => !/^[1-9]/.test(trayLine(root)), "every item registered");
    missingOnly.listeners.change({ target: { checked: false } });
    click(buttonNamed(root, "Unregister all"));
    await until(() => /^Unregister \d+ items\?$/.test(trayLine(root)), "the question");
    yes(root);
    await until(() => (gga.Cards[1] ?? []).length === 0, "the Slab empty");
});

for (const [file, tab, name, read, value] of [
    [SAILING, "Loot Pile", "Gold Bar", () => gga.Sailing[1][0], 60000],
    [DIVINITY, null, "Arctis", () => gga.Divinity[29], 44],
    [DIVINITY, null, "Gods unlocked", () => gga.Divinity[25], 10],
    [GAMING, "Garden", "Bits", () => gga.Gaming[0], 123456],
    [GAMING, "Imports", "Little Sprinkler", () => gga.GamingSprout[25][0], 12],
    [GAMING, "Imports", "Acorns", () => gga.Gaming[9], 4000],
    [GAMING, "Rat King", "King Tokens", () => gga.Gaming[14], 9000],
]) {
    test(`${name} saves on Enter`, async () => {
        const root = tab ? (await openPane(file, tab)).root : await openPage(file);
        const row = rowNamed(root, name);
        typeAndEnter(row, byTag(row, "input")[0], value);
        await settled(row);
        assert.equal(stateOf(row), "success");
        assert.equal(read(), value);
    });
}

for (const [file, tab, name, read, value] of [
    [VILLAGERS, "Opals", "The Well", () => gga.Holes[7][0], 11],
    [VILLAGERS, "Conjuror", COSMO_UPGRADES[0][0][2].replace(/_/g, " "), () => gga.Holes[4][0], 3],
    [VILLAGERS, "Measurer", "Measurement 1", () => gga.Holes[22][0], 9],
    [VILLAGERS, "Librarian", "The Well", () => gga.Holes[26][0], 4],
    [CAVERNS, "The Well", "Gravel", () => gga.Holes[9][0], 5000],
    [CAVERNS, "Motherlode", "Layers completed", () => gga.Holes[11][1], 41],
    [CAVERNS, "The Den", "Highscore", () => gga.Holes[11][8], 321],
    [CAVERNS, "Bravery", "AFK hours", () => gga.Holes[14][0], 200],
    [CAVERNS, "The Bell", "Method 1", () => gga.Holes[16][0], 31],
    [CAVERNS, "The Harp", "Crotchet Note", () => gga.Holes[9][10], 900],
    [CAVERNS, "The Harp", "C string", () => gga.Holes[19][0], 44],
    [CAVERNS, "The Lamp", "Bonuses unlocked", () => gga.Holes[11][24], 11],
    [CAVERNS, "The Hive", "Harvests completed", () => gga.Holes[11][3], 12],
    [CAVERNS, "Grotto", "Colonies cleared", () => gga.Holes[11][26], 8],
    [CAVERNS, "Justice", "AFK hours", () => gga.Holes[14][2], 70],
    [CAVERNS, "The Jars", "Rupie Slugs", () => gga.OptionsListAccount[355], 4],
    [CAVERNS, "Evertree", "Trunks whittled", () => gga.Holes[11][5], 9],
    [CAVERNS, "Wisdom", "Bonus 1", () => gga.Holes[15][20], 6],
    [CAVERNS, "Gambit", "King's Gambit", () => gga.Holes[11][65], 140],
    [CAVERNS, "Temple", "Torches", () => gga.Holes[11][56], 99],
    [CAVERNS, "Fountain", "Rubber duckies", () => gga.OptionsListAccount[601], 21],
    [CAVERNS, "Trench", "Layers completed", () => gga.Holes[11][7], 13],
    [CAVERNS, "The Cove", RANDO_LISTO_2[11][0].replace(/_/g, " "), () => gga.OptionsListAccount[630], 6],
]) {
    test(`Hole › ${tab}: ${name} saves on Enter`, async () => {
        const { pane } = await openPane(file, tab);
        const row = rowNamed(pane, name);
        typeAndEnter(row, byTag(row, "input")[0], value);
        await settled(row);
        assert.equal(stateOf(row), "success");
        assert.equal(read(), value);
    });
}

test("Caverns › The Lamp refuses more bonuses than the game's 11", async () => {
    const { pane } = await openPane(CAVERNS, "The Lamp");
    const row = rowNamed(pane, "Bonuses unlocked");
    const before = gga.Holes[11][24];
    typeAndEnter(row, byTag(row, "input")[0], 12);
    await settled(row);
    assert.equal(stateOf(row), "error");
    assert.equal(gga.Holes[11][24], before);
});

test("Rupie Slugs say what they do, and search finds them by the gem shop's words", async () => {
    const { default: caverns } = await importRepo(CAVERNS);
    const { pane } = await openPane(CAVERNS, "The Jars");
    assert.equal(text(byClass(rowNamed(pane, "Rupie Slugs"), "account-row__bonus")[0]), "1.5x Jar Rupie value each");
    for (const word of ["Rupie Slugs", "Limited", "Gem shop", "Fomo"]) assert.ok(caverns.keywords.includes(word));
    const { default: sailing } = await importRepo(SAILING);
    const boats = sailing.tabs.find((tab) => tab.id === "boats");
    for (const word of ["Davey Jones Training", "Limited", "Gem shop", "Fomo"])
        assert.ok(boats.keywords.includes(word));
});

test("search finds Sailing's and Gaming's tabs by name and old words, and a hit opens the page on that tab", async () => {
    const { buildMenuTree, searchEntries, searchMenu } = await importRepo("src/ui/menu/menuModel.js");
    const pages = await Promise.all([SAILING, GAMING, CAVERNS].map(async (file) => (await importRepo(file)).default));
    const entries = searchEntries(buildMenuTree(pages));
    for (const [query, label, page, tab] of [
        ["boats", "Boats", "w5.sailing", "boats"],
        ["davey jones", "Boats", "w5.sailing", "boats"],
        ["loot pile", "Loot Pile", "w5.sailing", "lootpile"],
        ["rat king", "Rat King", "w5.gaming", "ratking"],
        ["duperbits", "Superbits", "w5.gaming", "superbits"],
        ["the jars", "The Jars", "w5.hole.caverns", "jars"],
    ]) {
        const hit = searchMenu(entries, query)[0];
        assert.equal(hit.label, label, `"${query}" finds ${label}`);
        assert.deepEqual(hit.target, { world: 5, page, tab }, `"${query}" opens ${label}`);
    }
    const { default: store } = await importRepo("src/ui/state/store.js");
    const { root } = await openPane(SAILING, "Boats");
    const selected = () =>
        text(elements(root).find((node) => node.attributes.role === "tab" && attr(node, "aria-selected") === "true"));
    store.openMenu({ world: 5, page: "w5.sailing", tab: "captains" });
    await until(() => selected().trim() === "Captains", "the Captains tab to open");
    // A sidebar click leaves the open tab where the player put it.
    store.openMenu({ world: 5, page: "w5.sailing" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(selected().trim(), "Captains");
});
