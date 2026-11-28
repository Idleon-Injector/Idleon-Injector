/**
 * Posts a published GitHub release to Discord (#injector-updates) through the DISCORD_RELEASE_WEBHOOK secret.
 *
 *   node scripts/discord-release.mjs <tag>
 *
 * Without the secret it only prints a notice, so a missing webhook never fails a release.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { UNDER_THE_HOOD } from "./release-notes.mjs";

const DESCRIPTION_LIMIT = 4096; // Discord's limit for an embed description

// The bullet lines under each heading of notes from scripts/release-notes.mjs, or null for notes written another way.
function sections(body) {
    const found = {};
    let current = null;
    for (const line of (body || "").split(/\r?\n/)) {
        const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1] ?? line.match(/^<summary>(.+)<\/summary>$/)?.[1];
        if (heading) current = found[heading] = [];
        else if (current && /^[-*]\s+/.test(line)) current.push(line.replace(/^[-*]\s+/, ""));
    }
    // Generated notes give each of their headings at least one line; a heading over prose ("## New" and a paragraph)
    // is notes written by hand, posted whole.
    const known = ["New", "Improved", "Fixed", UNDER_THE_HOOD].filter((h) => h in found);
    return known.length && known.every((h) => found[h].length) ? found : null;
}

const count = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : "");

/**
 * The webhook body for a release, as one embed with nobody pinged: every New line without its PR number, then
 * "Plus N improvements and M fixes", then a link to the full notes. Notes written another way are posted whole.
 */
export function releaseMessage({ name, tagName, url, body }) {
    const found = sections(body);
    let notes;
    if (found) {
        const news = (found.New ?? []).map((line) => `- ${line.replace(/\s*\(#\d+\)$/, "")}`);
        const more = [
            count(found.Improved?.length, "improvement", "improvements"),
            count(found.Fixed?.length, "fix", "fixes"),
        ].filter(Boolean);
        const plus = more.length ? `${news.length ? "Plus " : ""}${more.join(" and ")}.` : "";
        notes = [news.join("\n"), plus, `[Full notes on GitHub](${url})`].filter(Boolean).join("\n\n");
    } else {
        // Headings become bold lines, as the old post's reduce_headings did, so long notes stay compact.
        notes = (body || "")
            .split(/\r?\n/)
            .map((line) => line.replace(/^#{1,6}\s+(.+)$/, "**$1**"))
            .join("\n")
            .trim();
    }
    if (notes.length > DESCRIPTION_LIMIT) {
        const more = `\n\n... [Read the full notes](${url})`;
        notes = notes.slice(0, DESCRIPTION_LIMIT - more.length) + more;
    }
    return {
        allowed_mentions: { parse: [] },
        embeds: [
            {
                title: (name || tagName).slice(0, 256),
                url,
                description: notes || undefined,
                color: 2105893,
                footer: { text: "Changelog" },
            },
        ],
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const tag = process.argv[2];
    const webhook = process.env.DISCORD_RELEASE_WEBHOOK;
    if (!webhook) {
        console.log(
            "::notice title=Not posted to Discord::The DISCORD_RELEASE_WEBHOOK secret isn't set, so this release wasn't posted to #injector-updates."
        );
        process.exit(0);
    }
    if (!tag) throw new Error("Usage: node scripts/discord-release.mjs <tag>");

    const args = ["release", "view", tag, "--json", "name,tagName,url,body"];
    if (process.env.GITHUB_REPOSITORY) args.push("--repo", process.env.GITHUB_REPOSITORY);
    const release = JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));

    const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(releaseMessage(release)),
    });
    // The webhook URL is a secret, so the error names only the status.
    if (!res.ok) throw new Error(`Discord refused the release post: ${res.status} ${await res.text()}`);
    console.log(`Posted ${release.tagName} to Discord.`);
}
