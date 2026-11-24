// A value's cap sits in its field ("2 / 15") and a row's state is a plain word just before the field. The cap is
// shown, never typed: saves stay the number alone. Each test opens its own page and waits on the page's own requests
// (not on the clock), so it holds up on a loaded machine.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);

// Every request the page sends, with its body, and the ones still waiting for the fake game's answer.
const sent = [];
const inFlight = new Set();
const answer = globalThis.fetch;
// A test can hold a write until it has looked at the row mid-save.
let holdWrites = null;
globalThis.fetch = (url, options = {}) => {
    sent.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    const reply = (async () => {
        if (holdWrites && String(url).includes("/game/gga/write")) await holdWrites;
        return answer(url, options);
    })();
    inFlight.add(reply);
    // ponytail: a failed request is the page's to show; here it only has to leave the in-flight set.
    reply.then(
        () => inFlight.delete(reply),
        () => inFlight.delete(reply)
    );
    return reply;
};

// The page is still: every request it sent has its answer, and VanJS has drawn the result (it draws in microtasks,
// which run before the next macrotask). A request started by an answer joins the set before the macrotask, so the
// loop sees it.
async function settled() {
    do {
        await Promise.allSettled([...inFlight]);
        await new Promise((resolve) => setImmediate(resolve));
    } while (inFlight.size);
}

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(node?.attributes.class ?? "").split(" ");
const byClass = (root, name) => elements(root).filter((node) => classes(node).includes(name));
const inputOf = (row) => elements(row).find((node) => node.nodeName === "input");
// What the field shows: VanJS draws the bound value as the attribute in this minimal DOM.
const shown = (row) => String(inputOf(row).attributes.value);
// The cap the field shows, as the eye reads it ("/ 15"); "" when the field has none.
const capOf = (row) => {
    const cap = byClass(row, "number-input__cap")[0];
    return cap && !cap.attributes.hidden ? text(cap.childNodes[0]) : "";
};
const badgeOf = (row) => byClass(row, "account-row__badge")[0];
// The writes sent since `from`, as { path, value }.
const writesSince = (from) =>
    sent.slice(from).flatMap(({ url, body }) => (url.includes("/game/gga/write") ? (body.writes ?? [body]) : []));

async function openPage(file) {
    const root = (await importRepo(file)).default.component();
    await settled();
    return root;
}

function type(row, value) {
    const input = inputOf(row);
    input.listeners.focus({ target: input });
    input.value = String(value);
    input.listeners.input({ target: input });
    return input;
}
const pressEnter = (row) => row.listeners.keydown({ key: "Enter", target: inputOf(row), preventDefault() {} });
// Leaving the field: it blurs, and focus goes nowhere in the row (the row saves on focusout).
const leave = (row) => {
    inputOf(row).listeners.blur({ target: inputOf(row) });
    row.listeners.focusout({ target: inputOf(row), currentTarget: row, relatedTarget: null });
};

const prayers = () => openPage("src/ui/pages/world-3/prayers/prayers.js");
const prayerRows = (root) => byClass(root, "prayer-row");

test("prayers.js: the field shows the level with its cap, and Enter saves only the number", async () => {
    const row = prayerRows(await prayers())[0];
    assert.match(capOf(row), /^\/ \d+$/, "the cap shows after the value");
    assert.doesNotMatch(shown(row), /\//, "the cap isn't part of the field's text");

    const before = sent.length;
    type(row, 7);
    pressEnter(row);
    await settled();

    assert.deepEqual(
        writesSince(before).map((entry) => [entry.path.replace(/\d+/, "N"), entry.value]),
        [["gga.PrayersUnlocked[N]", 7]],
        "one write, of the number alone"
    );
    assert.equal(shown(row), "7");
    assert.ok(classes(byClass(row, "save-state")[0]).includes("save-state--success"));
});

test("prayers.js: leaving the field saves only the number", async () => {
    const row = prayerRows(await prayers())[1];
    const before = sent.length;
    type(row, 4);
    leave(row);
    await settled();

    assert.deepEqual(
        writesSince(before).map((entry) => [entry.path.replace(/\d+/, "N"), entry.value]),
        [["gga.PrayersUnlocked[N]", 4]]
    );
    assert.equal(shown(row), "4");
});

test("prayers.js: a level typed over the cap is refused beside the field, and nothing is written", async () => {
    const row = prayerRows(await prayers())[2];
    const cap = Number(capOf(row).replace("/ ", ""));
    const before = sent.length;
    type(row, cap + 84);
    pressEnter(row);
    await settled();

    assert.deepEqual(writesSince(before), [], "the game was never written");
    assert.ok(classes(row).includes("is-save-failed"));
    assert.equal(text(byClass(row, "save-state__label")[0]), `max ${cap}`);
    assert.equal(shown(row), String(cap + 84), "the typed text stays for the player to fix");
});

test("prayers.js: the state word sits before the field and steps aside while saving and while Undo shows", async () => {
    const root = await prayers();
    const row = prayerRows(root).find((candidate) => text(badgeOf(candidate)) === "Equipped");
    assert.ok(row, "an equipped prayer says so");
    const order = row.childNodes.filter((node) => node.nodeType === 1);
    assert.ok(
        order.indexOf(badgeOf(row)) === order.indexOf(byClass(row, "account-row__controls")[0]) - 1,
        "the word is just before the field"
    );

    // Mid-save: the write waits for the release below, so the row is looked at while the save is running.
    let release;
    holdWrites = new Promise((resolve) => (release = resolve));
    type(row, 3);
    pressEnter(row);
    await new Promise((resolve) => setImmediate(resolve));
    const whileSaving = classes(row);
    release();
    holdWrites = null;
    await settled();

    assert.ok(whileSaving.includes("is-saving"), "the row says it is saving");
    assert.ok(classes(row).includes("is-undo-offered"), "Undo is offered after the save");
    const css = await readFile(new URL("../src/ui/styles/_account-pages.css", import.meta.url), "utf8");
    for (const state of ["is-saving", "is-undo-offered"])
        assert.match(
            css,
            new RegExp(
                `\\.${state} > \\.account-row__badge[\\s\\S]*?\\{\\s*(visibility: hidden|animation: save-state-hide)`
            ),
            `the word steps aside on .${state}`
        );
});

test("stamps.js: the field shows the level alone, with no cap and no badge", async () => {
    const root = await openPage("src/ui/pages/world-1/stamps/stamps.js");
    const rows = byClass(root, "account-row--value");
    assert.ok(rows.length > 0, "stamps are listed");
    for (const row of rows) {
        assert.equal(capOf(row), "", `${text(byClass(row, "account-row__name")[0])} has no cap`);
        assert.equal(text(badgeOf(row) ?? ""), "", "and no badge");
    }
});

test("library.js: a talent's field is its max level over the book cap, and its points aren't shown or read", async () => {
    const before = sent.length;
    const root = await openPage("src/ui/pages/world-3/library/library.js");
    const bookCap = text(root).match(/book cap \((\d+)\)/)[1];
    // A talent is named once in the game's list, so its name finds its id.
    const { normalCase } = await importRepo("src/ui/components/views/account/accountShared.js");
    const names = game.gga.CustomLists.h.TalentIconNames.map(normalCase);
    const row = byClass(root, "talent-row").find(
        (candidate) =>
            capOf(candidate) !== "" &&
            text(badgeOf(candidate)) === "" &&
            names.filter((name) => name === text(byClass(candidate, "account-row__name")[0])).length === 1
    );
    assert.ok(row, "a book talent is listed");
    const talentId = names.indexOf(text(byClass(row, "account-row__name")[0]));

    assert.equal(capOf(row), `/ ${bookCap}`, "the cap is what Max books sets");
    assert.equal(shown(row), String(game.gga.SkillLevelsMAX[talentId]), "the field is the max level");
    assert.equal(text(badgeOf(row) ?? ""), "", "no badge beside it");
    assert.ok(
        !sent.slice(before).some(({ body }) => /^gga\.SkillLevels(\[|$)/.test(String(body?.path))),
        "the talent's own points are never read"
    );
});

// A talent the character hasn't unlocked has a max level of -1: the word says Locked and the field shows empty.
const lockedLibraryRow = async () => {
    const root = await openPage("src/ui/pages/world-3/library/library.js");
    const row = byClass(root, "talent-row").find((candidate) => text(badgeOf(candidate)) === "Locked");
    assert.ok(row, "a locked talent is listed");
    return row;
};

test("library.js: a locked talent says Locked and its field is empty, not -1, with the cap after it", async () => {
    const row = await lockedLibraryRow();
    assert.equal(shown(row), "");
    assert.match(capOf(row), /^\/ \d+$/);
});

test("library.js: Enter or leaving a locked talent's untouched empty field writes nothing", async () => {
    const row = await lockedLibraryRow();
    const before = sent.length;
    inputOf(row).listeners.focus({ target: inputOf(row) });
    pressEnter(row);
    await settled();
    leave(row);
    await settled();

    assert.deepEqual(writesSince(before), [], "the game was never written");
    assert.ok(!classes(row).includes("is-save-failed"), "and nothing is refused");
    assert.equal(shown(row), "");
    assert.equal(text(badgeOf(row)), "Locked");
});

test("library.js: typing a level into a locked talent and leaving the field sets it", async () => {
    const row = await lockedLibraryRow();
    const talentId = Number(text(byClass(row, "account-row__index")[0]).slice(1));
    const before = sent.length;
    type(row, 50);
    leave(row);
    await settled();

    assert.deepEqual(
        writesSince(before).map((entry) => [entry.path, entry.value]),
        [[`gga.SkillLevelsMAX[${talentId}]`, 50]]
    );
    assert.equal(shown(row), "50");
    assert.equal(text(badgeOf(row)), "", "it isn't locked any more");
});

test("library.js: a max level the game holds above the book cap is marked over max, and nothing is written", async () => {
    const libraryRows = async () => byClass(await openPage("src/ui/pages/world-3/library/library.js"), "talent-row");
    const idOf = (row) => Number(text(byClass(row, "account-row__index")[0]).slice(1));
    const wrapperOf = (row) => byClass(row, "number-input-wrapper")[0];
    const marked = (row) =>
        classes(wrapperOf(row)).includes("number-input-wrapper--over-max") &&
        inputOf(row).attributes.title === "over max";
    const row = (await libraryRows()).find((candidate) => capOf(candidate) !== "" && text(badgeOf(candidate)) === "");
    assert.ok(row, "a book talent is listed");
    assert.ok(!marked(row), "a level at or under the cap isn't marked");
    const talentId = idOf(row);
    const bookCap = Number(capOf(row).replace("/ ", ""));
    const kept = game.gga.SkillLevelsMAX[talentId];
    game.gga.SkillLevelsMAX[talentId] = bookCap + 50;
    try {
        const before = sent.length;
        const over = (await libraryRows()).find((candidate) => idOf(candidate) === talentId);
        assert.equal(shown(over), String(bookCap + 50), "the value is shown as the game holds it");
        assert.ok(marked(over), "the field is marked over max");
        assert.deepEqual(writesSince(before), [], "the mark never writes");
    } finally {
        game.gga.SkillLevelsMAX[talentId] = kept;
    }
});

test("CappedValue: a value with no field above its cap is marked over max", async () => {
    const { CappedValue } = await importRepo("src/ui/components/NumberInput.js");
    const over = CappedValue({ value: 20, cap: 15 });
    assert.ok(classes(over).includes("capped-value--over-max"));
    assert.equal(over.attributes.title, "over max");
    const at = CappedValue({ value: 15, cap: 15 });
    assert.ok(!classes(at).includes("capped-value--over-max"));
    assert.ok(!classes(CappedValue({ value: 20, cap: null })).includes("capped-value--over-max"), "no cap, no mark");
});
