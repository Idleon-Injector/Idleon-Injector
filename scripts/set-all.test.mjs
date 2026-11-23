// The shared Set all (SetAllTool, DESIGN.md's Page standards): what it writes, and when and how it asks first.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const { ListPanel } = await importRepo("src/ui/components/views/account/tabShared.js");
const { SetAllTool } = await importRepo("src/ui/components/views/account/BulkActionBar.js");

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    node.childNodes.forEach((child) => elements(child, out));
    return out;
};
const attr = (node, name) =>
    typeof node.attributes[name] === "function" ? node.attributes[name]() : node.attributes[name];
const byClass = (root, name) => elements(root).filter((node) => String(attr(node, "class")).split(" ").includes(name));
const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 2));
};

/** A list with these lines (`[value, max]`), its Set all, and every plan it wrote. */
const list = (...lines) => {
    const entries = lines.map(([value, max], i) => ({ id: i, valueState: van.state(value), max }));
    const plans = [];
    const node = ListPanel({
        body: [],
        tools: (_, ask) =>
            SetAllTool({
                ask,
                lines: () => entries,
                word: (n) => `stamp${n === 1 ? "" : "s"}`,
                write: async (plan) => {
                    plans.push(plan.map((step) => step.value));
                    plan.forEach((step) => (step.line.valueState.val = step.value));
                },
            }),
        toolsLabel: () => `All ${entries.length} stamps`,
    });
    const tray = byClass(node, "tabbed-list__tools")[0];
    const field = elements(byClass(tray, "account-setall-row")[0]).find((el) => el.nodeName === "input");
    const button = (label) => elements(tray).find((el) => el.nodeName === "button" && text(el) === label);
    const press = async (value) => {
        field.value = String(value);
        field.listeners.input({ target: field });
        button("Set all").listeners.click({ preventDefault() {}, currentTarget: button("Set all") });
        await settle();
    };
    const answer = async (label) => {
        button(label).listeners.click({ preventDefault() {} });
        await settle();
    };
    const label = byClass(tray, "tabbed-list__tools-label")[0];
    const asking = () => String(attr(label, "class")).includes("is-question");
    const answerClass = (label) => String(attr(button(label), "class"));
    return { plans, press, answer, asking, question: () => text(label), answerClass, entries };
};

test("lines without a max, and lines whose max is the number or more, get it on one press", async () => {
    const tool = list([3, null], [3, 15], [3, 10]);
    await tool.press(10);
    assert.equal(tool.asking(), false, "nothing goes past a max or down, so it doesn't ask");
    assert.deepEqual(tool.plans, [[10, 10, 10]]);
});

test("an empty field is refused, never written as 0", async () => {
    const tool = list([3, null], [5, 15]);
    await tool.press("");
    assert.equal(tool.asking(), false);
    assert.deepEqual(tool.plans, []);
});

test("a line with a lower max asks: Stop at max gives it its max, Go past the number", async () => {
    const tool = list([3, null], [3, 15], [3, 30]);
    await tool.press(25);
    assert.equal(tool.question(), "1 stamp has a max under 25.");
    assert.match(tool.answerClass("Stop at max"), /btn-quiet/, "nothing comes down, so neither answer is red");
    assert.deepEqual(tool.plans, [], "nothing is written before the answer");
    await tool.answer("Stop at max");
    assert.deepEqual(tool.plans, [[25, 15, 25]]);

    await tool.press(40);
    assert.equal(tool.question(), "2 stamps have a max under 40.");
    await tool.answer("Go past");
    assert.deepEqual(tool.plans[1], [40, 40, 40]);
});

test("a number that lowers a line asks first, as before", async () => {
    const tool = list([3, null], [12, 30]);
    await tool.press(5);
    assert.equal(tool.question(), "Lower 1 stamp to level 5?");
    await tool.answer("Cancel");
    assert.deepEqual(tool.plans, [], "Cancel writes nothing");
    await tool.press(5);
    await tool.answer("Lower it");
    assert.deepEqual(tool.plans, [[5, 5]]);
});

test("going past a max and lowering are one question, its answers red; it doesn't ask twice", async () => {
    const tool = list([50, null], [3, 15], [3, 10]);
    await tool.press(18);
    assert.equal(tool.question(), "2 stamps have a max under 18. 1 goes down.");
    assert.match(tool.answerClass("Go past"), /btn-danger/, "both answers lower a line");
    await tool.answer("Stop at max");
    assert.equal(tool.asking(), false, "one answer covers both");
    assert.deepEqual(tool.plans, [[18, 15, 10]]);
});

test("a line saved while the question is open changes what it asks about, so it asks again", async () => {
    const tool = list([3, null], [3, 15]);
    await tool.press(20);
    assert.equal(tool.question(), "1 stamp has a max under 20.");
    tool.entries[0].valueState.val = 30; // saved meanwhile: 20 now lowers it
    await tool.answer("Go past");
    assert.equal(tool.question(), "1 stamp has a max under 20. 1 goes down.");
    assert.deepEqual(tool.plans, []);
});

test("a line above its max that Stop at max lowers counts as going down, and the answers are red", async () => {
    const tool = list([3, null], [20, 15]);
    await tool.press(25);
    assert.equal(tool.question(), "1 stamp has a max under 25. 1 goes down.");
    assert.match(tool.answerClass("Stop at max"), /btn-danger/);
    await tool.answer("Stop at max");
    assert.deepEqual(tool.plans, [[25, 15]]);
});

test("lines saving one by one stop when the character changes on the way", async () => {
    let character = 0;
    const written = [];
    const line = (id) => ({
        id,
        valueState: van.state(1),
        max: null,
        write: async (value) => {
            written.push([id, character, value]);
            character = 1; // the page reads another character while this save runs
            return value;
        },
    });
    const entries = [line("a"), line("b")];
    const node = ListPanel({
        body: [],
        tools: (_, ask) =>
            SetAllTool({
                ask,
                lines: () => entries,
                word: (n) => `line${n === 1 ? "" : "s"}`,
                askedFor: () => character,
            }),
        toolsLabel: () => "All 2 lines",
    });
    const tray = byClass(node, "tabbed-list__tools")[0];
    const field = elements(tray).find((el) => el.nodeName === "input");
    const setAll = elements(tray).find((el) => el.nodeName === "button" && text(el) === "Set all");
    field.value = "5";
    field.listeners.input({ target: field });
    setAll.listeners.click({ preventDefault() {}, currentTarget: setAll });
    await settle();
    assert.deepEqual(written, [["a", 0, 5]], "the second line isn't written to the new character");
    assert.match(String(attr(setAll, "class")), /account-btn--error/, "the run says it failed where it was pressed");
});

test("a row with afterWrite saves through its own write in a Set all, so its cache follows", async () => {
    const { SimpleNumberRow } = await importRepo("src/ui/components/views/account/SimpleNumberRow.js");
    const { linesIn } = await importRepo("src/ui/components/views/account/EditableNumberRow.js");
    const row = (entry) => SimpleNumberRow({ entry: { name: "Wins", ...entry }, valueState: van.state(1) });
    const plain = row({ path: "OptionsListAccount[1]" });
    const cached = row({ path: "OptionsListAccount[319]", afterWrite: () => {} });
    assert.equal(linesIn({ childNodes: [plain] })[0].path, "OptionsListAccount[1]");
    assert.equal(linesIn({ childNodes: [cached] })[0].path, null, "no path, so it isn't in the one bulk write");
});
