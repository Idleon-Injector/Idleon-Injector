// W7 pages from Gallery to Legend Talents on the fake game: what they show after a save stops part-way or a cap
// changes, the game caches an Undo must clear, and fields that stay open while another one saves.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

const fixture = fakeGameData();
const { router, game } = await createFakeApi(fixture);
const { requests, store } = await loadUi(router);
globalThis.requestAnimationFrame = () => {};
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
const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
const input = (row) => elements(row).find((node) => node.nodeName === "input" && node.attributes.type !== "checkbox");
const button = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0]))?.[1] ?? null;
const isDisabled = (node) => {
    const value = node.attributes.disabled;
    return Boolean(typeof value === "function" ? value() : value);
};

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

// The page shows its rows once it has read the game; until then its body is hidden.
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root) && pageRead(root), `${file} to load`);
    return root;
}

const type = (field, value) => {
    field.value = String(value);
    field.listeners.input({ target: field });
};
async function saveRow(row, value) {
    const field = input(row);
    type(field, value);
    row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
    await until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");
}

// Fail chosen game writes (by their number from now) the way a dropped connection does.
const failWrites = (...failing) => {
    const realFetch = globalThis.fetch;
    let count = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && failing.includes(++count)) throw new TypeError("Failed to fetch");
        return realFetch(url, options);
    };
    return () => (globalThis.fetch = realFetch);
};

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

// The game's lazy totals (as in its code): rebuilt from the levels only when the key is missing.
const gameCache = (key, sum) => () => {
    const dnsm = gga.DNSM.h;
    if (!Object.prototype.hasOwnProperty.call(dnsm, key)) dnsm[key] = sum();
    return dnsm[key];
};

test("Trophy Add all that stops part-way shows the trophies that landed, and Add fills the next empty slot", async (t) => {
    gga.Spelunk[16] = [1, -1, -1, -1, -1, -1];
    const page = await openPage("src/ui/pages/world-7/gallery/1-trophy.js", (root) =>
        text(root).includes("CURRENT SLOTS")
    );
    const shown = () => byClass(page, "account-row").length;
    assert.equal(shown(), 1);

    const restore = failWrites(2); // Trophy2 lands in slot 1, Trophy3 fails for slot 2
    t.after(restore);
    button(page, "Add all").listeners.click({ preventDefault() {} });
    await until(() => shown() === 2, "the page to show the trophy that landed");
    restore();
    assert.deepEqual(gga.Spelunk[16], [1, 2, -1, -1, -1, -1]);

    const select = elements(page).find((node) => node.nodeName === "select");
    select.listeners.change({ target: { value: "Trophy3" } });
    button(page, "Add").listeners.click({ preventDefault() {} });
    await until(() => shown() === 3, "the added trophy");
    assert.deepEqual(gga.Spelunk[16], [1, 2, 3, -1, -1, -1], "Add keeps Trophy2 and fills the next empty slot");
});

test("Trophy Remove asks Click again first, and the second press clears the slot", async (t) => {
    gga.Spelunk[16] = [1, 2, -1, -1, -1, -1];
    const page = await openPage("src/ui/pages/world-7/gallery/1-trophy.js", (root) =>
        text(root).includes("CURRENT SLOTS")
    );
    const [first, second] = byClass(page, "account-row");
    const remove = button(first, "Remove");
    const click = (node) => node.listeners.click({ preventDefault() {} });
    const writes = () => requests.filter((entry) => entry.includes("/write")).length;
    const before = writes();

    // The first press only asks; the ask runs out after a few seconds, and the press after that asks again.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
        click(remove);
        assert.equal(remove.attributes["data-again"], "Click again", "the first press asks");
        assert.equal(
            remove.attributes["aria-label"],
            `Click again to remove ${text(byClass(first, "account-row__name")[0])}.`
        );
        t.mock.timers.tick(4000);
        assert.equal(remove.attributes["data-again"], undefined, "the ask runs out");
        click(remove);
        assert.equal(remove.attributes["data-again"], "Click again", "the press after that asks again");
    } finally {
        t.mock.timers.reset();
    }
    const other = button(second, "Remove");
    click(other);
    assert.equal(other.attributes["data-again"], "Click again", "another row's Remove asks for its own trophy");
    assert.equal(writes(), before, "nothing was written");
    assert.deepEqual(gga.Spelunk[16], [1, 2, -1, -1, -1, -1]);

    click(remove);
    await until(() => byClass(page, "account-row").length === 1, "the second press to clear the slot");
    assert.deepEqual(gga.Spelunk[16], [-1, 2, -1, -1, -1, -1]);
});

test("a refused Trophy Remove stays red on its row", async () => {
    gga.Spelunk[16] = [1, 2, -1, -1, -1, -1];
    const page = await openPage("src/ui/pages/world-7/gallery/1-trophy.js", (root) =>
        text(root).includes("CURRENT SLOTS")
    );
    const [first] = byClass(page, "account-row");
    const remove = button(first, "Remove");
    const click = (node) => node.listeners.click({ preventDefault() {} });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) =>
        String(url).includes("/write")
            ? new Response(JSON.stringify({ error: "the game refused" }), {
                  status: 500,
                  headers: { "content-type": "application/json" },
              })
            : realFetch(url, options);
    const realError = console.error;
    console.error = () => {};
    try {
        click(remove);
        await click(remove);
        await until(() => /account-btn--error/.test(String(remove.attributes.class)), "the refusal to show");
        await new Promise((resolve) => setTimeout(resolve, 50)); // the read after it
    } finally {
        globalThis.fetch = realFetch;
        console.error = realError;
    }
    assert.ok(byClass(page, "account-row").includes(first), "the row that asked is still on the page");
    assert.match(String(remove.attributes.class), /account-btn--error/);
    assert.deepEqual(gga.Spelunk[16], [1, 2, -1, -1, -1, -1]);
});

test("a trophy removed down to an empty list and added back gets a new row, not the removed one", async () => {
    gga.Spelunk[16] = [1, -1, -1, -1, -1, -1];
    const page = await openPage("src/ui/pages/world-7/gallery/1-trophy.js", (root) =>
        text(root).includes("CURRENT SLOTS")
    );
    const [removed] = byClass(page, "account-row");
    const remove = button(removed, "Remove");
    const click = (node) => node.listeners.click({ preventDefault() {} });
    click(remove);
    await click(remove);
    await until(() => byClass(page, "account-row").length === 0, "the list to be empty");
    gga.Spelunk[16] = [1, -1, -1, -1, -1, -1]; // the game has it again
    await click(button(page, "Refresh"));
    await until(() => byClass(page, "account-row").length === 1, "the trophy to show again");
    assert.notEqual(byClass(page, "account-row")[0], removed, "a new row, without the removed one's state");
});

test("Nametag 6 (the game's EquipmentNametag6b) has its row", async () => {
    gga.Spelunk[17][6] = 3;
    const page = await openPage("src/ui/pages/world-7/gallery/2-nametag.js", (root) =>
        byClass(root, "account-row").some((row) => text(byClass(row, "account-row__index")[0]) === "#6")
    );
    const row = byClass(page, "account-row").find((node) => text(byClass(node, "account-row__index")[0]) === "#6");
    assert.equal(input(row).attributes.value, "3");
});

test("Legend Talents Refresh picks up a raised max level", async (t) => {
    const thingies = fixture.computed._customBlock_Thingies;
    const maxLevel = thingies.LegendTalent_MaxLV;
    t.after(() => (thingies.LegendTalent_MaxLV = maxLevel));
    const firstRow = (root) => byClass(root, "account-row")[0];
    // The field's level and its cap, as the eye reads it ("10 / 15").
    const shownLevel = (root) => {
        const row = firstRow(root);
        const cap = byClass(row, "number-input__cap")[0];
        return `${input(row).attributes.value} ${cap && !cap.attributes.hidden ? text(cap.childNodes[0]) : ""}`;
    };
    const page = await openPage("src/ui/pages/world-7/legend-talents/legend-talents.js", (root) =>
        Boolean(firstRow(root))
    );
    const index = Number(text(byClass(firstRow(page), "account-row__index")[0]).slice(1));
    gga.Spelunk[18][index] = 10;
    await button(page, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => shownLevel(page) === "10 / 10", "the field at the old max");

    thingies.LegendTalent_MaxLV = () => 15; // a Research grid bonus raised it
    await button(page, "Refresh").listeners.click({ preventDefault() {} });
    await until(() => shownLevel(page) === "10 / 15", "the field to show the new max");

    await saveRow(firstRow(page), 15);
    assert.equal(stateOf(firstRow(page)), "success");
    assert.equal(gga.Spelunk[18][index], 15);
});

test("Undo of a Bubba upgrade level clears the game's cached upgrade total", async () => {
    const total = gameCache("Bubba_LVzAll", () =>
        gga.Bubba[1].reduce((sum, level, i) => sum + Number(level) + Number(gga.Bubba[2][i]), 0)
    );
    const name = String(gga.CustomLists.h.BubbaUpg[1][0]).replace(/_/g, " ");
    const page = await openPage("src/ui/pages/world-7/bubba/1-bubba.js", (root) => Boolean(findRow(root, name)));
    const row = findRow(page, name);
    const before = gga.Bubba[1][1];

    await saveRow(row, before + 1);
    assert.equal(stateOf(row), "success");
    const saved = total(); // the game reads the total built from the saved level

    await byClass(row, "save-state__undo")[0].listeners.click({});
    await until(() => gga.Bubba[1][1] === before && !("Bubba_LVzAll" in gga.DNSM.h), "the undo to clear the cache");
    assert.equal(total(), saved - 1);
});

test("Undo of a Jelly cell level clears the game's cached cell total", async () => {
    gga.Research[15] = [5, 5, 5, 5, 5, 5, 5, 5, 5];
    gga.Research[16] = [0, 2, 0, 0, 0, 0, 0, 0, 0];
    delete gga.DNSM.h.CellLV_tot;
    const total = gameCache("CellLV_tot", () => gga.Research[16].slice(0, 9).reduce((a, b) => a + Number(b), 0));
    const page = await openPage("src/ui/pages/world-7/jelly-operator/jelly-operator.js", (root) =>
        Boolean(findRow(root, "Amoeba"))
    );
    const row = findRow(page, "Amoeba");
    await until(() => String(input(row).attributes.value) === "0", "the Amoeba level");

    await saveRow(row, 1);
    assert.equal(stateOf(row), "success");
    assert.equal(total(), 3);

    await byClass(row, "save-state__undo")[0].listeners.click({});
    await until(() => gga.Research[16][0] === 0 && !("CellLV_tot" in gga.DNSM.h), "the undo to clear the cache");
    assert.equal(total(), 2);
});

test("Undo from History clears the Bubba and Jelly cached totals with neither page open", async () => {
    const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const { undoAction } = await importRepo("src/ui/components/views/account/undo.js");
    const writes = [
        { path: "Bubba[1][1]", value: Number(gga.Bubba[1][1]) + 1 },
        { path: "Research[16][0]", value: Number(gga.Research[16][0]) + 1 },
        { path: "Research[17][8]", value: Number(gga.Research[17][8]) + 1 },
    ];
    const before = writes.map(({ value }) => value - 1);
    await writeManyVerified(writes);
    // The game rebuilt its totals from the saved levels (WebUI reloaded since; another page is open).
    Object.assign(gga.DNSM.h, { Bubba_LVzAll: 73, CellLV_tot: 9, JellySlotz: 4 });
    const { actions } = await fetchChanges();
    const action = actions.find((entry) => entry.entries.some((change) => change.path === "Research[17][8]"));

    await undoAction(action.id);
    assert.deepEqual([gga.Bubba[1][1], gga.Research[16][0], gga.Research[17][8]], before);
    for (const key of ["Bubba_LVzAll", "CellLV_tot", "JellySlotz"]) assert.equal(key in gga.DNSM.h, false, key);
});

// #126 (from #124): the values are back and marked undone before the cached totals are cleared, so a clean-up that
// fails can't be tried again as an undo. It is tried once more by itself; when that fails too it is a warning: the undo
// shows it landed and says the totals may be off, and the row (or History, or Undo all) stays usable.
const TOTALS = "Undone. Totals may be off.";

// The game refuses the first `failing` cache clean-ups (gga/delete); returns how many were asked for, and a restore.
const failDeletes = (failing) => {
    const realFetch = globalThis.fetch;
    const deletes = { count: 0 };
    globalThis.fetch = (url, options) =>
        String(url).endsWith("/game/gga/delete") && ++deletes.count <= failing
            ? Promise.resolve(new Response(JSON.stringify({ error: "game busy" }), { status: 500 }))
            : realFetch(url, options);
    return { deletes, restore: () => (globalThis.fetch = realFetch) };
};

const bubbaRow = async () => {
    const name = String(gga.CustomLists.h.BubbaUpg[1][0]).replace(/_/g, " ");
    const page = await openPage("src/ui/pages/world-7/bubba/1-bubba.js", (root) => Boolean(findRow(root, name)));
    return findRow(page, name);
};

test("an Undo whose cache clean-up fails once tries it again, and says nothing more when that works", async (t) => {
    const row = await bubbaRow();
    const before = gga.Bubba[1][1];
    await saveRow(row, before + 1);
    gga.DNSM.h.Bubba_LVzAll = 999;
    const { deletes, restore } = failDeletes(1);
    t.after(restore);

    await byClass(row, "save-state__undo")[0].listeners.click({});
    await until(() => ["success", "error"].includes(stateOf(row)), "the undo to end");
    assert.equal(stateOf(row), "success");
    assert.equal(gga.Bubba[1][1], before, "the old level is back");
    assert.equal(deletes.count, 2, "the clean-up was tried twice");
    assert.equal("Bubba_LVzAll" in gga.DNSM.h, false, "the second try cleared the total");
    assert.equal(text(byClass(row, "save-state__label")[0]), "saved", "no words beside the ✓");
    assert.doesNotMatch(classes(row), /is-undo-warned/);
});

test("an Undo whose cache clean-up fails twice shows the values undone with a warning, and the row still saves", async (t) => {
    const row = await bubbaRow();
    const before = gga.Bubba[1][1];
    await saveRow(row, before + 1);
    assert.equal(stateOf(row), "success");
    gga.DNSM.h.Bubba_LVzAll = 999; // the game's total, built from the saved level
    const { deletes, restore } = failDeletes(2);
    t.after(restore);

    await byClass(row, "save-state__undo")[0].listeners.click({});
    await until(() => ["success", "error"].includes(stateOf(row)), "the undo to end");
    assert.equal(gga.Bubba[1][1], before, "the old level is back");
    assert.equal(deletes.count, 2, "the clean-up was tried twice");
    assert.equal(stateOf(row), "success", "the undo landed");
    assert.equal(text(byClass(row, "save-state__label")[0]), TOTALS);
    assert.match(classes(row), /is-undo-warned/, "the badge steps aside for the words");
    await until(() => String(input(row).attributes.value) === String(before), "the row to show the old level");
    assert.equal(gga.DNSM.h.Bubba_LVzAll, 999, "the cache stayed");
    const { actions } = await (await importRepo("src/ui/services/api.js")).fetchChanges();
    const undone = actions.find((action) => action.entries.some((entry) => entry.path === "Bubba[1][1]"));
    assert.ok(
        undone.entries.every((entry) => entry.undone),
        "History has it undone"
    );

    restore();
    type(input(row), before + 2);
    row.listeners.keydown({ key: "Enter", target: input(row), preventDefault() {} });
    // The next save's ✓ takes the warning's place.
    await until(
        () => gga.Bubba[1][1] === before + 2 && text(byClass(row, "save-state__label")[0]) === "saved",
        "the next save"
    );
    assert.equal(stateOf(row), "success");
    assert.doesNotMatch(classes(row), /is-undo-warned/);
});

test("History's Undo says the totals may be off when the clean-up fails twice, beside its entry", async (t) => {
    const { History } = await importRepo("src/ui/components/views/History.js");
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const before = gga.Bubba[1][1];
    await withAction({ label: "test" }, () => writeManyVerified([{ path: "Bubba[1][1]", value: before + 1 }]));
    gga.DNSM.h.Bubba_LVzAll = 999;
    store.app.activeTab = "history-tab";
    const root = History();
    const { actions } = await fetchChanges();
    await until(() => byClass(root, "change-group").length === actions.length, "History to list the log");
    const group = byClass(root, "change-group")[0];
    const { deletes, restore } = failDeletes(2);
    t.after(restore);

    await byClass(group, "change-group__button")[0].listeners.click({});
    await until(() => text(byClass(group, "change-group__reason")[0]) === TOTALS, "the warning beside the entry");
    assert.equal(gga.Bubba[1][1], before, "undone");
    assert.equal(deletes.count, 2);
    assert.doesNotMatch(classes(group), /is-refused/, "a warning, not a refusal");
});

test("Undo all says the totals may be off when the clean-up fails twice, where its reason shows", async (t) => {
    await importRepo("src/ui/components/views/account/UndoAllOffer.js"); // offers beside the bulk control
    const { withAction } = await importRepo("src/ui/services/changeLog.js");
    const { writeManyVerified } = await importRepo("src/ui/components/views/account/accountShared.js");
    const parent = globalThis.document.createElement("div");
    const anchor = globalThis.document.createElement("button");
    parent.append(anchor);
    anchor.parentElement = parent;
    // Just enough layout for the offer to place itself beside the control.
    anchor.after = (node) => {
        node.offsetParent = { clientWidth: 400 };
        node.style = { setProperty() {} };
        parent.append(node);
    };
    const before = gga.Bubba[1][1];
    await withAction({ label: "bulk", anchor }, () => writeManyVerified([{ path: "Bubba[1][1]", value: before + 1 }]));
    gga.DNSM.h.Bubba_LVzAll = 999;
    await until(() => parent.childNodes.some((node) => node !== anchor), "Undo all to be offered");
    const offer = parent.childNodes.find((node) => node !== anchor);
    const { deletes, restore } = failDeletes(2);
    t.after(restore);

    byClass(offer, "undo-all__button")[0].listeners.click({});
    await until(() => text(byClass(offer, "undo-all__status")[0]) === TOTALS, "the warning where the reason shows");
    assert.equal(gga.Bubba[1][1], before, "undone");
    assert.equal(deletes.count, 2);
    assert.match(classes(offer), /undo-all--done/);
    assert.match(classes(offer), /undo-all--said/, "the words show, not only to screen readers");
});

test("Clam Scurge fields stay open while another Scurge field saves, and both edits save", async (t) => {
    gga.Menagerie[5] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const page = await openPage("src/ui/pages/world-7/clam-work/clam-work.js", (root) =>
        Boolean(findRow(root, "Scurge level"))
    );
    const exp = findRow(page, "Scurge EXP");
    const level = findRow(page, "Scurge level");
    const expField = input(exp);
    const levelField = input(level);

    const release = holdWrites();
    t.after(release);
    expField.listeners.focus?.({ target: expField });
    type(expField, 500);
    // Tab to Scurge level: leaving the EXP row saves it.
    expField.listeners.blur?.({ target: expField, relatedTarget: levelField });
    exp.listeners.focusout({ target: expField, currentTarget: exp, relatedTarget: levelField });
    levelField.listeners.focus?.({ target: levelField });
    await until(() => stateOf(exp) === "loading", "the EXP save to start");
    assert.equal(isDisabled(levelField), false, "Scurge level stays open while EXP saves");

    type(levelField, 77);
    levelField.listeners.blur?.({ target: levelField, relatedTarget: null });
    level.listeners.focusout({ target: levelField, currentTarget: level, relatedTarget: null });
    release();
    await until(() => stateOf(exp) === "success" && stateOf(level) === "success", "both saves to finish");
    assert.equal(gga.Menagerie[0][7], 500);
    assert.equal(gga.Menagerie[0][8], 77);
});
