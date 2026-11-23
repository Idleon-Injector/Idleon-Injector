// World 6 pages on the fake game (the game's real names and bonuses, world-6-game.mjs), driven the way the player drives
// them: each page is one sidebar entry with the game's screens as tabs, and every save lands where the game keeps it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

const FARMING = "src/ui/pages/world-6/farming/farming.js";
const SNEAKING = "src/ui/pages/world-6/sneaking/1-sneaking.js";
const SUMMONING = "src/ui/pages/world-6/summoning/1-summoning.js";
const SNEAKING_AUTOMATION = "src/ui/pages/world-6/sneaking/2-automation.js";
const SUMMONING_AUTOMATION = "src/ui/pages/world-6/summoning/2-automation.js";
const BEANSTALK = "src/ui/pages/world-6/beanstalk/beanstalk.js";
const EMPEROR = "src/ui/pages/world-6/emperor/emperor.js";

// The automation tabs read the game again every few seconds while one runs; that timer mustn't keep the file running.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const fixture = fakeGameData();
const { router, game } = await createFakeApi(fixture);
await loadUi(router);
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const gga = game.gga;

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
const disabled = (node) => attr(node, "disabled") === true;

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
const tabNamed = (root, label) =>
    elements(root).find((node) => node.attributes.role === "tab" && text(node).trim().startsWith(label));
const paneOf = (root, label) =>
    elements(root).find((node) => node.attributes.id === tabNamed(root, label).attributes["aria-controls"]);
const rowsIn = (pane) => byClass(pane, "account-row").filter((row) => !classes(row).includes("account-row--head"));
// A page opened on one of its tabs: the tab's own rows are its pane's.
const openPane = async (file, label) => {
    const root = await openPage(file);
    tabNamed(root, label).listeners.click({});
    await until(() => rowsIn(paneOf(root, label)).length > 0, `the ${label} tab`);
    return { root, pane: paneOf(root, label) };
};
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]).trim() === name);
const names = (pane) => rowsIn(pane).map((row) => text(byClass(row, "account-row__name")[0]).trim());
const click = (node) =>
    (node.listeners.click ?? node.onclick)({ preventDefault() {}, currentTarget: node, target: node, detail: 1 });
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const switchOf = (row) => elements(row).find((node) => node.nodeName === "input" && node.attributes.role === "switch");
const wordsOf = (row) => text(byClass(row, "state-switch__words")[0]);
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);
const yes = (root) => click(byClass(root, "tabbed-list__yes")[0]);

const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0] ?? { attributes: {} }))?.[1];
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
const fieldOf = (row) => byTag(row, "input").find((node) => node.attributes.role !== "switch");
const shown = (row) => String(fieldOf(row).attributes.value);
const capOf = (row) => {
    const cap = byClass(row, "number-input__cap")[0];
    return cap && !attr(cap, "hidden") ? text(cap.childNodes[0]) : "";
};
const focus = (input) => input.listeners.focus?.({ target: input });
const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const press = (row, input, key) => row.listeners.keydown({ key, target: input, preventDefault() {} });
const leave = (row, input, to = null) => {
    input.listeners.blur?.({ target: input, relatedTarget: to });
    row.listeners.focusout({ target: input, currentTarget: row, relatedTarget: to });
};
const typeAndEnter = (row, value, input = fieldOf(row)) => {
    focus(input);
    type(input, value);
    press(row, input, "Enter");
};

// Hold the requests to one route until released; `reached` says one arrived.
const hold = (route) => {
    const realFetch = globalThis.fetch;
    let release;
    let reached = false;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes(route)) {
            reached = true;
            await gate;
        }
        return realFetch(url, options);
    };
    return {
        reached: () => reached,
        release: () => {
            globalThis.fetch = realFetch;
            release();
        },
    };
};

// ---- The menu ----------------------------------------------------------------------------------------------------

test("World 6 has five systems; Sneaking and Summoning keep Automation as their own sidebar entry", async () => {
    const { buildMenuTree, pageTitle } = await importRepo("src/ui/menu/menuModel.js");
    const pages = await Promise.all(
        [FARMING, SNEAKING, SNEAKING_AUTOMATION, SUMMONING, SUMMONING_AUTOMATION, BEANSTALK, EMPEROR].map(
            async (file) => (await importRepo(file)).default
        )
    );
    const world = buildMenuTree(pages).find((entry) => entry.id === 6);
    assert.deepEqual(
        world.systems.map((system) => [system.name, system.pages.map((page) => pageTitle(page, system))]),
        [
            ["Farming", ["Farming"]],
            ["Sneaking", ["Sneaking", "Automation"]],
            ["Summoning", ["Summoning", "Automation"]],
            ["Beanstalk", ["Beanstalk"]],
            ["Emperor", ["Emperor"]],
        ]
    );
    const tabsOf = (file) => pages.find((page) => page.id === file).tabs.map((tab) => tab.label);
    assert.deepEqual(tabsOf("w6.farming"), ["Plots", "Crop Depot", "Market", "Exotic Market", "Land Rank", "Stickers"]);
    assert.deepEqual(tabsOf("w6.sneaking"), ["Ninja Knowledge", "Jade Emporium", "Charms"]);
    assert.deepEqual(tabsOf("w6.summoning"), ["Upgrades", "Essence", "Battles"]);
});

test("search finds each tab by its name and the old page names, and a hit opens the page on that tab", async () => {
    const { buildMenuTree, searchEntries, searchMenu } = await importRepo("src/ui/menu/menuModel.js");
    const pages = await Promise.all(
        [FARMING, SNEAKING, SUMMONING].map(async (file) => (await importRepo(file)).default)
    );
    const entries = searchEntries(buildMenuTree(pages));
    for (const [query, label, page, tab] of [
        ["depo", "Crop Depot", "w6.farming", "depot"],
        ["night market", "Market", "w6.farming", "market"],
        ["organic labels", "Exotic Market", "w6.farming", "exotic"],
        ["land rank database", "Land Rank", "w6.farming", "rank"],
        ["sneaking upgrades", "Ninja Knowledge", "w6.sneaking", "knowledge"],
        ["pristine charms", "Charms", "w6.sneaking", "charms"],
        ["omnijade", "Ninja Knowledge", "w6.sneaking", "knowledge"],
        ["endless", "Battles", "w6.summoning", "battles"],
    ]) {
        const hit = searchMenu(entries, query)[0];
        assert.equal(hit.label, label, `"${query}" finds ${label}`);
        assert.deepEqual(hit.target, { world: 6, page, tab }, `"${query}" opens ${label}`);
    }
});

test("names keep the game's Roman numerals and short words; a bonus loses its number with its by, to and x", async () => {
    const { bonusText, normalCase } = await importRepo("src/ui/components/views/account/accountShared.js");
    assert.equal(normalCase("SPROUTLUCK_III"), "Sproutluck III");
    assert.equal(normalCase("GENEOLOGY_IV"), "Geneology IV");
    assert.equal(normalCase("Grand_Stone"), "Grand Stone");
    assert.equal(
        bonusText("Increases_next_crop_chance_by_+{%_per_rank_of_the_land_plot"),
        "Increases next crop chance per rank of the land plot"
    );
    assert.equal(
        bonusText("Each_Ninja_Knowledge_upgrade_costs_}x_less_every_100th_level_it_has!"),
        "Each Ninja Knowledge upgrade costs less every 100th level it has!"
    );
    assert.equal(
        bonusText("Raise_the_max_LV_of_Kunai_found_to_+{,_also_increases_rarity_of_Kunai_found."),
        "Raise the max LV of Kunai found, also increases rarity of Kunai found"
    );
});

// ---- Farming -----------------------------------------------------------------------------------------------------

test("Plots: saving a plot's rank keeps the rank EXP it earned in game since", async () => {
    const { pane } = await openPane(FARMING, "Plots");
    const row = rowNamed(pane, "Plot 2");
    gga.FarmRank[1][1] += 500;
    const exp = gga.FarmRank[1][1];
    typeAndEnter(row, 12);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.FarmRank[0][1], 12);
    assert.equal(gga.FarmRank[1][1], exp);
});

test("Plots: Set all gives every plot the rank, and leaves each plot's rank EXP as it is (#241)", async () => {
    const saved = gga.FarmRank.slice(0, 2).map((column) => [...column]);
    try {
        const { root } = await openPane(FARMING, "Plots");
        const tray = byClass(root, "tabbed-list__tools")[0];
        const setAll = byClass(tray, "account-setall-row")[0];
        const field = byTag(setAll, "input")[0];
        assert.equal(attr(field, "placeholder"), "Rank", "the field names the column it sets");
        assert.equal(trayLine(root), "All 36 plots");
        const exp = [...gga.FarmRank[1]];
        const top = Math.max(...gga.FarmRank[0].slice(0, 36)) + 5;
        type(field, top);
        click(buttonNamed(setAll, "Set all"));
        await until(() => gga.FarmRank[0].slice(0, 36).every((rank) => rank === top), "every plot's rank");
        assert.deepEqual(gga.FarmRank[1], exp, "rank EXP untouched");
        await until(() => shown(rowNamed(root, "Plot 36")) === String(top), "the plots to show it");
    } finally {
        saved.forEach((column, i) => (gga.FarmRank[i] = column));
    }
});

test("Crop Depot: crops sit under their seed's group, and an amount saves to the depot", async () => {
    const { pane } = await openPane(FARMING, "Crop Depot");
    assert.deepEqual(
        byClass(pane, "account-section__title").map(text),
        ["Basic", "Earthy", "Bulbo", "Sushi", "Mushie", "Glassy", "Medal"],
        "the game's seeds, in its order"
    );
    const row = rowNamed(pane, "Earthy 1");
    typeAndEnter(row, 4321);
    await settled(row);
    assert.equal(gga.FarmCrop.h[21], 4321, "Earthy's first crop is crop 21");
});

test("Market: the Day and Night Market are groups with the game's bonus first", async () => {
    const { pane } = await openPane(FARMING, "Market");
    assert.deepEqual(byClass(pane, "account-section__title").map(text), ["Day Market", "Night Market"]);
    const row = rowNamed(pane, "Land Plots");
    assert.equal(text(byClass(row, "account-row__bonus")[0]), "You get extra plots of land to plant crops in");
    assert.ok(rowNamed(pane, "Evolution GMO"), "the game's GMO keeps its capitals");
});

test("Market: a level above its cap shows as the game holds it, and Max brings it down to the cap", async () => {
    gga.FarmUpg[2] = 99;
    const { pane } = await openPane(FARMING, "Market");
    const row = rowNamed(pane, "Land Plots");
    assert.equal(shown(row), "99");
    assert.equal(capOf(row), "/ 20");
    click(buttonNamed(row, "Max"));
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(gga.FarmUpg[2], 20);
});

test("Market: Raise on a level above its cap keeps the level and saves nothing", async () => {
    gga.FarmUpg[2] = 99;
    const { pane } = await openPane(FARMING, "Market");
    const row = rowNamed(pane, "Land Plots");
    const field = fieldOf(row);
    const [, raise] = byTag(row, "button").filter((node) => text(node).trim() === "");
    const written = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (url, options) => {
        const body = String(url).includes("/gga/write") ? JSON.parse(options.body) : null;
        if (body?.path.includes("FarmUpg[2]")) written.push(body.value);
        return realFetch(url, options);
    };
    try {
        focus(field);
        click(raise);
        leave(row, field);
        // Then the player types 5 and presses Enter: that save runs after any save leaving the row started.
        typeAndEnter(row, 5, field);
        await until(() => gga.FarmUpg[2] === 5 && stateOf(row) === "success", "the typed level to save");
        assert.deepEqual(written, [5], "Raise and leaving the row wrote nothing");
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("Market: a typed level above the cap is refused even below the stored level, and − still steps down", async () => {
    gga.FarmUpg[2] = 99;
    const { root, pane } = await openPane(FARMING, "Market");
    const row = rowNamed(pane, "Land Plots");
    const field = fieldOf(row);
    const [lower] = byTag(row, "button").filter((node) => text(node).trim() === "");
    typeAndEnter(row, 98, field);
    await settled(row);
    assert.equal(stateOf(row), "error", "typing 98 over the cap of 20 is refused");
    assert.equal(gga.FarmUpg[2], 99);

    press(row, field, "Escape");
    click(lower);
    leave(row, field);
    await until(() => gga.FarmUpg[2] === 98 && stateOf(row) === "success", "− to save 98");

    // The game holds 99 again; typing the 98 − gave before is still refused.
    gga.FarmUpg[2] = 99;
    click(buttonNamed(root, "Refresh"));
    await until(() => shown(row) === "99", "the Refresh to show 99");
    typeAndEnter(row, 98, field);
    await until(() => stateOf(row) === "error", "typing 98 to be refused");
    assert.equal(gga.FarmUpg[2], 99);
});

test("Exotic Market: the game's placeholders stay out; a level saves", async () => {
    const { pane } = await openPane(FARMING, "Exotic Market");
    assert.equal(names(pane).length, 60, "60 upgrades, without the 20 NAME_MAGNI placeholders");
    assert.ok(!names(pane).some((name) => /Name Magni/i.test(name)));
    const row = rowNamed(pane, "Sproutluck III");
    typeAndEnter(row, 44);
    await settled(row);
    assert.equal(gga.FarmUpg[22], 44);
});

test("Exotic Market: Organic puts a label on with one press, and a second press takes it off", async (t) => {
    const before = [...gga.Spelunk[50]];
    t.after(() => (gga.Spelunk[50] = before));
    const { pane } = await openPane(FARMING, "Exotic Market");
    const organic = buttonNamed(rowNamed(pane, "Sproutluck I"), "Organic");
    assert.equal(attr(organic, "aria-pressed"), "false");
    await click(organic);
    await until(() => gga.Spelunk[50].includes(0), "the label to save");
    assert.equal(attr(organic, "aria-pressed"), "true");
    assert.match(text(pane), /4 of 4 Organic Labels used/);
    await click(organic);
    await until(() => !gga.Spelunk[50].includes(0), "the label to come off");
    assert.equal(attr(organic, "aria-pressed"), "false");
});

test("Exotic Market: two labels pressed at once both land (the labels are one list in the game)", async (t) => {
    const before = [...gga.Spelunk[50]];
    t.after(() => (gga.Spelunk[50] = before));
    const { pane } = await openPane(FARMING, "Exotic Market");
    const writes = hold("/write");
    const presses = [
        click(buttonNamed(rowNamed(pane, "Sproutluck I"), "Organic")),
        click(buttonNamed(rowNamed(pane, "Sproutluck IV"), "Organic")),
    ];
    await until(writes.reached, "the first label's write");
    writes.release();
    await Promise.all(presses);
    await until(() => gga.Spelunk[50].includes(0) && gga.Spelunk[50].includes(3), "both labels");
    assert.equal(gga.Spelunk[50].length, before.length + 2);
});

test("Exotic Market: a label the game refuses is said beside its button", async (t) => {
    const before = [...gga.Spelunk[50]];
    t.after(() => (gga.Spelunk[50] = before));
    const { pane } = await openPane(FARMING, "Exotic Market");
    const row = rowNamed(pane, "Sproutluck II");
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) throw new Error("Connection lost");
        return realFetch(url, options);
    };
    try {
        await click(buttonNamed(row, "Organic"));
        await until(() => text(byClass(row, "row-toggle__failure")[0]) !== "", "the reason");
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.deepEqual(gga.Spelunk[50], before);
    await click(buttonNamed(row, "Organic"));
    await until(() => gga.Spelunk[50].includes(1), "the label on a second try");
    assert.equal(text(byClass(row, "row-toggle__failure")[0]), "", "the next success clears it");
});

test("Land Rank: only the 5th column has a max; a level over it is refused, any other saves", async () => {
    const { pane } = await openPane(FARMING, "Land Rank");
    const capped = rowNamed(pane, "Seed Of Stealth");
    assert.equal(capOf(capped), "/ 50");
    assert.ok(buttonNamed(capped, "Max"), "a capped line has Max");
    assert.equal(
        buttonNamed(rowNamed(pane, "Evolution Boost"), "Max"),
        undefined,
        "an uncapped one keeps its room empty"
    );
    assert.equal(capOf(rowNamed(pane, "Evolution Boost")), "");
    typeAndEnter(capped, 51);
    await until(() => stateOf(capped) === "error", "51 to be refused");
    assert.notEqual(gga.FarmRank[2][4], 51);
    const free = rowNamed(pane, "Evolution Boost");
    typeAndEnter(free, 500);
    await settled(free);
    assert.equal(gga.FarmRank[2][0], 500);
});

test("Stickers: the game's stickers without its placeholders, and an amount saves", async () => {
    const { pane } = await openPane(FARMING, "Stickers");
    assert.equal(names(pane).length, 7);
    const row = rowNamed(pane, "Mega Mongo Sticker");
    typeAndEnter(row, 9);
    await settled(row);
    assert.equal(gga.Research[9][0], 9);
});

// ---- Sneaking ----------------------------------------------------------------------------------------------------

test("Ninja Knowledge: the bonus comes first, the placeholder stays out, and a level saves", async () => {
    const { pane } = await openPane(SNEAKING, "Ninja Knowledge");
    assert.ok(!names(pane).includes("Name"), "row 9 is the game's placeholder");
    const row = rowNamed(pane, "Way of Haste");
    assert.equal(text(byClass(row, "account-row__bonus")[0]), "Action speed %");
    typeAndEnter(row, 7);
    await settled(row);
    assert.equal(gga.Ninja[103][4], 7);
});

test("Jade Emporium: in the emporium's order, without what's still to come; two flips both stay bought", async (t) => {
    const before = String(gga.Ninja[102][9]);
    t.after(() => (gga.Ninja[102][9] = before));
    const { pane } = await openPane(SNEAKING, "Jade Emporium");
    assert.equal(names(pane)[0], "Quick Ref Access");
    assert.equal(names(pane)[1], "MSA Expander I", "the emporium's order (NinjaInfo[24])");
    assert.ok(!names(pane).includes("UNDER CONSTRUCTION"));
    const [first, second] = rowsIn(pane).filter((row) => wordsOf(row) === "");
    const writes = hold("/write");
    const flips = [flip(first, true), flip(second, true)];
    await until(writes.reached, "the first write");
    writes.release();
    await Promise.all(flips);
    await until(() => wordsOf(first) === "Bought" && wordsOf(second) === "Bought", "both to save");
    assert.equal(String(gga.Ninja[102][9]).length, before.length + 2, "the game holds both letters");
});

test("Charms: a switch unlocks one; Lock all asks in the tray first, Unlock all runs on one press", async (t) => {
    const before = [...gga.Ninja[107]];
    t.after(() => (gga.Ninja[107] = before));
    const { root, pane } = await openPane(SNEAKING, "Charms");
    const row = rowNamed(pane, "Fruit Rolle");
    assert.equal(text(byClass(row, "account-row__bonus")[0]), "AGI %");
    await flip(row, true);
    await until(() => gga.Ninja[107][1] === 1, "Fruit Rolle to unlock");
    assert.equal(trayLine(root), "All 23 charms");
    click(buttonNamed(root, "Lock all"));
    await until(() => /^Lock \d+ charms\?$/.test(trayLine(root)), "the question");
    assert.equal(gga.Ninja[107][1], 1, "nothing locked before the answer");
    yes(root);
    await until(() => gga.Ninja[107].every((on) => on === 0), "every charm locked");
    click(buttonNamed(root, "Unlock all"));
    await until(() => gga.Ninja[107].every((on) => on === 1), "every charm unlocked");
});

test("Ninja Knowledge: Omni Jade is a button on the lines that can have it, its levels on the same line", async (t) => {
    const before = structuredClone(gga.Menagerie);
    t.after(() => gga.Menagerie.splice(0, gga.Menagerie.length, ...before));
    const { root, pane } = await openPane(SNEAKING, "Ninja Knowledge");
    assert.ok(!tabNamed(root, "Omni Jade"), "no Omni Jade tab");
    const row = rowNamed(pane, "Way of Bargain");
    const omni = buttonNamed(row, "Omni Jade");
    const on = attr(omni, "aria-pressed") === "true";
    await click(omni);
    await until(() => Number(gga.Menagerie[6][1]) >= 1 === !on, "the button to save");
    assert.equal(attr(omni, "aria-pressed"), String(!on));
    // Its levels are the line's second field.
    const [, levels] = byTag(row, "input");
    typeAndEnter(row, 33, levels);
    await until(() => gga.Menagerie[7][1] === 33 && stateOf(row) === "success", "the Omni Jade levels to save");
    // Upgrades past the first 17 can't have Omni Jade: no button and no levels.
    const late = rowNamed(pane, "Strange Symbols");
    assert.equal(buttonNamed(late, "Omni Jade"), undefined);
    assert.equal(byTag(late, "input").length, 1);
});

test("Ninja Knowledge: an Omni Jade the game refuses is said beside its button, and the next press clears it", async (t) => {
    const before = structuredClone(gga.Menagerie);
    t.after(() => gga.Menagerie.splice(0, gga.Menagerie.length, ...before));
    const { pane } = await openPane(SNEAKING, "Ninja Knowledge");
    const row = rowNamed(pane, "Centurion Lineage");
    const omni = buttonNamed(row, "Omni Jade");
    const was = Number(gga.Menagerie[6][0]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) throw new Error("Connection lost");
        return realFetch(url, options);
    };
    try {
        await click(omni);
        await until(() => text(byClass(row, "row-toggle__failure")[0]) !== "", "the reason");
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.equal(Number(gga.Menagerie[6][0]), was);
    await click(omni);
    await until(() => Number(gga.Menagerie[6][0]) !== was, "the second press to save");
    assert.equal(text(byClass(row, "row-toggle__failure")[0]), "");
});

// ---- Summoning ---------------------------------------------------------------------------------------------------

test("Summoning: the board's upgrades are groups per colour; a capped one refuses over its max", async () => {
    const { pane } = await openPane(SUMMONING, "Upgrades");
    assert.deepEqual(byClass(pane, "account-section__title").map(text).slice(0, 2), ["White", "Green"]);
    const row = rowNamed(pane, "Familiar");
    assert.equal(capOf(row), "/ 50");
    typeAndEnter(row, 51);
    await until(() => stateOf(row) === "error", "51 to be refused");
    typeAndEnter(row, 30);
    await until(() => gga.Summon[0][2] === 30 && stateOf(row) === "success", "30 to save");
});

test("Summoning: an essence saves where the game keeps it", async () => {
    const essence = await openPane(SUMMONING, "Essence");
    assert.deepEqual(names(essence.pane), [
        "White Essence",
        "Green Essence",
        "Yellow Essence",
        "Blue Essence",
        "Purple Essence",
        "Red Essence",
        "Cyan Essence",
        "Teal Essence",
    ]);
    const row = rowNamed(essence.pane, "Blue Essence");
    typeAndEnter(row, 1234);
    await settled(row);
    assert.equal(gga.Summon[2][3], 1234);
});

test("Battles: Endless wins save and clear the game's win bonuses, so they follow at once", async (t) => {
    const before = gga.OptionsListAccount[319];
    t.after(() => (gga.OptionsListAccount[319] = before));
    gga.DNSM.h.SummWinBonus = [8, 7, 6];
    const { pane } = await openPane(SUMMONING, "Battles");
    const endless = rowNamed(pane, "Endless wins");
    typeAndEnter(endless, 200);
    await settled(endless);
    assert.equal(stateOf(endless), "success");
    assert.equal(gga.OptionsListAccount[319], 200);
    assert.equal("SummWinBonus" in gga.DNSM.h, false, "the cache is cleared");
});

test("Battles: the opponents are grouped by colour, and a win's switch saves it and clears the win bonuses", async (t) => {
    const before = [...gga.Summon[1]];
    t.after(() => (gga.Summon[1] = before));
    const { pane } = await openPane(SUMMONING, "Battles");
    const groups = byClass(pane, "account-section").map((section) => [
        text(byClass(section, "account-section__title")[0]),
        rowsIn(section).length,
    ]);
    assert.deepEqual(groups, [
        ["White", 9],
        ["Green", 15],
        ["Yellow", 11],
        ["Blue", 14],
        ["Purple", 13],
        ["Red", 13],
        ["Cyan", 14],
        ["Teal", 18],
    ]);
    const jonesy = rowNamed(pane, "Jonesy and his Lil Mushies");
    assert.equal(wordsOf(jonesy), "Won", "mushG is beaten on the practice data");
    const karen = rowNamed(pane, "Walter and his Lil Shrooms");
    assert.equal(wordsOf(karen), "");
    gga.DNSM.h.SummWinBonus = [8, 7, 6];
    await flip(karen, true);
    await until(() => gga.Summon[1].includes("mushR") && wordsOf(karen) === "Won", "the win to save");
    assert.equal("SummWinBonus" in gga.DNSM.h, false, "the cache is cleared");
    await flip(jonesy, false);
    await until(() => !gga.Summon[1].includes("mushG"), "the win to come off");
});

test("Battles: two wins switched on at once both land (the wins are one list in the game)", async (t) => {
    const before = [...gga.Summon[1]];
    t.after(() => (gga.Summon[1] = before));
    const { pane } = await openPane(SUMMONING, "Battles");
    const [first, second] = rowsIn(pane).filter((row) => switchOf(row) && wordsOf(row) === "");
    const writes = hold("/write");
    const flips = [flip(first, true), flip(second, true)];
    await until(writes.reached, "the first write");
    writes.release();
    await Promise.all(flips);
    await until(() => wordsOf(first) === "Won" && wordsOf(second) === "Won", "both to save");
    assert.equal(gga.Summon[1].length, before.length + 2);
});

test("Undo of an Endless wins save clears the game's win bonuses too", async () => {
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const old = Number(gga.OptionsListAccount[319]);
    await withAction({ label: "endless" }, () => writeVerified("OptionsListAccount[319]", old + 5));
    const { actions } = await fetchChanges();
    const action = actions.find((entry) => entry.entries.some((change) => change.path === "OptionsListAccount[319]"));
    gga.DNSM.h.SummWinBonus = [1, 2, 3];
    await undoAction(action.id);
    assert.equal(Number(gga.OptionsListAccount[319]), old);
    assert.equal("SummWinBonus" in gga.DNSM.h, false, "the bonuses are cleared");
});

// ---- Beanstalk ---------------------------------------------------------------------------------------------------

test("Beanstalk: a Refresh that read the game before a save landed doesn't put the old level back", async () => {
    const levels = gga.Ninja[104];
    levels[0] = 0;
    const root = await openPage(BEANSTALK);
    const row = rowNamed(root, "Golden Peanut");
    const refresh = buttonNamed(root, "Refresh");
    const itemNames = hold("/read-entries");
    const writes = hold("/write");
    typeAndEnter(row, 3);
    await until(writes.reached, "the save's write to reach the game");
    click(refresh);
    // The refresh has read the level (still 0) and waits on the names.
    await until(itemNames.reached, "the refresh to read the level");
    writes.release();
    await settled(row);
    assert.equal(stateOf(row), "success");
    itemNames.release();
    await until(
        () => shown(row) === "3" && capOf(row) === "/ 3" && !disabled(refresh),
        "the refresh to show what the game holds"
    );
    assert.equal(levels[0], 3);
});

test("Beanstalk: Max fills a food to 3", async () => {
    gga.Ninja[104][1] = 1;
    const root = await openPage(BEANSTALK);
    const row = rowNamed(root, "Butter Bar");
    click(buttonNamed(row, "Max"));
    await settled(row);
    assert.equal(gga.Ninja[104][1], 3);
});

// ---- Emperor -----------------------------------------------------------------------------------------------------

const rowWith = (root, words) => byClass(root, "account-row").find((row) => text(row).includes(words));

test("Emperor: leaving the showdowns field untouched with a count above the limit is not a failed save", async () => {
    const ola = gga.OptionsListAccount;
    ola[369] = 2000;
    const root = await openPage(EMPEROR);
    const row = rowWith(root, "Showdowns won");
    const field = fieldOf(row);
    // Tab from the field to Reset, typing nothing.
    row.listeners.focusout({ target: field, currentTarget: row, relatedTarget: buttonNamed(row, "Reset") });
    await settled(row);
    assert.equal(stateOf(row), "success", text(byClass(row, "save-state")[0]));
    assert.equal(ola[369], 2000);
    assert.match(text(root), /Showdowns won can be set to 1617 at most/);
    ola[369] = 37;
});

test("Emperor: an entries draft shows the game's count beside it while they differ; Max fills them", async () => {
    const root = await openPage(EMPEROR);
    const row = rowWith(root, "Entries");
    const field = fieldOf(row);
    const stored = Number(shown(row));
    const now = () => text(byClass(row, "account-row__now")[0]);
    assert.equal(now(), "", "no hint while the field shows the game's count");
    type(field, stored + 1);
    await until(() => now() === `now ${stored}`, "the game's count beside the draft");
    type(field, stored);
    await until(() => now() === "", "the hint to go once the draft matches the game");
    click(buttonNamed(row, "Max"));
    await settled(row);
    assert.equal(1 - gga.OptionsListAccount[370], 4, "full is the natural capacity (3 + 1)");
});

test("Emperor: the gem shop's Emperor tries save in a Gem shop group, and the entries follow the game's new cap", async (t) => {
    const ola = gga.OptionsListAccount;
    const thingies = fixture.computed._customBlock_Thingies;
    const before = { tries: ola[382], stack: thingies.MaxEmperorAttemptStack };
    t.after(() => {
        ola[382] = before.tries;
        thingies.MaxEmperorAttemptStack = before.stack;
    });
    const root = await openPage(EMPEROR);
    const group = byClass(root, "account-section").find(
        (node) => text(byClass(node, "account-section__title")[0]) === "Gem shop"
    );
    assert.ok(group, "a Gem shop group");
    const row = rowNamed(group, "Emperor tries");
    assert.equal(text(byClass(row, "account-row__bonus")[0]), "+1 try a day and +6 saved-up tries each");
    assert.equal(shown(row), "2");
    // Each try raises the saved-up cap by 6 in the game: a save reads the game again, so the entries' cap follows.
    thingies.MaxEmperorAttemptStack = 9;
    typeAndEnter(row, 3);
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(ola[382], 3);
    await until(() => capOf(rowWith(root, "Entries")) === "/ 10", "the entries' new cap");
});

test("search finds the Emperor's gem shop tries by limited, gem shop, fomo and its name", async () => {
    const { buildMenuTree, searchEntries, searchMenu } = await importRepo("src/ui/menu/menuModel.js");
    const entries = searchEntries(buildMenuTree([(await importRepo(EMPEROR)).default]));
    for (const query of ["limited", "gem shop", "fomo", "emperor tries"])
        assert.deepEqual(searchMenu(entries, query)[0]?.target, { world: 6, page: "w6.emperor" }, `"${query}"`);
});
