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
const badge = (row) => text(byClass(row, "account-row__badge")[0]).trim();
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
    assert.equal(badge(row), "LV 99 / 20");
    click(buttons(row).find((node) => text(node).trim() === "Max"));
    await settled(row);
    assert.equal(stateOf(row), "success");
    assert.equal(game.gga.FarmUpg[2], 20);
});

test("omni jade: the next bonus-levels field stays usable while one saves, and both save", async () => {
    const levels = game.gga.Menagerie[7];
    const root = await openPage("src/ui/pages/world-6/sneaking/3-omni-jade.js", (r) => {
        return byClass(r, "account-row--value").length >= 2;
    });
    const [rowA, rowB] = byClass(root, "account-row--value");
    const [fieldA] = inputs(rowA);
    const [fieldB] = inputs(rowB);
    const writes = hold("/write");
    focus(fieldA);
    type(fieldA, 7);
    leave(rowA, fieldA, fieldB);
    focus(fieldB);
    await until(writes.reached, "A's write to reach the game");
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
