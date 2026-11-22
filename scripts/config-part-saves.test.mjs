// Config part saves (saveConfigPart): a page sends only the settings it changed, in one save that writes
// config.custom.js and then takes them into the session, one save at a time across the menu, and gets the config read
// after it. The file below merges what
// it is sent as the server does: objects key by key, lists whole.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi, saveToSession } from "./page-shots/fake-api.mjs";

const require = createRequire(import.meta.url);
const { deepMerge } = require("../src/modules/utils/objectUtils");

const { router } = await createFakeApi();
const file = { cheatConfig: {} };
// Events in order: "save <names>" when a file save arrives, "saved" once it is written (the save then takes it into the
// session), "update" for a separate session update, which a part save no longer sends.
const log = [];
let failNext = 0;
let onFail = null;
let gate = null;
let arrive = null;
const names = (body) => body.cheatConfig?.wide?.wardrobe?.loadouts?.map((loadout) => loadout.name).join(",");
router.routes.POST.set("/api/config/save", async (req, res) => {
    const body = await req.json();
    log.push(`save ${body.injectorConfig ? "whole" : names(body)}`);
    arrive?.();
    if (gate) await gate;
    if (failNext > 0) {
        failNext--;
        await onFail?.();
        return res.status(500).json({ error: "The config file is locked" });
    }
    deepMerge(file, body);
    log.push("saved");
    res.json(await saveToSession(router, body));
});
const update = router.routes.POST.get("/api/config/update");
router.routes.POST.set("/api/config/update", (req, res) => {
    log.push("update");
    return update(req, res);
});
const { requests } = await loadUi(router);
const { fetchConfig, saveConfigPart, updateSessionConfig } = await importRepo("src/ui/services/api.js");

const listOf = (config) => config.cheatConfig.wide.wardrobe.loadouts.map((loadout) => loadout.name);
const part = (loadouts) => ({ cheatConfig: { wide: { wardrobe: { loadouts } } } });
// A page's change: the list as it is now, plus one loadout.
const add = (name) => (config) => part([...config.cheatConfig.wide.wardrobe.loadouts, { id: name, name }]);
// Hold the next file save until release(); `arrived` resolves when it reaches the file.
const holdSave = () => {
    let release;
    gate = new Promise((resolve) => (release = resolve));
    const arrived = new Promise((resolve) => (arrive = resolve));
    return {
        arrived,
        release: () => {
            gate = arrive = null;
            release();
        },
    };
};
const reset = async () => {
    await updateSessionConfig(part([]));
    deepMerge(file, part([]));
    log.length = 0;
};

test("two pages saving at once both land, one after the other, in the order asked", async () => {
    await reset();
    const held = holdSave();
    const first = saveConfigPart(add("first"));
    await held.arrived;
    const second = saveConfigPart(add("second"));
    held.release();
    const [, { config }] = await Promise.all([first, second]);
    assert.deepEqual(log, ["save first", "saved", "save first,second", "saved"]);
    assert.deepEqual(listOf(file), ["first", "second"]);
    assert.deepEqual(listOf(config), ["first", "second"], "the read after it shows what the file holds");
    assert.deepEqual(listOf(await fetchConfig()), ["first", "second"]);
});

test("a config read that answers after a save landed reads again, so it shows what that save left", async () => {
    await reset();
    const realFetch = globalThis.fetch;
    let release;
    const answer = new Promise((resolve) => (release = resolve));
    let held = false;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (!held && String(url).endsWith("/api/config")) {
            held = true; // a page's Refresh: the game answered, the answer comes late
            await answer;
        }
        return response;
    };
    try {
        const read = fetchConfig();
        while (!held) await new Promise(setImmediate);
        await saveConfigPart(add("first"));
        release();
        assert.deepEqual(listOf(await read), ["first"], "not the list from before the save");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
});

test("a failed save sends nothing more, so another tab's newer save stays", async () => {
    await reset();
    let since;
    failNext = 1;
    onFail = async () => {
        // Another tab saves its list while this one's file save fails.
        await updateSessionConfig(part([{ id: "theirs", name: "theirs" }]));
        deepMerge(file, part([{ id: "theirs", name: "theirs" }]));
        since = requests.length;
    };
    await assert.rejects(saveConfigPart(add("mine")), /The config file is locked/);
    onFail = null;
    assert.deepEqual(
        requests.slice(since).filter((entry) => entry.startsWith("POST")),
        [],
        "nothing put back"
    );
    assert.deepEqual(listOf(file), ["theirs"]);
    assert.deepEqual(listOf(await fetchConfig()), ["theirs"]);
});

test("a retry after a failed save saves it once", async () => {
    await reset();
    failNext = 1;
    await assert.rejects(saveConfigPart(add("retry")), /locked/);
    assert.deepEqual(listOf(await fetchConfig()), [], "the failed save left the session as the file is");
    const { config } = await saveConfigPart(add("retry"));
    assert.deepEqual(listOf(file), ["retry"]);
    assert.deepEqual(listOf(config), ["retry"]);
});

test("a failed save is the asker's alone: the save asked after it still runs and lands", async () => {
    await reset();
    const held = holdSave();
    failNext = 1;
    const failing = saveConfigPart(add("failing"));
    await held.arrived;
    const next = saveConfigPart(add("next"));
    held.release();
    await assert.rejects(failing, /The config file is locked/);
    const { config } = await next;
    assert.deepEqual(listOf(file), ["next"]);
    assert.deepEqual(listOf(config), ["next"]);
});

test("Save settings on the Config page waits for a page's save, then saves what that save left", async () => {
    await reset();
    const { Config } = await importRepo("src/ui/components/views/Config.js");
    const view = Config();
    const elements = (node, out = []) => {
        if (node?.nodeType !== 1) return out;
        out.push(node);
        for (const child of node.childNodes) elements(child, out);
        return out;
    };
    const saveButton = () => elements(view).find((node) => node.attributes.id === "save-config-button");
    while (!saveButton()) await new Promise(setImmediate);
    const held = holdSave();
    const page = saveConfigPart(add("page"));
    await held.arrived;
    const whole = saveButton().listeners.click({ currentTarget: saveButton() });
    held.release();
    await Promise.all([page, whole]);
    assert.deepEqual(log.slice(0, 3), ["save page", "saved", "save whole"]);
    assert.deepEqual(listOf(file), ["page"], "the Config page's save keeps the page's loadout");
});
