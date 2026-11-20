// The fake game and DOM helpers a system's automation tab test uses (#92): the toggle, config update and config save
// routes record what the page sent (and can refuse updates), and the helpers read and drive the page like a player.
import assert from "node:assert/strict";
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
    const commands = [];
    const saves = [];
    const updates = [];
    const fake = { refuseNextUpdates: 0, startup: [] };
    router.routes.POST.set("/api/toggle", async (req, res) => {
        const { action, on } = await req.json();
        commands.push([action, on]);
        res.json(switchAutomation(getAutomations().find(({ cheat }) => cheat === action).id, on));
    });
    const update = router.routes.POST.get("/api/config/update");
    router.routes.POST.set("/api/config/update", async (req, res) => {
        updates.push(await req.json());
        if (fake.refuseNextUpdates > 0) {
            fake.refuseNextUpdates--;
            return res.json({ message: "Config update failed", details: "the game is busy" });
        }
        return update(req, res);
    });
    router.routes.POST.set("/api/config/save", async (req, res) => {
        const body = await req.json();
        saves.push(body);
        fake.startup = body.startupCheats ?? fake.startup; // the server merges a partial save into the file
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
        res.json(structuredClone({ ...read, startupCheats: [...fake.startup] }));
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
    const checkbox = (node) => byTag(node, "input").find((entry) => entry.attributes.type === "checkbox");
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
    // The option a select shows; the page binds each option's `selected` (an attribute in this fake DOM).
    const selected = (node) => text(byTag(node, "option").find((o) => o.attributes.selected === true));
    // Type into a row's number field and press Enter; then every step ends.
    async function type(node, value) {
        const input = field(node);
        input.listeners.input({ target: { value } });
        const since = updates.length;
        byClass(node, "account-field-metric")[0].listeners.keydown({
            key: "Enter",
            target: input,
            preventDefault() {},
        });
        await until(() => updates.length > since || /save-state--error/.test(saveState(node)), "the field's save");
        await idle();
    }
    // Pick the option at `index` in the row's select titled `title` ("priority", "pay with"); then every step ends.
    async function choose(node, title, index) {
        const pick = byTag(node, "select").find((entry) => entry.attributes["aria-label"].endsWith(title));
        const since = updates.length;
        await pick.listeners.change({ target: { value: String(index) } });
        await until(() => updates.length > since || /save-state--error/.test(saveState(node)), `the ${title} save`);
        await idle();
    }
    async function flip(node, on) {
        await checkbox(node).listeners.change({ target: { checked: on } });
        await idle();
    }
    async function clickTwice(root, label) {
        const action = button(root, label);
        await action.listeners.click({ preventDefault() {} });
        await settle();
        assert.equal(action.attributes["data-again"], "Click again", `${label} asks first`);
        await action.listeners.click({ preventDefault() {} });
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
        elements,
        byClass,
        row,
        byTag,
        checkbox,
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
        flip,
        clickTwice,
    };
}
