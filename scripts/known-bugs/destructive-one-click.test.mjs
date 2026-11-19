import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { KNOWN_BUGS, importRepo, loadUi, request } from "./index.mjs";

const require = createRequire(import.meta.url);
const TinyRouter = require("../../src/modules/server/tinyRouter");
const { setupCheatRoutes } = require("../../src/modules/server/routes/cheats");

test(
    "one click on 'wipe inv' in the Cheats list doesn't run it",
    { todo: KNOWN_BUGS.destructiveOneClick },
    async () => {
        const wipe = { value: "wipe inv", message: "Wipe your inventory" };
        const router = new TinyRouter();
        setupCheatRoutes(router, {
            callHelper: async () => ({ value: [wipe] }),
            executeCheat: async () => ({ value: { ok: true, message: "Inventory wiped" } }),
        });
        const { requests } = await loadUi(router);
        globalThis.confirm = () => false; // if the fix asks first, the player hasn't said yes yet

        const listed = (await request(router, "GET", "/api/cheats")).body;
        const { CheatItem } = await importRepo("src/ui/components/CheatItem.js");
        const button = CheatItem(listed[0] ?? wipe).childNodes[0];
        await button.listeners.click();

        const ran = requests.includes("POST /api/toggle");
        assert.ok(listed.length === 0 || !ran, "'wipe inv' is listed and one click ran it");
    }
);
