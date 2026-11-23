// Every page on the shared look, held to DESIGN.md's Page standards on the fake game (checks.mjs). A failure names
// the rule and the line that breaks it. The layout rules are measured by `npm run page-shots`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "../known-bugs/index.mjs";
import { createFakeApi } from "../page-shots/fake-api.mjs";
import { fakeGameData } from "../page-shots/fake-game-data.mjs";
import {
    bulkBreaks,
    clickOutlineBreaks,
    KNOWN_BREAKS,
    loadPage,
    NOT_LISTS,
    onStandards,
    openedBreaks,
    pageBreaks,
    pageFiles,
    renderPage,
    styleSheets,
} from "./checks.mjs";

// An automation page follows the game on an interval for the whole session; here that may not keep the run open.
const everyInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => everyInterval(...args).unref();

const { router } = await createFakeApi(fakeGameData());
const { requests } = await loadUi(router);
const { buildMenuTree, pageTitle } = await importRepo("src/ui/menu/menuModel.js");

const files = pageFiles();
const pages = await Promise.all(files.map(async (file) => ({ file, page: await loadPage(file) })));
const tree = buildMenuTree(pages.map(({ page }) => page));
const titleOf = (page) => {
    const system = tree.flatMap((world) => world.systems).find((s) => s.pages.includes(page));
    return pageTitle(page, system);
};
const writes = () => requests.filter((line) => line.includes("/write")).length;

for (const { file, page } of pages.filter(({ file }) => onStandards(file))) {
    test(`${titleOf(page)} (${file.replace("src/ui/pages/", "")}) follows the page standards`, async () => {
        // What the page puts outside itself (the cog board's editor) is checked with it.
        const before = new Set(globalThis.document.body.childNodes);
        const node = await renderPage(page);
        const hosts = globalThis.document.body.childNodes.filter((el) => el.nodeType === 1 && !before.has(el));
        const name = file.replace("src/ui/pages/", "");
        const all = [
            ...pageBreaks(node, page, titleOf(page)),
            ...(await openedBreaks(node, hosts)),
            ...(await bulkBreaks(node, writes)),
        ];
        const needsSetAll = (b) => b.startsWith("Set all: ") && b.endsWith("lines without a max but no Set all");
        const breaks = NOT_LISTS.has(name) ? all.filter((b) => !needsSetAll(b)) : all;
        if (NOT_LISTS.has(name)) assert.ok(all.some(needsSetAll), "a list now, so take it off NOT_LISTS in checks.mjs");
        const known = KNOWN_BREAKS[name] ?? [];
        const added = breaks.filter((b) => !known.includes(b));
        const gone = known.filter((b) => !breaks.includes(b));
        assert.deepEqual(added, [], `\n${added.join("\n")}`);
        assert.deepEqual(gone, [], `fixed, so take it off KNOWN_BREAKS in checks.mjs:\n${gone.join("\n")}`);
    });
}

test("Automation pages are their own sidebar entries, in every world", () => {
    const breaks = pages
        .filter(({ file }) => /automation/i.test(file.split("/").pop()))
        .filter(({ page }) => page.tab !== "Automation" && page.system !== "Automation")
        .map(({ file }) => file);
    assert.deepEqual(breaks, []);
});

test("no style leaves an outline or ring after a click", async () => {
    const breaks = (await styleSheets()).flatMap(([file, css]) => clickOutlineBreaks(css, file));
    assert.deepEqual(breaks, [], `\n${breaks.join("\n")}`);
});
