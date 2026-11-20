// Value search on the fake game: a value typed while another is written is written next, not thrown away, and
// New scan asks in place before it drops the results.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.requestAnimationFrame = () => {};
globalThis.CSS = { escape: (s) => s };

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(typeof node.attributes.class === "function" ? "" : (node.attributes.class ?? ""));
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));
const titleOf = (node) =>
    String(typeof node.attributes.title === "function" ? node.attributes.title() : node.attributes.title);

async function until(check, what) {
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

// Every value the game is asked to write, held until released while `gate` is set.
const writes = [];
let gate = null;
const realWrite = router.routes.POST.get("/api/game/gga/write");
router.routes.POST.set("/api/game/gga/write", async (req, res) => {
    const body = await req.json();
    writes.push(body.value);
    if (gate) await gate.promise;
    return realWrite({ json: async () => body }, res);
});
const holdWrites = () => {
    let release;
    gate = { promise: new Promise((resolve) => (release = resolve)) };
    return () => {
        gate = null;
        release();
    };
};

const { Search } = await importRepo("src/ui/components/views/Search.js");
const page = Search();
await until(() => elements(page).some((n) => n.nodeName === "select"), "the search page");
elements(page)
    .find((n) => n.nodeName === "select")
    .listeners.change({ target: { value: "unknown_initial_value" } });
const scanButton = () => byClass(page, "search-btn")[0];
const click = (btn) => btn.listeners.click({ stopPropagation() {}, currentTarget: btn });
const resultRows = () => byClass(page, "search-result-item").filter((r) => !classes(r).includes("saved-result-item"));
const pathOf = (row) => text(byClass(row, "result-path")[0]);
const isNumber = (row) => elements(row).some((n) => classes(n).includes("type-number"));

const firstScan = async () => {
    // The favorite keys are picked once the key list loads.
    await until(() => byClass(page, "key-checkbox").some((n) => classes(n).includes("checked")), "the keys to load");
    click(scanButton());
    await until(() => resultRows().length > 0, "the scan's results");
};

// Enter writes `first`; while the game answers, the player types `second` and presses Enter again.
async function correctMidWrite(row, first, second) {
    const field = () => byClass(row(), "result-edit-input")[0];
    const enter = () => field().listeners.keydown({ key: "Enter", stopPropagation() {} });
    await until(field, "the editor");
    const count = writes.length;
    const release = holdWrites();
    field().listeners.input({ target: { value: first } });
    enter();
    await until(() => writes.length > count, "the first write to start");
    field().listeners.input({ target: { value: second } });
    enter();
    release();
    await until(() => writes.length > count + 1 && !field(), "the second write and the editor to close");
    assert.deepEqual(writes.slice(count), [Number(first), Number(second)], "the corrected value is written next");
    assert.match(text(byClass(row(), "result-value")[0]), new RegExp(`^${second}$`));
}

test("a value corrected while the first is written is written next, in the results and in the saved list", async () => {
    await firstScan();
    const [a, b] = resultRows().filter(isNumber).map(pathOf);
    const resultsRow = (p) => () => resultRows().find((r) => pathOf(r) === p);

    click(elements(resultsRow(a)()).find((n) => n.nodeName === "button" && text(n).trim() === "Edit"));
    await correctMidWrite(resultsRow(a), "5", "50");

    click(elements(resultsRow(b)()).find((n) => n.nodeName === "button" && /saved list/.test(titleOf(n))));
    const savedRow = () => byClass(page, "saved-result-item").find((r) => pathOf(r) === b);
    await until(savedRow, "the saved row");
    click(elements(savedRow()).find((n) => n.nodeName === "button" && text(n).trim() === "Edit"));
    await correctMidWrite(savedRow, "3", "33");
});

// Review of #121: the queued write read the editor when it ran, so it wrote 500, typed but never entered.
test("a value entered while another is written is written as entered, and newer typing stays open", async () => {
    if (!resultRows().length) await firstScan();
    const p = pathOf(resultRows().filter(isNumber)[0]);
    const row = () => resultRows().find((r) => pathOf(r) === p);
    click(elements(row()).find((n) => n.nodeName === "button" && text(n).trim() === "Edit"));
    const field = () => byClass(row(), "result-edit-input")[0];
    const enter = () => field().listeners.keydown({ key: "Enter", stopPropagation() {} });
    await until(field, "the editor");
    const count = writes.length;
    const release = holdWrites();
    field().listeners.input({ target: { value: "5" } });
    enter();
    await until(() => writes.length > count, "the first write to start");
    field().listeners.input({ target: { value: "50" } });
    enter();
    field().listeners.input({ target: { value: "500" } });
    release();
    await until(() => writes.length > count + 1, "the second write");
    await until(() => classes(row()).includes("is-confirmed"), "the second write to be confirmed");
    assert.deepEqual(writes.slice(count), [5, 50], "the entered value is written, not the one only typed");
    assert.equal(field()?.attributes.value, "500", "the editor stays open with what was typed since");
    field().listeners.keydown({ key: "Escape", stopPropagation() {} });
    await until(() => !field(), "the editor to close");
});

// Review of #121: the first write closed the editor when the text went back to its value, dropping the queued 50.
test("a value entered while another is written is still written when the text goes back to the first", async () => {
    if (!resultRows().length) await firstScan();
    const p = pathOf(resultRows().filter(isNumber)[0]);
    const row = () => resultRows().find((r) => pathOf(r) === p);
    click(elements(row()).find((n) => n.nodeName === "button" && text(n).trim() === "Edit"));
    const field = () => byClass(row(), "result-edit-input")[0];
    const enter = () => field().listeners.keydown({ key: "Enter", stopPropagation() {} });
    await until(field, "the editor");
    const count = writes.length;
    const release = holdWrites();
    field().listeners.input({ target: { value: "6" } });
    enter();
    await until(() => writes.length > count, "the first write to start");
    field().listeners.input({ target: { value: "60" } });
    enter();
    field().listeners.input({ target: { value: "6" } });
    release();
    await until(() => writes.length > count + 1, "the second write");
    assert.deepEqual(writes.slice(count), [6, 60]);
    await until(() => classes(row()).includes("is-confirmed"), "the second write to be confirmed");
    assert.equal(field()?.attributes.value, "6", "the editor stays open with what was typed since");
    field().listeners.keydown({ key: "Escape", stopPropagation() {} });
    await until(() => !field(), "the editor to close");
});

test("text typed while a value is written stays in the editor when no Enter follows", async () => {
    if (!resultRows().length) await firstScan();
    const p = pathOf(resultRows().filter(isNumber)[0]);
    const row = () => resultRows().find((r) => pathOf(r) === p);
    click(elements(row()).find((n) => n.nodeName === "button" && text(n).trim() === "Edit"));
    const field = () => byClass(row(), "result-edit-input")[0];
    await until(field, "the editor");
    const count = writes.length;
    const release = holdWrites();
    field().listeners.input({ target: { value: "7" } });
    field().listeners.keydown({ key: "Enter", stopPropagation() {} });
    await until(() => writes.length > count, "the write to start");
    field().listeners.input({ target: { value: "77" } });
    const typingIn = field();
    release();
    // The row confirms the write in place.
    await until(() => classes(row()).includes("is-confirmed"), "the write to be confirmed");
    assert.equal(writes.length, count + 1);
    assert.equal(field()?.attributes.value, "77", "the editor stays open with what was typed");
    assert.equal(field(), typingIn, "the field being typed in is kept, so it keeps focus");
    field().listeners.keydown({ key: "Escape", stopPropagation() {} });
    await until(() => !field(), "the editor to close");
    assert.equal(text(byClass(row(), "result-value")[0]), "7", "the row shows the value written");
});

test("New scan asks Click again before it drops the results", async () => {
    if (!resultRows().length) await firstScan();
    const count = resultRows().length;
    const btn = scanButton();
    assert.equal(text(btn).trim(), "New scan");
    click(btn);
    assert.equal(btn.attributes["data-again"], "Click again");
    assert.match(btn.attributes["aria-label"], /^Click again to drop \d+ results? and start over\.$/);
    assert.equal(resultRows().length, count, "one press drops nothing");
    click(btn);
    await until(() => resultRows().length === 0, "the results to go");
    assert.equal(text(scanButton()).trim(), "First scan");
});
