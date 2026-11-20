// World 7 › Bubba › Automation (#92) on the fake game. Each upgrade row has a switch, a stop-at and a High / Low /
// Balanced priority; the meat section has the status line and the saving %. Every change saves
// cheatConfig.automation.bubba ({ saving, items }) to the game and the config file, switching an upgrade on switches
// the Bubba automation on, the page reads the game again after a save, and a refused save goes back to what the game
// holds and says why at the row.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const setIntervalReal = globalThis.setInterval;
globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
const { router } = await createFakeApi();
const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
const commands = [];
const saves = [];
const updates = [];
let refuseUpdate = false;
let fileStartup = [];
router.routes.POST.set("/api/toggle", async (req, res) => {
    const { action, on } = await req.json();
    commands.push([action, on]);
    res.json(switchAutomation(getAutomations().find(({ cheat }) => cheat === action).id, on));
});
let holdNextRead = null; // a promise the next Bubba read waits on, answering what it read before (or failing)
const readComputedRoute = router.routes.POST.get("/api/game/computed/read");
router.routes.POST.set("/api/game/computed/read", async (req, res) => {
    const { name } = await req.json();
    const hold = name === "bubba" ? holdNextRead : null;
    if (!hold) return readComputedRoute(req, res);
    holdNextRead = null;
    let read;
    await readComputedRoute(req, {
        status() {
            return this;
        },
        json: (data) => (read = data),
    });
    if (await hold) return res.status(500).json({ error: "the game timed out" });
    res.json(read);
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", async (req, res) => {
    const body = await req.json();
    updates.push(body);
    if (refuseUpdate) return res.json({ message: "Config update failed", details: "the game is busy" });
    return update(req, res);
});
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    saves.push(body);
    fileStartup = body.startupCheats ?? fileStartup;
    res.json({ ok: true });
});
let failConfigReads = 0;
const readConfig = router.routes.GET.get("/api/config");
router.routes.GET.set("/api/config", async (req, res) => {
    if (failConfigReads > 0 && failConfigReads--) return res.status(500).json({ error: "the server restarted" });
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
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await settle(10);
    }
    assert.fail(`timed out waiting for ${typeof what === "function" ? what() : what}`);
}
const bubbaOn = () => getAutomations().find(({ cheat }) => cheat === "automation bubba").on;
const saved = () => updates.at(-1)?.cheatConfig.automation.bubba;
const fileBubba = () => saves.findLast((body) => body.cheatConfig)?.cheatConfig.automation.bubba;

const page = (await importRepo("src/ui/pages/world-7/bubba/2-automation.js")).default.component();
const row = (name) => byClass(page, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === name);
const checkbox = (name) =>
    elements(row(name)).find((node) => node.nodeName === "input" && node.attributes.type === "checkbox");
const field = (name) =>
    elements(row(name)).find((node) => node.nodeName === "input" && node.attributes.type !== "checkbox");
const priority = (name) => elements(row(name)).find((node) => node.nodeName === "select");
const saveState = (name) => classes(byClass(row(name), "save-state")[0]);
const statusLine = () =>
    text(elements(page).find((node) => node.attributes?.role === "status" && classes(node) === "account-row__name"));
const button = (label) =>
    elements(page).find(
        (node) => node.nodeName === "button" && text(node).trim() === label && !node.attributes.disabled
    );
async function type(name, value) {
    const input = field(name);
    input.listeners.input({ target: { value } });
    const since = updates.length;
    byClass(row(name), "account-field-metric")[0].listeners.keydown({
        key: "Enter",
        target: input,
        preventDefault() {},
    });
    await until(() => updates.length > since || /save-state--error/.test(saveState(name)), `${name}'s save`);
    await settle();
}

await until(() => row("Grand Stone"), "the Bubba automation tab to load");

test("the tab shows the Bubba switch, meat, the status, the saving % and every upgrade with its next cost", () => {
    assert.ok(row("Bubba"), "the same switch as the overview");
    assert.match(text(page), /12\.5K owned/);
    assert.equal(statusLine(), "Nothing switched on");
    assert.equal(String(field("Saving").attributes.value), "10");
    assert.match(text(row("Grand Stone")), /Next level 40 meat/);
    assert.match(text(row("Grand Stone")), /LV 0 \/ 5/);
    assert.match(text(row("Hollow Drift")), /Max level/);
    assert.equal(byClass(page, "automation-pick").length, 28);
    assert.ok(
        byClass(page, "automation-pick").some((node) => /Unlocks at 1M meat made/.test(text(node))),
        "a locked upgrade says what unlocks it and can still be switched on"
    );
});

test("switching an upgrade on saves it and switches the Bubba automation on, now and at start", async () => {
    assert.equal(bubbaOn(), false);
    await checkbox("Grand Stone").listeners.change({ target: { checked: true } });
    await until(
        () => bubbaOn() && /save-state--success/.test(saveState("Grand Stone")),
        () => `Bubba to go on: ${bubbaOn()} ${saveState("Grand Stone")}`
    );
    assert.deepEqual(saved(), { saving: 10, items: [{ id: "0", on: true }] });
    assert.deepEqual(commands, [["automation bubba", true]]);
    assert.deepEqual(fileStartup, ["automation bubba"]);
    await until(() => fileBubba()?.items.length === 1, "the config file save");
    await until(
        () => statusLine() === "Buying cheapest first",
        () => `the status to follow: ${statusLine()}`
    );
});

test("a priority saves on change, and the status line reads the game again after the save", async () => {
    await checkbox("Tiny Tide").listeners.change({ target: { checked: true } });
    await until(() => saved().items.length === 2, "Tiny Tide to save");
    await priority("Tiny Tide").listeners.change({ target: { value: "2" } });
    await until(() => saved().items[1].priority === 2, "the priority to save");
    assert.deepEqual(saved().items, [
        { id: "0", on: true },
        { id: "1", on: true, priority: 2 },
    ]);
    await until(
        () => statusLine() === "Saving for Tiny Tide (64 meat)",
        () => `the status to show the goal: ${statusLine()}`
    );

    // Back to Balanced drops the field.
    await priority("Tiny Tide").listeners.change({ target: { value: "" } });
    await until(() => !("priority" in saved().items[1]), "Balanced to save");
    await until(
        () => statusLine() === "Buying cheapest first",
        () => `the status to follow: ${statusLine()}`
    );
});

test("the saving % saves on Enter; one over 100 or not whole is refused at its field and nothing is saved", async () => {
    await type("Saving", "25");
    assert.equal(saved().saving, 25);
    await until(() => fileBubba()?.saving === 25, "the file save");

    const before = updates.length;
    await type("Saving", "150");
    assert.equal(updates.length, before);
    assert.match(text(row("Saving")), /a whole number from 0 to 100/);
    await type("Saving", "2.5");
    assert.equal(updates.length, before);
    await type("Saving", "30");
    assert.equal(saved().saving, 30);
    assert.doesNotMatch(text(row("Saving")), /a whole number/, "the next success clears the reason");
});

test("a save the game refuses puts the switch and the priority back and says why at the row", async () => {
    refuseUpdate = true;
    const box = checkbox("Royal Crown");
    await box.listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Royal Crown")), "the row to show the failure");
    assert.equal(box.checked, false);
    assert.match(text(row("Royal Crown")), /busy/);

    const select = priority("Grand Stone");
    await select.listeners.change({ target: { value: "1" } });
    await until(() => /save-state--error/.test(saveState("Grand Stone")), "the priority failure");
    assert.equal(select.value, "", "back to Balanced, what the game holds");
    refuseUpdate = false;
});

test("a refused save whose read-back fails too still says the game's reason and reads the game again", async () => {
    refuseUpdate = true;
    failConfigReads = 1; // only the read-back fails; the page's read after it works
    const box = checkbox("Royal Crown");
    await box.listeners.change({ target: { checked: true } });
    await until(() => /save-state--error/.test(saveState("Royal Crown")), "the row to show the failure");
    assert.match(text(row("Royal Crown")), /busy/, "the game's refusal, not the read-back's error");
    await until(() => box.checked === false, "the page's read again to put the switch back");
    assert.equal(failConfigReads, 0);
    refuseUpdate = false;
});

test("Enable all switches every upgrade on in one save; Disable all asks Click again and keeps priorities", async () => {
    const before = updates.length;
    await button("Enable all").listeners.click({ preventDefault() {} });
    await until(() => updates.length > before && saved().items.length === 28, "every upgrade to save on");
    assert.equal(updates.length, before + 1, "one save");
    assert.ok(saved().items.every(({ on }) => on));

    // A priority survives Disable all.
    await priority("Tiny Tide").listeners.change({ target: { value: "1" } });
    await until(() => saved().items[1].priority === 1, "the priority to save");
    const since = updates.length;
    await until(() => button("Disable all"), "Disable all");
    const disable = button("Disable all");
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(disable.attributes["data-again"], "Click again");
    assert.equal(updates.length, since, "the first click saves nothing");
    await disable.listeners.click({ preventDefault() {} });
    await until(() => updates.length > since && !saved().items.some(({ on }) => on), "every upgrade to save off");
    assert.deepEqual(saved().items, [{ id: "1", on: false, priority: 1 }]);
    await until(
        () => statusLine() === "Nothing switched on",
        () => `the status to follow: ${statusLine()}`
    );
});

test("a read that started before a save and answers after the newer one doesn't put the old status back", async () => {
    await checkbox("Grand Stone").listeners.change({ target: { checked: true } });
    await until(
        () => statusLine() === "Buying cheapest first",
        () => `the status to follow: ${statusLine()}`
    );
    let release;
    holdNextRead = new Promise((resolve) => (release = resolve));
    void button("Refresh").listeners.click({ preventDefault() {} }); // reads "Buying cheapest first", held
    await settle();
    await priority("Grand Stone").listeners.change({ target: { value: "2" } });
    await until(
        () => statusLine() === "Saving for Grand Stone (40 meat)",
        () => `the newer read: ${statusLine()}`
    );
    release();
    await settle(100);
    assert.equal(statusLine(), "Saving for Grand Stone (40 meat)");
});

test("an older read that fails after a newer one worked shows no read failure", async () => {
    let fail;
    holdNextRead = new Promise((resolve) => (fail = () => resolve(true)));
    void button("Refresh").listeners.click({ preventDefault() {} }); // fails, held
    await settle();
    await priority("Grand Stone").listeners.change({ target: { value: "" } });
    await until(
        () => statusLine() === "Buying cheapest first",
        () => `the newer read: ${statusLine()}`
    );
    fail();
    await settle(100);
    assert.doesNotMatch(text(page), /timed out/, "no read failure over the newer read");
    assert.equal(statusLine(), "Buying cheapest first");
});
