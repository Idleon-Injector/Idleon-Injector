/**
 * What the page screenshots flag, and the summary that lists only the flagged shots. No browser here, so the
 * tests can feed it made-up shots.
 *
 * A shot: { name, errors: string[], misses: { [path]: error } (what the page asked the fake game for and didn't get),
 *           overflow: null | { viewport, boxes: [{ box, by, culprit }] },
 *           layout: string[] (the layout rules it breaks, see layout.mjs),
 *           diff: null (no baseline) | { ratio } | { sizeChanged: true, before, after } }
 */

/** Share of pixels that may differ from the baseline before a shot is flagged (text antialiasing, a caret). */
export const DIFF_THRESHOLD = 0.001;

const missCount = (shot) => Object.keys(shot.misses ?? {}).length;

/**
 * Why a shot needs a look, in plain words; empty when it doesn't. A page the fake game lacks data for errors
 * because of that, so its errors aren't flagged (the summary counts it instead); its layout still is.
 */
export function flagsFor(shot, threshold = DIFF_THRESHOLD) {
    const flags = [];
    if (shot.errors.length && !missCount(shot)) {
        flags.push(`${shot.errors.length} error${shot.errors.length > 1 ? "s" : ""}, first: ${shot.errors[0]}`);
    }
    for (const { box, by, culprit } of shot.overflow?.boxes ?? []) {
        flags.push(
            `${box} is ${by}px too wide for the ${shot.overflow.viewport}px window${culprit ? ` (${culprit})` : ""}`
        );
    }
    flags.push(...(shot.layout ?? []));
    if (shot.diff?.sizeChanged) flags.push(`size changed from ${shot.diff.before} to ${shot.diff.after}`);
    else if (shot.diff && shot.diff.ratio > threshold) {
        flags.push(`${(shot.diff.ratio * 100).toFixed(2)}% of the pixels changed since the baseline`);
    }
    return flags;
}

/**
 * Flag every shot and write the summary. `baselineNames` are the shots the baseline has;
 * a name only one side has is new or gone (a page that moved shows as both).
 */
export function summarize(shots, baselineNames, threshold = DIFF_THRESHOLD) {
    const flagged = shots
        .map((shot) => ({ name: shot.name, flags: flagsFor(shot, threshold) }))
        .filter((s) => s.flags.length);
    const names = new Set(shots.map((shot) => shot.name));
    const hasBaseline = baselineNames.length > 0;
    const added = hasBaseline ? shots.filter((shot) => !shot.diff).map((shot) => shot.name) : [];
    const gone = baselineNames.filter((name) => !names.has(name));
    const unfed = shots.filter((shot) => shot.errors.length && missCount(shot)).map((shot) => shot.name);
    const lines = [`${shots.length} screenshot${shots.length === 1 ? "" : "s"}, ${flagged.length} flagged.`];
    if (!hasBaseline) lines.push("No baseline for these pages yet, so nothing was compared.");
    if (unfed.length) {
        lines.push(
            `${unfed.length} show a page the fake game has no data for, so their errors aren't flagged;`,
            "report.json lists what each asked for (`misses`), to add to scripts/page-shots/data/."
        );
    }
    if (flagged.length)
        lines.push("", "Flagged:", ...flagged.flatMap(({ name, flags }) => flags.map((f) => `  ${name}: ${f}`)));
    if (added.length) lines.push("", "New since the baseline:", ...added.map((name) => `  ${name}`));
    if (gone.length) lines.push("", "In the baseline but not found now:", ...gone.map((name) => `  ${name}`));
    return { flagged, added, gone, unfed, text: lines.join("\n") };
}
