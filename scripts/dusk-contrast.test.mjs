// Dusk: every text colour meets WCAG AA (4.5:1) on the surface it sits on, status text on the status fills included.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/ui/styles/_variables.css", import.meta.url), "utf8");
const token = (name) => {
    const value = css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    assert.ok(value, `${name} is defined`);
    return value.startsWith("var(") ? token(value.slice(4, -1)) : value;
};
const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
    const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

const surfaces = ["--c-void", "--c-void-soft", "--c-panel", "--c-panel-hover"];
const pairs = [
    ...["--c-text-main", "--c-text-muted", "--c-accent", "--c-success", "--c-warning", "--c-danger"].flatMap((text) =>
        surfaces.map((surface) => [text, surface])
    ),
    ...["--c-text-muted", "--c-danger", "--c-warning"].flatMap((text) => [
        [text, "--c-danger-tint"],
        [text, "--c-danger-flash"],
    ]),
    ...["--c-text-muted", "--c-success"].flatMap((text) => [
        [text, "--c-success-tint"],
        [text, "--c-success-flash"],
    ]),
    ["--c-text-muted", "--c-warning-tint"],
    ["--c-warning", "--c-warning-tint"],
    ["--c-accent", "--c-accent-tint"],
    ["--c-accent-ink", "--c-accent"],
    // Names that identify a thing sit on rows.
    ...[1, 2, 3, 4, 5, 6, 7].map((world) => [`--c-world-w${world}`, "--c-panel"]),
    ...["stone", "gold", "onyx", "zenith"].map((tier) => [`--c-tier-${tier}`, "--c-panel"]),
    ...["orange", "green", "purple", "yellow"].map((name) => [`--c-cauldron-${name}`, "--c-panel"]),
    ...["water", "nitrogen", "seawater", "mercury"].map((name) => [`--c-liquid-${name}`, "--c-panel"]),
    ["--c-arcade-cosmic", "--c-panel"],
    ["--c-arcade-omega", "--c-panel"],
];

test("every Dusk text colour meets WCAG AA on its surface", () => {
    const failing = pairs
        .map(([text, surface]) => [text, surface, ratio(text, surface)])
        .filter(([, , r]) => r < 4.5)
        .map(([text, surface, r]) => `${text} on ${surface}: ${r.toFixed(2)}`);
    assert.deepEqual(failing, []);
});
