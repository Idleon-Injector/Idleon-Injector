// Each file runs in its own process, so the cheats the fake game registers here are a fresh copy.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeGame } from "../page-shots/fake-game.mjs";

test("suggestions are marked dangerous from the cheat they run, so the WebUI can ask first", async () => {
    const { runtime } = await createFakeGame();
    const { result } = await runtime.evaluate({ expression: "getAutoCompleteSuggestions()" });
    const dangerous = (value) => result.value.find((row) => row.value === value)?.dangerous === true;

    assert.ok(dangerous("wipe inv"), "a dangerous group's subcheat");
    assert.ok(dangerous("equipall"));
    assert.ok(
        result.value.some((row) => row.value.startsWith("bulk ") && row.dangerous),
        "a dangerous command's suggestion"
    );
    assert.ok(!dangerous("godlike reach"));
    assert.ok(!result.value.some((row) => row.value.startsWith("drop ") && row.dangerous), "drop is safe");
});
