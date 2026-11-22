// World 6 pages on the fake game, driven the way a player does: what they show and save.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);

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
const buttons = (row) => elements(row).filter((node) => node.nodeName === "button");
const disabled = (node) => node.disabled === true || node.attributes.disabled === true;

async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
async function openPage(file, ready) {
    const root = (await importRepo(file)).default.component();
    await until(() => pageRead(root) && ready(root), `${file} to load`);
    return root;
}
const rowAt = (root, index) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__index")[0]).trim() === `#${index}`);
const findRow = (root, label) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]).trim() === label);
// What the field shows, and its cap as the eye reads it ("/ 20"; "" when it has none).
const shown = (row) => String(inputs(row)[0].attributes.value);
const capOf = (row) => {
    const cap = byClass(row, "number-input__cap")[0];
    return cap && !cap.attributes.hidden ? text(cap.childNodes[0]) : "";
};
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0] ?? { attributes: {} }))?.[1];
const settled = (row) => until(() => ["success", "error"].includes(stateOf(row)), "the save to finish");

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
const click = (node) => node.listeners.click({ preventDefault() {}, currentTarget: node, target: node });

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

test("markets: a level above its cap shows as the game holds it, and Max brings it down to the cap", async () => {
    game.gga.FarmUpg[2] = 99;
    const root = await openPage("src/ui/pages/world-6/farming/2-markets.js", (r) => Boolean(rowAt(r, 2)));
    const row = rowAt(root, 2);
    const [field] = inputs(row);
    assert.equal(String(field.value ?? field.attributes.value), "99");
    assert.equal(capOf(row), "/ 20");
    click(buttons(row).find((node) => text(node).trim() === "Max"));
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(game.gga.FarmUpg[2], 20);
});

test("markets: Raise on a level above its cap keeps the level and saves nothing", async () => {
    game.gga.FarmUpg[2] = 99;
    const root = await openPage("src/ui/pages/world-6/farming/2-markets.js", (r) => Boolean(rowAt(r, 2)));
    const row = rowAt(root, 2);
    const [field] = inputs(row);
    const [, raise] = buttons(row).filter((node) => text(node).trim() === "");
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
        focus(field);
        type(field, 5);
        press(row, field, "Enter");
        await until(() => game.gga.FarmUpg[2] === 5 && stateOf(row) === "success", "the typed level to save");
        assert.deepEqual(written, [5], "Raise and leaving the row wrote nothing");
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("markets: a typed level above the cap is refused even below the stored level, and − still steps down", async () => {
    game.gga.FarmUpg[2] = 99;
    const root = await openPage("src/ui/pages/world-6/farming/2-markets.js", (r) => Boolean(rowAt(r, 2)));
    const row = rowAt(root, 2);
    const [field] = inputs(row);
    const [lower] = buttons(row).filter((node) => text(node).trim() === "");
    focus(field);
    type(field, 98);
    press(row, field, "Enter");
    await settled(row);
    assert.equal(stateOf(row), "error", "typing 98 over the cap of 20 is refused");
    assert.equal(game.gga.FarmUpg[2], 99);

    press(row, field, "Escape");
    click(lower);
    leave(row, field);
    await until(() => game.gga.FarmUpg[2] === 98 && stateOf(row) === "success", "− to save 98");

    // The game holds 99 again; typing the 98 − gave before is still refused.
    game.gga.FarmUpg[2] = 99;
    click(buttons(root).find((node) => text(node).trim() === "Refresh"));
    await until(() => shown(row) === "99", "the Refresh to show 99");
    focus(field);
    type(field, 98);
    press(row, field, "Enter");
    await until(() => stateOf(row) === "error", "typing 98 to be refused");
    assert.equal(game.gga.FarmUpg[2], 99);
});

test("omni jade: the next bonus-levels field stays usable while one saves, and both save", async () => {
    const levels = game.gga.Menagerie[7];
    const root = await openPage("src/ui/pages/world-6/sneaking/3-omni-jade.js", (r) => {
        return byClass(r, "account-row--value").length >= 2;
    });
    const [rowA, rowB] = byClass(root, "account-row--value");
    const [fieldA] = inputs(rowA);
    const [fieldB] = inputs(rowB);
    // Tab from A's field lands on the next node's switch, then on its field (the -/+ are skipped).
    const switchB = inputs(root).filter((node) => node.attributes.role === "switch")[1];
    const rereads = hold("/computed/read");
    const writes = hold("/write");
    focus(fieldA);
    type(fieldA, 7);
    leave(rowA, fieldA, switchB);
    await until(writes.reached, "A's write to reach the game");
    assert.equal(disabled(switchB), false, "the switch Tab moved to keeps focus while A saves");
    focus(fieldB);
    assert.equal(disabled(fieldB), false, "the field the player moved to takes typing");
    assert.deepEqual(
        buttons(rowB)
            .filter((node) => text(node).trim() === "")
            .map(disabled),
        [false, false],
        "its -/+ stay usable"
    );
    type(fieldB, 9);
    press(rowB, fieldB, "Enter");
    writes.release();
    await until(rereads.reached, "the read after A's save");
    assert.equal(disabled(switchB), false, "and while the page reads the game after it");
    rereads.release();
    await settled(rowA);
    await settled(rowB);
    assert.equal(stateOf(rowA), "success");
    assert.equal(stateOf(rowB), "success", "B's save waits its turn instead of being refused");
    assert.equal(levels[0], 7);
    assert.equal(levels[1], 9);
});

test("emperor: leaving the showdowns field untouched with a count above the limit is not a failed save", async () => {
    const ola = game.gga.OptionsListAccount;
    ola[369] = 2000;
    const root = await openPage("src/ui/pages/world-6/emperor/emperor.js", (r) =>
        Boolean(findRow(r, "Completed showdowns"))
    );
    const row = findRow(root, "Completed showdowns");
    const [field] = inputs(row);
    const reset = buttons(row).find((node) => /reset/i.test(text(node)));
    // Tab from the field to RESET, typing nothing.
    row.listeners.focusout({ target: field, currentTarget: row, relatedTarget: reset });
    await settled(row);
    assert.equal(stateOf(row), "success", text(byClass(row, "save-state")[0]));
    assert.equal(ola[369], 2000);
    assert.equal(text(byClass(root, "write-status--error")[0]).trim(), "");
});

test("emperor: a stored-entries draft shows the game's count beside it while they differ", async () => {
    const root = await openPage("src/ui/pages/world-6/emperor/emperor.js", (r) =>
        Boolean(findRow(r, "Remaining entries"))
    );
    const row = findRow(root, "Remaining entries");
    const [field] = inputs(row);
    const stored = Number(shown(row));
    const now = () => text(byClass(row, "account-row__now")[0]);
    assert.equal(now(), "", "no hint while the field shows the game's count");
    type(field, stored + 1);
    await until(() => now() === `now ${stored}`, "the game's count beside the draft");
    type(field, stored);
    await until(() => now() === "", "the hint to go once the draft matches the game");
});

test("beanstalk: a Refresh that read the game before a save landed doesn't put the old level back", async () => {
    const levels = game.gga.Ninja[104];
    levels[0] = 0;
    const root = await openPage("src/ui/pages/world-6/beanstalk/beanstalk.js", (r) => Boolean(rowAt(r, 0)));
    const row = rowAt(root, 0);
    const [field] = inputs(row);
    const refresh = buttons(root).find((node) => text(node).trim() === "Refresh");
    const names = hold("/read-entries");
    const writes = hold("/write");
    focus(field);
    type(field, 3);
    press(row, field, "Enter");
    await until(writes.reached, "the save's write to reach the game");
    click(refresh);
    // The refresh has read the level (still 0) and waits on the names.
    await until(names.reached, "the refresh to read the level");
    writes.release();
    await settled(row);
    assert.equal(stateOf(row), "success");
    names.release();
    await until(
        () => shown(row) === "3" && capOf(row) === "/ 3" && !disabled(refresh),
        "the refresh to show what the game holds"
    );
    assert.equal(levels[0], 3);
});

test("beanstalk: a save that lands during the Refresh's second read doesn't put the old level back", async () => {
    const levels = game.gga.Ninja[104];
    levels[0] = 0;
    levels[1] = 0;
    const root = await openPage("src/ui/pages/world-6/beanstalk/beanstalk.js", (r) => Boolean(rowAt(r, 1)));
    const [row0, row1] = [rowAt(root, 0), rowAt(root, 1)];
    const refresh = buttons(root).find((node) => text(node).trim() === "Refresh");
    const saveThree = async (row) => {
        const [field] = inputs(row);
        focus(field);
        type(field, 3);
        press(row, field, "Enter");
        await settled(row);
    };
    const firstRead = hold("/read-entries");
    click(refresh);
    await until(firstRead.reached, "the refresh to read the levels");
    await saveThree(row0);
    firstRead.release();
    const secondRead = hold("/read-entries");
    await until(secondRead.reached, "the refresh to read the levels again");
    await saveThree(row1);
    assert.equal(stateOf(row1), "success");
    secondRead.release();
    await until(
        () => shown(row0) === "3" && shown(row1) === "3" && capOf(row0) === "/ 3" && !disabled(refresh),
        "the refresh to show what the game holds"
    );
    assert.deepEqual([levels[0], levels[1]], [3, 3]);
});
