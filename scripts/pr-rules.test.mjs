import { test } from "node:test";
import assert from "node:assert/strict";
import {
    checkPr,
    corePaths,
    githubApi,
    kindOfPath,
    linkedIssues,
    newCheatsAndHooks,
    readCorePaths,
} from "./pr-rules.mjs";

const core = readCorePaths();
const added = (path) => ({ path, status: "added" });
const modified = (path) => ({ path, status: "modified" });
const PAGE = "src/ui/pages/world-1/anvil/anvil.js";
const CHEAT = "src/cheats/cheats/wide.js";
const HOOK = "src/cheats/hooks/events012.js";
const AUTOMATION = "src/cheats/automations/sushi.js";
const noIssues = async () => null;
const check = (files, { body = "", issue = noIssues } = {}) => checkPr({ files, body, core, issue });

test("the core is read from .github/CODEOWNERS", () => {
    for (const p of ["src/cheats/core/", "scripts/", ".github/workflows/", "package.json", ".github/CODEOWNERS"])
        assert.ok(core.includes(p), p);
    assert.deepEqual(corePaths("# a comment\n\n/src/x/ @lumi\n/a.js @lumi\n"), ["src/x/", "a.js"]);
    assert.throws(() => corePaths("*.js @lumi"), /not \*\.js/);
});

test("each path gets its kind", () => {
    assert.equal(kindOfPath(PAGE, core), "page");
    assert.equal(kindOfPath(CHEAT, core), "game");
    assert.equal(kindOfPath(HOOK, core), "game");
    assert.equal(kindOfPath(AUTOMATION, core), "game");
    assert.equal(kindOfPath("src/cheats/core/hooks.js", core), "core");
    assert.equal(kindOfPath("scripts/page-shots/shoot.mjs", core), "core");
    assert.equal(kindOfPath("src/modules/autoUpdater.js", core), "core");
    assert.equal(kindOfPath("src/modules/autoUpdater.js.bak", core), "other");
    assert.equal(kindOfPath("docs/glossary.md", core), "other");
    assert.equal(kindOfPath("src/cheats/helpers/values.js", core), "other");
});

test("a PR of one kind passes and is named", async () => {
    assert.deepEqual(await check([modified(PAGE), modified("src/ui/pages/world-1/anvil/anvil.css")]), {
        kind: "a page",
        problems: [],
    });
    assert.equal((await check([modified(CHEAT), modified(HOOK), modified(AUTOMATION)])).kind, "game-side code");
    assert.equal(
        (await check([modified("package.json")])).kind,
        "only core files, which wait for the maintainer's review"
    );
    assert.equal((await check([modified("README.md")])).kind, "other files (docs and the like)");
    const withCore = await check([modified(PAGE), modified("scripts/rules/exceptions.json")]);
    assert.equal(withCore.kind, "a page, plus core files, which wait for the maintainer's review");
    assert.deepEqual(withCore.problems, []);
});

test("a PR with a page and game-side code fails and says to split it", async () => {
    const { kind, problems } = await check([modified(PAGE), modified(AUTOMATION)]);
    assert.equal(kind, "a page and game-side code mixed");
    assert.deepEqual(problems, [
        "This PR changes a page (`src/ui/pages/world-1/anvil/anvil.js`) and game-side code " +
            "(`src/cheats/automations/sushi.js`). A PR is either a page or game-side code, so split it into two PRs. " +
            'See "One kind per PR" in CONTRIBUTING.md.',
    ]);
    // A page renamed into the cheats folder is both.
    const moved = await check([{ path: "src/cheats/cheats/x.js", status: "renamed", previousPath: PAGE }]);
    assert.match(moved.problems[0], /split it/);
});

test("the rules don't ask who opened the PR: a maintainer's mixed PR with a new hook fails like anyone's", async () => {
    assert.equal(checkPr.length, 1, "one argument, and no author in it");
    const files = [modified(PAGE), added("src/cheats/hooks/new.js"), modified("scripts/rules/exceptions.json")];
    assert.equal((await check(files)).problems.length, 2);
});

test("issue links in the PR body", () => {
    assert.deepEqual(linkedIssues("Closes #12\nFixes #13, for #14 and (#15). See #12 again."), [12, 13, 14, 15]);
    assert.deepEqual(linkedIssues("For #7"), [7]);
    assert.deepEqual(linkedIssues("<!-- e.g. For #99 -->\na#1 &#2; https://x.dev/page#3 ##4"), []);
    assert.deepEqual(linkedIssues(null), []);
    assert.equal(linkedIssues(Array.from({ length: 30 }, (_, i) => `#${i + 1}`).join(" ")).length, 10);
});

test("only files added to cheats/ or hooks/ need an issue", () => {
    assert.deepEqual(
        newCheatsAndHooks([
            added("src/cheats/cheats/new.js"),
            added("src/cheats/hooks/new.js"),
            added("src/cheats/automations/new.js"),
            added(PAGE),
            modified(HOOK),
            { path: "src/cheats/hooks/b.js", status: "renamed", previousPath: "src/cheats/hooks/a.js" },
            { path: "src/cheats/cheats/c.js", status: "renamed", previousPath: "src/cheats/helpers/c.js" },
            { path: "src/cheats/hooks/d.js", status: "copied", previousPath: HOOK },
        ]),
        ["src/cheats/cheats/new.js", "src/cheats/hooks/new.js", "src/cheats/cheats/c.js"]
    );
});

test("a new cheat or hook needs a linked issue with the approved label", async () => {
    const files = [added("src/cheats/hooks/new.js")];
    const issues = {
        5: { labels: ["approved", "enhancement"], isPullRequest: false },
        6: { labels: ["enhancement"], isPullRequest: false },
        7: { labels: ["approved"], isPullRequest: true },
    };
    const issue = async (n) => issues[n] ?? null;

    const none = await check(files, { issue });
    assert.deepEqual(none.problems, [
        "This PR adds a new cheat or game hook (`src/cheats/hooks/new.js`). New ones need a feature request that the " +
            'maintainer approved first. Link that issue in the PR description, for example `For #12`. See "When to ' +
            'ask first" in CONTRIBUTING.md.',
    ]);
    const unapproved = await check(files, { issue, body: "For #6, also #7 and #8" });
    assert.deepEqual(unapproved.problems, [
        'This PR adds a new cheat or game hook (`src/cheats/hooks/new.js`), but no issue it links (#6, #7, #8) has the "approved" ' +
            "label yet. Wait for the maintainer to approve the feature request, then edit the PR description (any " +
            'small change) and this check runs again. See "When to ask first" in CONTRIBUTING.md.',
    ]);
    assert.deepEqual((await check(files, { issue, body: "Closes #6\nFor #5" })).problems, []);
    assert.deepEqual((await check([modified(HOOK)], { issue })).problems, [], "changing a hook needs no issue");
});

test("the API helper pages through lists and reads a 404 as null, without the network", async () => {
    const asked = [];
    const fetchImpl = async (url) => {
        asked.push(url);
        if (url.includes("/issues/404")) return { status: 404, ok: false };
        const page = Number(new URL(url).searchParams.get("page"));
        const count = page === 1 ? 100 : 3;
        return {
            status: 200,
            ok: true,
            json: async () => Array.from({ length: count }, (_, i) => ({ filename: `f${i}` })),
        };
    };
    const github = githubApi({ token: "t", repo: "o/r", fetchImpl });
    assert.equal((await github.files(9)).length, 103);
    assert.equal(asked[0], "https://api.github.com/repos/o/r/pulls/9/files?per_page=100&page=1");
    assert.equal(await github.issue(404), null);
});
