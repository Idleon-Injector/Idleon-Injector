// Save settings writes config.custom.js and also sends the settings to the running game (docs/config.md), and the
// Config page says so on the page, not in a hover label (no hover label explains a button: DESIGN.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router } = await createFakeApi();
await loadUi(router);
globalThis.requestAnimationFrame = () => {};

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

test("Config says Save settings also sends the settings to the running game", async () => {
    const { Config } = await importRepo("src/ui/components/views/Config.js");
    const root = Config();

    await until(
        () =>
            text(root).includes(
                "Apply uses them for this session only; Save settings keeps them in your config file and sends them to the running game."
            ),
        "the help line above the cheat settings"
    );
    const save = elements(root).find((node) => node.attributes.id === "save-config-button");
    assert.equal(save.listeners.mouseenter, undefined, "Save settings has no hover label");
});

// #112: the config read says whether it reached the game (`gameRead`); the save sends the settings without it.
test("Apply and Save settings send the settings, not the read's gameRead", async () => {
    const { Config } = await importRepo("src/ui/components/views/Config.js");
    const root = Config();
    const button = (id) => elements(root).find((node) => node.attributes.id === id);
    await until(() => button("save-config-button"), "the Config page");
    const realFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = (url, options) => {
        if (/\/config\/(save|update)/.test(String(url))) sent.push(JSON.parse(options.body));
        return realFetch(url, options);
    };
    try {
        for (const id of ["update-config-button", "save-config-button"]) {
            const node = button(id);
            await node.listeners.click({ currentTarget: node, target: node });
        }
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.equal(sent.length, 2, "both saves reached the server");
    for (const body of sent) {
        assert.ok(body.cheatConfig, "the settings are sent");
        assert.equal("gameRead" in body, false, "the read's gameRead isn't");
    }
});
