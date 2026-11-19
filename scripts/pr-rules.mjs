/**
 * The PR rules from CONTRIBUTING.md: one kind per PR, and a new cheat or game hook needs an approved issue.
 *
 * Run by .github/workflows/pr-rules.yml (master's copy of this file) with PR_NUMBER, PR_BODY, PR_AUTHOR_ASSOCIATION,
 * GITHUB_REPOSITORY and GITHUB_TOKEN. It reads the PR's files and the linked issues from the API and exits 1 with a
 * plain message when a rule fails. scripts/pr-summary.mjs shows the same result in the PR's summary comment.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const APPROVED = "approved";
const PAGES = "src/ui/pages/";
const GAME_SIDE = ["src/cheats/cheats/", "src/cheats/hooks/", "src/cheats/automations/"];
const NEEDS_ISSUE = ["src/cheats/cheats/", "src/cheats/hooks/"];
// Maintainers move pages (touching scripts/rules/exceptions.json) and refactor across kinds.
const EXEMPT = ["OWNER", "MEMBER"];
// The repo permission GitHub reports for a user (maintain counts as write there).
const MAINTAINER_PERMISSIONS = ["admin", "write"];

// The core's paths from .github/CODEOWNERS: "/folder/" covers the folder, "/file" the file.
export function corePaths(codeowners) {
    return codeowners
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((p) => p && !p.startsWith("#"))
        .map((p) => {
            // ponytail: plain paths only; a glob in CODEOWNERS fails here (and in the test) instead of misreading.
            if (!/^\/[^*?[\]!]+$/.test(p))
                throw new Error(`pr-rules.mjs reads "/folder/" and "/file" in CODEOWNERS, not ${p}`);
            return p.slice(1);
        });
}

export const readCorePaths = () => corePaths(fs.readFileSync(path.join(root, ".github/CODEOWNERS"), "utf8"));

export function kindOfPath(file, core) {
    if (core.some((c) => (c.endsWith("/") ? file.startsWith(c) : file === c))) return "core";
    if (file.startsWith(PAGES)) return "page";
    if (GAME_SIDE.some((dir) => file.startsWith(dir))) return "game";
    return "other";
}

// kind -> the PR's paths of that kind. A rename counts its old path too. files: [{ path, status, previousPath }].
export function filesByKind(files, core) {
    const byKind = {};
    for (const f of files) {
        for (const p of [f.path, f.previousPath]) if (p) (byKind[kindOfPath(p, core)] ??= []).push(p);
    }
    return byKind;
}

const CORE_NOTE = "core files, which wait for the maintainer's review";

export function describeKind(byKind) {
    const main =
        byKind.page && byKind.game
            ? "a page and game-side code mixed"
            : byKind.page
              ? "a page"
              : byKind.game
                ? "game-side code"
                : null;
    if (main) return byKind.core ? `${main}, plus ${CORE_NOTE}` : main;
    if (byKind.core) return `only ${CORE_NOTE}`;
    return byKind.other ? "other files (docs and the like)" : "no files";
}

// Issue numbers the PR body links: "Closes #12", "Fixes #12", "For #12" or a bare "#12". HTML comments (the PR
// template's hints) don't count; neither do "a#12", "&#12;" or a URL's "#12".
export function linkedIssues(body) {
    const text = (body ?? "").replace(/<!--[\s\S]*?-->/g, "");
    return [...new Set([...text.matchAll(/(?<![\w&#/])#(\d{1,7})\b/g)].map((m) => Number(m[1])))].slice(0, 10);
}

const needsIssue = (p) => Boolean(p) && NEEDS_ISSUE.some((dir) => p.startsWith(dir));

// Files the PR adds under src/cheats/cheats/ or src/cheats/hooks/ (a file renamed in from elsewhere counts).
export const newCheatsAndHooks = (files) =>
    files
        .filter(
            (f) =>
                ["added", "copied", "renamed"].includes(f.status) && needsIssue(f.path) && !needsIssue(f.previousPath)
        )
        .map((f) => f.path);

const code = (p) => `\`${p.replaceAll("`", "'")}\``;
const list = (paths) =>
    paths.slice(0, 3).map(code).join(", ") + (paths.length > 3 ? ` and ${paths.length - 3} more` : "");

/**
 * The rules for one PR. issue(n) resolves to { labels: [names], isPullRequest } or null when #n doesn't exist.
 * @returns {Promise<{ kind: string, exempt: boolean, problems: string[] }>} no problems: the PR passes
 */
export async function checkPr({ files, body, association, permission, core, issue }) {
    const byKind = filesByKind(files, core);
    const kind = describeKind(byKind);
    // A private org member's association reads CONTRIBUTOR in Actions, so write access on the repo counts too.
    if (EXEMPT.includes(association) || MAINTAINER_PERMISSIONS.includes(permission)) {
        return { kind, exempt: true, problems: [] };
    }
    const problems = [];
    if (byKind.page && byKind.game) {
        problems.push(
            `This PR changes a page (${list(byKind.page)}) and game-side code (${list(byKind.game)}). A PR is either ` +
                `a page or game-side code, so split it into two PRs. See "One kind per PR" in CONTRIBUTING.md.`
        );
    }
    const added = newCheatsAndHooks(files);
    if (added.length) {
        const linked = linkedIssues(body);
        let approved = false;
        for (const n of linked) {
            const found = await issue(n);
            if (found && !found.isPullRequest && found.labels.includes(APPROVED)) {
                approved = true;
                break;
            }
        }
        if (!linked.length) {
            problems.push(
                `This PR adds a new cheat or game hook (${list(added)}). New ones need a feature request that the ` +
                    `maintainer approved first. Link that issue in the PR description, for example \`For #12\`. See ` +
                    `"When to ask first" in CONTRIBUTING.md.`
            );
        } else if (!approved) {
            problems.push(
                `This PR adds a new cheat or game hook (${list(added)}), but no issue it links ` +
                    `(${linked.map((n) => `#${n}`).join(", ")}) has the "${APPROVED}" label yet. Wait for the ` +
                    `maintainer to approve the feature request, then edit the PR description (any small change) and ` +
                    `this check runs again. See "When to ask first" in CONTRIBUTING.md.`
            );
        }
    }
    return { kind, exempt: false, problems };
}

// The few GitHub API calls the PR workflows make. A 404 is null.
export function githubApi({ token, repo, fetchImpl = fetch }) {
    const call = async (method, url, body) => {
        const res = await fetchImpl(`https://api.github.com/repos/${repo}${url}`, {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                accept: "application/vnd.github+json",
                "x-github-api-version": "2022-11-28",
                ...(body && { "content-type": "application/json" }),
            },
            body: body && JSON.stringify(body),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitHub ${method} ${url}: HTTP ${res.status}`);
        return res.json();
    };
    const all = async (url) => {
        const items = [];
        for (let page = 1; ; page++) {
            const batch = (await call("GET", `${url}?per_page=100&page=${page}`)) ?? [];
            items.push(...batch);
            if (batch.length < 100) return items;
        }
    };
    return {
        pull: (n) => call("GET", `/pulls/${n}`),
        // admin, write, read or none; a user the repo doesn't know is none.
        permission: async (login) =>
            (await call("GET", `/collaborators/${encodeURIComponent(login)}/permission`))?.permission ?? "none",
        files: async (n) =>
            (await all(`/pulls/${n}/files`)).map((f) => ({
                path: f.filename,
                status: f.status,
                previousPath: f.previous_filename,
            })),
        issue: async (n) => {
            const found = await call("GET", `/issues/${n}`);
            return found && { labels: found.labels.map((l) => l.name), isPullRequest: Boolean(found.pull_request) };
        },
        runJobs: async (id) => (await call("GET", `/actions/runs/${id}/jobs?per_page=100`)).jobs,
        runArtifacts: async (id) => (await call("GET", `/actions/runs/${id}/artifacts?per_page=100`)).artifacts,
        comments: (n) => all(`/issues/${n}/comments`),
        addComment: (n, body) => call("POST", `/issues/${n}/comments`, { body }),
        updateComment: (id, body) => call("PATCH", `/issues/comments/${id}`, { body }),
    };
}

// An ::error:: line shows on the PR's checks; % and line breaks are escaped so a file name can't end the command.
const annotation = (text) =>
    `::error title=PR rules::${text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { PR_NUMBER, PR_BODY, PR_AUTHOR, PR_AUTHOR_ASSOCIATION, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
    const github = githubApi({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY });
    const result = await checkPr({
        files: await github.files(Number(PR_NUMBER)),
        body: PR_BODY,
        association: PR_AUTHOR_ASSOCIATION,
        permission: await github.permission(PR_AUTHOR),
        core: readCorePaths(),
        issue: github.issue,
    });
    console.log(`Kind: ${result.kind}${result.exempt ? " (by a maintainer, so the rules don't apply)" : ""}`);
    for (const problem of result.problems) console.log(annotation(problem));
    if (!result.problems.length) console.log("PR rules OK");
    process.exitCode = result.problems.length ? 1 : 0;
}
