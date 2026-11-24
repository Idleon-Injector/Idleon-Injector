// The Cheats area's nine groups and the system pages' own cheats (#23): every cheat is in one place, and the old
// `w5 collider` still runs the renamed `w3 collider`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { captureLogger, importRepo, loadCommonJs, loadGame, useInstallDir } from "./known-bugs/index.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

const game = await loadGame();
const { cheats } = await importRepo("src/cheats/core/registration.js");
const { cheatState } = await importRepo("src/cheats/core/state.js");
const { PAGE_CHEATS, PAGE_RUNS, isPageCheat, cheatsOfPage } = await importRepo("src/ui/menu/pageCheats.js");
const { CATEGORY_ORDER } = await importRepo("src/ui/state/constants.js");
const { WORLDS } = await importRepo("src/ui/menu/menuModel.js");

const commands = Object.keys(cheats);

test("every page cheat is a real command", () => {
    for (const rows of Object.values(PAGE_CHEATS))
        for (const { cheat } of rows) assert.ok(commands.includes(cheat), `${cheat} is not a cheat`);
    for (const command of Object.keys(PAGE_RUNS))
        assert.ok(
            commands.some((name) => name === command || name.startsWith(`${command} `)),
            `${command} is not a cheat`
        );
});

test("every other cheat is in one of the nine groups", () => {
    const loose = commands.filter((name) => !isPageCheat(name) && !CATEGORY_ORDER.includes(cheats[name].category));
    assert.deepEqual(loose, []);
});

test("every page cheat names a real system, and a tab that system has", () => {
    const pageFiles = (dir) =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
            entry.isDirectory()
                ? pageFiles(join(dir, entry.name))
                : entry.name.endsWith(".js")
                  ? [readFileSync(join(dir, entry.name), "utf8")]
                  : []
        );
    const sources = pageFiles(join(root, "src/ui/pages"));
    for (const [key, rows] of Object.entries(PAGE_CHEATS)) {
        const [worldId, system] = key.split(":");
        const world = WORLDS.find((w) => String(w.id) === worldId);
        assert.ok(world?.systems.includes(system), `${key} is not a system`);
        for (const { cheat, tab } of rows) {
            if (!tab) continue;
            const has = sources.some(
                (source) => source.includes(`system: "${system}"`) && source.includes(`tab: "${tab}"`)
            );
            assert.ok(has, `${cheat}: ${system} has no "${tab}" tab`);
        }
    }
});

test("a tabbed page shows its own tab's cheats and the ones for every tab", () => {
    const arena = cheatsOfPage({ world: 4, system: "Breeding", tab: "Arena" }).map((row) => row.cheat);
    assert.deepEqual(arena, ["w4 arena", "w4 superpets"]);
    assert.deepEqual(cheatsOfPage({ world: 1, system: "Statues" }), []);
});

test("the Cheats area leaves out what a page has, suggestions included", () => {
    assert.equal(isPageCheat("w4 chips"), true);
    assert.equal(isPageCheat("w4 chips Copper 5"), true);
    assert.equal(isPageCheat("automation bubbles"), true);
    assert.equal(isPageCheat("buy GemPack1"), true);
    assert.equal(isPageCheat("wide"), false);
    assert.equal(isPageCheat("wide candy"), false);
    assert.equal(isPageCheat("w4"), false);
});

test("w5 collider still runs the Atom Collider cheat, now w3 collider", async () => {
    assert.ok(commands.includes("w3 collider"));
    assert.ok(!commands.includes("w5 collider"));
    const result = await game.cheat("w5 collider", true);
    assert.equal(result.ok, true, result.message);
    assert.equal(cheatState.w3.collider, true);
    await game.cheat("w3 collider", false);
    assert.equal(cheatState.w3.collider, false);
});

test("collider settings saved under w5 before the rename load under w3", (t) => {
    useInstallDir(t, {
        cheatConfig: { w3: { collider: { AtomCost: 0, AtomBonuses: 1 } }, w5: { sailing: {} } },
        custom: "exports.cheatConfig = { w5: { collider: { AtomCost: 7 } } };",
    });
    const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": captureLogger() });
    config.loadConfiguration();
    const cheatConfig = config.getCheatConfig();
    assert.deepEqual(cheatConfig.w3.collider, { AtomCost: 7, AtomBonuses: 1 });
    assert.equal(cheatConfig.w5.collider, undefined);
});
