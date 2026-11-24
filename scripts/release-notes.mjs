/**
 * Release notes from each merged PR's release line: the PR template's **Release line** and **Release kind**.
 *
 *   node scripts/release-notes.mjs <fromTag> [toRef] [--repo owner/name]
 *
 * Prints the GitHub release notes on stdout. On stderr it prints "Needs a line": the PRs (and commits without a PR)
 * that have no usable line, so none is dropped silently; that list is for the maintainer and never published.
 * toRef defaults to the repo's default branch, --repo to GITHUB_REPOSITORY or this clone's GitHub repo. Reads the
 * commits and PRs with `gh api` (GH_TOKEN in a workflow).
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const KINDS = ["new", "improved", "fixed", "internal"];
const HEADINGS = { new: "New", improved: "Improved", fixed: "Fixed" };
export const UNDER_THE_HOOD = "Under the hood";

// Whose lines carry no name: only the maintainer (Lumi's pick, 2026-11-24: every other author gets credit, team too).
export const TEAM = ["lumi-fiona"];

// "**Release line:** x", "**Release line**: x", "Release kind: new" or "## Release line" (case and bold don't matter).
const LABEL = /^\s*(?:#{1,6}\s*)?\**\s*release (line|kind)\b\s*\**\s*:?\s*\**\s*(.*)$/i;

/** A PR body's release line and kind: { line, kind } when both are good, else { line?, problem }. */
export function parseReleaseLine(body) {
    const lines = (body ?? "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
    const found = {};
    lines.forEach((text, i) => {
        const m = text.match(LABEL);
        const key = m?.[1].toLowerCase();
        if (!m || key in found) return;
        // The answer can sit under its label, as the template's other answers often do.
        const next = lines.slice(i + 1).find((l) => l.trim());
        const below = next && !LABEL.test(next) && !/^\s*(\*\*|#|<)/.test(next) ? next : "";
        found[key] = (m[2].trim() || below).replace(/\s+/g, " ").trim();
    });
    const line = found.line || undefined;
    if (!line) return { problem: "no release line" };
    const kind = (found.kind ?? "").toLowerCase().replace(/\.$/, "");
    if (KINDS.includes(kind)) return { line, kind };
    // The template's unpicked "new / improved / fixed / internal" counts as no kind.
    const picked = found.kind && !found.kind.includes("/");
    return { line, problem: picked ? `kind "${found.kind}" isn't new, improved, fixed or internal` : "no kind picked" };
}

/** The PR number in a squash commit's subject ("... (#123)") or a merge commit's ("Merge pull request #123 ..."). */
export const prNumberOf = (subject) =>
    Number(
        subject
            .match(/\(#(\d+)\)\s*$|^Merge pull request #(\d+)/)
            ?.slice(1)
            .find(Boolean)
    ) || null;

const credited = (author, team) => Boolean(author) && !team.includes(author) && !author.endsWith("[bot]");

/**
 * prs: [{ number, title, author, body }] in merge order; loose: [{ sha, subject }] commits without a PR.
 * Returns { notes, needs }: the markdown for the GitHub release, and the "Needs a line" block ("" when none).
 */
export function releaseNotes({ prs, loose = [], team = TEAM }) {
    const byKind = Object.fromEntries(KINDS.map((k) => [k, []]));
    const thanks = new Set();
    const needs = [];
    for (const pr of prs) {
        const { line, kind, problem } = parseReleaseLine(pr.body);
        if (problem) {
            needs.push(`- #${pr.number} ${pr.title}: ${problem}.`);
            continue;
        }
        const name = credited(pr.author, team) ? ` (${pr.author})` : "";
        if (name) thanks.add(pr.author);
        byKind[kind].push(`- ${line}${name} (#${pr.number})`);
    }
    for (const c of loose) needs.push(`- ${c.sha.slice(0, 7)} ${c.subject}: no PR here.`);

    const parts = Object.entries(HEADINGS)
        .filter(([kind]) => byKind[kind].length)
        .map(([kind, heading]) => [`## ${heading}`, "", ...byKind[kind]].join("\n"));
    if (byKind.internal.length)
        parts.push(
            ["<details>", `<summary>${UNDER_THE_HOOD}</summary>`, "", ...byKind.internal, "", "</details>"].join("\n")
        );
    if (thanks.size) parts.push(`Thanks to ${[...thanks].join(", ")}.`);
    return {
        notes: parts.join("\n\n"),
        needs: needs.length ? ["## Needs a line", "", "Not in the notes:", "", ...needs].join("\n") : "",
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { repo: { type: "string" } } });
    const [from, toArg] = positionals;
    if (!from) throw new Error("Usage: node scripts/release-notes.mjs <fromTag> [toRef] [--repo owner/name]");
    // {owner}/{repo} is gh's own placeholder for this clone's GitHub repo.
    const repo = values.repo ?? process.env.GITHUB_REPOSITORY ?? "{owner}/{repo}";
    const gh = (...args) =>
        execFileSync("gh", ["api", ...args], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
        });
    const to = toArg ?? gh(`repos/${repo}`, "--jq", ".default_branch").trim();

    const commits = gh(
        "--paginate",
        `repos/${repo}/compare/${from}...${to}?per_page=100`,
        "--jq",
        '.commits[] | [.sha, (.commit.message | split("\\n")[0])] | @json'
    )
        .split("\n")
        .filter(Boolean)
        .map((row) => JSON.parse(row))
        .map(([sha, subject]) => ({ sha, subject, number: prNumberOf(subject) }));
    const prs = [];
    const loose = [];
    for (const c of commits) {
        if (!c.number) loose.push(c);
        else if (!prs.some((p) => p.number === c.number)) {
            let pr = null;
            try {
                pr = JSON.parse(gh(`repos/${repo}/pulls/${c.number}`));
            } catch (error) {
                if (!/HTTP 404/.test(error.stderr)) throw error;
            }
            // A number that isn't this commit's PR here (an issue, or a 2.x commit's PR in MrJoiny's repo) is listed.
            if (pr?.merge_commit_sha !== c.sha) loose.push(c);
            else prs.push({ number: pr.number, title: pr.title, author: pr.user?.login, body: pr.body });
        }
    }
    const { notes, needs } = releaseNotes({ prs, loose });
    process.stdout.write(`${notes}\n`);
    if (needs) process.stderr.write(`${needs}\n`);
}
