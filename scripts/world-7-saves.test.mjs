// World 7 page saves on the fake game: a save writes only what the player changed and keeps what the game did
// since the page read; a read that crosses a save doesn't bring back the old value; a failed save shows what
// the game holds.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
// The caves page keeps its scroll place on the next frame.
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
// Sushi Tools polls the game's status while it is open; that timer may not keep the test alive.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { Research, Spelunk, Sushi, Menagerie } = game.gga;

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
const inputs = (row) => elements(row).filter((node) => node.nodeName === "input");
const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const writesSince = (start) => requests.slice(start).filter((entry) => entry.includes("/write"));

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root), `${file} to load`);
    return root;
}

// What the player does, as the browser reports it: blur on the field, then focusout bubbling to the row.
const fire = (node, kind, event) =>
    (node.handlers[kind] ?? []).filter((handler) => typeof handler === "function").forEach((handler) => handler(event));
const focus = (input) => fire(input, "focus", { target: input });
const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const press = (row, input, key) => row.listeners.keydown({ key, target: input, preventDefault() {} });
const leave = (row, input, to = null) => {
    fire(input, "blur", { target: input, relatedTarget: to });
    fire(row, "focusout", { target: input, currentTarget: row, relatedTarget: to });
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0] ?? { attributes: {} }))?.[1];
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
// Hold requests whose URL has `part` until released.
const hold = (part) => {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes(part)) await gate;
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

const OBSERVATIONS = "src/ui/pages/world-7/research/observations.js";
const observationTiles = (root) => byClass(root, "observation-tile");

test("Observations: leaving Insight Lv or Insight EXP saves what was typed", async () => {
    const root = await openPage(OBSERVATIONS, (node) => observationTiles(node).length > 3);
    const tile = observationTiles(root)[1];
    const [, level, exp] = inputs(tile);
    focus(level);
    type(level, 42);
    leave(tile, level);
    await settled(tile);
    assert.equal(Research[4][1], 42);

    // Typed in EXP, then Tab to Insight Lv and out of the tile.
    focus(exp);
    type(exp, 777);
    leave(tile, exp, level);
    focus(level);
    leave(tile, level);
    await until(() => Research[3][1] === 777, "the EXP to save");
    assert.equal(exp.attributes.value, "777");
});

test("Observations: saving Insight Lv keeps the Insight EXP the game gained since the page read", async () => {
    const root = await openPage(OBSERVATIONS, (node) => observationTiles(node).length > 3);
    const tile = observationTiles(root)[2];
    const [, level] = inputs(tile);
    Research[3][2] = 99999;
    const start = requests.length;
    focus(level);
    type(level, 3);
    press(tile, level, "Enter");
    await settled(tile);
    assert.equal(stateOf(tile), "success");
    assert.equal(Research[4][2], 3);
    assert.equal(Research[3][2], 99999, "the EXP the game gained stays");
    assert.equal(writesSince(start).length, 1, "only Insight Lv is written");
});

test("Sushi General: saving Perfect keeps the knowledge XP and level the game gained since the page read", async () => {
    // The game keeps one value per tier here (src/cheats/cheats/sushi/knowledge.js).
    Sushi[6] = Array.from({ length: 20 }, (_, i) => i * 100);
    Sushi[7] = Array.from({ length: 20 }, (_, i) => i % 7);
    const tierRows = (root) => byClass(root, "account-row").filter((row) => text(row).includes("Tier "));
    const root = await openPage("src/ui/pages/world-7/sushi-station/1-general.js", (node) => tierRows(node).length > 3);
    const row = tierRows(root)[2];
    const [perfect] = inputs(row);
    await until(() => perfect.attributes.value === String(Sushi[5][2]), "the tier to show the game's values");
    Sushi[6][2] = 987654;
    Sushi[7][2] = 9;
    const next = Sushi[5][2] === 1 ? 0 : 1;
    focus(perfect);
    type(perfect, next);
    press(row, perfect, "Enter");
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(Sushi[5][2], next);
    assert.equal(Sushi[6][2], 987654, "the XP the game gained stays");
    assert.equal(Sushi[7][2], 9, "the level the game gained stays");
});

test("Sushi Station: a slot save the game refuses shows the game's tier again and says why", async () => {
    const tiles = (root) => byClass(root, "sushi-station-tile");
    const root = await openPage(
        "src/ui/pages/world-7/sushi-station/2-station.js",
        (node) => tiles(node).length > 10 && inputs(tiles(node)[1])[0].attributes.value === String(Sushi[0][1] + 1)
    );
    const tile = tiles(root)[1];
    const [field] = inputs(tile);
    const shown = field.attributes.value;
    const restore = refuseWrites(Sushi[0], 1);
    try {
        field.listeners.focus({ target: field });
        field.value = String(Number(shown) + 1);
        field.listeners.input({ target: field });
        field.listeners.blur({ target: field });
        const region = () =>
            elements(globalThis.document.body).find((node) => node.attributes.role === "status")?.textContent ?? "";
        await until(() => region().startsWith("Slot 1 not saved"), "the failure to be said");
        await until(() => field.attributes.value === shown, "the field to show the game's tier");
    } finally {
        restore();
    }
});

// Review of #125: the earlier save, ending, put its tier over the one the player had typed since.
test("Sushi Station: a tier typed while the last one saves stays in the field", async () => {
    const tiles = (root) => byClass(root, "sushi-station-tile");
    Sushi[0][2] = 1; // tier 2
    const root = await openPage(
        "src/ui/pages/world-7/sushi-station/2-station.js",
        (node) => tiles(node).length > 10 && inputs(tiles(node)[2])[0].attributes.value === "2"
    );
    const [field] = inputs(tiles(root)[2]);
    const release = hold("/write");
    try {
        field.listeners.focus({ target: field });
        field.value = "1";
        field.listeners.input({ target: field });
        field.listeners.blur({ target: field });
        field.listeners.focus({ target: field });
        field.value = "2";
        field.listeners.input({ target: field });
    } finally {
        release();
    }
    await until(() => Sushi[0][2] === 0, "tier 1 to save");
    await tick();
    assert.equal(field.attributes.value, "2", "the field keeps the tier typed since");
    field.listeners.blur({ target: field });
    await until(() => Sushi[0][2] === 1, "the tier typed since to save on leaving");
});

test("Research Grid: Refresh while a level saves keeps the typed level, and leaving again writes nothing", async () => {
    const GRID = "src/ui/pages/world-7/research/grid.js";
    const tiles = (root) => byClass(root, "research-grid-tile").filter((tile) => tile.attributes.disabled === false);
    const root = await openPage(GRID, (node) => tiles(node).length > 3);
    const card = () => byClass(root, "research-grid-detail__edit-row")[0];
    tiles(root)[3].listeners.click({});
    await until(card, "the tile's card");
    const index = Number(/Tile (\d+)/.exec(text(byClass(root, "research-grid-detail__index")[0]))[1]) - 1;
    const max = Number(/\/ (\d+)/.exec(text(byClass(root, "research-grid-detail__preview-level")[0]))[1]);
    const next = Research[0][index] === max ? 0 : max;
    const [field] = inputs(card());

    focus(field);
    type(field, next);
    const release = hold("/write");
    leave(card(), field);
    // Refresh reads the game while the save's write waits.
    await buttonNamed(root, "Refresh").listeners.click({ preventDefault() {} });
    release();
    await settled(card());
    assert.equal(Research[0][index], next);
    assert.equal(field.attributes.value, String(next), "the field keeps the saved level");

    const start = requests.length;
    focus(field);
    leave(card(), field);
    await tick();
    assert.deepEqual(writesSince(start), [], "leaving the untouched field writes nothing");
    assert.equal(Research[0][index], next);
});

test("Spelunking Caves: Remove asks Click again first, and the second press takes the object off the list", async (t) => {
    const removeButtons = (root) =>
        elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === "Remove");
    const root = await openPage("src/ui/pages/world-7/spelunking/1-caves.js", (node) => removeButtons(node).length > 1);
    await until(() => removeButtons(root)[0].attributes.disabled === false, "Remove to be ready");
    const click = (node) => node.listeners.click({ preventDefault() {} });
    const [remove, other] = removeButtons(root);
    const row = byClass(root, "account-row").find((node) => elements(node).includes(remove));
    const read = [...Spelunk[6]];
    const start = requests.length;

    // The first press only asks; the ask runs out after a few seconds, and the press after that asks again.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
        click(remove);
        assert.equal(remove.attributes["data-again"], "Click again", "the first press asks");
        assert.equal(
            remove.attributes["aria-label"],
            `Click again to remove ${text(byClass(row, "account-row__name")[0])}.`
        );
        t.mock.timers.tick(4000);
        assert.equal(remove.attributes["data-again"], undefined, "the ask runs out");
        click(remove);
        assert.equal(remove.attributes["data-again"], "Click again", "the press after that asks again");
    } finally {
        t.mock.timers.reset();
    }
    click(other);
    assert.equal(other.attributes["data-again"], "Click again", "another row's Remove asks for its own object");
    assert.deepEqual(writesSince(start), [], "nothing was written");
    assert.deepEqual([...Spelunk[6]], read);

    await click(remove);
    await until(() => Spelunk[6].length === read.length - 1, "the second press to remove the object");
    assert.equal(Spelunk[6].includes(read[0]), false);
});

test("Spelunking Caves: Add and Remove keep objects the game destroyed since the page read", async () => {
    const removeButtons = (root) =>
        elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === "Remove");
    const root = await openPage("src/ui/pages/world-7/spelunking/1-caves.js", (node) => removeButtons(node).length > 0);
    const read = [...Spelunk[6]];
    Spelunk[6].push("Rock_5_1");
    await buttonNamed(root, "Add").listeners.click({ preventDefault() {} });
    await until(() => Spelunk[6].length === read.length + 2, "the object to be added");
    assert.ok(Spelunk[6].includes("Rock_5_1"), "Add keeps the game's new object");
    await until(
        () => removeButtons(root).length === Spelunk[6].length && removeButtons(root)[0].attributes.disabled === false,
        "the page to show the game's list"
    );

    Spelunk[6].push("Rock_6_2");
    const first = Spelunk[6][0];
    removeButtons(root)[0].listeners.click({ preventDefault() {} }); // Remove asks "Click again" first
    await removeButtons(root)[0].listeners.click({ preventDefault() {} });
    await until(() => !Spelunk[6].includes(first), "the first object to be removed");
    assert.ok(Spelunk[6].includes("Rock_6_2"), "Remove keeps the game's new object");
    assert.equal(removeButtons(root).length, Spelunk[6].length);
});

test("Spelunking Caves: a Remove the game refuses says so on the row", async () => {
    const removeButtons = (root) =>
        elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === "Remove");
    const root = await openPage("src/ui/pages/world-7/spelunking/1-caves.js", (node) => removeButtons(node).length > 0);
    const kept = Spelunk[6];
    const frozen = [...kept];
    Object.defineProperty(Spelunk, 6, { get: () => frozen, set() {}, configurable: true });
    try {
        removeButtons(root)[0].listeners.click({ preventDefault() {} }); // Remove asks "Click again" first
        await removeButtons(root)[0].listeners.click({ preventDefault() {} });
        await until(
            () => removeButtons(root).some((node) => classes(node).includes("account-btn--error")),
            "the refusal to show on a Remove button"
        );
        assert.equal(removeButtons(root).length, frozen.length, "the object stays listed");
    } finally {
        Object.defineProperty(Spelunk, 6, { value: kept, writable: true, configurable: true });
    }
});

test("Sushi Tools: Refresh during a settings save keeps the typed setting, and the next save doesn't undo it", async () => {
    const status = { enabled: false, maxPurchaseTier: 70, maxTier: 70, working: [], reserved: [], message: "Idle" };
    router.post("/api/toggle", async (req, res) => res.json({ ok: true, message: JSON.stringify(status) }));
    const root = (await importRepo("src/ui/pages/world-7/sushi-station/4-tools.js")).default.component();
    root.offsetParent = null; // off screen: no status polling
    const field = (title) => elements(root).find((node) => node.attributes["aria-label"] === title);
    await until(() => buttonNamed(root, "Enable Auto Play")?.attributes.disabled === false, "the tab to load");
    const tier = field("Purchase tier");
    let section = tier;
    while (!section.listeners.focusout) section = section.parentNode;
    const { fetchConfig } = await importRepo("src/ui/services/api.js");
    const savedTier = async () => (await fetchConfig()).cheatConfig.w7.sushitools.tier;
    const next = (await savedTier()) === 3 ? 4 : 3;

    type(tier, next);
    const release = hold("/config/save");
    leave(section, tier);
    await buttonNamed(root, "Refresh").listeners.click({ preventDefault() {} });
    release();
    await until(() => text(byClass(root, "save-state__label")[0]) === "saved", "the settings to save");
    assert.equal(await savedTier(), next);
    assert.equal(tier.attributes.value, String(next), "the field keeps the saved setting");

    const chain = inputs(
        elements(root).find((node) => node.nodeName === "label" && text(node).includes("Extended"))
    )[0];
    const releaseToggle = hold("/config/save");
    chain.listeners.change({ target: { checked: !chain.attributes.checked } });
    await until(() => text(byClass(root, "save-state__label")[0]) === "saving…", "the toggle to save");
    releaseToggle();
    await until(() => text(byClass(root, "save-state__label")[0]) === "saved", "the toggle save to finish");
    assert.equal(await savedTier(), next, "the toggle's save keeps the tier");
});

const MENAGERIE = "src/ui/pages/world-7/menagerie/menagerie.js";
const menagerieRead = (node) => Boolean(findRow(node, "Lumi balance"));

test("Menagerie: fields stay usable while a save runs, and a second Enter saves too", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    const rank = findRow(root, "Shell rank");
    const exp = findRow(root, "Unspent Shell EXP");
    const [rankField] = inputs(rank);
    const [expField] = inputs(exp);
    focus(rankField);
    type(rankField, 77);
    const release = hold("/write");
    press(rank, rankField, "Enter");
    await tick();
    assert.equal(rankField.attributes.disabled, false, "the field the player saved stays usable");
    assert.equal(expField.attributes.disabled, false, "the other fields stay usable");
    focus(expField);
    type(expField, 1234);
    press(exp, expField, "Enter");
    release();
    await settled(rank);
    await settled(exp);
    assert.equal(stateOf(rank), "success");
    assert.equal(stateOf(exp), "success");
    assert.equal(Menagerie[0][2], 77);
    assert.equal(Menagerie[0][1], 1234);
});

test("Menagerie: a save made while another runs offers its Undo beside its row too", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    const rank = findRow(root, "Shell rank");
    const exp = findRow(root, "Unspent Shell EXP");
    const [rankField] = inputs(rank);
    const [expField] = inputs(exp);
    const undoShown = (row) => byClass(row, "save-state__undo")[0]?.attributes.hidden === false;
    focus(rankField);
    type(rankField, Menagerie[0][2] === 55 ? 56 : 55);
    const release = hold("/write");
    try {
        press(rank, rankField, "Enter");
        await tick();
        focus(expField);
        type(expField, Menagerie[0][1] === 4321 ? 4322 : 4321);
        press(exp, expField, "Enter");
    } finally {
        release();
    }
    await until(() => undoShown(rank), "the first save's Undo");
    await until(() => undoShown(exp), "the second save's Undo");
});

test("Menagerie: switching an unlock off takes back the line saying all were saved", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    const line = () => byClass(root, "account-write-feedback").find((node) => text(node).includes("All 25"));
    await buttonNamed(root, "Unlock all").listeners.click({ preventDefault() {} });
    await until(line, "the bulk line");
    const row = byClass(root, "account-row").find((node) => text(node).includes("Unlock #3"));
    await until(() => inputs(row)[0].attributes.disabled === false, "the page to read again");
    inputs(row)[0].listeners.change({ target: { checked: false } });
    await until(() => Menagerie[2][3] === 0, "the unlock to switch off");
    assert.equal(line(), undefined);
});

// The line beside Unlock all, not a switch's own saving/saved read-out inside its row.
const unlockLine = (root) => {
    const inRows = new Set(byClass(root, "account-row").flatMap((row) => elements(row)));
    return byClass(root, "account-write-feedback")
        .filter((node) => !inRows.has(node))
        .map(text)
        .join("");
};
const unlockRow = (root, n) => byClass(root, "account-row").find((node) => text(node).includes(`Unlock #${n}`));

test("Menagerie: an unlock switched off while Unlock all saves doesn't leave 'All 25 unlocks saved.'", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    for (let i = 0; i < 25; i++) Menagerie[2][i] = i === 3 ? 1 : 0;
    await buttonNamed(root, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => inputs(unlockRow(root, 3))[0].attributes.checked === true, "unlock #3 to show On");
    const release = hold("/write");
    try {
        buttonNamed(root, "Unlock all").listeners.click({ preventDefault() {} });
        await until(() => unlockLine(root) === "Saving…", "Unlock all to start");
        inputs(unlockRow(root, 3))[0].listeners.change({ target: { checked: false } });
    } finally {
        release();
    }
    await until(
        () => unlockLine(root) !== "Saving…" && buttonNamed(root, "Unlock all").attributes.disabled === false,
        "both saves to finish"
    );
    assert.equal(Menagerie[2][3], 0);
    assert.equal(unlockLine(root), "");
});

test("Menagerie: Undo all after Unlock all takes back 'All 25 unlocks saved.'", async () => {
    const root = await openPage(MENAGERIE, menagerieRead);
    for (let i = 0; i < 25; i++) Menagerie[2][i] = 0;
    const { lastBulkAction } = await importRepo("src/ui/services/changeLog.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    lastBulkAction.val = null;
    buttonNamed(root, "Unlock all").listeners.click({ preventDefault() {} });
    await until(() => unlockLine(root) === "All 25 unlocks saved." && lastBulkAction.val, "Unlock all to save");
    await undoAction(lastBulkAction.val.action.id);
    await until(() => inputs(unlockRow(root, 3))[0].attributes.checked === false, "the page to read the undo");
    assert.equal(Menagerie[2][3], 0);
    assert.equal(unlockLine(root), "");
});

test("Spelunking Caves: a refused Remove stays red on its row when the game added an object meanwhile", async () => {
    const removeButtons = (root) =>
        elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === "Remove");
    const root = await openPage("src/ui/pages/world-7/spelunking/1-caves.js", (node) => removeButtons(node).length > 0);
    await until(() => removeButtons(root)[0].attributes.disabled === false, "Remove to be ready");
    const before = [...Spelunk[6]];
    const remove = removeButtons(root)[0];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/write")) return realFetch(url, options);
        Spelunk[6].push("Rock_7_3"); // the game destroyed another object meanwhile
        return new Response(JSON.stringify({ error: "the game refused" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    try {
        remove.listeners.click({ preventDefault() {} }); // Remove asks "Click again" first
        await remove.listeners.click({ preventDefault() {} });
        await until(() => removeButtons(root).length === before.length + 1, "the page to show the game's list");
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.ok(removeButtons(root).includes(remove), "the row that asked is still on the page");
    assert.match(classes(remove), /account-btn--error/);
    Spelunk[6] = before;
});

test("Spelunking Caves: an Add or Remove the game no longer needs writes nothing and doesn't say saved", async () => {
    const removeButtons = (root) =>
        elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === "Remove");
    const root = await openPage("src/ui/pages/world-7/spelunking/1-caves.js", (node) => removeButtons(node).length > 1);
    await until(() => removeButtons(root)[0].attributes.disabled === false, "Remove to be ready");
    const before = [...Spelunk[6]];
    const start = requests.length;

    const remove = removeButtons(root)[0];
    Spelunk[6] = before.slice(1); // the game no longer lists it
    remove.listeners.click({ preventDefault() {} }); // Remove asks "Click again" first
    await remove.listeners.click({ preventDefault() {} });
    assert.doesNotMatch(classes(remove), /account-btn--success/, "no ✓ on Remove");

    const add = buttonNamed(root, "Add");
    await until(() => add.attributes.disabled === false, "Add to be ready");
    const picked = elements(root).find((node) => node.nodeName === "select");
    Spelunk[6] = [...Spelunk[6], String(picked.attributes.value)]; // the game destroyed it meanwhile
    await add.listeners.click({ preventDefault() {} });
    assert.doesNotMatch(classes(add), /account-btn--success/, "no ✓ on Add");
    assert.deepEqual(writesSince(start), [], "nothing was written");
    Spelunk[6] = before;
});

test("Spelunking Caves: an object removed down to an empty list and added back gets a new row", async () => {
    const removeButtons = (root) =>
        elements(root).filter((node) => node.nodeName === "button" && text(node).trim() === "Remove");
    const before = [...Spelunk[6]];
    Spelunk[6] = [before[0]];
    const root = await openPage(
        "src/ui/pages/world-7/spelunking/1-caves.js",
        (node) => removeButtons(node).length === 1
    );
    await until(() => removeButtons(root)[0].attributes.disabled === false, "Remove to be ready");
    const [remove] = removeButtons(root);
    remove.listeners.click({ preventDefault() {} }); // Remove asks "Click again" first
    await remove.listeners.click({ preventDefault() {} });
    await until(() => removeButtons(root).length === 0, "the list to be empty");
    const picker = elements(root).find((node) => node.nodeName === "select");
    picker.listeners.change({ target: { value: before[0] } }); // the same object again
    await buttonNamed(root, "Add").listeners.click({ preventDefault() {} });
    assert.deepEqual([...Spelunk[6]], [before[0]]);
    await until(() => removeButtons(root).length === 1, "the object to show again");
    assert.notEqual(removeButtons(root)[0], remove, "a new row, without the removed one's state");
    Spelunk[6] = before;
});
