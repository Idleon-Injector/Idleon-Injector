import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, functionSource, inGame, namesInSource, unknownNames } from "./game-names.mjs";

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
