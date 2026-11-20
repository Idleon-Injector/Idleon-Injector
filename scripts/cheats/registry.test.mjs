// Every cheat the cheat files declare with defineCheat (#16), checked as a whole against the fake game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

const game = await loadGame();
const { cheatRows, cheats } = await importRepo("src/cheats/core/registration.js");

/** The commands a row declares, as [command, row], walking subcheats the way registration does. */
const commands = (row, parents = []) => [
    ...(row.registerParent === false ? [] : [[[...parents, row.name].join(" "), row]]),
    ...(row.subcheats ?? []).flatMap((sub) => commands(sub, [...parents, row.name])),
];
const declared = cheatRows.flatMap((row) => commands(row));
const toggles = declared.filter(([, row]) => !("fn" in row));

test("no two cheats share a name, and every command comes from a row", () => {
    const names = declared.map(([name]) => name);
    assert.deepEqual(
        names.filter((name, i) => names.indexOf(name) !== i),
        [],
        "a second row with the same name silently replaces the first"
    );
    assert.deepEqual(Object.keys(cheats).sort(), [...names].sort());
});

test("every toggle turns on, off and flips without throwing", async () => {
    assert.ok(toggles.length > 150, `only ${toggles.length} toggles found`);
    for (const [name] of toggles) {
        for (const [on, answer] of [
            [true, /^Activated /],
            [false, /^Deactivated /],
            [undefined, /^Activated /],
            [undefined, /^Deactivated /],
        ]) {
            const result = await game.cheat(name, on);
            assert.equal(result.ok, true, `${name} (${on}): ${result.message}`);
            assert.match(result.message, answer, `${name} (${on})`);
        }
    }
});

test("every command answers { ok, message }", async () => {
    for (const [name] of declared) {
        if (name === "w7 sushitools") continue; // starts the Sushi automation loop
        const result = await game.cheat(name);
        assert.equal(typeof result.ok, "boolean", name);
        assert.equal(typeof result.message, "string", name);
    }
});

test("errors come back as ok: false", async () => {
    for (const [name, row] of toggles) {
        const result = await game.cheat(`${name} notavalue`);
        assert.equal(result.ok, false, `${name} took a word that isn't a value: ${result.message}`);
        if (row.configurable) assert.equal(result.message, "Invalid value. Must be a number or boolean.");
    }
    assert.deepEqual(await game.cheat("nosuchcheat"), { ok: false, message: "nosuchcheat is not a valid option." });
    // A command that throws: the player gets the reason, not a stack.
    assert.deepEqual(await game.cheat("class"), {
        ok: false,
        message: "Cannot read properties of undefined (reading 'toLowerCase')",
    });
});

test("dangerous rows mark their commands, subcheats included", () => {
    for (const name of [
        "chng",
        "class",
        "lvl",
        "bulk",
        "equipall",
        "wipe inv",
        "wipe exp",
        "egga",
        "eggk",
        "wide perfectequipped",
    ])
        assert.equal(cheats[name].dangerous, true, name);
    for (const name of ["drop", "godlike reach", "fix_magnifier"])
        assert.equal(cheats[name].dangerous, undefined, name);
});
