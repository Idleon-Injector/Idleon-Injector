// What the page screenshots flag, from made-up shots.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DIFF_THRESHOLD, flagsFor, summarize } from "./report.mjs";

const shot = (name, extra = {}) => ({ name, errors: [], overflow: null, diff: { ratio: 0 }, ...extra });

test("a clean shot, or one that changed less than the threshold, isn't flagged", () => {
    assert.deepEqual(flagsFor(shot("1440/home")), []);
    assert.deepEqual(flagsFor(shot("1440/home", { diff: { ratio: DIFF_THRESHOLD } })), []);
    assert.deepEqual(flagsFor(shot("1440/home", { diff: null })), [], "no baseline is not a problem by itself");
});

test("errors are flagged with how many and the first", () => {
    assert.deepEqual(flagsFor(shot("400/world-1/bribes", { errors: ["TypeError: x is undefined", "second"] })), [
        "2 errors, first: TypeError: x is undefined",
    ]);
});

test("a page the fake game has no data for: its errors aren't flagged, its layout still is", () => {
    const unfed = {
        errors: ["Failed to load resource: the server responded with a status of 500"],
        misses: { "gga.Tasks": "Cannot resolve path segment: Tasks" },
    };
    assert.deepEqual(flagsFor(shot("1440/account/task-board", unfed)), []);
    const overflow = { viewport: 400, boxes: [{ box: "the page", by: 8, culprit: "" }] };
    assert.deepEqual(flagsFor(shot("400/account/task-board", { ...unfed, overflow })), [
        "the page is 8px too wide for the 400px window",
    ]);
    const summary = summarize([shot("1440/account/task-board", unfed)], []);
    assert.deepEqual(summary.unfed, ["1440/account/task-board"]);
    assert.match(summary.text, /1 show a page the fake game has no data for/);
});

test("each box that is too wide for the window is flagged, with what sticks out", () => {
    const overflow = {
        viewport: 400,
        boxes: [
            { box: "the page", by: 12, culprit: "" },
            { box: "div.account-list", by: 61, culprit: "div.account-row__controls" },
        ],
    };
    assert.deepEqual(flagsFor(shot("400/world-1/anvil", { overflow })), [
        "the page is 12px too wide for the 400px window",
        "div.account-list is 61px too wide for the 400px window (div.account-row__controls)",
    ]);
});

test("a change since the baseline is flagged above the threshold, and a new size always", () => {
    assert.deepEqual(flagsFor(shot("1440/home", { diff: { ratio: 0.0234 } })), [
        "2.34% of the pixels changed since the baseline",
    ]);
    assert.deepEqual(flagsFor(shot("1440/home", { diff: { ratio: 0.0234 } }), 0.05), [], "the threshold is a dial");
    assert.deepEqual(
        flagsFor(shot("1440/home", { diff: { sizeChanged: true, before: "1440x900", after: "1440x1300" } })),
        ["size changed from 1440x900 to 1440x1300"]
    );
});

test("the summary lists only flagged shots, and what is new or gone since the baseline", () => {
    const shots = [
        shot("1440/home"),
        shot("1440/world-1/anvil", { errors: ["boom"] }),
        shot("1440/world-2/kangaroo", { diff: null }),
    ];
    const summary = summarize(shots, ["1440/home", "1440/world-1/anvil", "1440/older-pages/w2/poppy"]);
    assert.deepEqual(summary.flagged, [{ name: "1440/world-1/anvil", flags: ["1 error, first: boom"] }]);
    assert.deepEqual(summary.added, ["1440/world-2/kangaroo"]);
    assert.deepEqual(summary.gone, ["1440/older-pages/w2/poppy"]);
    assert.equal(
        summary.text,
        [
            "3 screenshots, 1 flagged.",
            "",
            "Flagged:",
            "  1440/world-1/anvil: 1 error, first: boom",
            "",
            "New since the baseline:",
            "  1440/world-2/kangaroo",
            "",
            "In the baseline but not found now:",
            "  1440/older-pages/w2/poppy",
        ].join("\n")
    );
    assert.doesNotMatch(summary.text, /1440\/home/, "a clean shot isn't listed");
});

test("without a baseline nothing counts as new, and the summary says nothing was compared", () => {
    const summary = summarize([shot("1440/home", { diff: null })], []);
    assert.deepEqual(summary.added, []);
    assert.equal(summary.text, "1 screenshot, 0 flagged.\nNo baseline for these pages yet, so nothing was compared.");
});
