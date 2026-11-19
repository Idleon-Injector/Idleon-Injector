import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PR_TITLE, EXAMPLE } from "./pr-title.mjs";

const good = [
    EXAMPLE,
    "feat(cheats): add defineAutomation and move sushi auto play onto it",
    "refactor(ui): move world 1 pages into the menu",
    "chore(build): package releases on node 24",
    "test(rules): refuse the pre-3.0 ways of doing things",
    "docs(contributing): rewrite for 3.0",
    "fix(w7.sushi): keep the fuel when the slot is empty",
    "fix(cheats): answer every cheat with { ok, message }",
    "feat(ui): add `writeVerified` to the forge page",
];

const bad = [
    "",
    "Add Outposts tab and styles",
    "chore: point links at the new home",
    "fix(ui) restore sidebar",
    "fix(ui):restore sidebar",
    "fix(ui): Restore sidebar",
    "fix(ui): restore sidebar.",
    "fix(UI): restore sidebar",
    "fix(): restore sidebar",
    "fix(ui): ",
    "feature(ui): add a page",
    "refactror(ui): move pages",
    ":sparkles: feat: Event Wheel Cheat (#297)",
    "fix(ui): restore sidebar ",
];

test("the PR title rule accepts type(scope): description titles", () => {
    for (const title of good) assert.ok(PR_TITLE.test(title), title);
});

test("the PR title rule refuses titles that don't fit", () => {
    for (const title of bad) assert.ok(!PR_TITLE.test(title), title);
});

test("the workflow's script passes a good title and fails a bad one with the example", () => {
    const script = fileURLToPath(new URL("./pr-title.mjs", import.meta.url));
    execFileSync(process.execPath, [script], { env: { ...process.env, PR_TITLE: EXAMPLE } });
    assert.throws(
        () =>
            execFileSync(process.execPath, [script], { env: { ...process.env, PR_TITLE: "Fix stuff" }, stdio: "pipe" }),
        (err) => err.status === 1 && err.stderr.toString().includes(`Example: ${EXAMPLE}`)
    );
});
