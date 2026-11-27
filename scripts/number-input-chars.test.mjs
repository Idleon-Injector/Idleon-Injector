// A field tells its style how long its shown text is (--chars), so a capped value and its cap ("40 / 600") can sit in
// the middle of the field as one unit. It follows the value, in both the plain and the formatted field.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);

const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const { NumberInput } = await importRepo("src/ui/components/NumberInput.js");

// VanJS draws a changed state in a microtask; this waits for it.
const drawn = () => new Promise((resolve) => setImmediate(resolve));
const chars = (wrapper) => {
    const style = String(wrapper.attributes.style ?? wrapper.style ?? "");
    return Number(style.match(/--chars:\s*(\d+)/)?.[1]);
};

test("a plain field's --chars follows its value", async () => {
    const value = van.state("40");
    const field = NumberInput({ value, cap: 600 });
    await drawn();
    assert.equal(chars(field), 2);
    value.val = "1234";
    await drawn();
    assert.equal(chars(field), 4);
    value.val = "";
    await drawn();
    assert.equal(chars(field), 1, "an empty field still keeps room for one digit");
});

test("a formatted field counts the text it shows, not the number behind it", async () => {
    const value = van.state("1030");
    const field = NumberInput({
        value,
        cap: 5000,
        formatter: (raw) => (Number(raw) >= 1000 ? `${(Number(raw) / 1000).toFixed(2)}K` : String(raw)),
        parser: (text) => text,
    });
    await drawn();
    assert.equal(chars(field), 5, '"1.03K" is five characters');
    value.val = "7";
    await drawn();
    assert.equal(chars(field), 1);
});
