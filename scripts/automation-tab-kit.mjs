// The fake game and DOM helpers a system's automation tab test uses (#92): the toggle, config update and config save
// routes record what the page sent (and can refuse updates), and the helpers read and drive the page like a player.
import assert from "node:assert/strict";
import { after } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";
import { fakeGameData } from "./page-shots/fake-game-data.mjs";

export async function automationTabKit() {
    // An automation a test leaves on keeps its timer; don't let it keep the process alive.
    const setIntervalReal = globalThis.setInterval;
    globalThis.setInterval = (...args) => setIntervalReal(...args).unref();
    // The fake game's data, so a test can change what a game block answers (a cost, say) and read the page again.
    const fixture = fakeGameData();
    const { router, game } = await createFakeApi(fixture);
    const { getAutomations, switchAutomation } = await importRepo("src/cheats/core/automations.js");
    // The automations a test left on stop once the file's tests are done, so none keeps ticking.
    after(() => getAutomations().forEach(({ id, on }) => on && switchAutomation(id, false)));
    const commands = [];
    const saves = [];
    const updates = [];
    // What the fake game and server do next: refuse updates (`refuseUpdates`, or a count in `refuseNextUpdates`), take
    // the next update but lose its answer (`dropNextUpdate`), hold updates until a promise settles (`holdUpdates`),
    // fail config reads (a count) or the file save, or answer reads with only the server's copy (`serverCopyOnly`).
    const fake = {
        refuseNextUpdates: 0,
        refuseUpdates: false,
        dropNextUpdate: false,
        holdUpdates: null,
        failConfigReads: 0,
        failSave: false,
        serverCopyOnly: false,
        startup: [],
        // The automation settings the game holds but the file doesn't, as the server's config read says them: an
        // update the game took adds its keys, a file save that works writes them all.
        fileLacks: [],
    };
    const gameTook = (body) =>
        (fake.fileLacks = [...new Set([...fake.fileLacks, ...Object.keys(body.cheatConfig?.automation ?? {})])]);
    router.routes.POST.set("/api/toggle", async (req, res) => {
        const { action, on } = await req.json();
        commands.push([action, on]);
        res.json(switchAutomation(getAutomations().find(({ cheat }) => cheat === action).id, on));
    });
    const update = router.routes.POST.get("/api/config/update");
    router.routes.POST.set("/api/config/update", async (req, res) => {
        const body = await req.json();
        updates.push(body);
        await fake.holdUpdates;
        if (fake.dropNextUpdate) {
            fake.dropNextUpdate = false;
            gameTook(body);
            await update(req, { status: () => ({ json() {} }), json() {} }); // the game takes it...
            return res.status(500).json({ error: "the connection dropped" }); // ...but the answer is lost
        }
        if (fake.refuseUpdates || fake.refuseNextUpdates > 0) {
            if (fake.refuseNextUpdates > 0) fake.refuseNextUpdates--;
            return res.json({ message: "Config update failed", details: "the game is busy" });
        }
        gameTook(body);
        return update(req, res);
    });
    router.routes.POST.set("/api/config/save", async (req, res) => {
        if (fake.failSave) return res.status(500).json({ error: "the disk is full" });
        const body = await req.json();
        saves.push(body);
        fake.fileLacks = [];
        fake.startup = body.startupCheats ?? fake.startup; // the server merges a partial save into the file
        res.json({ ok: true });
    });
    const readConfig = router.routes.GET.get("/api/config");
    router.routes.GET.set("/api/config", async (req, res) => {
        if (fake.failConfigReads > 0 && fake.failConfigReads--)
            return res.status(500).json({ error: "the config didn't load" });
        let read;
        await readConfig(req, {
            status() {
                return this;
            },
            json: (data) => (read = data),
        });
        const copy = { ...read, startupCheats: [...fake.startup], unsavedAutomation: [...fake.fileLacks] };
        res.json(structuredClone(fake.serverCopyOnly ? { ...copy, gameRead: false } : copy));
    });
    await loadUi(router);
    globalThis.requestAnimationFrame = () => {};
    globalThis.document.body = globalThis.document.createElement("body");
    globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

    const text = (node) =>
        typeof node === "string"
            ? node
            : node?.nodeType === 3
              ? node.data
              : (node?.childNodes ?? []).map(text).join("");
    // What the screen shows: without the words only screen readers hear, and a capped value read as "15 / 50".
    const shown = (node) =>
        typeof node === "string" || node?.nodeType === 3
            ? text(node)
            : String(node?.attributes?.class ?? "").includes("sr-only")
              ? ""
              : `${String(node?.attributes?.class ?? "").includes("number-input__cap") ? " " : ""}${(node?.childNodes ?? []).map(shown).join("")}`;
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
    const byTag = (node, tag) => elements(node).filter((entry) => entry.nodeName === tag);
    const switches = (node) => byTag(node, "input").filter((entry) => entry.attributes.type === "checkbox");
    // A row's own switch (an item's "On", an automation's); its "Save for it" switch is saveSwitch.
    const checkbox = (node) => switches(node).find((entry) => !/^Save for /.test(entry.attributes["aria-label"] ?? ""));
    const saveSwitch = (node) =>
        switches(node).find((entry) => /^Save for /.test(entry.attributes["aria-label"] ?? ""));
    const field = (node) => byTag(node, "input").find((entry) => entry.attributes.type !== "checkbox");
    const button = (root, label) =>
        byTag(root, "button").find((node) => text(node).trim() === label && !node.attributes.disabled);
    const saveState = (node) => classes(byClass(node, "save-state")[0]);
    const status = (root, name) => text(byClass(row(root, name), "automation-row__status")[0]);
    const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
    async function until(check, what) {
        for (let i = 0; i < 300; i++) {
            if (check()) return;
            await settle(10);
        }
        assert.fail(`timed out waiting for ${typeof what === "function" ? what() : what}`);
    }
    const { inTurn } = await importRepo("src/ui/components/views/account/automation.js");
    // Every step queued so far has ended (a step's own follow-up is queued as it ends, hence twice).
    const idle = async () => {
        await inTurn(() => {});
        await inTurn(() => {});
        await settle(0);
    };
    const running = (cheat) => getAutomations().find((entry) => entry.cheat === cheat).on;
    // What the newest update (or file save) that carried `key` sent.
    const sent = (key) => updates.findLast((body) => key in body.cheatConfig.automation)?.cheatConfig.automation[key];
    const fileSent = (key) =>
        saves.findLast((body) => body.cheatConfig && key in body.cheatConfig.automation)?.cheatConfig.automation[key];
    // The step a step picker shows picked; the page binds each step's `aria-checked` (an attribute in this fake DOM).
    const selected = (node) => text(byTag(node, "button").find((o) => o.attributes["aria-checked"] === "true"));
    // The row's step picker named `title` ("pay with").
    const picker = (node, title) =>
        byClass(node, "step-picker").find((entry) => entry.attributes["aria-label"].endsWith(title));
    // Type into a row's number field and press Enter; then every step ends. A value with nothing to save ends there.
    async function type(node, value) {
        const input = field(node);
        input.listeners.input({ target: { value } });
        const since = updates.length;
        byClass(node, "account-field-metric")[0].listeners.keydown({
            key: "Enter",
            target: input,
            preventDefault() {},
        });
        await idle();
        await until(
            () =>
                updates.length > since ||
                /save-state--error/.test(saveState(node)) ||
                !/save-state--loading/.test(saveState(node)),
            "the field's save"
        );
        await idle();
    }
    // Pick the step at `index` in the row's step picker titled `title` ("pay with"); then every step ends.
    async function choose(node, title, index) {
        const since = updates.length;
        await byTag(picker(node, title), "button")[index].listeners.click({});
        await until(() => updates.length > since || /save-state--error/.test(saveState(node)), `the ${title} save`);
        await idle();
    }
    // Flip the row's "Save for it" switch; then every step ends.
    async function flipSave(node, on) {
        const since = updates.length;
        await saveSwitch(node).listeners.change({ target: { checked: on } });
        await until(() => updates.length > since || /save-state--error/.test(saveState(node)), "the save-for-it save");
        await idle();
    }
    async function flip(node, on) {
        await checkbox(node).listeners.change({ target: { checked: on } });
        await idle();
    }
    // Press a tray tool that asks first (Disable all), check its question, and answer it; then every step ends.
    async function askAndConfirm(root, label, question) {
        await button(root, label).listeners.click({ preventDefault() {} });
        await settle();
        const asked = byClass(root, "tabbed-list__tools-label")
            .map(text)
            .find((line) => line.endsWith("?"));
        assert.equal(asked, question, `${label} asks first`);
        await byClass(root, "tabbed-list__yes")[0].listeners.click({});
        await idle();
    }
    return {
        game,
        fixture,
        gga: game.gga,
        fake,
        commands,
        saves,
        updates,
        getAutomations,
        switchAutomation,
        text,
        shown,
        elements,
        byClass,
        row,
        byTag,
        checkbox,
        saveSwitch,
        field,
        button,
        saveState,
        status,
        settle,
        until,
        idle,
        running,
        sent,
        fileSent,
        selected,
        type,
        choose,
        flipSave,
        flip,
        askAndConfirm,
    };
}
