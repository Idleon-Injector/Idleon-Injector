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

test("the WebUI writes colours as hex or rgba() only, so it matches the game", () => {
    const found = uiFiles("src/ui").flatMap((file) =>
        readFileSync(join(root, file), "utf8")
            .split("\n")
            .flatMap((line, i) =>
                /oklch\(|oklab\(|color-mix\(|\b(?:rgba?|hsla?|hwb|lab|lch|color)\(\s*from\s/.test(line)
                    ? [`${file}:${i + 1}: ${line.trim()}`]
                    : []
            )
    );
    assert.deepEqual(found, [], "write the hex or rgba() value the game shows instead");
});
