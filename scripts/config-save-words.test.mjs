// Save settings writes config.custom.js and also sends the settings to the running game (docs/config.md), and the
// Config page says so where the player saves.
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
    const { TooltipContainer } = await importRepo("src/ui/components/Tooltip.js");
    const tooltip = TooltipContainer();
    const root = Config();

    await until(
        () =>
            text(root).includes(
                "Apply uses them for this session only; Save settings keeps them in your config file and sends them to the running game."
            ),
        "the help line above the cheat settings"
    );
    const save = elements(root).find((node) => node.attributes.id === "save-config-button");
    save.listeners.mouseenter({ target: save });
    await until(
        () => text(tooltip) === "Save to config file and send to the running game",
        "the Save settings tooltip"
    );
});
