/**
 * Posts a published GitHub release to Discord (#github-updates) through the DISCORD_RELEASE_WEBHOOK secret.
 *
 *   node scripts/discord-release.mjs <tag>
 *
 * Without the secret it only prints a notice, so a missing webhook never fails a release.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DESCRIPTION_LIMIT = 4096; // Discord's limit for an embed description

/** The webhook body for a release: its notes as one embed, with nobody pinged. */
export function releaseMessage({ name, tagName, url, body }) {
    // Headings become bold lines, as the old post's reduce_headings did, so long notes stay compact.
    let notes = (body || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^#{1,6}\s+(.+)$/, "**$1**"))
        .join("\n")
        .trim();
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
            "::notice title=Not posted to Discord::The DISCORD_RELEASE_WEBHOOK secret isn't set, so this release wasn't posted to #github-updates."
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
