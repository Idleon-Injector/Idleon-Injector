// The Cheats area's nine groups and the system pages' own cheats (#23): every cheat is in one place, and the old
// `w5 collider` still runs the renamed `w3 collider`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { captureLogger, importRepo, loadCommonJs, loadGame, useInstallDir } from "./known-bugs/index.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

const game = await loadGame();
const { cheats } = await importRepo("src/cheats/core/registration.js");
const { cheatState } = await importRepo("src/cheats/core/state.js");
const { PAGE_CHEATS, PAGE_RUNS, isPageCheat, cheatsOfPage } = await importRepo("src/ui/menu/pageCheats.js");
const { CATEGORY_ORDER } = await importRepo("src/ui/state/constants.js");
const { WORLDS, buildMenuTree, cheatSearchEntries, searchMenu } = await importRepo("src/ui/menu/menuModel.js");

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

test("search finds a cheat by its old name and opens its page, with no group switch in the list", () => {
    const tree = buildMenuTree([
        {
            id: "w3.atomcollider",
            world: 3,
            system: "Atom Collider",
            description: "Atoms.",
            keywords: [],
            component: () => null,
        },
    ]);
    const entries = cheatSearchEntries(
        [{ value: "w3 collider", message: "collider cheats", category: "Tools", toggle: true }],
        {},
        tree
    );
    const hit = searchMenu(entries, "w5 collider")[0];
    assert.equal(hit?.command, "w3 collider");
    assert.deepEqual(hit.target, { world: 3, page: "w3.atomcollider", cheat: "w3 collider" });
});

test("a family switch is gone: typed, it says where its cheats are", async () => {
    for (const name of ["w4", "wide", "godlike", "unlock", "upstones"]) {
        assert.ok(!commands.includes(name), `${name} is still a command`);
        const result = await game.cheat(name);
        assert.equal(result.ok, false);
        assert.ok(result.message.startsWith(`${name} is gone. Its cheats are `), result.message);
    }
    assert.equal((await game.cheat("w4")).message, "w4 is gone. Its cheats are on the World 4 pages.");
    assert.ok(commands.includes("minigame"), "minigame is its own cheat (unlimited minigames), not a family switch");
});

test("a startup list with a family switch gets its cheats instead, once, and the file keeps them", async (t) => {
    const dir = useInstallDir(t, {
        custom: 'exports.startupCheats = ["w4", "w4 eggcap", "godlike reach", "w5"];',
    });
    const config = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": captureLogger() });
    config.loadConfiguration();
    const list = config.getStartupCheats();
    assert.ok(!list.includes("w4") && !list.includes("w5"));
    assert.ok(list.includes("w4 eggcap") && list.includes("w4 arena") && list.includes("godlike reach"));
    assert.ok(list.includes("w3 collider"), "w5 turned the collider on when it was w5 collider");
    assert.equal(new Set(list).size, list.length, "each cheat once, so a startup toggle isn't flipped back");
    await config.startupMigrationDone();
    const saved = readFileSync(join(dir, "config.custom.js"), "utf8");
    assert.ok(!/"w4"/.test(saved) && /"w4 eggcap"/.test(saved));

    // The next start reads the file as it is now: nothing to replace.
    for (const key of Object.keys(require.cache)) if (key.endsWith("config.custom.js")) delete require.cache[key];
    const again = loadCommonJs("src/modules/config/configManager.js", { "../utils/logger": captureLogger() });
    again.loadConfiguration();
    assert.equal(again.startupMigrationDone(), null);
    assert.deepEqual(again.getStartupCheats(), list);
});

test("the family snapshot names only cheats that still exist", () => {
    const groups = loadCommonJs("src/modules/config/removedGroups.js");
    for (const [group, list] of Object.entries(groups))
        for (const command of list) assert.ok(commands.includes(command), `${group}: ${command} is not a cheat`);
});

test("a command that takes a value from a list is one row: names, codes, and search opening it with the value", async () => {
    const { VALUE_COMMANDS, valueCommandOf, valueOf, valuesOf, codeOf } =
        await importRepo("src/ui/menu/valueCommands.js");
    assert.equal(valueCommandOf("spawn rift2"), "spawn");
    assert.equal(valueCommandOf("w4 chips all"), "w4 chips");
    assert.equal(valueCommandOf("spawnx"), "");
    const name = (command, value, message) => valueOf(command, { value, message }).name;
    assert.equal(
        name("buy", "buy bun_c", "Starter Pack (One Time Use, does not provide gems and pets)"),
        "Starter Pack"
    );
    assert.equal(name("class", "class beginner", "Change to BEGINNER (ID: 1)"), "BEGINNER");
    assert.equal(name("lvl", "lvl mining", "Change Mining level"), "Mining");
    assert.equal(name("w4 chips", "w4 chips grounded_nanochip", "+{%_Total_Defence"), "grounded nanochip");
    assert.equal(name("keychain", "keychain acc", ""), "acc");

    const values = valuesOf("spawn", [
        { value: "spawn mob1", message: "Mossy Pebble" },
        { value: "spawn rift2", message: "Rift Slug" },
        { value: "drop Copper", message: "Copper Ore" },
    ]);
    assert.deepEqual(values, [
        { code: "mob1", name: "Mossy Pebble" },
        { code: "rift2", name: "Rift Slug" },
    ]);
    assert.equal(codeOf("rift slug", values), "rift2", "by name, any case");
    assert.equal(codeOf(" RIFT2 ", values), "rift2", "by code");
    assert.equal(codeOf("Not a thing", values), null);
    assert.ok(VALUE_COMMANDS.nomore.anyText, "nomore takes a pattern too");

    const tree = buildMenuTree([
        {
            id: "w4.lab.chips",
            world: 4,
            system: "Laboratory",
            tab: "Chips",
            description: "Chips.",
            keywords: [],
            component: () => null,
        },
    ]);
    const entries = cheatSearchEntries(
        [
            { value: "spawn rift2", message: "Rift Slug", needsParam: true, category: "Combat" },
            { value: "w4 chips all", message: "Set amount for all lab chips", needsParam: true, category: "w4" },
        ],
        {},
        tree
    );
    const slug = searchMenu(entries, "Rift Slug")[0];
    assert.equal(slug.kind, "Cheat", "opens the row, not the command box");
    assert.deepEqual(slug.target, { view: "CHEATS", cheat: "spawn", fill: "Rift Slug" });
    const chips = entries.find((entry) => entry.command === "w4 chips all");
    assert.deepEqual(chips.target, { world: 4, page: "w4.lab.chips", cheat: "w4 chips", fill: "all" });
});
