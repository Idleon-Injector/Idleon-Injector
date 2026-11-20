// One line when the character in play changed: every page says CHARACTER_CHANGED (accountShared.js), and the game's
// own refusal (characterInPlay) says the same words. A page with its own wording for this case fails here.
// The same for no character in play (character select): NO_CHARACTER.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadUi, importRepo } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const { router } = await createFakeApi();
await loadUi(router);
const { CHARACTER_CHANGED, NO_CHARACTER } = await importRepo("src/ui/components/views/account/accountShared.js");

const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith(".js") ? [join(dir, entry.name)] : []
    );
// A quoted string that says the character (in play) changed, or that another one is in play.
const OWN_WORDING =
    /(["'`])[^"'`\n]*(character (in play )?changed|another character is in play|is in play now)[^"'`\n]*\1/i;

test("the line is Lumi's pick", () => {
    assert.equal(CHARACTER_CHANGED, "Character changed. Refresh.");
});

test("no page or game refusal says a changed character in its own words", () => {
    const found = [];
    for (const file of [...files(join(root, "src/ui")), ...files(join(root, "src/cheats"))]) {
        readFileSync(file, "utf8")
            .split("\n")
            .forEach((line, i) => {
                const match = line.match(OWN_WORDING);
                // The game can't import the WebUI's constant, so its refusal may hold the same words, exactly.
                if (match && match[0].slice(1, -1) !== CHARACTER_CHANGED)
                    found.push(`${relative(root, file)}:${i + 1}: ${match[0]}`);
            });
    }
    assert.deepEqual(found, [], "use CHARACTER_CHANGED from accountShared.js");
});

// A quoted string that says no character is in play, or asks to select one.
const OWN_NO_CHARACTER =
    /(["'`])[^"'`\n]*(\bno (active |live |selected )?(character|player)\b|select a character|without an? (active |selected )?character)[^"'`\n]*\1/i;

test("the no-character line is Lumi's pick", () => {
    assert.equal(NO_CHARACTER, "No character in play.");
});

test("no page or game refusal says no character is in play in its own words", () => {
    const found = [];
    for (const file of [...files(join(root, "src/ui")), ...files(join(root, "src/cheats"))]) {
        readFileSync(file, "utf8")
            .split("\n")
            .forEach((line, i) => {
                const match = line.match(OWN_NO_CHARACTER);
                // The game can't import the WebUI's constant, so its refusal may hold the same words, exactly.
                if (match && match[0].slice(1, -1) !== NO_CHARACTER)
                    found.push(`${relative(root, file)}:${i + 1}: ${match[0]}`);
            });
    }
    assert.deepEqual(found, [], "use NO_CHARACTER from accountShared.js");
});
