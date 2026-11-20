// One colour set for the WebUI and the game: the Steam client runs Chromium 87, which drops oklch(), oklab(),
// color-mix() and relative colours ("rgb(from ...)"), so any of them makes the two menus look different.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const uiFiles = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? entry.name === "vendor"
                ? []
                : uiFiles(join(dir, entry.name))
            : /\.(js|css|html)$/.test(entry.name)
              ? [join(dir, entry.name)]
              : []
    );

// Each colour Chromium 87 drops, with its line. The whole text is searched, so a relative colour whose "from" is on
// the next line is found too.
const dropped = (text) =>
    [...text.matchAll(/oklch\(|oklab\(|color-mix\(|\b(?:rgba?|hsla?|hwb|lab|lch|color)\(\s*from\s/g)].map((match) => {
        const line = text.slice(0, match.index).split("\n").length;
        return `${line}: ${text.split("\n")[line - 1].trim()}`;
    });

test("the WebUI writes colours as hex or rgba() only, so it matches the game", () => {
    const found = uiFiles("src/ui").flatMap((file) =>
        dropped(readFileSync(join(root, file), "utf8")).map((entry) => `${file}:${entry}`)
    );
    assert.deepEqual(found, [], "write the hex or rgba() value the game shows instead");
});

// Review of #145: a relative colour split across lines passed.
test("a relative colour split across lines is found", () => {
    const css = "a {\n    background: rgba(\n        from #123456 r g b / 0.5\n    );\n}\n";
    assert.deepEqual(dropped(css), ["2: background: rgba("]);
});
