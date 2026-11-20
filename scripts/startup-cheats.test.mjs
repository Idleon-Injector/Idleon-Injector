// Settings › Startup: leaving one field keeps every row's fields, so the field the player tabbed or clicked into
// keeps focus; the rows still show changes from elsewhere and add, remove and change kind.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
const { store } = await loadUi(router);
await store.loadCheats();
const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const vanX = (await importRepo("src/ui/vendor/van-x-0.6.3.js")).default;
const { StartupCheats } = await importRepo("src/ui/components/config/StartupCheats.js");

const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};

async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const PARAM = "w7 sushitools knowledge";
const open = async (cheats) => {
    const draft = vanX.reactive({ startupCheats: cheats });
    const holder = van.tags.div(StartupCheats(draft.startupCheats).element);
    const inputs = () => elements(holder).filter((n) => n.nodeName === "input");
    await until(() => inputs().length > 0, "the rows");
    return { list: draft.startupCheats, inputs, draft, holder };
};
// VanJS draws on its next tick; a field's value binding shows as its attribute on the fake DOM.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const shown = (inputs) => inputs().map((n) => n.attributes.value);

test("leaving a field keeps every row's fields, including the one tabbed into", async () => {
    assert.ok(
        store.data.cheats.some((c) => c.value === PARAM && c.needsParam),
        `${PARAM} takes a value`
    );
    const { list, inputs } = await open(["godlike", `${PARAM} 3 500`, "godlike reach"]);
    const before = inputs();
    assert.deepEqual(shown(inputs), ["godlike", PARAM, "3 500", "godlike reach"]);

    before[0].listeners.change({ target: { value: "godlike crit" } });
    before[2].listeners.change({ target: { value: "4 600" } });
    await tick();
    await tick();
    assert.deepEqual([...list], ["godlike crit", `${PARAM} 4 600`, "godlike reach"]);
    assert.deepEqual(
        inputs().map((n, i) => n === before[i]),
        [true, true, true, true],
        "no field was replaced"
    );
});

test("rows show changes made elsewhere, change kind, and add and remove", async () => {
    const { list, inputs, draft } = await open(["godlike", "godlike reach"]);
    // Another tab saved the settings: the draft takes the new values in place.
    vanX.replace(draft, { startupCheats: ["godlike", "godlike crit"] });
    await until(() => shown(inputs)[1] === "godlike crit", "the change from elsewhere to show");

    // A row that now takes a value gets its value field.
    const keep = inputs()[0];
    inputs()[1].listeners.change({ target: { value: `${PARAM} 1 2` } });
    await until(() => inputs().length === 3, "the value field");
    assert.deepEqual(shown(inputs), ["godlike", PARAM, "1 2"]);
    assert.equal(inputs()[0], keep, "the other row is kept");

    list.push("godlike reach");
    await until(() => inputs().length === 4, "the added row");
    list.splice(0, 1);
    await until(() => inputs().length === 3, "the removed row");
    assert.deepEqual(shown(inputs), [PARAM, "1 2", "godlike reach"]);
});
