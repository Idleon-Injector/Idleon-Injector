// Printer saves on the fake game, driven through the listeners a player triggers: a value typed or a press made
// while another slot saves isn't lost, and every slot keeps its Undo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
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
const inputs = (row) => elements(row).filter((node) => node.nodeName === "input");
const button = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const findRow = (root, label) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
const saveState = (row) => classes(byClass(row, "save-state")[0] ?? { attributes: {} });
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
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
const saved = (row) => /save-state--(success|error)/.test(saveState(row));

const undoOffered = (row) => byClass(row, "save-state__undo")[0]?.attributes.hidden === false;

// Hold every write-many (every request with `reads`) until release(): a save the game hasn't answered yet.
function holdWrites({ reads = false } = {}) {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    globalThis.fetch = async (url, options) => {
        if (reads || String(url).includes("write-many")) {
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
}

const openPrinter = () =>
    openPage("src/ui/pages/world-3/printer/printer.js", (r) => byClass(r, "printer-item-select").length > 0);
const printerSlot = (sample) => 5 + 2 * (sample - 1); // the selected character's sample, as Printer[item, qty]

test("Printer keeps a quantity typed while that slot saves, and the next Enter saves it", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const root = await openPrinter();
    const row = findRow(root, "Sample 1");
    const input = inputs(row)[0];
    const hold = holdWrites();
    t.after(hold.release);

    input.listeners.focus?.({ target: input });
    type(input, 5000);
    enter(row, input);
    await until(() => hold.held() === 1, "the first save to reach the game");
    type(input, 7000);
    enter(row, input);
    hold.release();
    await until(() => gga.Printer[printerSlot(1) + 1] === 7000, "the second quantity to be saved");
    await until(() => /save-state--success/.test(saveState(row)), "the ✓");
    assert.equal(input.value, "7K", "the field shows the quantity saved last");
});

// Review of #131: the save's end put the saved quantity back over one typed while it waited, so Enter saved nothing.
test("Printer keeps a quantity typed while that slot saves, until its own Enter", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const root = await openPrinter();
    const row = findRow(root, "Sample 1");
    const input = inputs(row)[0];
    const hold = holdWrites();
    t.after(hold.release);

    type(input, 5000);
    enter(row, input);
    await until(() => hold.held() === 1, "the first save to reach the game");
    type(input, 7000);
    hold.release();
    await until(() => /save-state--success/.test(saveState(row)), "the first save's ✓");
    assert.equal(gga.Printer[printerSlot(1) + 1], 5000);
    assert.equal(input.value, "7000", "the quantity typed while the save waited stays");
    enter(row, input);
    await until(() => gga.Printer[printerSlot(1) + 1] === 7000, "the typed quantity to be saved");
});

test("Printer saves a slot's Enter pressed while another slot saves", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const root = await openPrinter();
    const [first, second] = [findRow(root, "Sample 3"), findRow(root, "Sample 4")];
    const hold = holdWrites();
    t.after(hold.release);

    type(inputs(first)[0], 3333);
    enter(first, inputs(first)[0]);
    await until(() => hold.held() === 1, "Sample 3's save to reach the game");
    type(inputs(second)[0], 4444);
    enter(second, inputs(second)[0]);
    hold.release();
    await until(() => gga.Printer[printerSlot(4) + 1] === 4444, "Sample 4's save");
    assert.equal(gga.Printer[printerSlot(3) + 1], 3333);
    await until(() => /save-state--success/.test(saveState(second)), "Sample 4's ✓");
});

// The first save hasn't claimed its History action yet while it reads the game; the second waits its whole turn.
test("Printer keeps each slot's Undo when a second slot's Enter lands while the first still reads", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const root = await openPrinter();
    const [first, second] = [findRow(root, "Sample 3"), findRow(root, "Sample 4")];
    const hold = holdWrites({ reads: true });
    t.after(hold.release);

    type(inputs(first)[0], 3333);
    enter(first, inputs(first)[0]);
    await until(() => hold.held() > 0, "Sample 3's save to read the game");
    type(inputs(second)[0], 4444);
    enter(second, inputs(second)[0]);
    hold.release();
    await until(() => saved(first) && saved(second), "both saves to end");
    assert.deepEqual([gga.Printer[printerSlot(3) + 1], gga.Printer[printerSlot(4) + 1]], [3333, 4444]);
    assert.ok(undoOffered(first), "Sample 3 offers Undo");
    assert.ok(undoOffered(second), "Sample 4 offers Undo");
});

test("Printer keeps each slot's Undo when Clear is confirmed while another slot's save reads", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const root = await openPrinter();
    const [draftRow, clearRow] = [findRow(root, "Sample 3"), findRow(root, "Sample 4")];
    const clear = button(clearRow, "Clear");
    clear.listeners.click({ currentTarget: clear, preventDefault() {} });
    const hold = holdWrites({ reads: true });
    t.after(hold.release);

    type(inputs(draftRow)[0], 3030);
    draftRow.listeners.focusout({ target: inputs(draftRow)[0], relatedTarget: clear, currentTarget: draftRow });
    await until(() => hold.held() > 0, "Sample 3's save to read the game");
    clear.listeners.click({ currentTarget: clear, preventDefault() {} });
    hold.release();
    await until(() => saved(draftRow) && saved(clearRow), "both saves to end");
    assert.deepEqual([gga.Printer[printerSlot(3) + 1], gga.Printer[printerSlot(4)]], [3030, "Blank"]);
    assert.ok(undoOffered(draftRow), "Sample 3 offers Undo");
    assert.ok(undoOffered(clearRow), "Sample 4 offers Undo");
});

test("Printer's Clear asks Click again when the press also saves another slot's draft", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const root = await openPrinter();
    const [draftRow, clearRow] = [findRow(root, "Sample 3"), findRow(root, "Sample 4")];
    const clear = button(clearRow, "Clear");
    assert.ok(clear, "Sample 4 holds something to clear");
    const writes = requests.length;

    type(inputs(draftRow)[0], 3030);
    // The mousedown on Clear moves focus out of Sample 3's row (its save starts), then the click lands.
    draftRow.listeners.focusout({ target: inputs(draftRow)[0], relatedTarget: clear, currentTarget: draftRow });
    clear.listeners.click({ currentTarget: clear, preventDefault() {} });
    assert.equal(clear.attributes["data-again"], "Click again");

    await until(() => gga.Printer[printerSlot(3) + 1] === 3030, "Sample 3's save");
    assert.notEqual(gga.Printer[printerSlot(4)], "Blank", "one press clears nothing");
    assert.ok(requests.length > writes);
});

// Review of #131: while an Undo's reload waited for another slot's write, an item picked on the undone row saved with
// the quantity the row still showed, over the one the Undo put back.
test("Printer saves nothing while an Undo's reload waits, then keeps the picked item with the game's quantity", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const root = await openPrinter();
    const [undone, other] = [findRow(root, "Sample 1"), findRow(root, "Sample 3")];
    const select = byClass(undone, "printer-item-select")[0];
    const picked = elements(select).find(
        (node) => node.nodeName === "option" && !["Blank", gga.Printer[printerSlot(1)]].includes(node.attributes.value)
    ).attributes.value;
    const hold = holdWrites();
    t.after(hold.release);

    type(inputs(other)[0], 3333);
    enter(other, inputs(other)[0]);
    await until(() => hold.held() === 1, "Sample 3's save to reach the game");
    gga.Printer[printerSlot(1) + 1] = 123; // an Undo put Sample 1's old quantity back
    reloadPlace.val = { view: "", page: "" };
    await new Promise((resolve) => setTimeout(resolve)); // VanJS runs the page's reload watch on the next turn
    select.listeners.change({ target: { value: picked } });
    enter(undone, inputs(undone)[0]);
    hold.release();
    // A save let through would run before the reload, which would then show its quantity instead.
    await until(() => inputs(undone)[0].value === "123", "the reload to show the quantity the Undo put back");
    assert.equal(gga.Printer[printerSlot(1) + 1], 123, "nothing saved over the Undo");
    assert.equal(select.value, picked, "the picked item stays a draft");
    enter(undone, inputs(undone)[0]);
    await until(() => gga.Printer[printerSlot(1)] === picked, "the picked item to be saved");
    assert.equal(gga.Printer[printerSlot(1) + 1], 123, "with the quantity the game holds");
});

// Review of #131: an Undo's reload read the game while a slot write was still running, and its older answer put the
// old quantity back on that row; the reload now waits for the slot writes.
test("Printer's reload after an Undo waits for a slot write still running", async (t) => {
    const before = gga.Printer.slice();
    t.after(() => gga.Printer.splice(0, before.length, ...before));
    const { reloadPlace } = await importRepo("src/ui/services/changeLog.js");
    const root = await openPrinter();
    const row = findRow(root, "Sample 2");
    const realFetch = globalThis.fetch;
    const gates = [0, 1].map(() => {
        let open;
        const promise = new Promise((resolve) => (open = resolve));
        return { promise, open };
    });
    let writing = false;
    let readsAnswered = 0; // reads of the game answered so far
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("write-many")) {
            writing = true;
            await gates[0].promise;
            writing = false;
            return realFetch(url, options);
        }
        if (!writing) return realFetch(url, options).finally(() => readsAnswered++);
        // A read made while the slot write runs: the game answers now, the answer arrives after the write.
        const answer = await realFetch(url, options);
        await gates[1].promise;
        readsAnswered++;
        return answer;
    };
    t.after(() => {
        globalThis.fetch = realFetch;
        gates.forEach((gate) => gate.open());
    });

    const input = inputs(row)[0];
    type(input, 2222);
    enter(row, input);
    await until(() => writing, "Sample 2's save to reach the game");
    const answered = readsAnswered;
    reloadPlace.val = { view: "", page: "" }; // an Undo elsewhere changed what this page shows
    await new Promise((resolve) => setTimeout(resolve)); // VanJS runs the page's reload watch on the next turn
    gates[0].open();
    await until(() => saved(row), "Sample 2's save");
    gates[1].open();
    // The reload has read the game and ended: Refresh is usable again only once no load runs.
    const refresh = button(root, "Refresh");
    await until(() => readsAnswered > answered && !refresh.attributes.disabled, "the reload to finish");
    assert.equal(gga.Printer[printerSlot(2) + 1], 2222);
    assert.equal(input.value, "2.22K", "the row shows the quantity saved, not the reload's older answer");
});
