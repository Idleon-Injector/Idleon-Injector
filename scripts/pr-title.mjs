/**
 * The PR title rule. PRs are squash-merged, so the title becomes the commit on master.
 *
 * Run by .github/workflows/pr-title.yml with the title in PR_TITLE; exits 1 with an example when it doesn't fit.
 */

import { pathToFileURL } from "node:url";

export const TYPES = ["feat", "fix", "refactor", "chore", "test", "docs", "style"];

// type(scope): description, the description not starting with a capital and not ending with a period.
export const PR_TITLE = new RegExp(`^(${TYPES.join("|")})\\([a-z0-9][a-z0-9./-]*\\): [^A-Z\\s](.*[^.\\s])?$`);

export const EXAMPLE = "fix(ui): restore sidebar content after switching tabs";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const title = process.env.PR_TITLE ?? "";
    if (!PR_TITLE.test(title)) {
        console.error(
            `The PR title "${title}" doesn't look like type(scope): description.\n` +
                `Example: ${EXAMPLE}\n` +
                `Types: ${TYPES.join(", ")}. The scope is lowercase. The description starts lowercase and has no ` +
                `period at the end.\nEdit the title on the PR page; the check runs again by itself.`
        );
        process.exit(1);
    }
    console.log(`PR title OK: ${title}`);
}
