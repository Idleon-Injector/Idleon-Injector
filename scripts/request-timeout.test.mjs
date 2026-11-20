// A request the local server never answers gives up after requestLimit.timeoutMs (10 s; a few ms here): a save fails
// like any other with "Couldn't save. Try again.", a read with "Couldn't load. Try again.", a retry works, and an
// answer that comes after the limit is dropped. A value search may take longer and has no limit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
const ola = game.gga.OptionsListAccount;
const api = await importRepo("src/ui/services/api.js");
api.requestLimit.timeoutMs = 40;

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
const stateOf = (row) => /save-state--(\w+)/.exec(classes(byClass(row, "save-state")[0]))?.[1] ?? null;
const label = (row) => text(byClass(row, "save-state__label")[0]);
const field = (row) => elements(row).find((node) => node.nodeName === "input");

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

/**
 * The server says nothing to requests whose URL matches `pattern` until `answer(body)` is called: then the held ones
 * get that answer, late. Calls after `stop()` reach the fake server again.
 */
const holdAnswers = (pattern) => {
    const realFetch = globalThis.fetch;
    const held = [];
    globalThis.fetch = (url, options) =>
        pattern.test(String(url)) ? new Promise((resolve) => held.push(resolve)) : realFetch(url, options);
    return {
        held,
        stop: () => (globalThis.fetch = realFetch),
        answer: (body) =>
            held
                .splice(0)
                .forEach((resolve) =>
                    resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }))
                ),
    };
};

const save = (row, value) => {
    field(row).value = String(value);
    field(row).listeners.input({ target: field(row) });
    row.listeners.keydown({ key: "Enter", target: field(row), preventDefault() {} });
};

test("a save the game never answers fails after the limit, a retry saves, and the late answer is dropped", async (t) => {
    const root = (await importRepo("src/ui/pages/world-1/owl/1-orion.js")).default.component();
    await until(() => Boolean(findRow(root, "Feather Generation")), "the Orion page");
    const row = findRow(root, "Feather Generation");
    const server = holdAnswers(/\/game\/gga\/write/);
    t.after(server.stop);

    save(row, 41);
    await until(() => stateOf(row) === "error", "the save to give up");
    assert.equal(label(row), "Couldn't save. Try again.");
    assert.equal(server.held.length, 1, "the save was sent once");

    server.stop();
    save(row, 42);
    await until(() => stateOf(row) === "success", "the retry to save");
    assert.equal(ola[254], 42);

    // The game answers the first save at last, saying it holds 41: nothing on the page takes it.
    server.answer({ value: 41 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(stateOf(row) === "error", false, "the late answer is no failure either");
    assert.equal(String(field(row).attributes.value ?? field(row).value), "42");
    assert.equal(ola[254], 42);
});

test("a read the game never answers fails after the limit with its own reason, and a retry reads", async (t) => {
    const server = holdAnswers(/\/game\/gga\/read/);
    t.after(server.stop);
    await assert.rejects(api.gga("OptionsListAccount[254]"), { message: "Couldn't load. Try again." });
    await assert.rejects(api.readGgaMany(["OptionsListAccount[254]"]), { message: "Couldn't load. Try again." });
    server.stop();
    assert.equal(await api.gga("OptionsListAccount[254]"), ola[254]);
    server.answer({ value: -1 }); // late, and dropped
});

test("a value search may take longer than the limit", async (t) => {
    const server = holdAnswers(/\/api\/search$/);
    t.after(server.stop);
    const search = api.searchGga("1", ["OptionsListAccount"]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    server.answer({ results: [], totalCount: 0 });
    assert.deepEqual(await search, { results: [], totalCount: 0 });
});
