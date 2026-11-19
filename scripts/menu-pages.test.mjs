import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    AREAS,
    WORLDS,
    buildMenuTree,
    definePage,
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

test("search finds systems, tabs, extra words and areas by their old names", () => {
    const entries = searchEntries(
        buildMenuTree([
            page("w7.button", 7, "The Button", { keywords: ["Button"] }),
            page("w7.sushi.shop", 7, "Sushi Station", { tab: "Shop", keywords: ["Sushi shop"] }),
            page("w7.sushi.general", 7, "Sushi Station", { tab: "General" }),
            page("w2.kangaroo", 2, "Kangaroo", { keywords: ["Poppy"] }),
        ])
    );
    const top = (q) => searchMenu(entries, q)[0];

    assert.deepEqual(top("button").target, { world: 7, page: "w7.button" });
    assert.deepEqual(top("poppy"), { ...top("poppy"), label: "Kangaroo", matched: "Poppy" });
    assert.deepEqual(top("shop").target, { world: 7, page: "w7.sushi.shop" });
    assert.equal(top("shop").where, "World 7 › Sushi Station");
    assert.deepEqual(top("sushi").target, { world: 7, page: "w7.sushi.shop" }, "a system opens on its first page");
    assert.deepEqual(top("config").target, { view: "CONFIG" });
    assert.deepEqual(top("chromedebug").target, { view: "DEVTOOLS" });
    assert.deepEqual(top("account options").target, { view: "ACCOUNT" });
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
});
