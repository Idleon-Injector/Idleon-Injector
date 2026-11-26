import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { importRepo, loadUi, request } from "./index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { setupCheatRoutes } = require("../../src/modules/server/routes/cheats");

test("one click on 'wipe inv' in the Cheats list doesn't run it", async () => {
    const wipe = { value: "wipe inv", message: "Wipe your inventory", category: "Dangerous", dangerous: true };
    const router = new TinyRouter();
    setupCheatRoutes(router, {
        callHelper: async () => ({ value: [wipe] }),
        executeCheat: async () => ({ value: { ok: true, message: "Inventory wiped" } }),
    });
    const { store, requests } = await loadUi(router);
    globalThis.confirm = () => false; // if the fix asks first, the player hasn't said yes yet

    const listed = (await request(router, "GET", "/api/cheats")).body;
    store.data.cheats = listed;
    const { cheatGroups } = await importRepo("src/ui/components/views/Cheats.js");
    const { CheatRow } = await importRepo("src/ui/components/SystemCheats.js");
    const { default: van } = await importRepo("src/ui/vendor/van-1.6.0.js");
    const [row] = cheatGroups(listed).flatMap(([, rows]) => rows);
    const el = CheatRow(row ?? wipe, { openId: van.state(null), config: van.state(null) });
    const button = el.querySelector(".system-cheats__run");
    await button.listeners.click({ currentTarget: button });

    const ran = requests.includes("POST /api/toggle");
    assert.ok(listed.length === 0 || !ran, "'wipe inv' is listed and one click ran it");
});
