// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// The Attire Rack (wide attire, #89): its TotalStats, EquipmentOrder and ItemDefinitionsGET hooks, on a game whose
// TotalStats caches each stat and adds up the worn items, as the game's does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "../known-bugs/index.mjs";
import { loadHookGame } from "./game-double.mjs";

const { game, set, setup, state, gga, events, cheat } = await loadHookGame();
const outfit = (STR, bonus = "0", value = 0) => ({
    h: { typeGen: "aGown", displayName: "An_Outfit", STR, UQ1txt: bonus, UQ1val: value, UQ2txt: "0", UQ2val: 0 },
});
const definitions = () => ({
    Blank: { h: {} },
    Sword: { h: { STR: 100 } },
    EquipmentGown0: outfit(99), // not an outfit
    EquipmentGown1: outfit(5, "%_DROP", 2),
    EquipmentGown2: outfit(7, "%_DMG", 3),
    EquipmentGown3: outfit(11),
});
gga.ItemDefinitionsGET = { h: definitions() };
gga.EquipmentOrder = [["Sword", ...Array(14).fill("Blank"), "EquipmentGown1"], ["Blank"]];
gga.UserInfo = ["Me"];
gga.DNSM = { h: { TotStatMAP: { h: {} }, TotalStatsETCmap: { h: {} } } };

// The game's TotalStats, in short: a cached stat comes from the cache; otherwise it adds up the worn items' stat
// (or, for calcEtcBonuses, rebuilds the bonus map from their bonuses) and caches it.
game.returns._customBlock_TotalStats = (key) => {
    const cache = gga.DNSM.h.TotStatMAP.h;
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    const items = gga.ItemDefinitionsGET.h;
    const worn = [...gga.EquipmentOrder[0], ...gga.EquipmentOrder[1]].map((id) => items[id]?.h ?? {});
    if (key === "calcEtcBonuses") {
        const map = {};
        for (const item of worn) if (item.UQ1txt && item.UQ1txt !== "0") map[item.UQ1txt] = item.UQ1val;
        gga.DNSM.h.TotalStatsETCmap = { h: map };
        return (cache[key] = 0);
    }
    return (cache[key] = worn.reduce((sum, item) => sum + (Number(item[key]) || 0), 0));
};
game.returns._customBlock_Dungon = -1;
game.returns._customBlock_ResearchStuff = 0;

const { hookFailures, error } = await setup();
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");
const totalStats = (key) => events(12)._customBlock_TotalStats(key);
const gameCalls = (name) => game.calls.filter((call) => call === name).length;
const bonuses = () => ({ ...gga.DNSM.h.TotalStatsETCmap.h });
const choose = (outfits) => (state.cheatConfig.wide.attire.outfits = outfits);
// The game empties its stat cache whenever gear changes; tests start from a fresh one.
const freshCache = () => (gga.DNSM.h.TotStatMAP = { h: {} });

test("every hook the Attire Rack uses installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("off: the hooks only pass the game's own values through", () => {
    const order = gga.EquipmentOrder;
    const items = gga.ItemDefinitionsGET;
    const cache = gga.DNSM.h.TotStatMAP;
    const before = game.calls.length;
    assert.equal(totalStats("STR"), 105);
    assert.equal(totalStats("STR"), 105);
    // Each call runs the game's method once, and nothing else of the game's.
    assert.deepEqual(game.calls.slice(before), ["_customBlock_TotalStats", "_customBlock_TotalStats"]);
    assert.equal(gga.DNSM.h.TotStatMAP, cache, "the cache is the game's own");
    assert.equal(gga.EquipmentOrder, order);
    assert.equal(gga.ItemDefinitionsGET, items);
    assert.equal(totalStats("calcEtcBonuses"), 0);
    assert.deepEqual(bonuses(), { "%_DROP": 2 }, "only the worn outfit's own bonus");
});

test("all outfits: the others' stats and bonuses count, the worn one once, through the game's own sum", () => {
    choose("all");
    set("wide.attire");
    freshCache();
    totalStats("calcEtcBonuses");
    // Sword 100, the worn outfit 5, the other two outfits 7 and 11; EquipmentGown0 is no outfit.
    assert.equal(totalStats("STR"), 123);
    assert.deepEqual(bonuses(), { "%_DROP": 2, "%_DMG": 3 });
    assert.equal(gga.EquipmentOrder[0][15], "EquipmentGown1", "the slot shows the real item again after the refill");
    assert.equal(gga.ItemDefinitionsGET.h.EquipmentGown1.h.STR, 5);
});

test("a stat the rack already refilled comes from the game's cache", () => {
    const before = gameCalls("_customBlock_TotalStats");
    assert.equal(totalStats("STR"), 123);
    assert.equal(gameCalls("_customBlock_TotalStats") - before, 1);
});

test("the research grid bonus raises the outfits' bonuses", () => {
    game.returns._customBlock_ResearchStuff = 50;
    assert.equal(totalStats("STR"), 123);
    assert.deepEqual(bonuses(), { "%_DROP": 2, "%_DMG": 4.5 });
    game.returns._customBlock_ResearchStuff = 0;
});

test("chosen outfits: only those count", () => {
    choose("EquipmentGown3, Nonsense");
    assert.equal(totalStats("STR"), 116);
    assert.deepEqual(bonuses(), { "%_DROP": 2 });
    choose("all");
});

test("no attire worn: the rack's outfits fill the empty slot, which still reads Blank", () => {
    gga.EquipmentOrder[0][15] = "Blank";
    assert.equal(totalStats("STR"), 123);
    assert.deepEqual(bonuses(), { "%_DROP": 2, "%_DMG": 3 });
    assert.equal(gga.EquipmentOrder[0][15], "Blank");
    gga.EquipmentOrder[0][15] = "EquipmentGown1";
});

test("in a dungeon: no rack bonus", () => {
    game.returns._customBlock_Dungon = 3;
    assert.equal(totalStats("STR"), 105);
    assert.deepEqual(bonuses(), { "%_DROP": 2 });
    game.returns._customBlock_Dungon = -1;
    assert.equal(totalStats("STR"), 123);
});

test("all includes an outfit a game update adds", () => {
    gga.ItemDefinitionsGET = { h: { ...definitions(), EquipmentGown9: outfit(1) } };
    assert.equal(totalStats("STR"), 124);
    gga.ItemDefinitionsGET = { h: definitions() };
});

test("a cache the game emptied is refilled under the rack again", () => {
    assert.equal(totalStats("STR"), 123);
    freshCache();
    assert.equal(totalStats("STR"), 123);
});

test("wide attirestats empties the cache and rebuilds the bonus map; the page then reads the attire", async () => {
    gga.DNSM.h.TotalStatsETCmap = { h: {} };
    gga.DNSM.h.TotStatMAP.h.STR = 1;
    gga.GetPlayersUsernames = ["Me"];
    gga.EquipmentQuantity = [Array(16).fill(1)];
    gga.EquipmentMap = [Array.from({ length: 16 }, () => ({ h: {} }))];
    gga.PlayerDATABASE = { h: {} };
    assert.deepEqual(await cheat("wide attirestats"), {
        ok: true,
        message: "Worked out the stats of the character in play again",
    });
    const { value } = readComputed("attire", "status");
    assert.deepEqual(bonuses(), { "%_DROP": 2, "%_DMG": 3 });
    assert.deepEqual(
        value.characters.map(({ name, item }) => [name, item]),
        [["Me", "EquipmentGown1"]]
    );
    assert.deepEqual(
        value.outfits.map(({ id }) => id),
        ["EquipmentGown1", "EquipmentGown2", "EquipmentGown3"]
    );
    assert.equal(totalStats("STR"), 123);
});

test("off again: the next stat puts the game's values back once, then the hooks rest", () => {
    set("wide.attire", false);
    assert.equal(totalStats("STR"), 105);
    assert.deepEqual(bonuses(), { "%_DROP": 2 });
    const cache = gga.DNSM.h.TotStatMAP;
    const before = game.calls.length;
    assert.equal(totalStats("STR"), 105);
    assert.deepEqual(game.calls.slice(before), ["_customBlock_TotalStats"]);
    assert.equal(gga.DNSM.h.TotStatMAP, cache);
});

test("on with no outfits chosen: the game's values", () => {
    choose("");
    set("wide.attire");
    const before = game.calls.length;
    assert.equal(totalStats("STR"), 105);
    assert.deepEqual(game.calls.slice(before), ["_customBlock_TotalStats"]);
    choose("all");
    set("wide.attire", false);
});
