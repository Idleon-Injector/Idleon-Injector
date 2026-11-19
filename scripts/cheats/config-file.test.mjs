// config.js and the WebUI's setting descriptions are generated from the defineCheat rows and the core settings
// (scripts/config-file.mjs, #16); nobody edits them by hand.
import assert from "node:assert/strict";
import { copyFileSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { CONFIG_PATH, DESCRIPTIONS_PATH, generate } from "../config-file.mjs";
import { captureLogger, loadCommonJs, requireFresh, useInstallDir } from "../known-bugs/index.mjs";

const generated = await generate();

test("the committed config.js and descriptions are what the rows generate", () => {
    for (const [file, text] of Object.entries(generated)) {
        const committed = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
        assert.ok(committed === text, `${relative(process.cwd(), file)} is out of date: run npm run config:generate`);
    }
});

test("every setting in config.js has a description", async () => {
    const config = requireFresh(CONFIG_PATH);
    const { configDescriptions } = await import(pathToFileURL(DESCRIPTIONS_PATH).href);
    const settings = (tree, prefix) =>
        Object.entries(tree).flatMap(([name, value]) =>
            value && typeof value === "object" && !Array.isArray(value)
                ? settings(value, `${prefix}.${name}`)
                : [`${prefix}.${name}`]
        );
    const all = [...settings(config.cheatConfig, "cheatConfig"), ...settings(config.injectorConfig, "injectorConfig")];
    assert.ok(all.length > 450, `only ${all.length} settings found`);
    assert.deepEqual(
        all.filter((path) => !configDescriptions[path]),
        [],
        "settings without a description"
    );
});

test("config.custom.js still overrides the generated defaults", (t) => {
    const custom = `exports.cheatConfig = { w1: { anvil: { productionspeed: (t) => t * 8 } }, wide: { autoloot: { zenithfarm: true } } };
exports.injectorConfig = { webPort: 9090 };
exports.startupCheats = ["godlike reach"];`;
    const dir = useInstallDir(t, { custom });
    copyFileSync(CONFIG_PATH, join(dir, "config.js"));
    const { loadConfiguration } = loadCommonJs("src/modules/config/configManager.js", {
        "../utils/logger": captureLogger(),
    });
    const { cheatConfig, injectorConfig, startupCheats } = loadConfiguration();

    assert.equal(cheatConfig.w1.anvil.productionspeed(2), 16, "the custom formula");
    assert.equal(cheatConfig.w1.forge.speed(2), 8, "a default next to it");
    assert.equal(cheatConfig.wide.autoloot.zenithfarm, true);
    assert.equal(cheatConfig.wide.autoloot.itemstochest, true);
    assert.equal(injectorConfig.webPort, 9090);
    assert.equal(injectorConfig.target, "web");
    assert.deepEqual(startupCheats, ["godlike reach"]);
});
