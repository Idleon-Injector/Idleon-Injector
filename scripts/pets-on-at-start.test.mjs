// Pets on at start: choosing pets also makes "w1 companion" a startup cheat, so the pets come back after a restart;
// clearing them takes it off the list. Startup cheats toggle, so with "w1" (every W1 cheat) listed it isn't added.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi, saveToSession } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
// Click again places its tooltip on the next frame and on <body>, as in the menu.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);
const { updateSessionConfig } = await importRepo("src/ui/services/api.js");

// What the page hands the config file save (the fake API's own save writes no file, and takes it into the session).
const saves = [];
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    saves.push(body);
    res.json(await saveToSession(router, body));
});

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const byClass = (root, name) =>
    elements(root).filter((node) => String(node.attributes.class).split(" ").includes(name));
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const page = (await importRepo("src/ui/pages/world-1/pets/pets.js")).default.component();
// Plain pets: a token pet's click removes its token instead, and an owned one shows OWNED.
const plainPets = () =>
    byClass(page, "companion-card-wrap")
        .filter((card) => /NOT SELECTED/.test(text(card)))
        .map((card) => card.childNodes.find((node) => node.nodeName === "button"));
await until(() => byClass(page, "companion-card-wrap").length > 3, "the pets to load");
const clearAll = elements(page).find((node) => node.nodeName === "button" && text(node) === "Clear all");
// Clear all asks in place first (#25): the first press arms it, the second clears.
const press = (button) => button.listeners.click({ preventDefault() {}, stopPropagation() {}, currentTarget: button });
const saved = async (click) => {
    const count = saves.length;
    await click();
    await until(() => saves.length > count, "the config save");
    await new Promise((resolve) => setTimeout(resolve, 30)); // the save's answer reaches the page
    return saves.at(-1).startupCheats;
};

test("clearing every pet takes w1 companion off the startup cheats", async () => {
    await updateSessionConfig({ startupCheats: ["godlike reach", "w1 companion"] });
    assert.deepEqual(
        await saved(async () => {
            await press(clearAll);
            await press(clearAll);
        }),
        ["godlike reach"]
    );
    // Only what it changed: a whole config read before another page's change would put that change back.
    assert.deepEqual(saves.at(-1).cheatConfig, { w1: { companion: { companions: "none" } } });
    assert.equal(saves.at(-1).injectorConfig, undefined);
});

// Unselected once the first test cleared them.
let first, second, third;

test("choosing a pet adds w1 companion to the startup cheats, once", async () => {
    await until(() => plainPets().length >= 3, "unselected pets");
    [first, second, third] = plainPets();
    await updateSessionConfig({ startupCheats: ["godlike reach"] });
    assert.deepEqual(await saved(() => first.listeners.click({})), ["godlike reach", "w1 companion"]);
    await updateSessionConfig({ startupCheats: ["godlike reach", "w1 companion"] });
    assert.deepEqual(await saved(() => second.listeners.click({})), ["godlike reach", "w1 companion"]);
});

test("with every W1 cheat on at start, choosing a pet adds nothing that would toggle it back off", async () => {
    await updateSessionConfig({ startupCheats: ["w1"] });
    assert.deepEqual(await saved(() => third.listeners.click({})), ["w1"]);
});

// The file and the session took the choice and the game didn't: the reason is said on the page, and the card shows the
// read after it, what the file holds.
test("a pet choice the game didn't take is said on the page, and its card shows what was saved", async () => {
    await until(() => plainPets().length >= 1, "an unselected pet");
    const [pet] = plainPets();
    const wrap = byClass(page, "companion-card-wrap").find((card) => card.childNodes.includes(pet));
    const routes = router.routes.POST;
    const save = routes.get("/api/config/save");
    routes.set("/api/config/save", async (req, res) => {
        await save(req, { status: () => ({ json() {} }), json() {} });
        res.json({
            message:
                "Configuration saved to config.custom.js. The running game kept its old settings (The game is busy)",
        });
    });
    const count = saves.length;
    try {
        await pet.listeners.click({});
        await until(() => /The game is busy/.test(text(page)), "the reason on the page");
        await until(() => !/NOT SELECTED/.test(text(wrap)), "the card to show the saved choice");
        assert.equal(saves.length, count + 1, "the file took it first");
    } finally {
        routes.set("/api/config/save", save);
    }
});

// Review of #147: the read after a failed save could answer after a newer save and put the older choice back.
test("the read after a failed pet save can't put back what a newer save changed", async () => {
    await until(() => plainPets().length >= 2, "two unselected pets");
    const [failing, chosen] = plainPets();
    const wrapOf = (pet) => byClass(page, "companion-card-wrap").find((card) => card.childNodes.includes(pet));
    const { POST, GET } = router.routes;
    const save = POST.get("/api/config/save");
    const config = GET.get("/api/config");
    let failed = false;
    let release;
    const held = new Promise((resolve) => (release = resolve));
    POST.set("/api/config/save", async (req, res) => {
        failed = true;
        res.status(500).json({ error: "The disk is full" });
    });
    // The first read after the failure answers with the config as it was then, but only once released.
    GET.set("/api/config", async (req, res) => {
        if (!failed) return config(req, res);
        failed = false;
        let answer;
        const capture = { status: () => capture, json: (data) => (answer = structuredClone(data)) };
        await config(req, capture);
        await held;
        return res.json(answer);
    });
    try {
        failing.listeners.click({});
        await until(() => /The disk is full/.test(text(page)), "the failed save's reason");
        POST.set("/api/config/save", save);
        await saved(() => chosen.listeners.click({}));
        await until(() => !/NOT SELECTED/.test(text(wrapOf(chosen))), "the newer save's card to show it");
        release();
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.doesNotMatch(text(wrapOf(chosen)), /NOT SELECTED/, "the older read is dropped");
    } finally {
        release();
        POST.set("/api/config/save", save);
        GET.set("/api/config", config);
    }
});

// CodeRabbit on #147: a click built its list from the tiers it read before the save's turn, so a list saved in between
// (the Config tab) lost its newer pet; it's now built from the config read in the save's turn.
test("a pet click keeps a pet the Config tab saved between its read and its save", async (t) => {
    await until(() => plainPets().length >= 2, "two unselected pets");
    const [clicked, other] = plainPets();
    const idOf = (pet) => Number(/\d+/.exec(text(byClass(pet, "companion-card__id")[0]))[0]);
    const config = router.routes.GET.get("/api/config");
    let reads = 0;
    router.routes.GET.set("/api/config", async (req, res) => {
        let answer;
        const capture = { status: () => capture, json: (data) => (answer = structuredClone(data)) };
        await config(req, capture);
        // The click's first read has its answer; the Config tab then saves the other pet too.
        if (++reads === 1) {
            const list = String(answer.cheatConfig.w1.companion.companions).replace(/^none$/, "");
            const companions = [list, `${idOf(other)}:0`].filter(Boolean).join(",");
            await updateSessionConfig({ cheatConfig: { w1: { companion: { companions } } } });
        }
        return res.json(answer);
    });
    t.after(() => router.routes.GET.set("/api/config", config));

    const count = saves.length;
    clicked.listeners.click({});
    await until(() => saves.length > count, "the config save");
    const saved = saves.at(-1).cheatConfig.w1.companion.companions.split(",");
    assert.ok(saved.includes(`${idOf(clicked)}:0`), "the clicked pet");
    assert.ok(saved.includes(`${idOf(other)}:0`), "the pet the Config tab saved meanwhile");
});
