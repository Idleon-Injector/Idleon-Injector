// Account pages on the fake game: a row keeps its node through a reload, so a save's or an undo's result is said
// where the player acted, and what a row shows follows each read of the game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
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
async function openPage(file) {
    const root = (await importRepo(file)).default.component();
    await until(() => byClass(root, "account-row").length > 0 && pageRead(root), `${file} to load`);
    return root;
}
const saveState = (row) => classes(byClass(row, "save-state")[0]);
const words = (row) => text(byClass(row, "save-state__label")[0]);
const field = (row) => elements(row).find((node) => node.nodeName === "input");
const button = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);

async function saveRow(row, value) {
    const input = field(row);
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--(success|error)/.test(saveState(row)), "the save to finish");
}

const VAULT = "src/ui/pages/account/upgrade-vault/upgrade-vault.js";

test("upgrade vault: a refused undo says why on the row the player clicked, through the reload", async () => {
    const root = await openPage(VAULT);
    const row = byClass(root, "account-row")[0];
    await saveRow(row, 7);
    assert.match(saveState(row), /save-state--success/);
    gga.UpgVault[0] = 3; // the game moved on
    await byClass(row, "save-state__undo")[0].listeners.click({});
    await until(() => String(field(row).attributes.value) === "3", "the reload to show 3");
    assert.equal(byClass(root, "account-row")[0], row, "the row kept its node");
    assert.equal(words(row), "changed since: now 3");
});

test("upgrade vault: Refresh while a save runs keeps that save's result on the row", async () => {
    const root = await openPage(VAULT);
    const row = byClass(root, "account-row")[1];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    let held = false;
    let reread = false;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) {
            held = true;
            await gate;
        }
        const response = await realFetch(url, options);
        // The Refresh's last read: the real maxes.
        if (held && String(url).includes("/computed/read-many")) reread = true;
        return response;
    };
    try {
        const input = field(row);
        input.value = "55";
        input.listeners.input({ target: input });
        row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        await until(() => held, "the write to start");
        await button(root, "Refresh").listeners.click({});
        await until(() => reread, "the Refresh to read the game");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await until(() => /save-state--(success|error)/.test(saveState(row)), "the save to finish");
    assert.equal(byClass(root, "account-row")[1], row, "the row kept its node");
    assert.match(saveState(row), /save-state--success/);
    assert.equal(gga.UpgVault[1], 55);
});
