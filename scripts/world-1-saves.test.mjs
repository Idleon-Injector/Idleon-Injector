// World 1 pages save from what the game holds now, not from what the page read when it opened, and say why a save
// failed where the player acted.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
const g = game.gga;
// Click again places its tooltip on the next frame and on <body>, as in the menu.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

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
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};

// The game changes something just before (or just after) the page's next request matching `route` reaches it.
const onRequest = (route, act, { after = false } = {}) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (!route.test(String(url))) return realFetch(url, options);
        globalThis.fetch = realFetch;
        if (!after) act();
        const response = await realFetch(url, options);
        if (after) act();
        return response;
    };
    return () => (globalThis.fetch = realFetch);
};

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root) && ready(root), `${file} to load`);
    return root;
};
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
const switchOf = (row) => elements(row).find((node) => node.attributes.role === "switch");
const wordsOf = (row) => text(byClass(row, "state-switch__words")[0]);
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const saveState = (node) =>
    /save-state--(loading|success|error)/.exec(classes(byClass(node, "save-state")[0] ?? { attributes: {} }))?.[1];

const STAMPS = "src/ui/pages/world-1/stamps/stamps.js";

test("stamps: two exalt flips saving at once both land", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Mana Stamp"));
    const release = holdWrites();
    const saves = [flip(rowNamed(root, "Sword Stamp"), true)];
    await tick();
    saves.push(flip(rowNamed(root, "Mana Stamp"), true));
    await tick();
    release();
    await Promise.all(saves);
    assert.deepEqual([...g.Compass[4]], ["_0", "_1", "_2", "a0", "b4"]);
    assert.equal(switchOf(rowNamed(root, "Sword Stamp")).checked, true);
});

test("stamps: an exalt flip keeps a stamp exalted in the game since the page opened", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Shield Stamp"));
    g.Compass[4] = [...g.Compass[4], "_9"]; // exalted in the game
    await flip(rowNamed(root, "Shield Stamp"), true);
    assert.deepEqual([...g.Compass[4]], ["_1", "_5", "_9", "a0", "b4"]);
    await tick();
    assert.equal(wordsOf(rowNamed(root, "Battleaxe Stamp")), "Exalted", "the page shows the game's own exalt too");
});

test("stamps: a refused exalt says why on the row and shows what the game holds", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Shield Stamp"));
    const row = rowNamed(root, "Shield Stamp");
    g.Compass[4] = [...g.Compass[4], "_9"]; // exalted in the game
    const restore = refuseWrites(g.Compass, 4);
    try {
        await flip(row, true);
    } finally {
        restore();
    }
    assert.deepEqual([...g.Compass[4]], ["_1", "a0", "b4", "_9"]);
    assert.equal(wordsOf(row), "game kept old value", "the switch says why it wasn't saved");
    assert.equal(switchOf(row).checked, false);
    await tick();
    assert.equal(wordsOf(rowNamed(root, "Battleaxe Stamp")), "Exalted", "the page shows the game's own exalt too");
});

// #126 (from #122): a stamp the game exalts between the flip's read and its write isn't written over.
test("stamps: a stamp the game exalts while a flip saves stays exalted, and the flip says why", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Shield Stamp"));
    const row = rowNamed(root, "Shield Stamp");
    const restore = onRequest(/\/game\/gga\/write/, () => g.Compass[4].push("_9"));
    try {
        await flip(row, true);
    } finally {
        restore();
    }
    assert.deepEqual([...g.Compass[4]], ["_1", "a0", "b4", "_9"], "the game's exalt stays and nothing is written");
    assert.equal(wordsOf(row), "changed since");
    assert.equal(switchOf(row).checked, false);
    await tick();
    assert.equal(wordsOf(rowNamed(root, "Battleaxe Stamp")), "Exalted", "the page shows the game's own exalt");
});

// #126 (from #122): after a flip that worked, the switches show what the game holds, not the list the page wrote.
test("stamps: after a flip saves, the page reads the exalts again", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Shield Stamp"));
    const restore = onRequest(/\/game\/gga\/write/, () => g.Compass[4].push("_9"), { after: true });
    try {
        await flip(rowNamed(root, "Shield Stamp"), true);
    } finally {
        restore();
    }
    assert.equal(wordsOf(rowNamed(root, "Shield Stamp")), "Exalted");
    await tick();
    assert.equal(wordsOf(rowNamed(root, "Battleaxe Stamp")), "Exalted", "the exalt the game added after the write");
});

// Review of #208: the game can hold the list as a numeric-key object, which the read route gives as an array; the
// write's `expect` holds for an unchanged list in either shape.
test("stamps: a flip saves when the game holds the exalts as a numeric-key object", async () => {
    g.Compass[4] = { 0: "_1", 1: "a0", 2: "b4" };
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Shield Stamp"));
    const row = rowNamed(root, "Shield Stamp");
    await flip(row, true);
    assert.deepEqual([...g.Compass[4]], ["_1", "_5", "a0", "b4"]);
    assert.equal(wordsOf(row), "Exalted");
});

// #216: the Exalted Stamp uses from a past limited gem shop sale have their row on Stamps.
const USES = "Exalted Stamp uses";
const shownValue = (row) => {
    // The fake DOM keeps the typed text on the property; what the page binds since is the attribute.
    const value = elements(row).find((node) => node.nodeName === "input").attributes.value;
    return String(typeof value === "function" ? value() : value);
};
const typeAndEnter = async (row, value) => {
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => ["success", "error"].includes(saveState(row)), "the save to finish");
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

test("stamps: the Exalted Stamp uses row saves the count the game reads", async (t) => {
    const before = g.OptionsListAccount[366];
    t.after(() => (g.OptionsListAccount[366] = before));
    g.OptionsListAccount[366] = 2;
    const root = await openPage(STAMPS, (root) => rowNamed(root, USES));
    const row = rowNamed(root, USES);
    assert.equal(shownValue(row), "2");
    await typeAndEnter(row, 7);
    assert.equal(saveState(row), "success");
    assert.equal(g.OptionsListAccount[366], 7);
});

// As #228 on Equinox: a Refresh that read the count before a save landed doesn't put the old count back.
test("stamps: an Exalted Stamp uses count saved while a Refresh reads stays on screen", async (t) => {
    const before = g.OptionsListAccount[366];
    t.after(() => (g.OptionsListAccount[366] = before));
    g.OptionsListAccount[366] = 2;
    const root = await openPage(STAMPS, (root) => rowNamed(root, USES));
    const row = rowNamed(root, USES);
    const realFetch = globalThis.fetch;
    t.after(() => (globalThis.fetch = realFetch));
    // A load's stamp-level reads wait for `gate` while it is set.
    let gate = null;
    let reached = 0;
    globalThis.fetch = async (url, options) => {
        if (String(options?.body ?? "").includes('"gga.StampLevelMAX"') && gate) {
            reached++;
            await gate;
        }
        return realFetch(url, options);
    };
    let releaseFirst;
    let releaseSecond;
    gate = new Promise((resolve) => (releaseFirst = resolve));
    elements(root)
        .find((node) => node.nodeName === "button" && text(node).trim() === "Refresh")
        .listeners.click({ preventDefault() {}, stopPropagation() {} });
    await until(() => reached === 1, "the Refresh to read the count and wait for the levels");
    gate = new Promise((resolve) => (releaseSecond = resolve));
    await typeAndEnter(row, 5);
    assert.equal(saveState(row), "success");
    releaseFirst();
    await until(() => reached === 2, "the load to read again");
    assert.equal(shownValue(row), "5", "the saved count, not the one the Refresh read before the save");
    gate = null;
    releaseSecond();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(shownValue(row), "5");
});

for (const odd of ["broken", "", " ", true, -1, 1.5]) {
    test(`stamps: an Exalted Stamp uses count of ${JSON.stringify(odd)} is a read error, not 0`, async (t) => {
        const before = g.OptionsListAccount[366];
        t.after(() => (g.OptionsListAccount[366] = before));
        g.OptionsListAccount[366] = odd;
        const root = (await importRepo(STAMPS)).default.component();
        await quietly(() =>
            until(() => text(root).includes("Exalted Stamp uses count"), "the read to fail and say why")
        );
    });
}

for (const [stored, shows] of [
    [null, "0"],
    [undefined, "0"],
    ["3", "3"],
]) {
    test(`stamps: an Exalted Stamp uses count of ${JSON.stringify(stored)} shows as ${shows}`, async (t) => {
        const before = g.OptionsListAccount[366];
        t.after(() => (g.OptionsListAccount[366] = before));
        g.OptionsListAccount[366] = stored;
        const root = await openPage(STAMPS, (root) => rowNamed(root, USES));
        assert.equal(shownValue(rowNamed(root, USES)), shows);
    });
}

const STATUES = "src/ui/pages/world-1/statues/statues.js";
const statueRow = (root, index) => byClass(root, "statue-row")[index];
// The tier shows once, in its step picker: the step that is picked.
const tierOf = (row) =>
    text(byClass(row, "step-picker__step").find((node) => node.attributes["aria-checked"] === "true"));
// The player types into the row's last field (Flair) and presses Enter.
const typeFlair = (row, value) => {
    const flair = elements(row)
        .filter((node) => node.nodeName === "input")
        .at(-1);
    flair.value = value;
    flair.listeners.input({ target: flair });
    row.listeners.keydown({ key: "Enter", target: flair, preventDefault() {} });
};

test("statues: saving one field keeps what the game gained since the page opened", async () => {
    const saved = [[...g.StatueLevels[1]], g.StatueG[1], g.RoyalG[22][1]];
    g.RoyalG[22][1] = 1;
    const root = await openPage(STATUES, (root) => statueRow(root, 1));
    const row = statueRow(root, 1);
    g.StatueLevels[1][1] = 99999; // deposited in the game
    g.StatueG[1] = 3;
    typeFlair(row, "4");
    await until(() => ["success", "error"].includes(saveState(row)), "the save");
    assert.equal(saveState(row), "success");
    assert.deepEqual([...g.StatueLevels[1]], [saved[0][0], 99999]);
    assert.equal(g.StatueG[1], 3);
    assert.equal(g.RoyalG[22][1], 4);
    await tick();
    assert.equal(tierOf(row), "Zenith", "the row shows what the game holds");
    [g.StatueLevels[1], g.StatueG[1], g.RoyalG[22][1]] = saved;
});

test("statues: a refused save says why and shows what the game holds", async () => {
    const saved = [g.StatueG[1], g.RoyalG[22][1]];
    g.RoyalG[22][1] = 1;
    const root = await openPage(STATUES, (root) => statueRow(root, 1));
    const row = statueRow(root, 1);
    g.StatueG[1] = 3;
    const restore = refuseWrites(g.RoyalG[22], 1);
    try {
        typeFlair(row, "4");
        await until(() => ["success", "error"].includes(saveState(row)), "the save");
    } finally {
        restore();
    }
    assert.equal(saveState(row), "error");
    assert.equal(g.StatueG[1], 3);
    await tick();
    assert.equal(tierOf(row), "Zenith");
    [g.StatueG[1], g.RoyalG[22][1]] = saved;
});

// Review of #154: a save refused because another character came into play put that character's values in the rows.
test("statues: a save refused because the character changed keeps the rows' own values", async () => {
    const saved = [g.StatueG[1], g.RoyalG[22][1], g.UserInfo[0]];
    g.RoyalG[22][1] = 1;
    g.StatueG[1] = 0;
    const root = await openPage(STATUES, (root) => statueRow(root, 1));
    const row = statueRow(root, 1);
    g.UserInfo[0] = "Lumi_Alt"; // another character in play, with its own statues
    g.StatueG[1] = 3;
    try {
        typeFlair(row, "4");
        await until(() => ["success", "error"].includes(saveState(row)), "the save");
        assert.equal(saveState(row), "error");
        await tick();
        assert.notEqual(tierOf(row), "Zenith", "the other character's tier stays out of the row");
    } finally {
        [g.StatueG[1], g.RoyalG[22][1], g.UserInfo[0]] = saved;
    }
});

// Review of #122: the second Enter's save took the deposit it was committed with as an edit and wrote it back.
test("statues: a save queued behind another keeps a deposit the game made meanwhile", async () => {
    const saved = [[...g.StatueLevels[2]], g.RoyalG[22][2]];
    g.RoyalG[22][2] = 1;
    const root = await openPage(STATUES, (root) => statueRow(root, 2));
    const row = statueRow(root, 2);
    const release = holdWrites();
    try {
        typeFlair(row, "2");
        await tick();
        g.StatueLevels[2][1] = 77777; // deposited in the game while the first save runs
        typeFlair(row, "3");
    } finally {
        release();
    }
    await until(() => g.RoyalG[22][2] === 3 && saveState(row) === "success", "both saves");
    assert.equal(g.StatueLevels[2][1], 77777, "the game's deposit isn't put back");
    [g.StatueLevels[2], g.RoyalG[22][2]] = saved;
});

// Review of #122, second round: a queued save of the value the field started at (1, save 2, then 1) was dropped.
test("statues: Flair set back to its first value while the change saves is saved too", async () => {
    const saved = g.RoyalG[22][3];
    g.RoyalG[22][3] = 1;
    const root = await openPage(STATUES, (root) => statueRow(root, 3));
    const row = statueRow(root, 3);
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && ++writes === 1) await gate;
        return realFetch(url, options);
    };
    try {
        typeFlair(row, "2");
        await until(() => writes === 1, "the first save to reach the game");
        typeFlair(row, "1");
        release();
        await until(() => writes === 2 && g.RoyalG[22][3] === 1, "Flair to go back to 1");
    } finally {
        globalThis.fetch = realFetch;
        release();
        g.RoyalG[22][3] = saved;
    }
});

// Review of #117 (same field editor), third round: a deposit shown again after the first save's read-back counted
// as an edit in the third save.
test("statues: a third Flair save doesn't write the deposit an earlier save showed over a newer one", async () => {
    const saved = [[...g.StatueLevels[4]], g.RoyalG[22][4]];
    g.RoyalG[22][4] = 1;
    const root = await openPage(STATUES, (root) => statueRow(root, 4));
    const row = statueRow(root, 4);
    const realFetch = globalThis.fetch;
    const releases = [];
    const gates = [1, 2].map(() => new Promise((resolve) => releases.push(resolve)));
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) {
            const n = ++writes;
            if (n <= 2) await gates[n - 1];
        }
        return realFetch(url, options);
    };
    try {
        typeFlair(row, "2");
        await until(() => writes === 1, "the first save to reach the game");
        g.StatueLevels[4][1] = 77777; // deposited in the game while the first save runs
        typeFlair(row, "3");
        releases[0]();
        await until(() => writes === 2, "the second save to reach the game");
        g.StatueLevels[4][1] = 88888; // and again while the second runs
        typeFlair(row, "4");
        releases[1]();
        await until(() => g.RoyalG[22][4] === 4 && saveState(row) === "success", "the third save");
        assert.equal(g.StatueLevels[4][1], 88888, "the game's newer deposit isn't put back");
    } finally {
        globalThis.fetch = realFetch;
        releases.forEach((release) => release());
        [g.StatueLevels[4], g.RoyalG[22][4]] = saved;
    }
});

test("statues: names show the game's underscores as spaces, in normal case", async () => {
    const root = await openPage(STATUES, (root) => statueRow(root, 7));
    assert.equal(text(byClass(statueRow(root, 7), "account-row__name")[0]), "Thicc Skin");
});

// CodeRabbit on #212: a Set all question asked for one character, answered after Refresh read another whose same
// statues would come down, asks again for that one instead of lowering its statues unasked.
test("statues: a Set all question asks again once Refresh has read another character", async () => {
    const saved = [g.StatueLevels.map((entry) => [...entry]), g.UserInfo[0]];
    g.StatueLevels.forEach((entry) => (entry[0] = 3));
    g.StatueLevels[0][0] = 10;
    try {
        const root = await openPage(STATUES, (root) => statueRow(root, 0));
        const label = () => text(byClass(root, "tabbed-list__tools-label")[0]);
        const control = byClass(root, "account-setall-row")[0];
        const apply = elements(control).find((node) => node.nodeName === "button" && text(node).trim() === "Set all");
        control.querySelector = () => apply; // the fake DOM has no selectors; the page asks for its button
        elements(control)
            .find((node) => node.nodeName === "input")
            .listeners.input({ target: { value: "5" } });
        await tick();
        await apply.listeners.click({ preventDefault() {} });
        await until(() => label() === "Lower 1 statue to level 5?", "the question");
        g.UserInfo[0] = "Lumi_Alt"; // another character, whose first statue is above 5 too
        const refresh = elements(root).find((node) => node.nodeName === "button" && text(node).trim() === "Refresh");
        await refresh.listeners.click({ preventDefault() {}, currentTarget: refresh });
        await until(() => !refresh.attributes.disabled, "the other character's read");
        const writes = () => requests.filter((entry) => entry.includes("/write")).length;
        const before = writes();
        await byClass(root, "tabbed-list__yes")[0].listeners.click({});
        await tick();
        assert.equal(label(), "Lower 1 statue to level 5?", "it asks again");
        assert.equal(writes(), before, "nothing was written");
        assert.equal(g.StatueLevels[0][0], 10);
        await byClass(root, "tabbed-list__yes")[0].listeners.click({});
        await until(() => g.StatueLevels[0][0] === 5, "the answer for the character now in play");
    } finally {
        g.StatueLevels.forEach((entry, i) => (entry[0] = saved[0][i][0]));
        g.UserInfo[0] = saved[1];
    }
});

const PETS = "src/ui/pages/world-1/pets/pets.js";
// A pet is a row: its tier is a step picker (Off | Normal | Pets+), its token a switch.
const petRow = (root, id) =>
    byClass(root, "pet-row").find((row) => String(row.attributes["data-pet-id"]) === String(id));
const pickTier = (root, id, tier) =>
    byClass(petRow(root, id), "step-picker__step")
        .find((step) => text(step) === tier)
        .listeners.click({});
const tierShown = (root, id) =>
    text(byClass(petRow(root, id), "step-picker__step").find((step) => step.attributes["aria-checked"] === "true"));
const flipToken = (root, id) => {
    const box = elements(petRow(root, id)).find((node) =>
        String(node.attributes["aria-label"]).startsWith("Pet token for")
    );
    return box.listeners.change({ target: box });
};
const tokenShown = (root, id) =>
    elements(petRow(root, id)).find((node) => String(node.attributes["aria-label"]).startsWith("Pet token for"))
        .attributes.checked;
const alertText = (root) => text(elements(root).find((node) => node.attributes.role === "alert"));
// The game's trade-screen token button: adds the pet when a token is free (the fake game owns 2).
const tokenInGame = (id) => (g.OptionsListAccount[606] = `${g.OptionsListAccount[606]},${id}`);

test("pets: removing a token in the page keeps a token picked in the game since", async () => {
    g.OptionsListAccount[606] = "2";
    const root = await openPage(PETS, (root) => petRow(root, 2));
    tokenInGame(9);
    await flipToken(root, 2);
    assert.equal(g.OptionsListAccount[606], "9");
    g.OptionsListAccount[606] = "2,5";
});

test("pets: a token the game no longer has room for is refused, and says why", async () => {
    g.OptionsListAccount[606] = "2";
    const root = await openPage(PETS, (root) => petRow(root, 5));
    tokenInGame(9); // the page still shows a free token
    await flipToken(root, 5);
    assert.equal(g.OptionsListAccount[606], "2,9");
    await tick();
    assert.equal(alertText(root), "All tokens are in use. Remove one first.");
    g.OptionsListAccount[606] = "2,5";
});

for (const [press, act] of [
    ["picking Normal", (root, id) => pickTier(root, id, "Normal")],
    ["the token switch", (root, id) => flipToken(root, id)],
    ["picking Pets+", (root, id) => pickTier(root, id, "Pets+")],
]) {
    test(`pets: ${press} on a pet tokened in the game since the page opened keeps that token`, async () => {
        g.OptionsListAccount[606] = "2";
        const root = await openPage(PETS, (root) => petRow(root, 12));
        tokenInGame(12); // the page still shows pet 12 without a token
        await act(root, 12);
        assert.equal(g.OptionsListAccount[606], "2,12");
        g.OptionsListAccount[606] = "2,5";
    });
}

test("pets: picking Off for a token the game dropped since leaves the pet off", async () => {
    g.OptionsListAccount[606] = "2";
    const root = await openPage(PETS, (root) => petRow(root, 2));
    g.OptionsListAccount[606] = ""; // the game dropped it
    await pickTier(root, 2, "Off");
    assert.equal(g.OptionsListAccount[606], "");
    await tick();
    assert.equal(tierShown(root, 2), "Off");
    g.OptionsListAccount[606] = "2,5";
});

// #126 (from #122): a token the game adds while a click reads the config isn't dropped by the token write.
test("pets: a token the game picks while a token removal reads the config stays, and the page says why", async () => {
    g.OptionsListAccount[606] = "2";
    const root = await openPage(PETS, (root) => petRow(root, 2));
    const restore = onRequest(/\/config$/, () => tokenInGame(9));
    try {
        await flipToken(root, 2);
    } finally {
        restore();
    }
    assert.equal(g.OptionsListAccount[606], "2,9", "nothing is written over the game's new token");
    await until(() => alertText(root) === "Tokens changed in the game. Try again.", "the reason");
    await until(() => tierShown(root, 9) === "Normal", "the page to show the game's new token");
    g.OptionsListAccount[606] = "2,5";
});

// #126 (from #122): Pets+ or Off on a pet the game gave a token since the press would leave a token pet at Pets+, or
// not off; it is refused with the reason. Normal is what the token gives, so that press still goes through.
for (const tier of ["Pets+", "Off"]) {
    test(`pets: ${tier} on a pet the game gave a token since is refused, and says why`, async () => {
        const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
        const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: "12:0" } } } }); // pet 12 at Normal
        g.OptionsListAccount[606] = "2";
        try {
            const root = await openPage(PETS, (root) => petRow(root, 12) && tierShown(root, 12) === "Normal");
            tokenInGame(12);
            await pickTier(root, 12, tier);
            assert.equal(g.OptionsListAccount[606], "2,12");
            assert.equal((await fetchConfig()).cheatConfig.w1.companion.companions, "12:0", "the tiers are unchanged");
            await until(() => alertText(root) === "This pet has a token now.", "the reason");
        } finally {
            await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
            g.OptionsListAccount[606] = "2,5";
        }
    });
}

// Review of #208: a token the game gives while the save reads the config is checked in the save's own turn.
test("pets: Pets+ on a pet the game gives a token during the save is refused, and says why", async () => {
    const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
    const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
    await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: "12:0" } } } }); // pet 12 at Normal
    g.OptionsListAccount[606] = "2";
    try {
        const root = await openPage(PETS, (root) => petRow(root, 12) && tierShown(root, 12) === "Normal");
        // After the click read the tokens, before the save's turn.
        const restore = onRequest(/\/cheat-states$/, () => tokenInGame(12));
        try {
            pickTier(root, 12, "Pets+"); // the pick saves in the background
            await until(() => alertText(root) === "This pet has a token now.", "the reason");
        } finally {
            restore();
        }
        assert.equal(g.OptionsListAccount[606], "2,12");
        assert.equal((await fetchConfig()).cheatConfig.w1.companion.companions, "12:0", "the tiers are unchanged");
    } finally {
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
        g.OptionsListAccount[606] = "2,5";
    }
});

// Review of #208: the tokens a failed save reads again don't replace the ones a newer save read.
test("pets: a failed save's token read that answers after a newer save doesn't bring old tokens back", async () => {
    g.OptionsListAccount[606] = "2";
    const root = await openPage(PETS, (root) => petRow(root, 2));
    const realFetch = globalThis.fetch;
    let step = "first save";
    let release;
    let staleReads = 0;
    const held = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (step === "released" && /\/config$/.test(String(url)) && !options?.body) staleReads++;
        if (step === "first save" && /\/config$/.test(String(url))) {
            tokenInGame(9); // the first save's token write is refused
            step = "failed";
        } else if (step === "failed" && String(options?.body).includes("petTokens")) {
            step = "held"; // the failed save reads the tokens again; its answer arrives last
            const response = await realFetch(url, options);
            await held;
            return response;
        }
        return realFetch(url, options);
    };
    try {
        await flipToken(root, 2);
        await until(() => step === "held", "the failed save to read the tokens again");
        await flipToken(root, 2); // the newer save takes pet 2's token off
        assert.equal(g.OptionsListAccount[606], "9");
        step = "released";
        release();
        for (let i = 0; i < 5; i++) await tick();
        assert.equal(staleReads, 0, "the old save doesn't read the tiers again after a newer save");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(tokenShown(root, 2), false, "pet 2 shows no token");
    assert.equal(tierShown(root, 2), "Off");
    g.OptionsListAccount[606] = "2,5";
});

// Review of #122: the click read the saved tiers against the tokens the page had before, and dropped pet 2's Pets+.
test("pets: a pick keeps a Pets+ pick saved for a pet whose token the game dropped since", async () => {
    const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
    const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
    g.OptionsListAccount[606] = "2";
    const root = await openPage(PETS, (root) => petRow(root, 12));
    g.OptionsListAccount[606] = ""; // the game dropped pet 2's token
    await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: "2:1,5:0" } } } }); // the Config tab
    try {
        await pickTier(root, 12, "Normal");
        const saved = (await fetchConfig()).cheatConfig.w1.companion.companions;
        assert.ok(String(saved).split(",").includes("2:1"), `pet 2 stays at Pets+ (saved: ${saved})`);
    } finally {
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
        g.OptionsListAccount[606] = "2,5";
    }
});

// Review of #147: with every pet chosen (an empty list, the cheat on), a token pet's press is worked out again on the
// tiers read in the save's turn, where the pet, its token gone, already counts at Pets+.
for (const [press, tier, wanted] of [
    ["Off deselects", "Off", null],
    ["Pets+ moves to Pets+", "Pets+", "2:1"],
]) {
    test(`pets: with every pet chosen, ${press} a token pet`, async () => {
        const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
        const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: "" } } } });
        g.OptionsListAccount[606] = "2";
        try {
            const root = await openPage(PETS, (root) => petRow(root, 2));
            await pickTier(root, 2, tier);
            // The pick saves in the background: the list the save leaves is no longer the empty one.
            let list = "";
            for (let i = 0; i < 100 && !list; i++) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                list = String((await fetchConfig()).cheatConfig.w1.companion.companions);
            }
            const saved = list.split(",");
            assert.equal(g.OptionsListAccount[606], "", "the token is removed");
            assert.equal(saved.find((entry) => entry.startsWith("2:")) ?? null, wanted, `saved: ${saved}`);
        } finally {
            await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
            g.OptionsListAccount[606] = "2,5";
        }
    });
}

const STAR_SIGNS = "src/ui/pages/world-1/star-signs/star-signs.js";
const signsReady = (root) => byClass(root, "starsign-row").length > 0;
// A sign's row opens its players in place, from the task (the row's opener).
const openSign = async (label) => {
    const root = await openPage(STAR_SIGNS, signsReady);
    const row = byClass(root, "starsign-row").find((node) => node.attributes["data-sign"] === label);
    byClass(row, "starsign-row__open")[0].listeners.click({});
    await until(() => byClass(root, "starsign-detail")[0], "the sign to open");
    return root;
};
const detailOf = (root) => byClass(root, "starsign-detail")[0];
// What a screen reader was last told (announce, in inPlace.js).
const spoken = () => elements(globalThis.document.body).find((node) => node.attributes.role === "status")?.textContent;
const chipLetters = (root) =>
    byClass(detailOf(root), "starsign-player-chip").map((chip) => chip.attributes["data-letter"]);
// Taking a player off is one press; Undo puts them back.
const removeChip = (root, at) => {
    const remove = byClass(detailOf(root), "starsign-remove-btn")[at];
    return remove.listeners.click({ currentTarget: remove });
};

test("star signs: taking a player off saves at once, with no Click again", async () => {
    const saved = [...g.StarSignProg[1]];
    g.StarSignProg[1] = ["_a", 0];
    const root = await openSign("A-2");
    assert.deepEqual(chipLetters(root), ["_", "a"]);
    removeChip(root, 0);
    await until(() => g.StarSignProg[1][0] === "a", "the press to take the player off");
    g.StarSignProg[1] = saved;
});

test("star signs: removing a player keeps a completion made in the game since", async () => {
    const saved = [...g.StarSignProg[1]];
    g.StarSignProg[1] = ["_", 0];
    const root = await openSign("A-2");
    g.StarSignProg[1] = ["_c", 1]; // character c completed it in the game
    const detail = detailOf(root);
    removeChip(root, 0);
    await until(() => ["success", "error"].includes(saveState(detail)), "the save");
    assert.equal(saveState(detail), "success");
    assert.equal(g.StarSignProg[1][0], "c");
    await tick();
    assert.deepEqual(chipLetters(root), ["c"], "the open sign shows what the game holds");
    g.StarSignProg[1] = saved;
});

test("star signs: a refused save says why in the open sign and shows the game's players", async () => {
    const root = await openSign("A-4");
    const detail = detailOf(root);
    const before = chipLetters(root);
    const restore = refuseWrites(g.StarSignProg[3], 0);
    try {
        removeChip(root, 0);
        await until(() => ["success", "error"].includes(saveState(detailOf(root))), "the save");
    } finally {
        restore();
    }
    assert.equal(detailOf(root), detail, "the open sign stays, with its save state");
    assert.equal(saveState(detail), "error");
    assert.equal(text(byClass(detail, "save-state__label")[0]).trim(), "game kept old value");
    await tick();
    assert.deepEqual(chipLetters(root), before);
});

test("star signs: Undo in the open sign puts the players back and shows them", async () => {
    const saved = [...g.StarSignProg[1]];
    g.StarSignProg[1] = ["_a", 0];
    const root = await openSign("A-2");
    const detail = detailOf(root);
    removeChip(root, 0);
    await until(() => saveState(detail) === "success", "the save");
    assert.equal(g.StarSignProg[1][0], "a");
    await byClass(detail, "save-state__undo")[0].listeners.click({});
    await until(() => g.StarSignProg[1][0] === "_a", "the undo");
    await until(() => chipLetters(root).join("") === "_a", "the open sign to show the players again");
    assert.equal(detailOf(root), detail);
    g.StarSignProg[1] = saved;
});

test("star signs: Reset all asks in the tray, then clears a sign completed in the game since the page opened and says so", async () => {
    const saved = [...g.StarSignProg[2]];
    g.StarSignProg[2] = ["", 0];
    const root = await openPage(STAR_SIGNS, signsReady);
    g.StarSignProg[2] = ["_", 0]; // completed in the game
    const reset = elements(root).find((node) => node.nodeName === "button" && text(node).trim() === "Reset all");
    const writes = () => requests.filter((entry) => entry.includes("/write")).length;
    const before = writes();
    reset.listeners.click({ preventDefault() {} }); // asks in the tray
    await tick();
    assert.equal(writes(), before, "nothing is written before the answer");
    await byClass(root, "tabbed-list__yes")[0].listeners.click({});
    await until(() => g.StarSignProg[2][0] === "", "the reset");
    await until(() => spoken() === "Reset all: done", "the result to be said");
    g.StarSignProg[2] = saved;
});

// #183: Unlock all wrote every sign again, so a full sign lost its players.
test("star signs: Unlock all fills only the empty places and leaves a full sign alone", async () => {
    const saved = g.StarSignProg.map((entry) => [...entry]);
    const savedPoints = g.OptionsListAccount[40];
    g.StarSignProg[0] = ["c", 0]; // A-1 needs 4; character c has it
    g.StarSignProg[3] = ["cde", 1]; // A-4 needs 3 and is full
    try {
        const root = await openPage(STAR_SIGNS, signsReady);
        const unlock = elements(root).find((node) => node.nodeName === "button" && text(node).trim() === "Unlock all");
        await unlock.listeners.click({ preventDefault() {}, currentTarget: unlock });
        await until(() => g.StarSignProg[0][0].length === 4, "A-1 to fill");
        assert.equal(g.StarSignProg[0][0], "c_ab", "who had it stays first");
        assert.equal(g.StarSignProg[3][0], "cde", "the full sign keeps its players");
        await until(() => spoken() === "Unlock all: done", "the result to be said"); // before the next test speaks
    } finally {
        saved.forEach((entry, i) => (g.StarSignProg[i] = entry));
        g.OptionsListAccount[40] = savedPoints;
    }
});

// #183: Randomize all took players off signs in one click.
test("star signs: Randomize all asks in the tray before it changes anything, and says how it went", async () => {
    const saved = g.StarSignProg.map((entry) => [...entry]);
    const savedPoints = g.OptionsListAccount[40];
    g.StarSignProg[3] = ["cde", 1];
    try {
        const root = await openPage(STAR_SIGNS, signsReady);
        const randomize = elements(root).find(
            (node) => node.nodeName === "button" && text(node).trim() === "Randomize all"
        );
        const writes = () => requests.filter((entry) => entry.includes("/write")).length;
        const before = writes();
        randomize.listeners.click({ preventDefault() {} });
        await tick();
        assert.equal(writes(), before, "nothing is written before the answer");
        const asked = text(byClass(root, "tabbed-list__tools-label")[0]);
        assert.ok(asked.startsWith("Randomize "), `the tray asks (${asked})`);
        await byClass(root, "tabbed-list__yes")[0].listeners.click({});
        await until(() => writes() > before, "the randomize");
        await until(() => spoken() === "Randomize all: done", "the result to be said");
    } finally {
        saved.forEach((entry, i) => (g.StarSignProg[i] = entry));
        g.OptionsListAccount[40] = savedPoints;
    }
});

// OptionsListAccount[40] is the star points balance the game spends on star signs: a change moves it by the sign's
// points (A-4 needs 3 players and gives 4), so points already spent on star signs stay spent.
test("star signs: star points move by what a sign gives, so points spent on star signs stay spent", async () => {
    const saved = [...g.StarSignProg[3]];
    const savedPoints = g.OptionsListAccount[40];
    g.StarSignProg[3] = ["_ab", 1]; // A-4 is done (3 players) and claimed: it gave 4 points
    g.OptionsListAccount[40] = 5; // what's left after spending points on star signs
    try {
        const root = await openSign("A-4");
        const detail = detailOf(root);
        removeChip(root, 0);
        await until(() => saveState(detail) === "success", "the save");
        assert.equal(Number(g.OptionsListAccount[40]), 1, "unclaiming takes back the sign's 4 points, not the total");
        await byClass(detail, "save-state__undo")[0].listeners.click({});
        await until(() => g.StarSignProg[3][0] === "_ab", "the undo");
        await until(() => Number(g.OptionsListAccount[40]) === 5, "and claiming again gives them back");
    } finally {
        g.StarSignProg[3] = saved;
        g.OptionsListAccount[40] = savedPoints;
    }
});

test("star signs: star points that aren't a number are refused, and nothing is written", async () => {
    const saved = [...g.StarSignProg[3]];
    const savedPoints = g.OptionsListAccount[40];
    g.StarSignProg[3] = ["_ab", 1];
    g.OptionsListAccount[40] = "lots";
    try {
        const root = await openSign("A-4");
        const detail = detailOf(root);
        const writes = () => requests.filter((entry) => entry.includes("/write")).length;
        const before = writes();
        removeChip(root, 0);
        await until(() => saveState(detail) === "error", "the save to fail");
        assert.equal(writes(), before, "nothing was written");
        assert.equal(g.StarSignProg[3][0], "_ab");
        assert.equal(g.OptionsListAccount[40], "lots");
    } finally {
        g.StarSignProg[3] = saved;
        g.OptionsListAccount[40] = savedPoints;
    }
});

test("star signs: points the game spends while a save runs aren't given back", async () => {
    const saved = [...g.StarSignProg[3]];
    const savedPoints = g.OptionsListAccount[40];
    g.StarSignProg[3] = ["_ab", 1];
    g.OptionsListAccount[40] = 5;
    // The game spends 4 points on a star sign right after the page read the balance.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (String(url).includes("/gga/read") && String(options?.body ?? "").includes("OptionsListAccount[40]")) {
            g.OptionsListAccount[40] = 1;
        }
        return response;
    };
    try {
        const root = await openSign("A-4");
        const detail = detailOf(root);
        removeChip(root, 0);
        await until(() => ["success", "error"].includes(saveState(detail)), "the save");
        assert.equal(saveState(detail), "error", "the save says the game changed it");
        assert.equal(Number(g.OptionsListAccount[40]), 1, "the spent points stay spent");
    } finally {
        globalThis.fetch = realFetch;
        g.StarSignProg[3] = saved;
        g.OptionsListAccount[40] = savedPoints;
    }
});

test("star signs: a sign the game claims during a save isn't counted twice", async () => {
    const saved = g.StarSignProg.map((entry) => [...entry]);
    const savedPoints = g.OptionsListAccount[40];
    // Every sign done and claimed but A-4 (it needs 3 players and gives 4 points); 5 points to spend.
    g.StarSignProg.forEach((_, i) => (g.StarSignProg[i] = ["_abc".slice(0, 1 + (i % 3)), 1]));
    g.StarSignProg[3] = ["_", 0];
    g.OptionsListAccount[40] = 5;
    const realFetch = globalThis.fetch;
    try {
        const root = await openPage(STAR_SIGNS, signsReady);
        // Right after Unlock all reads the signs, the game claims A-4 itself and adds its 4 points.
        let claimedInGame = false;
        globalThis.fetch = async (url, options) => {
            const response = await realFetch(url, options);
            const path = String(url).includes("/gga/read") ? JSON.parse(options?.body ?? "{}").path : null;
            // The read asks for "gga.StarSignProg".
            if (/(^|\.)StarSignProg$/.test(path ?? "") && !claimedInGame) {
                claimedInGame = true;
                g.StarSignProg[3] = ["_ab", 1];
                g.OptionsListAccount[40] = 9;
            }
            return response;
        };
        const writes = () => requests.filter((entry) => entry.includes("/write")).length;
        const before = writes();
        const unlock = elements(root).find((node) => node.nodeName === "button" && text(node).trim() === "Unlock all");
        await unlock.listeners.click({ preventDefault() {}, currentTarget: unlock });
        await until(() => claimedInGame && writes() > before, "Unlock all to save");
        await tick();
        assert.equal(Number(g.OptionsListAccount[40]), 9, "A-4's points count once");
    } finally {
        globalThis.fetch = realFetch;
        saved.forEach((entry, i) => (g.StarSignProg[i] = entry));
        g.OptionsListAccount[40] = savedPoints;
    }
});

test("star signs: the row's switch fills a sign with the players it still needs, and off clears it", async () => {
    const saved = [...g.StarSignProg[0]];
    g.StarSignProg[0] = ["c", 0]; // A-1 needs 4; character c has it
    const root = await openPage(STAR_SIGNS, signsReady);
    const row = byClass(root, "starsign-row").find((node) => node.attributes["data-sign"] === "A-1");
    const box = elements(row).find((node) => node.nodeName === "input" && node.attributes.role === "switch");
    box.checked = true;
    await box.listeners.change({ target: box });
    await until(() => g.StarSignProg[0][0].length === 4, "the sign to fill");
    assert.equal(g.StarSignProg[0][0], "c_ab", "who had it stays first");
    assert.equal(Number(g.StarSignProg[0][1]), 1, "and it's claimed");
    box.checked = false;
    await box.listeners.change({ target: box });
    await until(() => g.StarSignProg[0][0] === "", "the sign to clear");
    g.StarSignProg[0] = saved;
});

// OptionsListAccount[40] is the star points balance the game spends on star signs: a change moves it by the sign's
// points (A-1 gives 3), so points already spent stay spent.
test("star signs: the row's switch moves star points by what a sign gives, so points spent stay spent", async () => {
    const saved = [...g.StarSignProg[0]];
    const savedPoints = g.OptionsListAccount[40];
    g.StarSignProg[0] = ["", 0];
    g.OptionsListAccount[40] = 5; // what's left after spending points on star signs
    try {
        const root = await openPage(STAR_SIGNS, signsReady);
        const row = byClass(root, "starsign-row").find((node) => node.attributes["data-sign"] === "A-1");
        const box = elements(row).find((node) => node.nodeName === "input" && node.attributes.role === "switch");
        box.checked = true;
        await box.listeners.change({ target: box });
        await until(() => Number(g.OptionsListAccount[40]) === 8, "the sign's 3 points to be added");
        box.checked = false;
        await box.listeners.change({ target: box });
        await until(() => Number(g.OptionsListAccount[40]) === 5, "and taken back");
    } finally {
        g.StarSignProg[0] = saved;
        g.OptionsListAccount[40] = savedPoints;
    }
});

// A tray question counts the rows the top bar's search shows when it is asked; a new search drops it, so Yes never
// acts on rows the player wasn't asked about.
const { searchHits } = await importRepo("src/ui/menu/pageSearch.js");
const trayLabel = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);
const levelWrites = () => requests.filter((entry) => entry.includes("/write") && entry.includes("StampLevel")).length;

test("stamps: a Set all question is dropped when the page search changes", async () => {
    const saved = g.StampLevel[0].map((level) => level);
    g.StampLevel[0] = saved.map(() => 3);
    try {
        const root = await openPage(STAMPS, (root) => rowNamed(root, "Mana Stamp"));
        const control = byClass(root, "account-setall-row")[0];
        const apply = elements(control).find((node) => node.nodeName === "button" && text(node).trim() === "Set all");
        control.querySelector = () => apply; // the fake DOM has no selectors; the page asks for its button
        elements(control)
            .find((node) => node.nodeName === "input")
            .listeners.input({ target: { value: "0" } });
        await tick();
        await apply.listeners.click({ preventDefault() {} });
        await until(() => trayLabel(root).startsWith("Lower "), "the question");
        searchHits.val = new Set();
        await until(() => !trayLabel(root).startsWith("Lower "), "the question to drop");
        const before = levelWrites();
        await byClass(root, "tabbed-list__yes")[0].listeners.click({});
        await tick();
        assert.equal(levelWrites(), before, "a dropped question changes nothing");
    } finally {
        searchHits.val = null;
        g.StampLevel[0] = saved;
    }
});

// #126 (CodeRabbit on #208): a token the game gives after the save's own read is checked again once the save lands.
test("pets: Pets+ on a pet the game gives a token after the save read the tokens is taken back, and says why", async () => {
    const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
    const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
    await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: "12:0" } } } }); // pet 12 at Normal
    g.OptionsListAccount[606] = "2";
    try {
        const root = await openPage(PETS, (root) => petRow(root, 12) && tierShown(root, 12) === "Normal");
        // As the tiers are saved, after the save read the tokens in its turn.
        const restore = onRequest(/\/config\/save$/, () => tokenInGame(12));
        try {
            pickTier(root, 12, "Pets+"); // the pick saves in the background
            await until(() => alertText(root) === "This pet has a token now.", "the reason");
        } finally {
            restore();
        }
        assert.equal(g.OptionsListAccount[606], "2,12");
        const saved = String((await fetchConfig()).cheatConfig.w1.companion.companions).split(",");
        assert.ok(!saved.includes("12:1"), `pet 12 isn't left at Pets+ (saved: ${saved})`);
    } finally {
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
        g.OptionsListAccount[606] = "2,5";
    }
});

// CodeRabbit on #213: the save takes a pet's token back for Pets+; the game giving it back while the tiers save is late
// too, though the pet had a token at the press.
test("pets: Pets+ on a token pet the game gives its token back during the save is taken back, and says why", async () => {
    const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
    const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
    await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: "5:0" } } } });
    g.OptionsListAccount[606] = "2";
    try {
        const root = await openPage(PETS, (root) => petRow(root, 2) && tokenShown(root, 2));
        // The token write took pet 2's token back; the game gives it again as the tiers are saved.
        const restore = onRequest(/\/config\/save$/, () => tokenInGame(2));
        try {
            pickTier(root, 2, "Pets+"); // the pick saves in the background
            await until(() => alertText(root) === "This pet has a token now.", "the reason");
        } finally {
            restore();
        }
        const saved = String((await fetchConfig()).cheatConfig.w1.companion.companions).split(",");
        assert.ok(!saved.includes("2:1"), `pet 2 isn't left at Pets+ (saved: ${saved})`);
    } finally {
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
        g.OptionsListAccount[606] = "2,5";
    }
});

// #126 (CodeRabbit on #208): a tray answer could start a second save while one ran, and the first one's failure then
// put its message over the newer save's.
const attr = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
const petsAskingWhileASaveRuns = async () => {
    const { updateSessionConfig } = await importRepo("src/ui/services/api.js");
    await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: "12:1" } } } }); // pet 12 at Pets+
    g.OptionsListAccount[606] = "2";
    const root = await openPage(PETS, (root) => petRow(root, 12) && tierShown(root, 12) === "Pets+");
    const pane = elements(root).find(
        (node) => node.attributes["data-tab"] && elements(node).includes(petRow(root, 12))
    );
    elements(root)
        .find((node) => node.attributes.role === "tab" && text(node).trim().startsWith(pane.attributes["data-tab"]))
        .listeners.click({});
    for (let i = 0; i < 5; i++) await tick(); // the switch drops any question on its next update, so it comes first
    const tray = byClass(root, "tabbed-list__tools")[0];
    const normalAll = elements(tray).find((node) => node.nodeName === "button" && text(node).trim() === "Normal");
    await normalAll.listeners.click({ preventDefault() {}, currentTarget: normalAll });
    await until(() => trayLabel(root).startsWith("Lower 1 pet"), "the question");
    // Pet 2's token comes off; its token write waits, and the game picks a token meanwhile, so it fails.
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = false;
    globalThis.fetch = async (url, options) => {
        if (!held && String(url).includes("/write")) {
            held = true;
            tokenInGame(9);
            await gate;
        }
        return realFetch(url, options);
    };
    const tokenSave = flipToken(root, 2);
    await until(() => held, "pet 2's token write to wait");
    const yes = byClass(root, "tabbed-list__yes")[0];
    const done = async () => {
        release();
        globalThis.fetch = realFetch;
        await tokenSave;
    };
    return { root, yes, done };
};

test("pets: the tray's Yes waits while a save runs", async () => {
    const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
    const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
    let done = async () => {};
    try {
        let yes;
        ({ yes, done } = await petsAskingWhileASaveRuns());
        assert.equal(Boolean(attr(yes, "disabled")), true, "Yes is off while pet 2 saves");
        await done();
        assert.equal(Boolean(attr(yes, "disabled")), false, "Yes is back once it ended");
    } finally {
        await done();
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
        g.OptionsListAccount[606] = "2,5";
    }
});

test("pets: a save that fails after a newer one started leaves the newer one's message", async () => {
    const { fetchConfig, updateSessionConfig } = await importRepo("src/ui/services/api.js");
    const before = (await fetchConfig()).cheatConfig.w1.companion.companions;
    let done = async () => {};
    try {
        let root;
        let yes;
        ({ root, yes, done } = await petsAskingWhileASaveRuns());
        await yes.listeners.click({}); // a press that got through: the newer save
        // All to Normal: pet 12 comes down from Pets+, and the tab's other pets come up from Off.
        let saved = [];
        for (let i = 0; i < 100 && !saved.includes("12:0"); i++) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            saved = String((await fetchConfig()).cheatConfig.w1.companion.companions).split(",");
        }
        assert.ok(saved.includes("12:0"), `the newer save landed (saved: ${saved})`);
        for (let i = 0; i < 10; i++) await tick();
        await done(); // the older save fails now
        for (let i = 0; i < 10; i++) await tick();
        assert.equal(alertText(root), "", "the older failure says nothing over the newer save");
    } finally {
        await done();
        await updateSessionConfig({ cheatConfig: { w1: { companion: { companions: before } } } });
        g.OptionsListAccount[606] = "2,5";
    }
});

test("star signs: a Reset all question is dropped when the page search changes", async () => {
    const saved = [...g.StarSignProg[2]];
    g.StarSignProg[2] = ["_", 0];
    try {
        const root = await openPage(STAR_SIGNS, signsReady);
        const reset = elements(root).find((node) => node.nodeName === "button" && text(node).trim() === "Reset all");
        reset.listeners.click({ preventDefault() {} });
        await until(() => trayLabel(root).startsWith("Reset "), "the question");
        searchHits.val = new Set();
        await until(() => !trayLabel(root).startsWith("Reset "), "the question to drop");
        await byClass(root, "tabbed-list__yes")[0].listeners.click({});
        await tick();
        assert.equal(g.StarSignProg[2][0], "_", "a dropped question changes nothing");
    } finally {
        searchHits.val = null;
        g.StarSignProg[2] = saved;
    }
});

// #204: a tray question checks again, when answered, what it takes away.
test("stamps: a stamp exalted while Unexalt all asks is one more to take away, so it asks again", async () => {
    g.Compass[4] = ["_1", "a0", "b4"];
    const root = await openPage(STAMPS, (root) => rowNamed(root, "Mana Stamp"));
    const unexalt = elements(root).find((node) => node.nodeName === "button" && text(node).trim() === "Unexalt all");
    unexalt.listeners.click({ preventDefault() {} });
    await until(() => /^Unexalt 1 /.test(trayLabel(root)), "the question");
    await flip(rowNamed(root, "Mana Stamp"), true);
    const writes = () => requests.filter((entry) => entry.includes("/write")).length;
    const before = writes();
    await byClass(root, "tabbed-list__yes")[0].listeners.click({});
    await tick();
    assert.match(trayLabel(root), /^Unexalt 2 /, "it asks again");
    assert.equal(writes(), before, "nothing was written");
    await byClass(root, "tabbed-list__yes")[0].listeners.click({});
    await until(() => !g.Compass[4].some((code) => code.startsWith("_")), "the answer to unexalt both");
});
