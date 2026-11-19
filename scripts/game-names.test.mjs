import assert from "node:assert/strict";
import test from "node:test";
import {
    compare,
    findWebGameUrl,
    fingerprint,
    functionSource,
    inGame,
    namesInSource,
    unknownNames,
    watch,
    watchIssue,
} from "./game-names.mjs";

test("names: every kind of reference is collected", () => {
    const names = namesInSource(`
        const c = events(189);
        c._customBlock_AnvilProduceStats = () => {};
        behavior.runLater(1, f);
        firebase.playButton();
        const a = cList.SlabItemSort, b = readCList("CompanionDB");
        gga.Holes[15][0] = 1; gga("Cards[1]"); writeVerified(\`RoyalMaps[\${i}][11]\`, 0); readGgaEntries("Lv0");
        const row = { writePath: \`UpgVault[\${i}]\`, levelsPath: "Atoms", definitionsPath: "UpgradeVault" };
        const EQUIPPED_MAIN_PATH = "EquipmentOrder[0]";
        createProxy(gga, "GemsOwned", {});
    `);
    assert.deepEqual([...names].sort(), [
        "behavior:runLater",
        "class:scripts.ActorEvents_189",
        "clist:CompanionDB",
        "clist:SlabItemSort",
        "clist:UpgradeVault",
        "firebase:playButton",
        "gga:Atoms",
        "gga:Cards",
        "gga:EquipmentOrder",
        "gga:GemsOwned",
        "gga:Holes",
        "gga:Lv0",
        "gga:RoyalMaps",
        "gga:UpgVault",
        "method:_customBlock_AnvilProduceStats",
    ]);
});

test("names: comments, imports, class names and the injector's own names don't count", () => {
    const names = namesInSource(`
        import { thing } from "./gga.js";
        /** Reads gga.Atoms[b] */
        // re-called from firebase.js
        const url = "https://example.com//gga.Fake";
        behavior = context["com.stencyl.behavior.Script"];
        if (gga.Holes[11]._isPatched) {}
        const config = { path: "cheatConfig" };
        const p = \`gga.\${path}\`;
    `);
    assert.deepEqual([...names], ["gga:Holes"]);
});

const GAME = [
    'A["scripts.ActorEvents_579"]=m;',
    'm._customBlock_Gallery=\nfunction(d,b){if("GalleryBonusSystemON"==d)return b.h.Cards;return "}"}',
    "c.runLater=function(e,t){return e+t};",
    'q.h.OptionsListAccount=[];var z="SlabItemSort";',
].join("");

test("game lookup: each kind, including a line break between = and function", () => {
    for (const n of [
        "class:scripts.ActorEvents_579",
        "method:_customBlock_Gallery",
        "behavior:runLater",
        "gga:OptionsListAccount",
        "clist:SlabItemSort",
    ]) {
        assert.ok(inGame(GAME, n), n);
    }
    assert.equal(inGame(GAME, "method:_customBlock_Missing"), false);
    assert.equal(inGame(GAME, "class:scripts.ActorEvents_1"), false);
});

test("fingerprint: the whole function, braces inside strings skipped", () => {
    assert.equal(
        functionSource(GAME, "_customBlock_Gallery"),
        '{if("GalleryBonusSystemON"==d)return b.h.Cards;return "}"}'
    );
    assert.equal(fingerprint(GAME, "_customBlock_Missing"), null);
});

test("fingerprint: ignores the minifier renaming, sees real changes", () => {
    const before = fingerprint(GAME, "_customBlock_Gallery");
    const renamed = GAME.replace(
        'function(d,b){if("GalleryBonusSystemON"==d)return b.h',
        'function(Na,e){if("GalleryBonusSystemON"==Na)return e.h'
    );
    assert.equal(fingerprint(renamed, "_customBlock_Gallery"), before);
    assert.notEqual(
        fingerprint(GAME.replace("GalleryBonusSystemON", "GalleryBonusSystemOFF"), "_customBlock_Gallery"),
        before
    );
    assert.notEqual(fingerprint(GAME.replace("b.h.Cards", "b.h.Cards2"), "_customBlock_Gallery"), before);
});

test("check: a name that isn't in the pinned list is reported", () => {
    const names = new Map([
        ["gga:Holes", new Set(["a.js"])],
        ["gga:NewThing", new Set(["b.js"])],
    ]);
    assert.deepEqual(unknownNames(names, { names: { gga: ["Holes"] } }), ["gga:NewThing"]);
    assert.deepEqual(unknownNames(new Map([["gga:Holes", new Set()]]), { names: { gga: ["Holes"] } }), []);
});

test("watch: finds the game's code through the site's Play link", async () => {
    const pages = {
        "https://www.legendsofidleon.com/":
            '<link href="/app-1.js"><script src="/component---src-pages-index-js-2.js">',
        "https://www.legendsofidleon.com/app-1.js": "no links here",
        "https://www.legendsofidleon.com/component---src-pages-index-js-2.js":
            'createElement("a",{className:"SubtleLink PlayButton",href:"/ytGl5oc/"},"Play for Free")',
    };
    assert.equal(await findWebGameUrl(async (url) => pages[url]), "https://www.legendsofidleon.com/ytGl5oc/N.js");
    pages["https://www.legendsofidleon.com/component---src-pages-index-js-2.js"] = "redesigned";
    await assert.rejects(
        findWebGameUrl(async (url) => pages[url]),
        /No Play link found/
    );
});

const PINNED = {
    fingerprints: { _customBlock_Gallery: fingerprint(GAME, "_customBlock_Gallery"), runLater: null },
};
const NAMES = new Map([
    ["method:_customBlock_Gallery", new Set(["src/cheats/proxies/events579.js"])],
    ["gga:OptionsListAccount", new Set(["src/ui/a.js"])],
]);

test("watch: a version that matches opens nothing", () => {
    const off = compare(NAMES, PINNED, GAME);
    assert.deepEqual(off, { missing: [], changed: [] });
    assert.equal(watchIssue(off, { sha256: "a".repeat(64) }, NAMES), null);
});

test("watch: missing names and changed functions are listed with their files", () => {
    const game = GAME.replace("q.h.OptionsListAccount", "q.h.OptionsListAccount2").replace("b.h.Cards", "b.h.Cards2");
    const off = compare(NAMES, PINNED, game);
    assert.deepEqual(off, { missing: ["gga:OptionsListAccount"], changed: ["_customBlock_Gallery"] });
    const issue = watchIssue(off, { sha256: "0123456789abcdef", lastModified: "Sun, 01 Nov 2026 23:16:58 GMT" }, NAMES);
    assert.equal(issue.title, "Game update 2026-11-01 (0123456789ab): 1 missing game name, 1 changed game function");
    assert.match(issue.body, /- `gga:OptionsListAccount` in src\/ui\/a\.js/);
    assert.match(issue.body, /- `_customBlock_Gallery`/);
});

test("watch: one issue per game version, never a duplicate", async () => {
    const titles = [];
    const github = {
        issueTitles: () => titles,
        openIssue: ({ title }) => (titles.push(title), `#${titles.length}`),
    };
    const broken = GAME.replace("q.h.OptionsListAccount", "q.h.Renamed");
    const load = async () => ({ text: broken, meta: { sha256: "feedfacecafe0000" } });
    const logs = [];
    const run = () => watch({ names: NAMES, pinned: PINNED, source: "x", load, github, log: (m) => logs.push(m) });
    await run();
    await run();
    assert.equal(titles.length, 1);
    assert.deepEqual(logs, ["Opened #1", "Already reported: feedfacecafe"]);
});

test("watch: a game file that can't be loaded fails the run", async () => {
    const load = async () => {
        throw new Error("https://www.legendsofidleon.com/ytGl5oc/N.js: HTTP 404");
    };
    await assert.rejects(watch({ names: NAMES, pinned: PINNED, source: "x", load, github: {} }), /HTTP 404/);
});
