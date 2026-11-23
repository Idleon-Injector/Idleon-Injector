// Account › Automation › Shops review follow-ups (#112) on the fake game: Enable all goes grey once it has nothing
// left to do, and a stop-at entered twice and then the item's switch reach the game in that order.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

// An automation left on keeps its timer; don't let it keep the process alive.
const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();

const { router } = await createFakeApi();
// The fake game's cheats don't run; the switch runs the real automation switch, as the game's cheat does.
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const updates = []; // the shop list of each session update, in the order the game got them
let holdNextUpdate = null;
let fileStartup = []; // the startup cheats in the config file
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    const automation = getAutomations().find(({ cheat }) => cheat === action);
    res.json(switchAutomation(automation.id, on));
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    const body = await req.json();
    if (holdNextUpdate) {
        const hold = holdNextUpdate;
        holdNextUpdate = null;
        await hold;
    }
    updates.push(body.cheatConfig?.automation?.shops);
    return update({ json: async () => body }, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    fileStartup = body.startupCheats ?? fileStartup; // the server merges a partial save into the file
    res.json({ ok: true });
});
const readConfig = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    let read;
    await readConfig(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    res.json(structuredClone({ ...read, startupCheats: [...fileStartup] }));
});
await loadUi(router);
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

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
const row = (root, name) =>
    byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
const enabledButton = (root, label) =>
    elements(root).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const shopsOn = () => getAutomations().find(({ cheat }) => cheat === "automation shops").on;

const shops = (await importRepo("src/ui/pages/automation/shops/shops.js")).default.component();
await until(() => row(shops, "Lucky Whisker"), "the Shops tab to load");
const pickRow = (name) => row(shops, name);

test("Shops: Enable all goes grey once every item and Shops are on, now and at start", async () => {
    assert.equal(shopsOn(), false);
    assert.deepEqual(fileStartup, [], "Shops isn't in the startup cheats when the page reads them");
    await enabledButton(shops, "Enable all").listeners.click({ preventDefault() {} });
    await until(() => shopsOn() && fileStartup.includes("automation shops"), "Shops to go on, now and at start");
    await until(() => !enabledButton(shops, "Enable all"), "Enable all to have nothing left to do");

    await enabledButton(shops, "Disable all").listeners.click({ preventDefault() {} });
    await byClass(shops, "tabbed-list__yes")[0].listeners.click({}); // it asks in the tray first
    await until(() => updates.at(-1)?.every(({ on }) => !on), "every item to go off");
    await until(() => enabledButton(shops, "Enable all"), "Enable all to have work again");
});

// #105 review: stop-at 5, then 6, then the switch reached the game as 5, switch on, 6.
test("Shops: a stop-at entered twice and then the item's switch reach the game in that order", async () => {
    const field = elements(pickRow("Grand Drift")).find(
        (node) => node.nodeName === "input" && node.attributes.type !== "checkbox"
    );
    const metric = byClass(pickRow("Grand Drift"), "account-field-metric")[0];
    const box = elements(pickRow("Grand Drift")).find(
        (node) => node.nodeName === "input" && node.attributes.type === "checkbox"
    );
    const enterStopAt = (value) => {
        field.listeners.input({ target: { value } });
        metric.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
    };
    const since = updates.length;
    let release;
    holdNextUpdate = new Promise((resolve) => (release = resolve));
    enterStopAt("5");
    await settle();
    enterStopAt("6");
    await settle();
    box.listeners.change({ target: { checked: true } });
    await settle();
    release();
    await until(() => updates.length >= since + 3, "the three saves");
    await settle();
    // Every other item is off with no stop-at, so Grand Drift is the only one each list keeps.
    const steps = updates.slice(since).map(([entry]) => `${entry.on ? "on" : "off"} ${entry.stopAt}`);
    assert.deepEqual(steps, ["off 5", "off 6", "on 6"]);
});
