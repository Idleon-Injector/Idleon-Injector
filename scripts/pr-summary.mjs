/**
 * The PR summary comment, made in two stages so a fork's code never runs next to a write token.
 *
 *   node scripts/pr-summary.mjs collect [--base REF] [--out DIR] [--shots]
 *       Stage 1 (the summary job in check.yml: the PR's code, a read-only token). Compares HEAD with its merge base
 *       with REF (default HEAD^1, which is master in a pull_request merge commit) and writes DIR/summary.json: the
 *       pages, hooks and game names the PR touches. --shots also screenshots the touched pages' areas into DIR/shots.
 *       PR_NUMBER and HEAD_SHA name the PR.
 *   node scripts/pr-summary.mjs post DIR
 *       Stage 2 (pr-summary.yml: master's code, can comment). DIR/summary.json is untrusted: it is size-capped,
 *       validated and matched against the workflow run that made it. The kind and rules come from the API, not from
 *       the artifact. Posts the comment, or updates the one it posted before.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { collectNames } from "./game-names.mjs";
import { checkPr, githubApi, readCorePaths } from "./pr-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MARKER = "<!-- pr-summary -->";
export const LIMITS = { bytes: 64 * 1024, pages: 100, hooks: 200, names: 300 };
const CHANGES = ["new", "changed", "removed"];
const ID = /^(?=.{1,300}$)[\w.$-]+(?:, ?[\w.$-]+)*$/;
const MEMBER = /^[\w$]{0,80}$/;
const NAME = /^[a-z]+:[\w.$]{1,120}$/;
const HOOKS = "src/cheats/hooks/";

// `git diff --name-status -z` -> [{ path, status, previousPath }], with the API's status words.
export function parseNameStatus(z) {
    const words = { A: "added", M: "modified", D: "removed", R: "renamed", C: "copied", T: "changed" };
    const parts = z.split("\0").filter(Boolean);
    const files = [];
    for (let i = 0; i < parts.length; ) {
        const letter = parts[i++][0];
        const [previousPath, file] = "RC".includes(letter) ? [parts[i++], parts[i++]] : [undefined, parts[i++]];
        files.push({ path: file, status: words[letter] ?? "modified", previousPath });
    }
    return files;
}

// src/ui/pages/<world>/<page>/... -> "src/ui/pages/<world>/<page>".
export const pageFolder = (p) => p?.match(/^(src\/ui\/pages\/[^/]+\/[^/]+)\//)?.[1] ?? null;

// The text of each define<Kind>( call, up to the next one. ponytail: an id that isn't a string literal isn't seen.
const calls = (text, fn) => text.split(new RegExp(`\\b${fn}\\(`)).slice(1);
// A hook's id can list several cheats: "w4.labpx, w2.sigilspeed". A hooked property can be an index: property: 2.
const idOf = (chunk) => chunk.match(/\bid\s*:\s*["'`]([^"'`\n]+)["'`]/)?.[1];
const memberOf = (chunk) =>
    chunk
        .match(/\b(?:method|property)\s*:\s*(?:["'`]([\w$]+)["'`]|(\d+)\b)/)
        ?.slice(1)
        .find(Boolean);

export const pageIds = (text) =>
    calls(text, "definePage")
        .map(idOf)
        .filter((id) => ID.test(id ?? ""));

// The defineHook calls in a file, keyed by id and the game method or property they hook.
export function hookEntries(text) {
    const seen = new Map();
    return calls(text ?? "", "defineHook")
        .map((chunk) => ({ id: idOf(chunk), on: memberOf(chunk) ?? "", chunk }))
        .filter((h) => ID.test(h.id ?? ""))
        .map((h) => {
            const key = `${h.id} ${h.on}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
            return { ...h, key: `${key} ${seen.get(key)}` };
        });
}

// The hooks a file adds, changes or removes between two versions (null: the file doesn't exist there).
export function hookChanges(before, after) {
    const old = new Map(hookEntries(before).map((h) => [h.key, h]));
    const changes = [];
    for (const h of hookEntries(after)) {
        const was = old.get(h.key);
        old.delete(h.key);
        if (!was || was.chunk !== h.chunk) changes.push({ id: h.id, on: h.on, change: was ? "changed" : "new" });
    }
    for (const h of old.values()) changes.push({ id: h.id, on: h.on, change: "removed" });
    return changes;
}

/**
 * What stage 1 hands to stage 2. head(p)/base(p): a file's text in the PR or on master, null when missing;
 * pageTexts(folder): the PR's .js texts in a page folder; names*: collectNames() maps of each side.
 */
export function summaryData({ pr, headSha, files, head, base, pageTexts, namesHead, namesBase }) {
    const folders = [
        ...new Set(files.flatMap((f) => [pageFolder(f.path), pageFolder(f.previousPath)]).filter(Boolean)),
    ];
    const pages = [...new Set(folders.flatMap((folder) => pageTexts(folder).flatMap(pageIds)))].sort();
    const hooks = files
        .filter((f) => (f.path.startsWith(HOOKS) || f.previousPath?.startsWith(HOOKS)) && f.path.endsWith(".js"))
        .flatMap((f) => hookChanges(base(f.previousPath ?? f.path), head(f.path)));
    const names = [...namesHead.keys()].filter((n) => !namesBase.has(n)).sort();
    return {
        data: {
            pr,
            headSha,
            pages: pages.slice(0, LIMITS.pages),
            hooks: hooks.slice(0, LIMITS.hooks),
            names: names.slice(0, LIMITS.names),
        },
        areas: [...new Set(folders.map((folder) => folder.split("/")[3]))],
    };
}

const need = (ok, message) => {
    if (!ok) throw new Error(`Refused the summary artifact: ${message}`);
};

// Stage 2's reading of summary.json: only these fields, in these shapes, for this run.
export function validateSummary(text, run) {
    need(Buffer.byteLength(text) <= LIMITS.bytes, `it is over ${LIMITS.bytes} bytes`);
    let d;
    try {
        d = JSON.parse(text);
    } catch {
        need(false, "it isn't JSON");
    }
    const list = (v, max, ok) => Array.isArray(v) && v.length <= max && v.every(ok);
    need(d !== null && typeof d === "object", "it isn't an object");
    need(Number.isSafeInteger(d.pr) && d.pr > 0, "pr isn't a PR number");
    need(d.headSha === run.head_sha, `headSha isn't the run's commit ${run.head_sha}`);
    need(
        !run.pull_requests?.length || run.pull_requests.some((p) => p.number === d.pr),
        `PR #${d.pr} isn't the run's PR`
    );
    need(
        list(d.pages, LIMITS.pages, (p) => typeof p === "string" && ID.test(p)),
        "pages isn't a list of page ids"
    );
    need(
        list(d.hooks, LIMITS.hooks, (h) => h && ID.test(h.id) && MEMBER.test(h.on) && CHANGES.includes(h.change)),
        "hooks isn't a list of hooks"
    );
    need(
        list(d.names, LIMITS.names, (n) => typeof n === "string" && NAME.test(n)),
        "names isn't a list of game names"
    );
    return {
        pr: d.pr,
        headSha: d.headSha,
        pages: [...d.pages],
        hooks: d.hooks.map(({ id, on, change }) => ({ id, on, change })),
        names: [...d.names],
    };
}

// The PR the artifact names must be the one the run was for: same head commit, from the same repository.
export const samePr = (pr, run) =>
    Boolean(pr) && pr.head.sha === run.head_sha && pr.head.repo?.full_name === run.head_repository?.full_name;

const SHOWN = 20;
const items = (values, format = (v) => `\`${v}\``) =>
    values.length
        ? values.slice(0, SHOWN).map(format).join(", ") +
          (values.length > SHOWN ? ` and ${values.length - SHOWN} more` : "")
        : "none";

export function renderComment({ data, rules, check, runUrl, shotsUrl }) {
    const ruleLines = rules.exempt
        ? ["- Contributor rules: skipped, the author is a maintainer."]
        : rules.problems.length
          ? ["- Contributor rules: not met.", ...rules.problems.map((p) => `  - ${p}`)]
          : ["- Contributor rules: met."];
    const checkWord = { success: "passed", failure: "failed", cancelled: "cancelled" }[check] ?? "didn't finish";
    const lines = [
        MARKER,
        "### PR summary",
        "",
        `- Kind: ${rules.kind}.`,
        ...ruleLines,
        `- The check: ${checkWord}.`,
        `- Pages it touches: ${items(data.pages)}.`,
        `- Hooks it adds, changes or removes: ${items(data.hooks, (h) => `\`${h.id}\`${h.on ? ` on \`${h.on}\`` : ""} (${h.change})`)}.`,
        `- Game names it newly uses: ${items(data.names)}.`,
    ];
    if (data.pages.length) {
        lines.push(
            shotsUrl
                ? `- Screenshots of the touched pages: [page-shots](${shotsUrl}) (a zip; GitHub asks you to sign in).`
                : "- Screenshots of the touched pages: none were made, see the run."
        );
    }
    lines.push("", `For commit ${data.headSha.slice(0, 7)}, from [this run](${runUrl}).`);
    return lines.join("\n");
}

/**
 * Stage 2. run: the workflow_run event's run. Throws on a bad artifact; returns { posted: false, reason } when the
 * artifact is fine but its PR has moved on (a newer run will post) or doesn't match the run.
 */
export async function post({ dir, run, repo, github, core }) {
    const file = path.join(dir, "summary.json");
    need(fs.existsSync(file), "summary.json is missing");
    need(fs.statSync(file).size <= LIMITS.bytes, `it is over ${LIMITS.bytes} bytes`);
    const data = validateSummary(fs.readFileSync(file, "utf8"), run);
    const pr = await github.pull(data.pr);
    if (!samePr(pr, run)) return { posted: false, reason: `PR #${data.pr} isn't at the run's commit ${run.head_sha}` };
    const rules = await checkPr({
        files: await github.files(pr.number),
        body: pr.body,
        association: pr.author_association,
        permission: await github.permission(pr.user.login),
        core,
        issue: github.issue,
    });
    const check = (await github.runJobs(run.id)).find((j) => j.name === "check")?.conclusion;
    const shots = data.pages.length ? (await github.runArtifacts(run.id)).find((a) => a.name === "page-shots") : null;
    const shotsUrl = shots && `https://github.com/${repo}/actions/runs/${run.id}/artifacts/${shots.id}`;
    const body = renderComment({ data, rules, check, runUrl: run.html_url, shotsUrl });
    const mine = (await github.comments(pr.number)).find(
        (c) => c.user?.login === "github-actions[bot]" && c.body?.startsWith(MARKER)
    );
    if (mine) await github.updateComment(mine.id, body);
    else await github.addComment(pr.number, body);
    return { posted: true, body };
}

function collect({ base: baseRef, out, shots }) {
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const base = git("merge-base", baseRef, "HEAD").trim();
    const files = parseNameStatus(git("diff", "--name-status", "-z", "-M", base, "HEAD"));
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-summary-base-"));
    git("worktree", "add", "--detach", baseDir, base);
    try {
        const read = (dir) => (p) =>
            p && fs.existsSync(path.join(dir, p)) ? fs.readFileSync(path.join(dir, p), "utf8") : null;
        const pageTexts = (folder) =>
            fs.existsSync(path.join(root, folder))
                ? fs
                      .readdirSync(path.join(root, folder), { recursive: true })
                      .filter((f) => f.endsWith(".js"))
                      .map((f) => fs.readFileSync(path.join(root, folder, f), "utf8"))
                : [];
        const { data, areas } = summaryData({
            pr: Number(process.env.PR_NUMBER ?? 0),
            headSha: process.env.HEAD_SHA ?? git("rev-parse", "HEAD").trim(),
            files,
            head: read(root),
            base: read(baseDir),
            pageTexts,
            namesHead: collectNames(root),
            namesBase: collectNames(baseDir),
        });
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(data, null, 2));
        console.log(JSON.stringify(data, null, 2));
        // A flagged or failed screenshot run still leaves the shots it took; the summary doesn't depend on it.
        for (const area of shots ? areas : []) {
            const shoot = path.join(root, "scripts/page-shots/shoot.mjs");
            spawnSync(process.execPath, [shoot, `--only=${area}`, `--out=${path.join(out, "shots", area)}`], {
                stdio: "inherit",
            });
        }
    } finally {
        git("worktree", "remove", "--force", baseDir);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            base: { type: "string", default: "HEAD^1" },
            out: { type: "string", default: path.join(root, ".scratch/pr-summary") },
            shots: { type: "boolean", default: false },
        },
    });
    const [command, dir] = positionals;
    if (command === "collect") collect(values);
    else if (command === "post") {
        const run = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")).workflow_run;
        const repo = process.env.GITHUB_REPOSITORY;
        const result = await post({
            dir,
            run,
            repo,
            github: githubApi({ token: process.env.GITHUB_TOKEN, repo }),
            core: readCorePaths(),
        });
        console.log(result.posted ? result.body : `Not posting: ${result.reason}`);
    } else {
        console.error("usage: node scripts/pr-summary.mjs collect [--base REF] [--out DIR] [--shots] | post DIR");
        process.exitCode = 2;
    }
}
