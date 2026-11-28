import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { releaseMessage } from "./discord-release.mjs";
import { parseReleaseLine, prNumberOf, releaseNotes } from "./release-notes.mjs";

const body = (line, kind) =>
    `**What the player sees:**\nStuff.\n\n**Release line:** ${line}\n\n**Release kind:** ${kind}\n`;
const pr = (number, line, kind, author = "lumi-fiona") => ({
    number,
    title: `feat(ui): pr ${number}`,
    author,
    body: body(line, kind),
});
const LINK = "https://github.com/o/r/releases/tag/3.0.1";

test("a release line and kind are read from the template's fields", () => {
    assert.deepEqual(parseReleaseLine(body("Pets: token picker per pet.", "new")), {
        line: "Pets: token picker per pet.",
        kind: "new",
    });
    // Bold around the colon, any case, the answer on the next line, a heading.
    assert.deepEqual(parseReleaseLine("**Release Line**:\nW7 Sushi: autoplay.\n**release kind**: Fixed."), {
        line: "W7 Sushi: autoplay.",
        kind: "fixed",
    });
    assert.deepEqual(parseReleaseLine("## Release line\nPets: x.\n\nRelease kind: internal"), {
        line: "Pets: x.",
        kind: "internal",
    });
});

test("extra whitespace and CRLF don't reach the line", () => {
    const crlf = "**Release line:**   Pets:   token   picker.  \r\n\r\n**Release kind:**  improved \r\n";
    assert.deepEqual(parseReleaseLine(crlf), { line: "Pets: token picker.", kind: "improved" });
});

test("a missing line is a problem, never a crash", () => {
    for (const missing of [null, "", "**What the player sees:**\nStuff.", body("", "new")])
        assert.deepEqual(parseReleaseLine(missing), { problem: "no release line" });
    // The unfilled template: the empty line doesn't take the kind's label as its answer.
    const template = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
    assert.deepEqual(parseReleaseLine(template), { problem: "no release line" });
    // The template's hint in an HTML comment isn't a line.
    assert.deepEqual(parseReleaseLine("<!-- **Release line:** Pets: x. -->\n**Release kind:** new"), {
        problem: "no release line",
    });
});

test("a malformed or unpicked kind keeps the line and names the problem", () => {
    assert.deepEqual(parseReleaseLine(body("Pets: x.", "bugfix")), {
        line: "Pets: x.",
        problem: `kind "bugfix" isn't new, improved, fixed or internal`,
    });
    assert.deepEqual(parseReleaseLine(body("Pets: x.", "new / improved / fixed / internal")), {
        line: "Pets: x.",
        problem: "no kind picked",
    });
    assert.deepEqual(parseReleaseLine("**Release line:** Pets: x."), { line: "Pets: x.", problem: "no kind picked" });
});

test("PR numbers come from squash and merge commit subjects", () => {
    assert.equal(prNumberOf("feat(ui): undo where it was decided (#281)"), 281);
    assert.equal(prNumberOf("Merge pull request #12 from someone/branch"), 12);
    assert.equal(prNumberOf("fix: closes #12 for real"), null);
    assert.equal(prNumberOf("chore: bump version to v2.5.3"), null);
});

test("the notes group lines by kind, add PR numbers, credit outside authors and list what needs a line", () => {
    const { notes, needs } = releaseNotes({
        prs: [
            pr(1, "Pets: token picker per pet.", "new"),
            pr(2, "W7 Sushi Station: autoplay that buys and merges.", "new", "VoidKitten"),
            pr(3, "Anvil: points save on Enter.", "improved"),
            pr(4, "Bundles: follow the search.", "fixed", "VoidKitten"),
            pr(5, "Release notes from each PR.", "internal"),
            pr(6, "", "new"),
            pr(7, "Pets: x.", "bugfix"),
            pr(8, "Bot bump.", "internal", "dependabot[bot]"),
        ],
        loose: [{ sha: "0d92c31cabc", subject: "chore: bump version to v2.5.3" }],
    });
    assert.equal(
        notes,
        [
            "## New",
            "",
            "- Pets: token picker per pet. (#1)",
            "- W7 Sushi Station: autoplay that buys and merges. (VoidKitten) (#2)",
            "",
            "## Improved",
            "",
            "- Anvil: points save on Enter. (#3)",
            "",
            "## Fixed",
            "",
            "- Bundles: follow the search. (VoidKitten) (#4)",
            "",
            "<details>",
            "<summary>Under the hood</summary>",
            "",
            "- Release notes from each PR. (#5)",
            "- Bot bump. (#8)",
            "",
            "</details>",
            "",
            "Thanks to VoidKitten.",
        ].join("\n")
    );
    assert.equal(
        needs,
        [
            "## Needs a line",
            "",
            "Not in the notes:",
            "",
            "- #6 feat(ui): pr 6: no release line.",
            `- #7 feat(ui): pr 7: kind "bugfix" isn't new, improved, fixed or internal.`,
            "- 0d92c31 chore: bump version to v2.5.3: no PR here.",
        ].join("\n")
    );
    assert.doesNotMatch(notes, /Needs a line/, "the list for the maintainer is never in the published notes");
});

test("an all-internal release is only the folded block, and its Discord post only the link", () => {
    const { notes, needs } = releaseNotes({ prs: [pr(5, "Release notes.", "internal"), pr(6, "Tests.", "internal")] });
    assert.equal(
        notes,
        "<details>\n<summary>Under the hood</summary>\n\n- Release notes. (#5)\n- Tests. (#6)\n\n</details>"
    );
    assert.equal(needs, "");
    const post = releaseMessage({ name: "3.0.1", tagName: "3.0.1", url: LINK, body: notes }).embeds[0];
    assert.equal(post.description, `[Full notes on GitHub](${LINK})`);
});

test("the Discord post: every New line without PR numbers, the counts, then the link", () => {
    const { notes } = releaseNotes({
        prs: [
            pr(1, "Pets: token picker per pet.", "new"),
            pr(2, "W7 Sushi: autoplay.", "new", "VoidKitten"),
            pr(3, "Anvil: a.", "improved"),
            pr(4, "Anvil: b.", "improved"),
            pr(5, "Bundles: c.", "fixed"),
            pr(6, "Tests.", "internal"),
        ],
    });
    const { allowed_mentions, embeds } = releaseMessage({ name: "3.0.1", tagName: "3.0.1", url: LINK, body: notes });
    assert.deepEqual(allowed_mentions, { parse: [] });
    assert.equal(embeds[0].url, LINK);
    assert.equal(
        embeds[0].description,
        [
            "- Pets: token picker per pet.",
            "- W7 Sushi: autoplay. (VoidKitten)",
            "",
            "Plus 2 improvements and 1 fix.",
            "",
            `[Full notes on GitHub](${LINK})`,
        ].join("\n")
    );
});

test("a Discord post with zero fixes skips that part, and one without New lines drops the Plus", () => {
    const post = (prs) =>
        releaseMessage({ name: "3.0.1", tagName: "3.0.1", url: LINK, body: releaseNotes({ prs }).notes }).embeds[0]
            .description;
    assert.equal(
        post([pr(1, "Pets: x.", "new"), pr(2, "Anvil: a.", "improved")]),
        `- Pets: x.\n\nPlus 1 improvement.\n\n[Full notes on GitHub](${LINK})`
    );
    assert.equal(
        post([pr(1, "Anvil: a.", "fixed"), pr(2, "Anvil: b.", "fixed")]),
        `2 fixes.\n\n[Full notes on GitHub](${LINK})`
    );
    // Hand-edited notes with CRLF still read as sections.
    const crlf = releaseNotes({ prs: [pr(1, "Pets: x.", "new")] }).notes.replace(/\n/g, "\r\n");
    assert.equal(
        releaseMessage({ tagName: "3.0.1", url: LINK, body: crlf }).embeds[0].description,
        `- Pets: x.\n\n[Full notes on GitHub](${LINK})`
    );
});

test("a long Discord post still fits Discord's limit", () => {
    const prs = Array.from({ length: 200 }, (_, i) => pr(i + 1, `Page ${i}: ${"x".repeat(40)}.`, "new"));
    const post = releaseMessage({ tagName: "3.0.1", url: LINK, body: releaseNotes({ prs }).notes }).embeds[0];
    assert.equal(post.description.length, 4096);
    assert.ok(post.description.endsWith(`[Read the full notes](${LINK})`));
});

// CodeRabbit on #317: notes written by hand under a heading the generator uses are posted whole, not as a lone link.
test("hand-written notes under a New heading are posted whole", () => {
    const body = "## New\n\nThe 3.0 release: every page in the new look.";
    const post = releaseMessage({ tagName: "3.0.0", url: LINK, body }).embeds[0];
    assert.equal(post.description, "**New**\n\nThe 3.0 release: every page in the new look.");
});
