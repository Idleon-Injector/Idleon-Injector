// The Attire Rack's outfit list, the outfits `wide attire` gives, and each character's attire (#89, from #3).
import assert from "node:assert/strict";
import { test } from "node:test";
import { attireCatalog, characterAttire, configuredAttire } from "../src/cheats/helpers/attire/outfits.js";

const defs = {
    EquipmentGown0: { h: { typeGen: "aGown", displayName: "Robes" } },
    EquipmentGown1: {
        h: { typeGen: "aGown", displayName: "First_Robe|", STR: "4", UQ1txt: "%_DROP", UQ1val: "2", UQ2txt: "0" },
    },
    Other: { h: { typeGen: "aGown" } },
    EquipmentHat1: { h: { typeGen: "aHelmet" } },
};

test("the outfits are the EquipmentGown items but the first, with their stats and bonuses", () => {
    assert.deepEqual(attireCatalog(defs), [
        {
            id: "EquipmentGown1",
            name: "First Robe ",
            stats: { Weapon_Power: 0, STR: 4, AGI: 0, WIS: 0, LUK: 0, Defence: 0 },
            bonuses: [{ key: "%_DROP", value: 2 }],
        },
    ]);
});

test("all outfits includes new definitions after restart; chosen outfits stay chosen", () => {
    const updated = { ...defs, EquipmentGown99: { h: { typeGen: "aGown", displayName: "New" } } };
    assert.deepEqual(configuredAttire(updated, { outfits: "all" }), ["EquipmentGown1", "EquipmentGown99"]);
    assert.deepEqual(configuredAttire(updated, undefined), ["EquipmentGown1", "EquipmentGown99"], "all by default");
    assert.deepEqual(configuredAttire(updated, { outfits: " EquipmentGown99 , EquipmentGown1" }), [
        "EquipmentGown1",
        "EquipmentGown99",
    ]);
    assert.deepEqual(configuredAttire(updated, { outfits: "" }), []);
    // An id that is no outfit is left out rather than breaking the game's stats.
    assert.deepEqual(configuredAttire(updated, { outfits: "EquipmentGown0,Nonsense" }), []);
});

const equipment = (id) => ({
    EquipmentOrder: [Array.from({ length: 16 }, (_, i) => (i === 15 ? id : "KeepItem" + i))],
    EquipmentQuantity: [Array(16).fill(1)],
    EquipmentMap: [Array.from({ length: 16 }, () => ({ h: { STR: 9 } }))],
});
const account = () => ({
    ...equipment("EquipmentGown1"),
    UserInfo: ["One"],
    GetPlayersUsernames: ["One", "Two", "", "Three"],
    PlayerDATABASE: {
        h: { One: { h: equipment("Blank") }, Two: { h: equipment("EquipmentGown2") }, Three: { h: {} } },
    },
});

test("the character in play shows its live attire, the others their saved attire", () => {
    assert.deepEqual(characterAttire(account()), [
        { name: "One", active: true, available: true, saved: true, item: "EquipmentGown1" },
        { name: "Two", active: false, available: true, saved: true, item: "EquipmentGown2" },
        { name: "Three", active: false, available: false, saved: false, item: "Blank" },
    ]);
});

test("a character in play without a saved copy of the slot is changed on its live copy only", () => {
    const attributes = account();
    delete attributes.PlayerDATABASE.h.One;
    assert.deepEqual(characterAttire(attributes)[0], {
        name: "One",
        active: true,
        available: true,
        saved: false,
        item: "EquipmentGown1",
    });
});
