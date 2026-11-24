import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { configDescriptions } from "../src/ui/config/configDescriptions.js";
import {
    AREAS,
    WORLDS,
    buildMenuTree,
    cheatSearchEntries,
    commandHint,
    definePage,
    isDangerousCommand,
    MOVED_PAGES,
    pageFolder,
    searchEntries,
    searchMenu,
} from "../src/ui/menu/menuModel.js";

const require = createRequire(import.meta.url);
const TinyRouter = require("../src/modules/server/tinyRouter");
const { createWebServer } = require("../src/modules/server/webServer");
const { listPageFiles, setupPageRoutes } = require("../src/modules/server/routes/pages");

const PAGES_DIR = fileURLToPath(new URL("../src/ui/pages/", import.meta.url));
const noop = () => null;

async function getPages(router) {
    const response = {
        json(value) {
            this.body = value;
        },
    };
    await router.routes.GET.get("/api/pages")({ url: "/api/pages", headers: { host: "localhost" } }, response);
    return response.body;
}

test("the pages route lists page modules and their stylesheets, and nothing else", async () => {
    const dir = mkdtempSync(join(tmpdir(), "menu-pages-"));
    try {
        for (const file of [
            "world-7/the-button/button.js",
            "world-7/sushi-station/shop.js",
            "world-7/sushi-station/shop.css",
            "world-7/sushi-station/notes.md",
            "world-7/sushi-station/data.json",
            "world-7/.hidden/secret.js",
            "world-7/.draft.js",
            "account/player/player.js",
        ]) {
            mkdirSync(join(dir, dirname(file)), { recursive: true });
            writeFileSync(join(dir, file), "");
        }
        const router = new TinyRouter();
        setupPageRoutes(router, dir);
        assert.deepEqual(await getPages(router), {
            modules: ["account/player/player.js", "world-7/sushi-station/shop.js", "world-7/the-button/button.js"],
            styles: ["world-7/sushi-station/shop.css"],
        });
        assert.deepEqual([...router.routes.POST.keys()], [], "the route is read-only");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("the web server serves the real pages folder only when the UI is on", async () => {
    assert.deepEqual(await getPages(createWebServer({ enableUI: true })), await listPageFiles(PAGES_DIR));
    assert.equal(createWebServer({ enableUI: false }).routes.GET.has("/api/pages"), false);
});

test("definePage refuses declarations the menu can't place", () => {
    const ok = { id: "w7.button", world: 7, system: "The Button", description: "x", component: noop };
    assert.equal(definePage(ok).id, "w7.button");
    assert.deepEqual(definePage(ok).keywords, []);
    assert.throws(() => definePage({ ...ok, world: 8 }), /unknown world/);
    assert.throws(() => definePage({ ...ok, id: "w6.button" }), /must start with "w7\."/);
    assert.throws(() => definePage({ ...ok, id: "button" }), /must start with/);
    assert.throws(() => definePage({ ...ok, system: "Button" }), /not a World 7 system/);
    assert.throws(() => definePage({ ...ok, description: " " }), /description/);
    assert.throws(() => definePage({ ...ok, component: "ButtonTab" }), /component/);
    assert.throws(() => definePage({ ...ok, keywords: "Button" }), /keywords/);
    assert.throws(() => definePage({ ...ok, tabs: "Press" }), /tabs must be/);
    assert.throws(() => definePage({ ...ok, tabs: [{ id: "press", label: " " }] }), /tabs must be/);
    assert.throws(() => definePage({ ...ok, tabs: [{ id: "press", label: "Press", keywords: "x" }] }), /tabs must be/);
    assert.equal(definePage({ ...ok, tabs: [{ id: "press", label: "Press" }] }).tabs[0].label, "Press");
    assert.equal(definePage({ ...ok, id: "account.player", world: "account", system: "Player" }).world, "account");
});

const page = (id, world, system, extra = {}) =>
    definePage({ id, world, system, description: `${system} page`, component: noop, ...extra });

test("the menu tree keeps every world in order and only systems that have pages, in game order", () => {
    const tree = buildMenuTree([
        page("w7.sushi.shop", 7, "Sushi Station", { tab: "Shop" }),
        page("w7.button", 7, "The Button"),
        page("w7.sushi.general", 7, "Sushi Station", { tab: "General" }),
        page("account.player", "account", "Player"),
    ]);
    assert.deepEqual(
        tree.map((world) => world.code),
        WORLDS.map((world) => world.code)
    );
    const w7 = tree.find((world) => world.id === 7);
    assert.deepEqual(
        w7.systems.map((system) => system.name),
        ["The Button", "Sushi Station"]
    );
    assert.deepEqual(
        w7.systems[1].pages.map((p) => p.tab),
        ["Shop", "General"],
        "pages keep the order they were given"
    );
    assert.equal(tree.find((world) => world.id === 1).systems.length, 0);
    assert.throws(() => buildMenuTree([page("w7.button", 7, "The Button"), page("w7.button", 7, "The Button")]));
});

test("a page's own tabs are found by name and words, and open the page on that tab", () => {
    const page = definePage({
        id: "w7.button",
        world: 7,
        system: "The Button",
        description: "x",
        component: noop,
        tabs: [{ id: "press", label: "Press", keywords: ["Smash"] }],
    });
    const hit = searchMenu(searchEntries(buildMenuTree([page])), "smash")[0];
    assert.equal(hit.label, "Press");
    assert.deepEqual(hit.target, { world: 7, page: "w7.button", tab: "press" });
});

test("search finds systems, tabs, extra words and areas by their old names", () => {
    const entries = searchEntries(
        buildMenuTree([
            page("w7.button", 7, "The Button", { keywords: ["Button"] }),
            page("w7.sushi.shop", 7, "Sushi Station", { tab: "Shop", keywords: ["Sushi shop"] }),
            page("w7.sushi.general", 7, "Sushi Station", { tab: "General" }),
            page("account.orion", "account", "Clickers", { tab: "Orion", keywords: ["Owl"] }),
            page("account.poppy", "account", "Clickers", { tab: "Poppy", keywords: ["Kangaroo"] }),
        ])
    );
    const top = (q) => searchMenu(entries, q)[0];

    assert.deepEqual(top("button").target, { world: 7, page: "w7.button" });
    assert.deepEqual(top("kangaroo"), { ...top("kangaroo"), label: "Poppy", matched: "Kangaroo" });
    assert.deepEqual(top("owl"), { ...top("owl"), label: "Orion", matched: "Owl" });
    assert.equal(top("owl").where, "Account › Clickers");
    assert.deepEqual(top("shop").target, { world: 7, page: "w7.sushi.shop" });
    assert.equal(top("shop").where, "World 7 › Sushi Station");
    assert.deepEqual(top("sushi").target, { world: 7, page: "w7.sushi.shop" }, "a system opens on its first page");
    assert.deepEqual(top("config").target, { view: "CONFIG" });
    assert.deepEqual(top("chromedebug").target, { view: "DEVTOOLS" });
    assert.deepEqual(top("account options").target, { view: "ACCOUNT_OPTIONS" });
    assert.deepEqual(top("w1").target, { world: 1, page: null });
    assert.deepEqual(top("equinox valley").target, { world: 7, page: null });
    assert.equal(top("button page").label, "The Button", "descriptions match last");
    assert.deepEqual(searchMenu(entries, "   "), []);
    assert.deepEqual(searchMenu(entries, "zzzz"), []);
    assert.ok(searchMenu(entries, "e").length <= 8, "at most 8 results");
    assert.ok(AREAS.every((area) => area.view || area.tabs.length));
});

async function collectPageModules(dir) {
    const { readdir } = await import("node:fs/promises");
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await collectPageModules(path)));
        else if (entry.name.endsWith(".js")) files.push(path);
    }
    return files;
}

test("every module under src/ui/pages declares a page in its world and system folder, with a unique id", async () => {
    const files = await collectPageModules(PAGES_DIR);
    assert.ok(files.length > 0, "the example page exists");
    const pages = [];
    for (const file of files) {
        const rel = relative(PAGES_DIR, file).split("\\").join("/");
        const { default: declared } = await import(pathToFileURL(file).href);
        assert.ok(declared && typeof declared.component === "function", `${rel} must export default definePage({...})`);
        assert.equal(dirname(rel), pageFolder(declared), `${rel} must live in ${pageFolder(declared)}/`);
        pages.push(declared);
    }
    assert.doesNotThrow(() => buildMenuTree(pages), "page ids are unique");
    // A remembered place or History entry from before #249 finds the page where it is now.
    const ids = new Set(pages.map((page) => page.id));
    for (const [old, now] of Object.entries(MOVED_PAGES)) {
        assert.ok(ids.has(now), `${old} moved to ${now}, which must exist`);
        assert.ok(!ids.has(old), `${old} moved, so no page keeps its id`);
    }
});

test("search finds a moved automation page by its old words, under the Automation section", () => {
    const tree = buildMenuTree([
        page("w2.bubbles", 2, "Alchemy", { tab: "Bubbles" }),
        page("w2.vials", 2, "Alchemy", { tab: "Vials" }),
        page("automation.alchemy", "automation", "Alchemy", { keywords: ["Bubbles"] }),
    ]);
    const hit = searchMenu(searchEntries(tree), "bubble automation")[0];
    assert.equal(hit.where, "Automation");
    assert.deepEqual(hit.target, { world: "automation", page: "automation.alchemy" });
    assert.equal(searchMenu(searchEntries(tree), "automation")[0].label, "Automation", "the section itself first");
});

// Rows as GET /api/cheats returns them (copied from the fake game's list).
const CHEATS = [
    { value: "godlike", message: "all godlike powers", category: "godlike" },
    { value: "godlike reach", message: "reach set to 666", category: "godlike" },
    { value: "godlike respawn", message: "instant mob respawn", category: "godlike" },
    { value: "godlike hp", message: "never lose hp, become invincible (when active)", category: "godlike" },
    { value: "w1", message: "all w1 cheats", category: "w1" },
    { value: "w1 forge", message: "forge speed and capacity multiplier check config", category: "w1" },
    { value: "w1 stampcost", message: "stamp cost reduction multiplier check config", category: "w1" },
    { value: "lvl stamp", message: "Change all stamp levels", category: "lvl", needsParam: true, dangerous: true },
    { value: "godlike speed", message: "weapon super speed (default 9)", category: "godlike", needsParam: true },
    { value: "wide", message: "all account-wide cheats", category: "wide" },
    { value: "wide candy", message: "candy use everywhere", category: "wide" },
    { value: "wipe inv", message: "Wipe your inventory", category: "wipe", dangerous: true },
    { value: "drop Timecandy1", message: "24 Hr Time Candy", category: "drop", needsParam: true },
    { value: "nomore Timecandy1", message: "24 Hr Time Candy", category: "nomore" },
    { value: "drop Timecandy2", message: "72 Hr Time Candy", category: "drop", needsParam: true },
    { value: "drop Copper", message: "Copper Ore", category: "drop", needsParam: true },
    { value: "class mossy_fang", message: "Change to Mossy_Fang (ID: 1)", category: "class", dangerous: true },
];

test("search finds cheats and their settings after the menu's own places, and inner tabs by name", async () => {
    const pages = [];
    for (const file of await collectPageModules(PAGES_DIR))
        pages.push((await import(pathToFileURL(file).href)).default);
    const entries = [...searchEntries(buildMenuTree(pages)), ...cheatSearchEntries(CHEATS, configDescriptions)];
    const search = (q) => searchMenu(entries, q);

    const godlike = search("godlike");
    assert.deepEqual(godlike[0].target, { view: "CHEATS", cheat: "godlike" });
    assert.equal(godlike[0].where, "Cheat · Cheats › Godlike");
    assert.ok(godlike.some((hit) => hit.label === "godlike reach"));
    assert.deepEqual(search("godlike reach")[0].target, { view: "CHEATS", cheat: "godlike reach" });

    const stampcost = search("stampcost");
    assert.deepEqual(
        stampcost.map((hit) => [hit.label, hit.where]),
        [
            ["w1 stampcost", "Cheat · Cheats › W1"],
            ["stampcost", "Setting · w1 stampcost"],
        ]
    );
    assert.deepEqual(stampcost[1].target, {
        view: "CHEATS",
        cheat: "w1 stampcost",
        setting: "cheatConfig.w1.stampcost",
    });
    assert.deepEqual(
        search("capacity").find((hit) => hit.kind === "Setting").target,
        { view: "CHEATS", cheat: "w1 forge", setting: "cheatConfig.w1.forge.capacity" },
        "a setting opens the cheat whose gear shows it"
    );
    assert.equal(search("invincible")[0].label, "godlike hp", "a cheat is found by its description words");
    assert.equal(search("invincible")[0].matched, "invincible");
    assert.ok(!entries.some((entry) => entry.kind && /unban|maxval/.test(entry.label)), "core settings stay out");

    const stamps = search("stamps");
    assert.equal(stamps[0].label, "Stamps", "the page beats a cheat or setting with the same word");
    assert.deepEqual(stamps[0].target, { world: 1, page: "w1.stamps" });
    assert.ok(
        stamps.some((hit) => hit.kind === "Setting" && hit.label === "stampcost"),
        "then the stamp settings"
    );
    assert.ok(
        stamps.some((hit) => hit.label === "w1 stampcost") && stamps.some((hit) => hit.command === "lvl stamp"),
        "and the stamp cheats"
    );
    const stamp = search("stamp");
    assert.ok(stamp.findIndex((hit) => hit.kind) > stamp.findIndex((hit) => hit.label === "Stamps"));
    assert.ok(stamp.some((hit) => hit.label === "w1 stampcost") && stamp.some((hit) => hit.command === "lvl stamp"));

    for (const [q, system] of [
        ["combat", "Stamps"],
        ["skills", "Stamps"],
        ["misc", "Stamps"],
        ["unlocks", "Menagerie"],
        ["cells", "Jelly Operator"],
        ["units", "Outposts"],
    ]) {
        assert.equal(search(q)[0].label, system, `"${q}" (an inner tab) finds ${system}`);
    }
    // A page's own tab comes before an inner tab of the same name.
    assert.deepEqual(
        search("overview")
            .slice(0, 2)
            .map(({ label }) => label),
        ["Overview", "Menagerie"]
    );
    assert.ok(search("e").length <= 8, "at most 8 results");
});

test("search finds the terminal's commands after cheats, by item name, and knows which need a second Enter", () => {
    const pages = [page("w1.stamps", 1, "Stamps", { keywords: ["Combat"] })];
    const entries = [...searchEntries(buildMenuTree(pages)), ...cheatSearchEntries(CHEATS, configDescriptions)];
    const search = (q) => searchMenu(entries, q);

    const candy = search("candy");
    assert.deepEqual(
        candy.map((hit) => [hit.kind, hit.label, hit.where]),
        [
            ["Cheat", "wide candy", "Cheat · Cheats › Wide"],
            ["Cheat", "drop · 24 Hr Time Candy", "Cheat · Cheats › Drop"],
            ["Cheat", "drop · 72 Hr Time Candy", "Cheat · Cheats › Drop"],
            ["Cheat", "nomore · 24 Hr Time Candy", "Cheat · Cheats › Nomore"],
        ],
        "cheats first, then the items by name, every drop before every nomore"
    );
    // An item opens its command's one row with the item in its field (#23), not the command box.
    assert.deepEqual(candy[1].target, { view: "CHEATS", cheat: "drop", fill: "24 Hr Time Candy" });
    assert.equal(search("drop candy")[0].command, "drop Timecandy1", "every word, like the terminal");
    assert.equal(search("timecandy1")[0].command, "drop Timecandy1", "and by the command itself");
    assert.equal(search("stamp")[0].label, "Stamps", "pages still come first");

    const speed = search("godlike speed")[0];
    assert.deepEqual(
        [speed.kind, speed.where],
        ["Command", "Command · Cheats › Godlike"],
        "a cheat that needs a value"
    );
    assert.equal(search("godlike reach").filter((hit) => hit.command === "godlike reach").length, 1, "no duplicates");
    assert.equal(search("godlike reach")[0].kind, "Cheat", "a bare cheat still opens its row");

    assert.equal(isDangerousCommand("wipe inv", CHEATS), true);
    assert.equal(isDangerousCommand("  wipe   inv ", CHEATS), true);
    assert.equal(isDangerousCommand("lvl stamp 50", CHEATS), true, "the row it starts with");
    assert.equal(isDangerousCommand("class someone_new", CHEATS), true, "a command whose every suggestion is");
    assert.equal(isDangerousCommand("drop Timecandy1 5", CHEATS), false);
    assert.equal(isDangerousCommand("godlike reach", CHEATS), false);
    assert.equal(isDangerousCommand("nothing here", CHEATS), false);
    assert.equal(commandHint("drop Timecandy1"), "Amount optional");
    assert.equal(commandHint("godlike speed"), "");
});

// In-game check: "multiply damage" listed "w3 towerdamage" first (its description has both words), so Enter ran it.
test("a name with every typed word ranks above one that has only some of them", () => {
    // As GET /api/cheats has them: "w3" and "godlike" have their own rows, "multiply" (registerParent: false) doesn't.
    const cheats = [
        { value: "w3", message: "all w3 cheats", category: "w3" },
        { value: "w3 towerdamage", message: "multiply tower damage (see config)", category: "w3" },
        { value: "godlike", message: "all godlike powers", category: "godlike" },
        {
            value: "multiply damage",
            message: "Multiplies damage by the number given (use reasonably!)",
            category: "multiply",
            needsParam: true,
        },
        { value: "godlike crit", message: "100% crit chance, damage stays", category: "godlike" },
    ];
    const entries = cheatSearchEntries(cheats, {});
    const top = (q) => searchMenu(entries, q)[0].command;
    assert.equal(top("multiply damage"), "multiply damage");
    assert.equal(top("damage multiply"), "multiply damage", "in any order");
    assert.equal(top("multiply dam"), "multiply damage", "while it's typed");
    assert.equal(top("tower damage"), "w3 towerdamage", "a name match still wins for the other cheat");
});

// #216: a past limited gem shop item is found on its own system's page by the shop's words and its own name.
test("search finds the Equinox penguins by their names and the limited shop's words", async () => {
    const pages = [];
    for (const file of await collectPageModules(PAGES_DIR))
        pages.push((await import(pathToFileURL(file).href)).default);
    const entries = searchEntries(buildMenuTree(pages));
    for (const words of ["penguin", "pengy", "pingy", "limited", "gem shop", "fomo"]) {
        assert.ok(
            searchMenu(entries, words).some((hit) => hit.target.page === "w3.equinox"),
            `"${words}" finds Equinox`
        );
    }
});

test("search finds the Exalted Stamp uses on Stamps by their name and the limited shop's words", async () => {
    const pages = [];
    for (const file of await collectPageModules(PAGES_DIR))
        pages.push((await import(pathToFileURL(file).href)).default);
    const entries = searchEntries(buildMenuTree(pages));
    for (const words of ["exalted stamp uses", "limited", "gem shop", "fomo"]) {
        assert.ok(
            searchMenu(entries, words).some((hit) => hit.target.page === "w1.stamps"),
            `"${words}" finds Stamps`
        );
    }
});
