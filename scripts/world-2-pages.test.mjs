// World 2 pages (sweep 2026-11-20, on the shared panels 2026-11-22): a Set all that lowers asks in the tray and an
// empty one writes nothing; values that share one string save one at a time; a save made while another runs keeps its
// value, on screen and in the game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// The tooltip that says "Click again to …" places itself on the next frame.
globalThis.requestAnimationFrame = () => {};
const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
// A question or refusal is read out from a live region on the page.
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

const ola = game.gga.OptionsListAccount;

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
const inputs = (root) => elements(root).filter((node) => node.nodeName === "input");
const buttonNamed = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const writes = () => requests.filter((entry) => /write/.test(entry)).length;
// The tray's question and its answer: a tool that takes away asks there, and its change runs on the answer.
const trayLabel = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);
const asks = (root) => /^(Lower|Lock|Reset|Unprisma) /.test(trayLabel(root));
const yes = (root) => click(byClass(root, "tabbed-list__yes")[0]);
// An attribute as the page shows it now (VanJS binds a function for one that changes).
const attr = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
// A tab's rows, and opening a tab.
const paneOf = (root, id) => elements(root).find((node) => node.attributes["data-tab"] === id);
const openTab = (root, label) =>
    elements(root)
        .find((node) => node.attributes.role === "tab" && text(node).trim().startsWith(label))
        .listeners.click({});

async function until(check, what) {
    for (let i = 0; i < 1000; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root) && ready(root), `${file} to load`);
    return root;
};
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]).trim() === name);
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0] ?? { attributes: {} }))?.[1];
const shown = (input) => String(input.attributes.value);
// The cap the field shows, as the eye reads it ("/ 4"); "" when the field has none.
const capOf = (row) => {
    const cap = byClass(row, "number-input__cap")[0];
    return cap && !cap.attributes.hidden ? text(cap.childNodes[0]) : "";
};

const click = (button) => button.listeners.click({ preventDefault() {}, currentTarget: button, target: button });
const typeInto = (input, value) => {
    input.value = String(value);
    input.listeners.input({ target: input });
};
// Type a value into a row's field and press Enter.
const enter = (row, value) => {
    const [input] = inputs(row);
    input.listeners.focus?.({ target: input });
    typeInto(input, value);
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    return input;
};
const leave = (row, input) => {
    input.listeners.blur?.({ target: input, relatedTarget: null });
    row.listeners.focusout({ target: input, currentTarget: row, relatedTarget: null });
};
// The player flips a switch: the browser has already moved the box, then reports the change.
const flip = (box, on) => box.listeners.change({ target: { checked: on } });

// Hold the game's writes (whose URL has `match`) until released, to act while a save runs.
const holdWrites = (match = "/write") => {
    const realFetch = globalThis.fetch;
    let release;
    let held = 0;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes(match)) {
            held++;
            await gate;
        }
        return realFetch(url, options);
    };
    return {
        held: () => held,
        release: () => {
            globalThis.fetch = realFetch;
            release();
        },
    };
};

// A Set all field and the button beside it.
const setAllOf = (root) => {
    const row = byClass(root, "account-setall-row")[0];
    const button = buttonNamed(row, "Set all");
    row.querySelector = () => button; // the fake DOM has no selectors; the page asks for its button
    return {
        field: byClass(row, "number-input-wrapper")[0],
        input: inputs(row)[0],
        button,
    };
};
const notBusy = (button) => !button.attributes.disabled;

test("sigils: a tier for all asks before it lowers any sigil, and raising runs on one press", async () => {
    const tiers = game.gga.CauldronP2W[4];
    for (let i = 0; i < 24; i++) tiers[2 * i + 1] = 3;
    const picked = (root, label) =>
        elements(root).filter(
            (node) => node.attributes.role === "radio" && attr(node, "aria-checked") === "true" && text(node) === label
        );
    const root = await openPage(
        "src/ui/pages/world-2/alchemy/4-sigils.js",
        (root) => picked(root, "Ethereal").length === 24
    );
    const all = (tier) => Array.from({ length: 24 }, (_, i) => tiers[2 * i + 1]).every((value) => value === tier);
    const tray = byClass(root, "tabbed-list__tools")[0];

    const before = writes();
    await click(buttonNamed(tray, "Locked"));
    assert.equal(trayLabel(root), "Lock 24 sigils?", "locking asks");
    assert.equal(writes(), before, "nothing was written");
    assert.ok(all(3));
    await yes(root);
    await until(() => all(-1) && notBusy(buttonNamed(tray, "Unlocked")), "the answer to lock them");

    await click(buttonNamed(tray, "Eclectic"));
    assert.ok(!asks(root), "raising didn't ask");
    await until(() => all(4), "the raise to land");
});

test("weekly bosses: a skin picked while the last pick saves is the one saved", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    weekly.set0 = 2;
    const isPicker = (node) => node.nodeName === "select" && String(node.attributes["aria-label"]).includes("main-bar");
    const root = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", (root) =>
        elements(root).some(isPicker)
    );
    const picker = elements(root).find(isPicker);
    const value = (option) => String(resolve(option.attributes.value));
    const resolve = (attribute) => (typeof attribute === "function" ? attribute() : attribute);
    const [first, second] = elements(picker)
        .filter((node) => node.nodeName === "option" && !resolve(node.attributes.disabled))
        .map(value)
        .filter((pick) => pick !== "2" && pick !== "__unknown__");

    const hold = holdWrites();
    picker.listeners.change({ target: { value: first } });
    await until(() => hold.held() > 0, "the first pick's save to reach the game");
    picker.listeners.change({ target: { value: second } });
    hold.release();
    await until(() => String(weekly.set0) === second, "the newer pick to save");
    weekly.set0 = 2;
});

const weeklyPicker = async () => {
    const isPicker = (node) => node.nodeName === "select" && String(node.attributes["aria-label"]).includes("main-bar");
    const root = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", (root) =>
        elements(root).some(isPicker)
    );
    const picker = elements(root).find(isPicker);
    const resolve = (attribute) => (typeof attribute === "function" ? attribute() : attribute);
    const picks = elements(picker)
        .filter((node) => node.nodeName === "option" && !resolve(node.attributes.disabled))
        .map((option) => String(resolve(option.attributes.value)))
        .filter((pick) => pick !== "2" && pick !== "__unknown__");
    return { root, picker, picks };
};

test("weekly bosses: a pick back to the stored skin is saved after a failed save the game changed meanwhile", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    weekly.set0 = 2;
    const { picker, picks } = await weeklyPicker();
    const [first, other] = picks;
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && held++ === 0) {
            await gate;
            return new Response(JSON.stringify({ error: "the game refused" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        }
        return realFetch(url, options);
    };
    try {
        picker.listeners.change({ target: { value: first } });
        await until(() => held > 0, "the first pick's save to reach the game");
        picker.listeners.change({ target: { value: "2" } }); // back to the stored skin
        weekly.set0 = Number(other); // the game changed it meanwhile
        release();
        await until(() => String(weekly.set0) === "2", "the newer pick to save");
    } finally {
        globalThis.fetch = realFetch;
        release();
        weekly.set0 = 2;
    }
});

test("weekly bosses: a pick waiting its turn survives a reload after an undo elsewhere", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    weekly.set0 = 2;
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const { root, picker, picks } = await weeklyPicker();
    const trophiesBefore = ola[188];
    const hold = holdWrites();
    try {
        enter(rowNamed(root, "Trophies"), Number(ola[188]) + 5);
        await until(() => hold.held() > 0, "the trophies save to reach the game");
        picker.listeners.change({ target: { value: picks[0] } });
        reloadPlace.val = { view: "", page: "" }; // an Undo elsewhere changed what this page shows
        await new Promise((resolve) => setTimeout(resolve, 50));
        hold.release();
        await until(() => String(weekly.set0) === picks[0], "the waiting pick to save");
    } finally {
        hold.release();
        weekly.set0 = 2;
        ola[188] = trophiesBefore;
    }
});

test("weekly bosses: the picker follows the game when it changed the skin as the pick saved", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    weekly.set0 = 2;
    const { picker, picks } = await weeklyPicker();
    const resolve = (attribute) => (typeof attribute === "function" ? attribute() : attribute);
    const pickedValue = () =>
        String(
            resolve(
                elements(picker).find((node) => node.nodeName === "option" && resolve(node.attributes.selected))
                    ?.attributes.value
            )
        );
    const realFetch = globalThis.fetch;
    let wrote = false;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (String(url).includes("/write") && !wrote) {
            wrote = true;
            weekly.set0 = 2; // the game put the old skin back right after the save landed
        }
        return response;
    };
    try {
        picker.listeners.change({ target: { value: picks[0] } });
        await until(() => wrote, "the pick to save");
        await until(() => pickedValue() === "2", "the picker to show the skin the game holds");
    } finally {
        globalThis.fetch = realFetch;
        weekly.set0 = 2;
    }
});

test("weekly bosses: a pick back to Default waiting behind the trophies after a Default save stays the player's", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    weekly.set0 = 2;
    const { root, picker, picks } = await weeklyPicker();
    const trophiesBefore = ola[188];
    picker.listeners.change({ target: { value: "0" } }); // an earlier Default save
    await until(() => String(weekly.set0) === "0", "the Default save");
    await until(() => notBusy(buttonNamed(root, "Refresh")), "the page to settle");
    const hold = holdWrites();
    try {
        enter(rowNamed(root, "Trophies"), Number(ola[188]) + 5);
        await until(() => hold.held() > 0, "the trophies save to reach the game");
        picker.listeners.change({ target: { value: picks.find((pick) => pick !== "0") } }); // waits behind the trophies
        await new Promise((resolve) => setTimeout(resolve, 20));
        picker.listeners.change({ target: { value: "0" } }); // back to Default, saved after it
        weekly.set0 = 2; // the game picks another skin meanwhile
        hold.release();
        await until(() => String(weekly.set0) === "0", "the player's Default to save");
    } finally {
        hold.release();
        weekly.set0 = 2;
        ola[188] = trophiesBefore;
    }
});

test("weekly bosses: a skin unlocked while the trophies save is kept", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    const switchOf = (row) => inputs(row).find((node) => node.attributes.role === "switch");
    const root = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", (root) =>
        byClass(root, "account-row").some(switchOf)
    );
    const box = byClass(root, "account-row").map(switchOf).find(Boolean);
    const key = Object.keys(weekly).find((name) => name.startsWith("UI_"));
    const [trophiesBefore, unlockedBefore] = [ola[188], weekly[key]];
    weekly[key] = 0;
    await click(buttonNamed(root, "Refresh"));
    await until(() => !box.checked && notBusy(buttonNamed(root, "Refresh")), "the switch to show Locked");

    const hold = holdWrites();
    enter(rowNamed(root, "Trophies"), Number(ola[188]) + 50);
    await until(() => hold.held() > 0, "the trophies save to reach the game");
    const flipped = flip(box, true);
    hold.release();
    await flipped;
    assert.equal(Number(weekly[key]), 1, "the flip was saved");
    assert.equal(box.checked, true);
    assert.equal(Number(ola[188]), Number(trophiesBefore) + 50, "the trophies were saved too");
    [ola[188], weekly[key]] = [trophiesBefore, unlockedBefore];
});

test("weekly bosses: the characters' note doesn't send the player to a Save button", async () => {
    const root = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", (root) =>
        text(root).includes("Characters")
    );
    assert.ok(text(root).includes("Change maps in game to see a new skin."));
    assert.ok(!/Save/.test(text(root)));
});

test("weekly bosses: Lock all asks in the tray, and locks only on the answer", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    const keys = Object.keys(weekly).filter((name) => name.startsWith("UI_"));
    const saved = keys.map((key) => weekly[key]);
    keys.forEach((key) => (weekly[key] = 1));
    try {
        const root = await openPage("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", (root) =>
            byClass(root, "account-row").some((row) => text(row).includes("Galaxy UI"))
        );
        await click(buttonNamed(root, "Refresh"));
        const lockAll = buttonNamed(root, "Lock all");
        await until(() => notBusy(lockAll), "Lock all to be ready");
        const before = writes();
        click(lockAll);
        await until(() => asks(root), "the question");
        assert.equal(trayLabel(root), `Lock ${keys.length} skins?`);
        assert.equal(writes(), before, "nothing was written");
        await yes(root);
        await until(() => keys.every((key) => Number(weekly[key]) === 0), "the answer to lock them");
    } finally {
        keys.forEach((key, i) => (weekly[key] = saved[i]));
    }
});

test("islands: two islands unlocked close together both stay unlocked (they share one string)", async () => {
    ola[169] = "";
    const root = await openPage("src/ui/pages/world-2/islands/islands.js", (root) => rowNamed(root, "Rando Island"));
    const box = (name) => inputs(rowNamed(root, name)).find((node) => node.attributes.role === "switch");
    const hold = holdWrites();
    const saves = [flip(box("Trash Island"), true)];
    await until(() => hold.held() > 0, "the first save to reach the game");
    saves.push(flip(box("Rando Island"), true));
    hold.release();
    await Promise.all(saves);
    assert.equal(ola[169], "a_", "the game holds both");
    await until(() => box("Trash Island").checked && box("Rando Island").checked, "both switches to show Unlocked");
    ola[169] = "";
});

test("islands: Set all asks before it lowers an upgrade, and an empty field writes nothing", async () => {
    ola[163] = 500;
    ola[164] = 500;
    const root = await openPage(
        "src/ui/pages/world-2/islands/islands.js",
        (root) => rowNamed(root, "Bottles %") && String(inputs(rowNamed(root, "Bottles %"))[0].value) === "500"
    );
    openTab(root, "Trash");
    const { input, field, button } = setAllOf(root);
    const before = writes();
    typeInto(input, "");
    await click(button);
    assert.equal(writes(), before, "an empty field wrote nothing");
    assert.notEqual(field.attributes["data-refused"], undefined, "the field says it needs a number");

    typeInto(input, "200");
    await click(button);
    assert.equal(trayLabel(root), "Lower 2 trash upgrades to 200?", "lowering asks");
    assert.equal(writes(), before);
    await yes(root);
    await until(() => ola[163] === 200 && ola[164] === 200, "the answer to lower them");
    openTab(root, "Islands");
});

const BUBBLES = "src/ui/pages/world-2/alchemy/1-bubbles.js";
const orangeRows = (root) => byClass(paneOf(root, "orange"), "account-row");

test("bubbles: two Prisma switches flipped close together both stay Prisma (they share one string)", async () => {
    ola[384] = "0";
    const root = await openPage(BUBBLES, (root) => orangeRows(root).length > 4);
    const [first, second] = inputs(paneOf(root, "orange")).filter((node) => node.attributes.role === "switch");
    const hold = holdWrites();
    const saves = [flip(first, true)];
    await until(() => hold.held() > 0, "the first save to reach the game");
    saves.push(flip(second, true));
    hold.release();
    await Promise.all(saves);
    assert.equal(String(ola[384]).split(",").filter(Boolean).length, 2, `the game holds both: ${ola[384]}`);
    ola[384] = "0";
});

test("bubbles: Set all with an empty field writes nothing, lowering asks first, raising runs on one press", async () => {
    const levels = game.gga.CauldronInfo[0];
    for (let i = 0; i < levels.length; i++) levels[i] = 120;
    const root = await openPage(BUBBLES, (root) => orangeRows(root).length > 4);
    await click(buttonNamed(root, "Refresh"));
    openTab(root, "Orange");
    const shownRows = () => orangeRows(root).length;
    const all = (level) => levels.slice(0, shownRows()).every((value) => value === level);
    const { input, field, button } = setAllOf(root);
    await until(() => shown(inputs(orangeRows(root)[0])[0]) === "120", "the levels to show");

    const before = writes();
    typeInto(input, "");
    await click(button);
    assert.equal(writes(), before, "an empty field wrote nothing");
    assert.ok(all(120));
    assert.notEqual(field.attributes["data-refused"], undefined, "the field says it needs a number");

    typeInto(input, "5");
    await click(button);
    assert.equal(trayLabel(root), `Lower ${shownRows()} orange bubbles to level 5?`, "lowering asks");
    assert.equal(writes(), before);
    await yes(root);
    await until(() => all(5) && notBusy(button), "the answer to lower them");

    typeInto(input, "50");
    await click(button);
    assert.ok(!asks(root), "raising didn't ask");
    await until(() => all(50), "the raise to land");
});

test("bubbles: a bubble saved while its cauldron's Set all runs keeps the level it saved", async () => {
    const levels = game.gga.CauldronInfo[0];
    for (let i = 0; i < levels.length; i++) levels[i] = 10;
    levels[0] = 50000; // already at the Set all level, so Set all leaves it out
    const root = await openPage(BUBBLES, (root) => orangeRows(root).length > 4);
    await click(buttonNamed(root, "Refresh"));
    openTab(root, "Orange");
    const [row, other] = orangeRows(root);
    await until(() => shown(inputs(other)[0]) === "10", "the levels to show");
    const { input: setAllInput, button } = setAllOf(root);
    typeInto(setAllInput, "50000");

    const hold = holdWrites("/write-many");
    const setAll = click(button);
    await until(() => hold.held() > 0, "Set all to reach the game");
    const input = enter(row, 7);
    await until(() => stateOf(row) === "success", "the row's save");
    leave(row, input);
    hold.release();
    await setAll;
    await until(() => shown(inputs(other)[0]) === "50000", "Set all's levels to show");
    assert.equal(levels[0], 7);
    assert.equal(shown(input), "7", "the row shows what the game holds");
});

test("bubbles: Prisma all runs on one press, and Unprisma all asks in the tray", async () => {
    ola[384] = "0";
    const root = await openPage(BUBBLES, (root) => orangeRows(root).length > 4);
    await click(buttonNamed(root, "Refresh"));
    openTab(root, "Orange");
    await until(() => notBusy(buttonNamed(root, "Prisma all")), "Prisma all to be ready");
    const codes = () =>
        String(ola[384])
            .split(",")
            .filter((code) => code.startsWith("_"));
    await click(buttonNamed(root, "Prisma all"));
    await until(() => codes().length > 4, "the open cauldron's bubbles to be prisma");
    assert.ok(!String(ola[384]).includes("a"), "only the open cauldron's");
    const prisma = codes().length;

    const before = writes();
    await click(buttonNamed(root, "Unprisma all"));
    assert.equal(trayLabel(root), `Unprisma ${prisma} orange bubbles?`);
    assert.equal(writes(), before, "nothing was written");
    await yes(root);
    await until(() => codes().length === 0, "the answer to take them out");
    ola[384] = "0";
});

test("vials: Set all with an empty field writes nothing, lowering asks first, raising runs on one press", async () => {
    const levels = game.gga.CauldronInfo[4];
    for (let i = 0; i < levels.length; i++) levels[i] = 13;
    const root = await openPage(
        "src/ui/pages/world-2/alchemy/3-vials.js",
        (root) => byClass(root, "account-row").length > 4
    );
    const shownRows = byClass(root, "account-row").length;
    const all = (level) => levels.slice(0, shownRows).every((value) => value === level);
    const { input, field, button } = setAllOf(root);

    const before = writes();
    typeInto(input, "");
    await click(button);
    assert.equal(writes(), before, "an empty field wrote nothing");
    assert.notEqual(field.attributes["data-refused"], undefined, "the field says it needs a number");

    typeInto(input, "5");
    await click(button);
    assert.equal(trayLabel(root), `Lower ${shownRows} vials to level 5?`, "lowering asks");
    assert.equal(writes(), before);
    await yes(root);
    await until(() => all(5) && notBusy(button), "the answer to lower them");

    typeInto(input, "13");
    await click(button);
    assert.ok(!asks(root), "raising didn't ask");
    await until(() => all(13), "the raise to land");
});

test("vials: a vial saved while Set all runs keeps the level it saved (Set all left it out)", async () => {
    const levels = game.gga.CauldronInfo[4];
    for (let i = 0; i < levels.length; i++) levels[i] = 2;
    levels[0] = 13;
    const root = await openPage(
        "src/ui/pages/world-2/alchemy/3-vials.js",
        (root) => byClass(root, "account-row").length > 4
    );
    const [row, other] = byClass(root, "account-row");
    const { input: setAllInput, button } = setAllOf(root);
    typeInto(setAllInput, "13");

    const hold = holdWrites("/write-many");
    let setAll;
    let input;
    try {
        setAll = click(button);
        await until(() => hold.held() > 0, "Set all to reach the game");
        input = enter(row, 4);
        await until(() => stateOf(row) === "success", "the row's save");
        leave(row, input);
    } finally {
        hold.release();
    }
    await setAll;
    await until(() => shown(inputs(other)[0]) === "13", "Set all's levels to show");
    assert.equal(levels[0], 4);
    assert.equal(shown(input), "4", "the row shows what the game holds");
});

test("pay 2 win: a draconic count past 4 is refused, and a count past 4 in the game shows as it is", async () => {
    ola[123] = 2;
    const root = await openPage("src/ui/pages/world-2/alchemy/2-cauldrons.js", (root) =>
        rowNamed(root, "Draconic cauldrons")
    );
    const row = rowNamed(root, "Draconic cauldrons");
    const input = enter(row, 9);
    await until(() => stateOf(row) === "error", "the save to be refused");
    assert.equal(ola[123], 2, "nothing was written");
    assert.ok(text(row).includes("max 4"), "the row says why");

    leave(row, input);
    ola[123] = 9;
    await click(buttonNamed(root, "Refresh"));
    await until(() => shown(input) === "9" && capOf(row) === "/ 4", "the row to show what the game holds");
    ola[123] = 2;
});

test("pay 2 win: Raise on a count past 4 leaves it, and Lower takes one off and saves it", async () => {
    ola[123] = 9;
    const root = await openPage(
        "src/ui/pages/world-2/alchemy/2-cauldrons.js",
        (root) => rowNamed(root, "Draconic cauldrons") && shown(inputs(rowNamed(root, "Draconic cauldrons"))[0]) === "9"
    );
    const row = rowNamed(root, "Draconic cauldrons");
    const [input] = inputs(row);
    const stepper = (label) =>
        elements(row).find((node) => node.nodeName === "button" && node.attributes["aria-label"] === label);
    const before = writes();
    input.listeners.focus?.({ target: input });
    // Raise then Lower: 9 stays 9, then steps to 8 (a Raise that pulled it to 4 would show 3).
    click(stepper("Raise"));
    click(stepper("Lower"));
    await until(() => shown(input) !== "9", "the field to show the steps");
    assert.equal(shown(input), "8", "Raise didn't pull the count down to 4");
    leave(row, input);
    await until(() => stateOf(row) === "success", "the stepped-down count to save");
    assert.equal(ola[123], 8, "Lower saved one less, still above the max");
    assert.ok(writes() > before);
    ola[123] = 2;
});

test("post office: the points left follow a box or bonus boxes save as soon as it's saved", async () => {
    const root = await openPage("src/ui/pages/world-2/post-office/post-office.js", (root) =>
        rowNamed(root, "Civil War Memory Box")
    );
    const pointsLeft = () =>
        Number(
            text(byClass(root, "amount-left__value")[0])
                .replace("−", "-")
                .replace(/[^0-9-]/g, "")
        );
    await until(() => Number.isFinite(pointsLeft()) && pointsLeft() !== 0, "the points left to show");
    const left = pointsLeft();
    const box = rowNamed(root, "Civil War Memory Box");
    const boxValue = Number(game.gga.PostOfficeInfo[3][0][0]);
    enter(box, boxValue - 3);
    await until(() => stateOf(box) === "success", "the box save");
    await until(() => pointsLeft() === left + 3, "points left to rise by 3");

    const bonusBoxes = rowNamed(root, "Bonus boxes");
    enter(bonusBoxes, Number(ola[131] ?? 0) + 100);
    await until(() => stateOf(bonusBoxes) === "success", "the bonus boxes save");
    await until(() => pointsLeft() === left + 103, "points left to rise by 100");
});

test("post office: Max all runs on one press, and Reset all asks in the tray", async () => {
    const boxes = game.gga.PostOfficeInfo[3];
    const saved = boxes.map((box) => box[0]);
    boxes.forEach((box) => (box[0] = 1));
    try {
        const root = await openPage("src/ui/pages/world-2/post-office/post-office.js", (root) =>
            rowNamed(root, "Civil War Memory Box")
        );
        await click(buttonNamed(root, "Refresh"));
        await until(() => notBusy(buttonNamed(root, "Max all")), "Max all to be ready");
        const before = writes();
        await click(buttonNamed(root, "Reset all"));
        assert.equal(trayLabel(root), `Reset ${boxes.length} boxes to 0?`);
        assert.equal(writes(), before, "nothing was written");
        await yes(root);
        await until(() => boxes.every((box) => box[0] === 0), "the answer to reset them");

        await click(buttonNamed(root, "Max all"));
        assert.ok(!asks(root), "raising didn't ask");
        await until(() => boxes.every((box) => box[0] > 0), "every box to be maxed");
    } finally {
        boxes.forEach((box, i) => (box[0] = saved[i]));
    }
});

test("liquid: a connection lost while CAP UPGRADE saves writes neither of its two copies", async () => {
    const info = game.gga.CauldronInfo;
    const root = await openPage("src/ui/pages/world-2/alchemy/2-cauldrons.js", (root) =>
        rowNamed(root, "Water Droplets")
    );
    const row = rowNamed(root, "Water Droplets"); // its Cap upgrade is the line's second field
    const cap = info[8][4][2][1];
    const copy = ola[371];
    const realFetch = globalThis.fetch;
    // The request that carries the second copy never arrives.
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && String(options?.body).includes("OptionsListAccount[371]"))
            throw new TypeError("Failed to fetch");
        return realFetch(url, options);
    };
    try {
        const input = inputs(row)[1];
        input.listeners.focus?.({ target: input });
        typeInto(input, cap + 5);
        row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        await until(() => stateOf(row) === "error", "the save to fail");
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.equal(info[8][4][2][1], cap, "the first copy wasn't written alone");
    assert.equal(ola[371], copy);
});

// CodeRabbit on #196, round 1.
const rowAt = (root, index) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__index")[0]).trim() === `#${index}`);

test("vials and sigils: a bonus shows the sentence that holds its number, not the joke before it", async () => {
    const { bonusText } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { VIALS, SIGILS } = await import("./page-shots/data/world-2-game.mjs");
    const description = (rows, name, at) => rows.find((row) => row[0] === name)[at];
    assert.match(bonusText(description(VIALS, "FLY_IN_MY_DRINK", 9)), /base Accuracy$/);
    assert.match(bonusText(description(SIGILS, "METAL_EXTERIOR", 6)), /Class EXP$/);
    assert.equal(bonusText("+{%_Mining_EXP_gain._A_joke."), "Mining EXP gain %", "a first-sentence bonus stays");
});

test("liquid: a save the game read back stays saved when the read after it fails", async () => {
    const info = game.gga.CauldronInfo;
    const amount = Number(info[6][0]);
    const root = await openPage("src/ui/pages/world-2/alchemy/2-cauldrons.js", (root) =>
        rowNamed(root, "Water Droplets")
    );
    const row = rowNamed(root, "Water Droplets");
    const realFetch = globalThis.fetch;
    let written = false;
    globalThis.fetch = async (url, options) => {
        if (written && String(url).includes("/read") && String(options?.body).includes("CauldronInfo"))
            throw new TypeError("Failed to fetch");
        const response = await realFetch(url, options);
        if (String(url).includes("/write")) written = true;
        return response;
    };
    try {
        const input = enter(row, amount + 11);
        await until(() => stateOf(row) === "success" || stateOf(row) === "error", "the save to end");
        assert.equal(stateOf(row), "success", "the save isn't shown as failed");
        assert.equal(Number(info[6][0]), amount + 11);
        assert.equal(shown(input), String(amount + 11));
    } finally {
        globalThis.fetch = realFetch;
        info[6][0] = amount;
    }
});

const sigilRow = async () => {
    const root = await openPage("src/ui/pages/world-2/alchemy/4-sigils.js", (root) => rowAt(root, 0));
    const row = rowAt(root, 0);
    const radio = (label) => elements(row).find((node) => node.attributes.role === "radio" && text(node) === label);
    await click(buttonNamed(root, "Refresh"));
    await until(() => attr(radio("Ethereal"), "aria-checked") === "true", "the row to show Ethereal");
    return { row, radio };
};

test("sigils: a tier picked while the last pick saves is the one saved", async () => {
    const tiers = game.gga.CauldronP2W[4];
    tiers[1] = 3;
    const { row, radio } = await sigilRow();
    const hold = holdWrites();
    try {
        click(radio("Boosted"));
        await until(() => hold.held() > 0, "the first pick's save to reach the game");
        click(radio("Ionized"));
    } finally {
        // A wait that timed out still lets the writes go, so later tests' writes aren't held.
        hold.release();
    }
    await until(() => tiers[1] === 2 && stateOf(row) === "success", "the newer pick to save");
    assert.equal(attr(radio("Ionized"), "aria-checked"), "true");
    tiers[1] = 3;
});

test("sigils: after a failed save the picker shows the game's tier, and the same pick can be tried again", async () => {
    const tiers = game.gga.CauldronP2W[4];
    tiers[1] = 3;
    const { row, radio } = await sigilRow();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && String(options?.body).includes("CauldronP2W[4][1]"))
            throw new TypeError("Failed to fetch");
        return realFetch(url, options);
    };
    try {
        click(radio("Boosted"));
        await until(() => stateOf(row) === "error", "the save to fail");
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.equal(tiers[1], 3);
    assert.equal(attr(radio("Ethereal"), "aria-checked"), "true", "the picker shows the game's tier");
    click(radio("Boosted"));
    await until(() => tiers[1] === 1 && stateOf(row) === "success", "the retry to save");
    tiers[1] = 3;
});

test("arcade: a level saved while All to asks changes what gets lowered, so it asks again", async () => {
    const levels = game.gga.ArcadeUpg;
    const saved = [...levels];
    levels.forEach((_, i) => (levels[i] = 50));
    levels[0] = 101;
    levels[1] = 80;
    try {
        const root = await openPage("src/ui/pages/world-2/arcade-shop/arcade-shop.js", (root) => rowAt(root, 1));
        const tray = byClass(root, "tabbed-list__tools")[0];
        await click(buttonNamed(tray, "100"));
        assert.equal(trayLabel(root), "Lower 1 upgrade to level 100?");
        const row = rowAt(root, 1);
        enter(row, 102);
        await until(() => stateOf(row) === "success", "the row's save");
        const before = writes();
        await yes(root);
        assert.equal(trayLabel(root), "Lower 2 upgrades to level 100?", "it asks again");
        assert.equal(writes(), before, "nothing was written");
        assert.equal(levels[1], 102);
        await yes(root);
        await until(() => levels[0] === 100 && levels[1] === 100, "the answer to lower both");
    } finally {
        saved.forEach((value, i) => (levels[i] = value));
    }
});

test("islands: a row saved while Set all asks changes what gets lowered, so it asks again", async () => {
    ola[163] = 7;
    ola[164] = 2;
    const root = await openPage(
        "src/ui/pages/world-2/islands/islands.js",
        (root) => rowNamed(root, "Bottles %") && String(inputs(rowNamed(root, "Bottles %"))[0].value) === "2"
    );
    openTab(root, "Trash");
    const { input, button } = setAllOf(root);
    typeInto(input, "5");
    await until(() => notBusy(button), "Set all to be ready");
    await click(button);
    assert.equal(trayLabel(root), "Lower 1 trash upgrade to 5?");
    const bottles = rowNamed(root, "Bottles %");
    enter(bottles, 9);
    await until(() => stateOf(bottles) === "success", "the row's save");
    const before = writes();
    await yes(root);
    assert.equal(trayLabel(root), "Lower 2 trash upgrades to 5?", "it asks again");
    assert.equal(writes(), before, "nothing was written");
    assert.equal(ola[164], 9);
    await yes(root);
    await until(() => ola[163] === 5 && ola[164] === 5, "the answer to lower both");
    openTab(root, "Islands");
});

test("post office: Reset all asked about one character resets nothing once the page has read another", async () => {
    const boxes = game.gga.PostOfficeInfo[3];
    const saved = boxes.map((box) => box[0]);
    const { PLAYERS } = await import("./page-shots/data/shared.mjs");
    const playing = game.gga.UserInfo[0];
    boxes.forEach((box) => (box[0] = 1));
    const realFetch = globalThis.fetch;
    try {
        const root = await openPage("src/ui/pages/world-2/post-office/post-office.js", (root) =>
            rowNamed(root, "Civil War Memory Box")
        );
        await click(buttonNamed(root, "Refresh"));
        await until(() => notBusy(buttonNamed(root, "Reset all")), "Reset all to be ready");
        await click(buttonNamed(root, "Reset all"));
        assert.ok(asks(root));
        game.gga.UserInfo[0] = PLAYERS[1];
        await click(buttonNamed(root, "Refresh"));
        await until(() => notBusy(buttonNamed(root, "Refresh")), "the other character's read");
        assert.ok(asks(root), "the question is still open");
        // The game's answer to the reset write, once it has come back.
        let answered = false;
        globalThis.fetch = async (url, options) => {
            const response = await realFetch(url, options);
            if (String(url).includes("/write")) answered = true;
            return response;
        };
        await yes(root);
        await until(() => answered, "the game to answer the reset");
        assert.ok(
            boxes.every((box) => box[0] === 1),
            "the game refused it: another character is in play"
        );
    } finally {
        globalThis.fetch = realFetch;
        game.gga.UserInfo[0] = playing;
        boxes.forEach((box, i) => (box[0] = saved[i]));
    }
});

// #204: follow-ups from #196's review.
test("post office: Max all that lands after a Refresh read another character leaves that one's boxes as read", async () => {
    const boxes = game.gga.PostOfficeInfo[3];
    const saved = boxes.map((box) => box[0]);
    const { PLAYERS } = await import("./page-shots/data/shared.mjs");
    const playing = game.gga.UserInfo[0];
    boxes.forEach((box) => (box[0] = 1));
    const realFetch = globalThis.fetch;
    let release = () => {};
    try {
        const root = await openPage("src/ui/pages/world-2/post-office/post-office.js", (root) =>
            rowNamed(root, "Civil War Memory Box")
        );
        await click(buttonNamed(root, "Refresh"));
        const maxAll = buttonNamed(root, "Max all");
        await until(() => notBusy(maxAll), "Max all to be ready");
        // Max all lands in the game; its answer comes back only after the page has read another character.
        const gate = new Promise((resolve) => (release = resolve));
        let landed = false;
        globalThis.fetch = async (url, options) => {
            const response = await realFetch(url, options);
            if (String(url).includes("/write")) {
                landed = true;
                await gate;
            }
            return response;
        };
        click(maxAll);
        await until(() => landed, "Max all to land");
        globalThis.fetch = realFetch;
        assert.ok(boxes[0][0] > 1, "the first character's boxes were maxed");
        game.gga.UserInfo[0] = PLAYERS[1];
        boxes.forEach((box) => (box[0] = 2)); // the other character's boxes
        const box = rowNamed(root, "Civil War Memory Box");
        await click(buttonNamed(root, "Refresh"));
        await until(() => shown(inputs(box)[0]) === "2", "the other character's read");
        release();
        await until(() => notBusy(maxAll), "Max all to end");
        assert.equal(shown(inputs(box)[0]), "2", "the box shows the other character's value");
    } finally {
        release();
        globalThis.fetch = realFetch;
        game.gga.UserInfo[0] = playing;
        boxes.forEach((box, i) => (box[0] = saved[i]));
    }
});

test("vials: a vial saved while Set all asks changes what gets lowered, so it asks again", async () => {
    const levels = game.gga.CauldronInfo[4];
    for (let i = 0; i < levels.length; i++) levels[i] = 2;
    levels[0] = 13;
    const root = await openPage(
        "src/ui/pages/world-2/alchemy/3-vials.js",
        (root) => byClass(root, "account-row").length > 4
    );
    const [, second] = byClass(root, "account-row");
    const { input, button } = setAllOf(root);
    typeInto(input, "8");
    await click(button);
    assert.equal(trayLabel(root), "Lower 1 vial to level 8?");
    enter(second, 12);
    await until(() => stateOf(second) === "success", "the row's save");
    const before = writes();
    await yes(root);
    assert.equal(trayLabel(root), "Lower 2 vials to level 8?", "it asks again");
    assert.equal(writes(), before, "nothing was written");
    assert.equal(levels[1], 12);
    await yes(root);
    await until(() => levels[0] === 8 && levels[1] === 8, "the answer to lower both");
});

test("liquid: after the game refuses one copy of CAP UPGRADE, the same value can be saved again into both", async () => {
    const info = game.gga.CauldronInfo;
    const cap = Number(info[8][4][2][1]);
    const copy = Number(ola[371]);
    info[8][4][2][1] = copy;
    const root = await openPage("src/ui/pages/world-2/alchemy/2-cauldrons.js", (root) =>
        rowNamed(root, "Water Droplets")
    );
    const row = rowNamed(root, "Water Droplets");
    const input = inputs(row)[1];
    const save = (value) => {
        input.listeners.focus?.({ target: input });
        typeInto(input, value);
        row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    };
    // The game keeps its own value in the second copy: the first one takes the save, the second refuses it.
    Object.defineProperty(ola, 371, { configurable: true, enumerable: true, get: () => copy, set: () => {} });
    try {
        save(copy + 5);
        await until(() => stateOf(row) === "error", "the save to fail");
        assert.equal(Number(info[8][4][2][1]), copy + 5, "the first copy took it");
    } finally {
        Object.defineProperty(ola, 371, { configurable: true, enumerable: true, writable: true, value: copy });
    }
    // A Refresh still shows the copy the save didn't change; the typed value stays, and Enter tries it again.
    const refresh = buttonNamed(root, "Refresh");
    await click(refresh);
    await until(() => notBusy(refresh), "the read");
    assert.equal(shown(input), String(copy + 5));
    save(copy + 5);
    await until(() => stateOf(row) === "success", "the second save");
    assert.equal(Number(ola[371]), copy + 5, "the second copy has it now");
    assert.equal(Number(info[8][4][2][1]), copy + 5);
    info[8][4][2][1] = cap;
    ola[371] = copy;
});

// CodeRabbit on #212: a page opened again after the split read the first copy and couldn't save the same value.
test("liquid: a page opened again after one copy of CAP UPGRADE was refused still saves the value into both", async () => {
    const info = game.gga.CauldronInfo;
    const cap = Number(info[8][4][2][1]);
    const copy = Number(ola[371]);
    info[8][4][2][1] = copy;
    const open = async () => {
        const root = await openPage("src/ui/pages/world-2/alchemy/2-cauldrons.js", (root) =>
            rowNamed(root, "Water Droplets")
        );
        const row = rowNamed(root, "Water Droplets");
        const input = inputs(row)[1];
        const save = (value) => {
            input.listeners.focus?.({ target: input });
            typeInto(input, value);
            row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        };
        return { row, input, save };
    };
    try {
        const first = await open();
        Object.defineProperty(ola, 371, { configurable: true, enumerable: true, get: () => copy, set: () => {} });
        try {
            first.save(copy + 5);
            await until(() => stateOf(first.row) === "error", "the save to fail");
        } finally {
            Object.defineProperty(ola, 371, { configurable: true, enumerable: true, writable: true, value: copy });
        }
        const again = await open();
        await until(() => shown(again.input) === String(copy), "the copy the save didn't change");
        again.save(copy + 5);
        await until(() => stateOf(again.row) === "success", "the save on the page opened again");
        assert.equal(Number(ola[371]), copy + 5, "the second copy has it now");
        assert.equal(Number(info[8][4][2][1]), copy + 5);
    } finally {
        info[8][4][2][1] = cap;
        ola[371] = copy;
    }
});

// CodeRabbit on #212: the liquid values are shared by every opening, so an older opening's load that ends last showed
// what the game held before.
test("liquid: a load from an earlier opening that ends after a newer one doesn't put old values back", async () => {
    const info = game.gga.CauldronInfo;
    const amount = Number(info[6][0]);
    const realFetch = globalThis.fetch;
    let release = () => {};
    try {
        const first = await openPage("src/ui/pages/world-2/alchemy/2-cauldrons.js", (root) =>
            rowNamed(root, "Water Droplets")
        );
        // The first opening's Refresh reads the game, and its answer comes back last.
        const gate = new Promise((resolve) => (release = resolve));
        let held = false;
        globalThis.fetch = async (url, options) => {
            const response = await realFetch(url, options);
            if (!held && String(options?.body).includes('"gga.CauldronInfo"')) {
                held = true;
                await gate;
            }
            return response;
        };
        const refresh = buttonNamed(first, "Refresh");
        click(refresh);
        await until(() => held, "the first opening's read");
        globalThis.fetch = realFetch;
        info[6][0] = amount + 7; // the game moves on
        const second = await openPage("src/ui/pages/world-2/alchemy/2-cauldrons.js", (root) =>
            rowNamed(root, "Water Droplets")
        );
        const input = inputs(rowNamed(second, "Water Droplets"))[0];
        await until(() => shown(input) === String(amount + 7), "the newer opening's read");
        release();
        await until(() => notBusy(refresh), "the first opening's read to end");
        assert.equal(shown(input), String(amount + 7), "the newer read stays");
    } finally {
        release();
        globalThis.fetch = realFetch;
        info[6][0] = amount;
    }
});
