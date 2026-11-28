// CodeRabbit's review of the merged 3.0 work (#317, #319): a question answered after the player picked another
// character or world asks again, a value saved shows after a world switch, a verified write shows even when the read
// after it fails, a locked sushi stays locked, a Reset counts every unit it takes away, and a held Enter can't arm and
// run a dangerous button. On the fake game, through the listeners a player triggers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
globalThis.requestAnimationFrame = () => {};
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
const inputs = (row) => elements(row).filter((node) => node.nodeName === "input");
const button = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const click = (node) => node.listeners.click({ preventDefault() {}, currentTarget: node });
const attrOf = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
const saveState = (row) => classes(byClass(row, "save-state")[0] ?? { attributes: {} });
const settled = (row) => /save-state--(success|error)/.test(saveState(row));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await wait(10);
    }
    assert.fail(`timed out waiting for ${what}`);
}
async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root) && pageRead(root), `${file} to load`);
    return root;
}
const type = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
const enter = (row, input) => row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
const pickOption = (root, label) =>
    click(byClass(root, "pick-in-place__option").find((node) => text(node).includes(label)));
// The tray's Set all: its number, then its button; and the tray's line (what it acts on, or its question).
const setAll = (root, value) => {
    type(inputs(byClass(root, "account-setall-row")[0])[0], value);
    click(button(byClass(root, "account-setall-row")[0], "Set all"));
};
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);

test("levels: a Set all question asked for one character asks again once another is picked", async (t) => {
    const db = gga.PlayerDATABASE.h;
    const [first, other] = gga.GetPlayersUsernames;
    const before = { live: [...gga.Lv0], other: [...db[other].h.Lv0] };
    t.after(() => {
        gga.Lv0 = before.live;
        db[other].h.Lv0 = before.other;
    });
    // Every skill above 10 on both, so the same lines would go down on either.
    gga.Lv0 = gga.Lv0.map((level, i) => (i ? 50 : level));
    db[other].h.Lv0 = db[other].h.Lv0.map((level, i) => (i ? 60 : level));
    const root = await openPage("src/ui/pages/account/player/1-levels.js", (r) => byClass(r, "account-row").length > 3);
    const lastRow = () => byClass(root, "account-row").at(-1);
    setAll(root, 10);
    await until(() => /^Lower/.test(trayLine(root)), "Set all to ask about lowering");

    pickOption(root, other);
    await until(() => String(attrOf(inputs(lastRow())[0], "value")) === "60", `${other}'s levels to show`);
    click(byClass(root, "tabbed-list__yes")[0]);
    await wait(300);
    assert.match(trayLine(root), /^Lower/, "it asks again");
    assert.deepEqual(
        [...db[other].h.Lv0],
        db[other].h.Lv0.map((level, i) => (i ? 60 : level)),
        `${other} untouched`
    );
    assert.ok(
        gga.Lv0.slice(1).every((level) => level === 50),
        `${first} untouched`
    );
    click(button(root, "Cancel"));
});

test("levels: Set all keeps a skill level at 1 or more", async (t) => {
    const before = [...gga.Lv0];
    t.after(() => (gga.Lv0 = before));
    gga.Lv0 = gga.Lv0.map((level, i) => (i ? 0 : level));
    const root = await openPage("src/ui/pages/account/player/1-levels.js", (r) => byClass(r, "account-row").length > 3);
    // Every skill at 0: a Set all of 0 raises them to 1, the lowest a skill level goes.
    setAll(root, 0);
    await until(() => gga.Lv0.slice(2, 8).every((level) => level === 1), "the skill levels to go to 1");
});

test("task board: a Set all question asked for one world asks again once another is picked", async (t) => {
    const before = structuredClone([gga.Tasks[1][0], gga.Tasks[1][1]]);
    t.after(() => ([gga.Tasks[1][0], gga.Tasks[1][1]] = before));
    gga.Tasks[1][0] = gga.Tasks[1][0].map(() => 3);
    gga.Tasks[1][1] = gga.Tasks[1][1].map(() => 3);
    const root = await openPage(
        "src/ui/pages/account/task-board/tasks.js",
        (r) => byClass(r, "account-row").length > 3
    );
    setAll(root, 1);
    await until(() => /^Lower/.test(trayLine(root)), "Set all to ask about lowering");

    pickOption(root, "World 2");
    await until(
        () => pageRead(root) && /World 2/.test(text(byClass(root, "character-picker__opener")[0])),
        "World 2 to show"
    );
    click(byClass(root, "tabbed-list__yes")[0]);
    await wait(300);
    assert.match(trayLine(root), /^Lower/, "it asks again");
    assert.deepEqual(
        [...gga.Tasks[1][0]],
        before[0].map(() => 3),
        "World 1's tasks are untouched"
    );
    assert.deepEqual(
        [...gga.Tasks[1][1]],
        before[1].map(() => 3),
        "World 2's tasks wait for the new answer"
    );
    click(button(root, "Cancel"));
});

test("task board: a task saved, then another world and back, shows what was saved", async (t) => {
    const before = [...gga.Tasks[1][0]];
    t.after(() => (gga.Tasks[1][0] = before));
    gga.Tasks[1][0][0] = 0;
    const root = await openPage(
        "src/ui/pages/account/task-board/tasks.js",
        (r) => byClass(r, "account-row").length > 3
    );
    const firstRow = () => byClass(root, "account-row")[0];
    const shown = () => String(attrOf(inputs(firstRow())[0], "value"));
    await until(() => shown() === "0", "the task to show 0");
    type(inputs(firstRow())[0], 2);
    enter(firstRow(), inputs(firstRow())[0]);
    await until(() => settled(firstRow()), "the save to end");
    assert.equal(gga.Tasks[1][0][0], 2);

    pickOption(root, "World 2");
    await until(
        () => pageRead(root) && /World 2/.test(text(byClass(root, "character-picker__opener")[0])),
        "World 2 to show"
    );
    pickOption(root, "World 1");
    await until(() => /World 1/.test(text(byClass(root, "character-picker__opener")[0])), "World 1 to show");
    await until(() => shown() === "2", "the saved 2 to show");
});

test("caves: an object switched on shows discovered when the read after its save fails", async (t) => {
    const realFetch = globalThis.fetch;
    t.after(() => (globalThis.fetch = realFetch));
    const root = await openPage("src/ui/pages/world-7/spelunking/1-caves.js", (r) =>
        elements(r).some((node) => node.attributes.role === "switch")
    );
    const switches = () => elements(root).filter((node) => node.attributes.role === "switch");
    const isOn = (box) => Boolean(attrOf(box, "checked") ?? box.checked);
    const box = switches().find((node) => !isOn(node));
    let wrote = false;
    globalThis.fetch = async (url, options) => {
        const path = options?.body ? JSON.parse(options.body).path : null;
        if (String(url).endsWith("/gga/write") && path === "gga.Spelunk[6]") wrote = true;
        else if (wrote && String(url).endsWith("/gga/read") && path === "gga.Spelunk[6]")
            return new Response(JSON.stringify({ error: "The game didn't answer" }), { status: 500 });
        return realFetch(url, options);
    };
    const before = gga.Spelunk[6].length;
    box.listeners.change({ target: { checked: true } });
    await until(() => gga.Spelunk[6].length === before + 1, "the discovery to save");
    await wait(100);
    assert.ok(isOn(box), "the switch shows what the write read back");
});

test("sushi general: a locked sushi shows Locked, and saving its XP leaves it locked", async () => {
    const locked = gga.Sushi[5].findIndex((state) => state === -1);
    const tierRows = (root) => byClass(root, "account-row").filter((row) => text(row).includes("Tier "));
    const root = await openPage("src/ui/pages/world-7/sushi-station/1-general.js", (r) => tierRows(r).length > locked);
    const row = tierRows(root)[locked];
    const picked = () =>
        elements(row).find((node) => node.attributes.role === "radio" && attrOf(node, "aria-checked") === "true");
    await until(() => picked(), "the sushi's state to show");
    assert.equal(text(picked()).trim(), "Locked");
    const [xp] = inputs(row);
    type(xp, 500);
    enter(row, xp);
    await until(() => settled(row), "the save to end");
    assert.equal(gga.Sushi[6][locked], 500);
    assert.equal(gga.Sushi[5][locked], -1, "it stays locked");
});

test("royal guard: a Reset counts the units of each kind it takes away, not the shorter list", async () => {
    const { vanillaUnitsRemoved } = await importRepo("src/ui/components/views/account/royalGuardDomain.js");
    // World 1's militia upgrade (60) at 2: a reset puts back two militia (type 4).
    const royalG = [];
    royalG[2] = Object.assign(Array(70).fill(0), { 60: 2 });
    royalG[6] = [5, 5];
    assert.equal(vanillaUnitsRemoved(royalG, []), 2, "two knights reset to two militia are two removed");
    royalG[6] = [4, 4];
    assert.equal(vanillaUnitsRemoved(royalG, []), 0, "an army like the game's loses nothing");
    royalG[6] = [4, 5, 5];
    assert.equal(vanillaUnitsRemoved(royalG, []), 2);
});

test("a held Enter on a button that asks Click again can't arm it and run it", async () => {
    const { clickAgain } = await importRepo("src/ui/components/inPlace.js");
    const node = globalThis.document.createElement("button");
    let runs = 0;
    node.addEventListener("click", () => {
        if (clickAgain(node, "wipe everything.")) runs++;
    });
    // The browser: an Enter keydown clicks the button unless a listener cancels it.
    const keydown = (repeat) => {
        let cancelled = false;
        node.listeners.keydown?.({ key: "Enter", repeat, preventDefault: () => (cancelled = true) });
        if (!cancelled) node.listeners.click({});
    };
    keydown(false);
    for (let i = 0; i < 20; i++) keydown(true);
    assert.equal(runs, 0, "the repeats neither confirm nor arm it again");
    keydown(false);
    assert.equal(runs, 1, "a second press of its own runs it");
});

test("levels: a level typed that the game already moved to shows, instead of the old read", async (t) => {
    const before = [...gga.Lv0];
    t.after(() => (gga.Lv0 = before));
    gga.Lv0[2] = 10;
    const root = await openPage("src/ui/pages/account/player/1-levels.js", (r) => byClass(r, "account-row").length > 3);
    const row = byClass(root, "account-row").find((node) => /Mining level/.test(text(node)));
    const field = () => inputs(row)[0];
    await until(() => String(attrOf(field(), "value")) === "10", "the level to show 10");
    gga.Lv0[2] = 12; // the game moved on
    type(field(), 12);
    enter(row, field());
    await wait(200);
    assert.equal(String(attrOf(field(), "value")), "12");
});

test("task board: a Refresh that reads new stage targets shows them on the rows it keeps", async (t) => {
    const descriptions = gga.CustomLists.h.TaskDescriptions[0][0];
    const kept = [...descriptions];
    t.after(() => descriptions.splice(0, descriptions.length, ...kept));
    gga.Tasks[1][0][0] = 0;
    const root = await openPage(
        "src/ui/pages/account/task-board/tasks.js",
        (r) => byClass(r, "account-row").length > 3
    );
    const row = byClass(root, "account-row")[0];
    const note = () => text(byClass(row, "account-row__note")[0]);
    await until(() => / of 10$/.test(note()), "the first target");
    descriptions[5] = "20";
    click(button(root, "Refresh"));
    await until(() => / of 20$/.test(note()), "the new target after Refresh");
    assert.equal(byClass(root, "account-row")[0], row, "the row kept its node");
});

const CAVES = "src/ui/pages/world-7/spelunking/1-caves.js";
const switchesOf = (root) => elements(root).filter((node) => node.attributes.role === "switch");
const isOn = (box) => Boolean(attrOf(box, "checked") ?? box.checked);
const switchFor = (root, id) =>
    byClass(root, "account-row")
        .filter((row) => text(row).includes(id.replace(/_/g, " ")))
        .flatMap((row) => switchesOf(row))[0];

test("caves: a biggest haul typed with decimals saves them", async (t) => {
    const kept = gga.Spelunk[2][1];
    t.after(() => (gga.Spelunk[2][1] = kept));
    const root = await openPage(CAVES, (r) => byClass(r, "value-row").length > 1);
    const row = byClass(root, "value-row")[1];
    const haul = inputs(row)[2];
    type(haul, "12.5");
    enter(row, haul);
    await until(() => settled(row), "the save to end");
    assert.equal(gga.Spelunk[2][1], 12.5);
});

test("caves: Add all pressed while a switch-off still saves discovers that object too", async (t) => {
    const kept = [...gga.Spelunk[6]];
    const realFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = realFetch;
        gga.Spelunk[6] = kept;
    });
    const root = await openPage(CAVES, (r) => switchesOf(r).length > 3);
    const id = kept[0];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = false;
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).endsWith("/gga/write")) {
            writes++;
            if (!held) {
                held = true;
                await gate;
            }
        }
        return realFetch(url, options);
    };
    switchFor(root, id).listeners.change({ target: { checked: false } });
    await until(() => held, "the switch-off's write to start");
    click(button(root, "Add all"));
    release();
    await until(() => writes === 2, "the switch-off, then Add all, to write");
    await wait(100);
    assert.ok(gga.Spelunk[6].includes(id), "Add all discovered it again");
});

test("caves: an unknown object that leaves the list and comes back gets a working row", async (t) => {
    const kept = [...gga.Spelunk[6]];
    t.after(() => (gga.Spelunk[6] = kept));
    const unknown = "Mystery_Rock";
    gga.Spelunk[6] = [...kept, unknown];
    const root = await openPage(CAVES, (r) => Boolean(switchFor(r, unknown)));
    const oldRow = byClass(root, "account-row").find((row) => text(row).includes("Mystery Rock"));
    switchFor(root, unknown).listeners.change({ target: { checked: false } });
    await until(() => !gga.Spelunk[6].includes(unknown), "the unknown object to go");
    await until(() => !byClass(root, "account-row").includes(oldRow), "its row to leave the page");
    // Off the page, the browser calls its nodes disconnected, so VanJS drops their bindings at the next change.
    elements(oldRow).forEach((node) => (node.isConnected = false));
    const other = kept[1];
    switchFor(root, other).listeners.change({ target: { checked: false } });
    await until(() => !gga.Spelunk[6].includes(other), "another change");
    await wait(50);
    // An undo in History puts it back; Refresh reads it.
    gga.Spelunk[6] = [...gga.Spelunk[6], unknown];
    click(button(root, "Refresh"));
    await until(() => Boolean(switchFor(root, unknown)), "the unknown object to show again");
    await wait(50);
    assert.ok(isOn(switchFor(root, unknown)), "its switch shows it discovered");
});
