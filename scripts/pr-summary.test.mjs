import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCorePaths } from "./pr-rules.mjs";
import {
    LIMITS,
    MARKER,
    hookChanges,
    layoutGate,
    layoutOf,
    pageIds,
    parseNameStatus,
    post,
    renderComment,
    summaryData,
    validateSummary,
} from "./pr-summary.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const SHA = "a".repeat(40);
const RUN = {
    id: 77,
    head_sha: SHA,
    head_repository: { full_name: "someone/Idleon-Injector" },
    pull_requests: [],
    html_url: "https://github.com/o/r/actions/runs/77",
};

// A fixture diff: a page and its css changed, one hook file changed, one added.
const BASE = {
    "src/cheats/hooks/events012.js": [
        `defineHook({ id: "godlike.crit", target: () => events(12), method: "_customBlock_CritChance" }, (b) => b);`,
        `defineHook({ id: "godlike.reach", target: () => events(12), method: "_customBlock_PlayerReach" }, (b) => b);`,
        `defineHook({ id: "w1.forge", target: () => events(12), method: "_customBlock_ForgeStats" }, (b) => b);`,
    ].join("\n"),
};
const HEAD = {
    "src/cheats/hooks/events012.js": [
        `defineHook({ id: "godlike.crit", target: () => events(12), method: "_customBlock_CritChance" }, (b) => b);`,
        `defineHook({ id: "godlike.reach", target: () => events(12), method: "_customBlock_PlayerReach" }, (b) => 666);`,
        `defineHook({ id: "w4.labpx, w2.sigilspeed", target: () => events(345), method: "_customBlock_Labb" }, (b) => b);`,
    ].join("\n"),
    "src/cheats/hooks/clist.js": `defineHook({ id: "w3.saltlick", targets: () => x, property: 2 }, (s) => s);`,
};
const ANVIL = `export default definePage({\n    id: "w1.anvil",\n    world: 1,\n    component: AnvilTab,\n});`;
const FILES = parseNameStatus(
    [
        "M",
        "src/ui/pages/world-1/anvil/anvil.js",
        "M",
        "src/ui/pages/world-1/anvil/anvil.css",
        "M",
        "src/cheats/hooks/events012.js",
        "A",
        "src/cheats/hooks/clist.js",
        "",
    ].join("\0")
);
const fixtureSummary = () =>
    summaryData({
        pr: 41,
        headSha: SHA,
        files: FILES,
        head: (p) => HEAD[p] ?? null,
        base: (p) => BASE[p] ?? null,
        pageTexts: (folder) => (folder === "src/ui/pages/world-1/anvil" ? [ANVIL] : []),
        namesHead: new Map([
            ["gga:Cards0", 1],
            ["gga:GemsOwned", 1],
            ["method:_customBlock_Labb", 1],
        ]),
        namesBase: new Map([["gga:Cards0", 1]]),
    });

test("git's -z name-status becomes the API's file list", () => {
    assert.deepEqual(parseNameStatus("M\0a.js\0R087\0old.js\0new.js\0A\0b c.js\0D\0gone.js\0"), [
        { path: "a.js", status: "modified", previousPath: undefined },
        { path: "new.js", status: "renamed", previousPath: "old.js" },
        { path: "b c.js", status: "added", previousPath: undefined },
        { path: "gone.js", status: "removed", previousPath: undefined },
    ]);
});

test("page ids and hook changes come from definePage and defineHook", () => {
    assert.deepEqual(pageIds(ANVIL), ["w1.anvil"]);
    assert.deepEqual(pageIds("definePage({ id: `w${n}.x` })"), []);
    assert.deepEqual(hookChanges(BASE["src/cheats/hooks/events012.js"], HEAD["src/cheats/hooks/events012.js"]), [
        { id: "godlike.reach", on: "_customBlock_PlayerReach", change: "changed" },
        { id: "w4.labpx, w2.sigilspeed", on: "_customBlock_Labb", change: "new" },
        { id: "w1.forge", on: "_customBlock_ForgeStats", change: "removed" },
    ]);
    assert.deepEqual(hookChanges(null, null), []);
});

test("every page and hook in the repo is seen", () => {
    const pages = path.join(root, "src/ui/pages");
    for (const world of fs.readdirSync(pages)) {
        for (const page of fs.readdirSync(path.join(pages, world))) {
            const dir = path.join(pages, world, page);
            const ids = fs
                .readdirSync(dir, { recursive: true })
                .filter((f) => f.endsWith(".js"))
                .flatMap((f) => pageIds(fs.readFileSync(path.join(dir, f), "utf8")));
            assert.ok(ids.length, `no definePage id found in ${dir}`);
        }
    }
    const hooks = path.join(root, "src/cheats/hooks");
    let calls = 0;
    let seen = 0;
    for (const f of fs.readdirSync(hooks, { recursive: true }).filter((f) => f.endsWith(".js"))) {
        const text = fs.readFileSync(path.join(hooks, f), "utf8");
        calls += (text.match(/\bdefineHook\(/g) ?? []).length;
        seen += hookChanges(null, text).length;
    }
    // ponytail: hooks whose id is a variable (one in events579.js) aren't listed; a big drop means the pattern broke.
    assert.ok(seen >= calls - 3, `${seen} of ${calls} defineHook calls seen`);
});

test("the summary from a fixture diff", () => {
    const { data } = fixtureSummary();
    assert.deepEqual(data, {
        pr: 41,
        headSha: SHA,
        pages: ["w1.anvil"],
        hooks: [
            { id: "godlike.reach", on: "_customBlock_PlayerReach", change: "changed" },
            { id: "w4.labpx, w2.sigilspeed", on: "_customBlock_Labb", change: "new" },
            { id: "w1.forge", on: "_customBlock_ForgeStats", change: "removed" },
            { id: "w3.saltlick", on: "2", change: "new" },
        ],
        names: ["gga:GemsOwned", "method:_customBlock_Labb"],
    });
    const rules = { kind: "a page and game-side code mixed", problems: ["Split it."] };
    const body = renderComment({ data, rules, check: "success", runUrl: RUN.html_url, shotsUrl: "https://x/shots" });
    assert.equal(
        body,
        [
            MARKER,
            "### PR summary",
            "",
            "- Kind: a page and game-side code mixed.",
            "- PR rules: not met.",
            "  - Split it.",
            "- The check: passed.",
            "- Pages it touches: `w1.anvil`.",
            "- Hooks it adds, changes or removes: `godlike.reach` on `_customBlock_PlayerReach` (changed), " +
                "`w4.labpx, w2.sigilspeed` on `_customBlock_Labb` (new), `w1.forge` on `_customBlock_ForgeStats` " +
                "(removed), `w3.saltlick` on `2` (new).",
            "- Game names it newly uses: `gga:GemsOwned`, `method:_customBlock_Labb`.",
            "- Layout of the touched pages: not measured, see the run.",
            "- Screenshots of the touched pages: [page-shots](https://x/shots) (a zip; GitHub asks you to sign in).",
            "",
            "For commit aaaaaaa, from [this run](https://github.com/o/r/actions/runs/77).",
        ].join("\n")
    );
    const quiet = renderComment({
        data: { ...data, pages: [], hooks: [], names: [] },
        rules: { kind: "a page", problems: [] },
        check: "failure",
        runUrl: RUN.html_url,
    });
    assert.match(quiet, /- PR rules: met\.\n- The check: failed\.\n- Pages it touches: none\./);
    assert.doesNotMatch(quiet, /Screenshots/);
});

test("stage 2 accepts a good artifact and keeps only the known fields", () => {
    const { data } = fixtureSummary();
    const extra = { ...data, note: "<img src=x>", hooks: data.hooks.map((h) => ({ ...h, why: "x" })) };
    assert.deepEqual(validateSummary(JSON.stringify(extra), RUN), { ...data, layout: null });
    assert.deepEqual(validateSummary(JSON.stringify(data), { ...RUN, pull_requests: [{ number: 41 }] }), {
        ...data,
        layout: null,
    });
});

test("the touched pages' layout breaks are named in the comment, inside code spans", () => {
    const report = {
        shots: [
            {
                name: "1440/world-6/emperor",
                layout: [
                    `the fields don't line up: "Emperor tries" starts at 857px, 2 of 3 rows at 773px (at rest)`,
                    `the fields don't line up: "Emperor tries" starts at 857px, 2 of 3 rows at 773px (controls showing)`,
                ],
                overflow: null,
            },
            {
                name: "400/world-6/emperor",
                layout: [],
                overflow: { viewport: 400, boxes: [{ box: "the page", by: 8 }] },
            },
            { name: "1440/world-6/beanstalk", layout: [], overflow: null },
        ],
    };
    const layout = layoutOf(report);
    assert.deepEqual(layout, [
        `1440/world-6/emperor: the fields don't line up: "Emperor tries" starts at 857px, 2 of 3 rows at 773px`,
        "400/world-6/emperor: the page is 8px too wide for the window",
    ]);
    const { data } = fixtureSummary();
    // A row's name is the page's text: a backtick in it can't end the code span.
    const shown = validateSummary(JSON.stringify({ ...data, layout: [...layout, "x: `[click](https://evil)`"] }), RUN);
    const body = renderComment({ data: shown, rules: { kind: "a page", problems: [] }, check: "success", runUrl: "u" });
    assert.match(
        body,
        /- Layout of the touched pages: 3 breaks of the page standards:\n {2}- `1440\/world-6\/emperor: /
    );
    assert.match(body, /\n {2}- `x: '\[click\]\(https:\/\/evil\)'`\n/);
    const fine = renderComment({ data: { ...data, layout: [] }, rules: { kind: "a page", problems: [] }, runUrl: "u" });
    assert.match(fine, /- Layout of the touched pages: follows the page standards\./);
});

test("stage 2 refuses a wrong, oversized or malformed artifact", () => {
    const { data } = fixtureSummary();
    const refused = (value, run = RUN) =>
        assert.throws(
            () => validateSummary(typeof value === "string" ? value : JSON.stringify(value), run),
            /^Error: Refused/
        );
    refused({ ...data, pr: 42 }, { ...RUN, pull_requests: [{ number: 41 }] });
    refused({ ...data, headSha: "b".repeat(40) });
    refused({ ...data, pr: "41" });
    refused({ ...data, pr: -1 });
    refused("{not json");
    refused("null");
    refused("[]");
    refused(" ".repeat(LIMITS.bytes) + "{}");
    refused({ ...data, pages: ["w1.anvil`) [click](https://evil)"] });
    refused({ ...data, pages: "w1.anvil" });
    refused({ ...data, hooks: [{ id: "x", on: "y", change: "deleted" }] });
    refused({ ...data, hooks: [{ id: "x", on: "<b>", change: "new" }] });
    refused({ ...data, hooks: [null] });
    refused({ ...data, names: ["gga:Cards0\n- injected"] });
    refused({ ...data, names: Array.from({ length: LIMITS.names + 1 }, (_, i) => `gga:N${i}`) });
    refused({ ...data, layout: ["a break\n- injected"] });
    refused({ ...data, layout: ["x".repeat(LIMITS.line + 1)] });
    refused({ ...data, layout: Array.from({ length: LIMITS.layout + 1 }, (_, i) => `break ${i}`) });
    refused({ ...data, layout: "a break" });
});

// A fake GitHub for post(): the PR, its files, the run's jobs and artifacts, and the comments it writes.
function fakeGithub({ pr, comments = [] }) {
    const writes = [];
    return {
        writes,
        pull: async (n) => (n === pr.number ? pr : null),
        files: async () => [{ path: "src/ui/pages/world-1/anvil/anvil.js", status: "modified" }],
        issue: async () => null,
        runJobs: async () => [
            { name: "check", conclusion: "success" },
            { name: "summary", conclusion: "success" },
        ],
        runArtifacts: async () => [
            { name: "pr-summary", id: 1 },
            { name: "page-shots", id: 2 },
        ],
        comments: async () => comments,
        addComment: async (n, body) => writes.push({ add: n, body }),
        updateComment: async (id, body) => writes.push({ update: id, body }),
    };
}
const PR = {
    number: 41,
    body: "",
    author_association: "CONTRIBUTOR",
    head: { sha: SHA, repo: { full_name: "someone/Idleon-Injector" } },
};
const dirs = [];
after(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
const artifactDir = (text) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-summary-test-"));
    dirs.push(dir);
    if (text !== undefined) fs.writeFileSync(path.join(dir, "summary.json"), text);
    return dir;
};
const run = (dir, github) => post({ dir, run: RUN, repo: "o/r", github, core: readCorePaths() });

test("stage 2 posts one comment, then updates its own", async () => {
    const dir = artifactDir(JSON.stringify(fixtureSummary().data));
    const fresh = fakeGithub({ pr: PR });
    await run(dir, fresh);
    assert.equal(fresh.writes.length, 1);
    assert.equal(fresh.writes[0].add, 41);
    assert.match(fresh.writes[0].body, /- Kind: a page\.\n- PR rules: met\.\n- The check: passed\./);
    assert.match(
        fresh.writes[0].body,
        /\[page-shots\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/77\/artifacts\/2\)/
    );

    const comments = [
        { id: 5, user: { login: "someone" }, body: `${MARKER} a contributor's copy` },
        { id: 6, user: { login: "github-actions[bot]" }, body: `${MARKER}\nold` },
    ];
    const again = fakeGithub({ pr: PR, comments });
    await run(dir, again);
    assert.deepEqual(
        again.writes.map((w) => w.update),
        [6]
    );
});

test("stage 2 doesn't post for a PR that isn't the run's, or a missing or huge artifact", async () => {
    const dir = artifactDir(JSON.stringify(fixtureSummary().data));
    for (const pr of [
        { ...PR, head: { ...PR.head, sha: "c".repeat(40) } },
        { ...PR, head: { ...PR.head, repo: { full_name: "other/fork" } } },
        { ...PR, number: 40 },
    ]) {
        const github = fakeGithub({ pr });
        assert.equal((await run(dir, github)).posted, false);
        assert.deepEqual(github.writes, []);
    }
    await assert.rejects(run(artifactDir(), fakeGithub({ pr: PR })), /summary\.json is missing/);
    await assert.rejects(run(artifactDir("x".repeat(LIMITS.bytes + 1)), fakeGithub({ pr: PR })), /over/);
});

test("the layout gate fails on a break, and when touched pages went unmeasured", () => {
    assert.equal(layoutGate({ pages: [], layout: null }).pass, true);
    assert.equal(layoutGate({ pages: ["w1.anvil"], layout: [] }).pass, true);
    const broken = layoutGate({ pages: ["w1.anvil"], layout: [`1440/world-1/anvil: the fields don't line up`] });
    assert.equal(broken.pass, false);
    assert.match(broken.message, /1440\/world-1\/anvil: the fields don't line up/);
    assert.deepEqual(layoutGate({ pages: ["w1.anvil"], layout: null }), {
        pass: false,
        message: "The touched pages' layout wasn't measured: the page shots didn't finish.",
    });
    assert.equal(layoutGate({ pages: ["w1.anvil"] }).pass, false);
});
