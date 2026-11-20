// Wardrobe and Perfect Equipped, game side (#101, ported from VoidKitten's #2): a loadout's plan is path writes the
// page saves through writeManyVerified; `wide wardrobestats` works the stats out again; `wide perfectequipped` still
// rebuilds the gear at once. On the fake game of the hook tests, with a level 500 mage (scripts/wardrobe-fixture.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { loadHookGame } from "./hooks/game-double.mjs";
import { savedLoadout, wardrobeGame } from "./wardrobe-fixture.mjs";

const { game, setup, gga, cheat, set } = await loadHookGame();
// The path resolver falls back to `window` for paths that don't start with gga.
globalThis.window ??= {};
const fixture = wardrobeGame();
Object.assign(gga, fixture.gga);
Object.assign(gga.ItemDefinitionsGET.h, fixture.definitions);
Object.assign(gga.CustomLists.h, fixture.lists);
for (const [method, answers] of Object.entries(fixture.computed)) game.returns[method] = (key) => answers[key];
const { hookFailures, error } = await setup();

const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");
const { writePaths, readPath } = await importRepo("src/cheats/utils/pathResolver.js");
const { captureWardrobe, validateSavedWardrobe } = await importRepo("src/cheats/helpers/wardrobe/index.js");
const { foodStackLimits, keychainRoll } = await importRepo("src/cheats/helpers/wardrobe/planner.js");
const { planPerfectEquipment } = await importRepo("src/cheats/helpers/wardrobe/perfect.js");
const { arcaneRoll, tempestRoll } = await importRepo("src/cheats/helpers/wardrobe/special.js");

const read = (name, args = {}) => {
    const result = readComputed("wardrobe", name, [args]);
    if (result.error) throw new Error(result.error);
    return result.value;
};
// What the page does with a plan: one batch through the path resolver, each value read back as it landed.
const save = (writes) => {
    const result = writePaths(
        writes.map(({ path, value }) => ({ path: `gga.${path}`, value: JSON.parse(JSON.stringify(value)) }))
    );
    assert.ok(result.ok, JSON.stringify(result.results.filter((entry) => !entry.ok)));
    for (const [index, entry] of result.results.entries())
        assert.deepEqual(entry.value, writes[index].value, `${entry.path} reads back as written`);
};
const snapshot = () => JSON.parse(JSON.stringify(fixture.gga));
const reset = () => Object.assign(gga, wardrobeGame().gga);

test("every hook installs with the wardrobe's cheats loaded", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("status: who is in play, the loadouts a mage can take, and the food stack sizes", () => {
    reset();
    const status = read("status", { goldenFood: { Lumi: 30000, Lumi_Alt: 99 } });
    assert.equal(status.character, "Lumi");
    assert.equal(status.baseClass, "Mage");
    assert.equal(status.world, 5);
    assert.ok(status.presets.some((preset) => preset.id === "rare-drops"));
    assert.ok(status.presets.every((preset) => preset.id && preset.name));
    // Golden food keeps the largest stack recorded for this character; other food gets the carry capacity.
    assert.deepEqual(status.foodLimits, { golden: 30000, regular: 1500 });
    assert.deepEqual(read("status").foodLimits, { golden: 25000, regular: 1500 }, "the golden stack worn now");
});

test("no character in play: the Wardrobe says to pick one", () => {
    reset();
    gga.UserInfo = [0];
    assert.throws(() => read("status"), /Select a character in the game/);
    reset();
});

test("a saved loadout's plan is unique path writes that land as written and change only what it lists", () => {
    reset();
    const before = snapshot();
    const plan = read("preview", { loadout: savedLoadout() });
    const paths = plan.writes.map(({ path }) => path);
    assert.equal(new Set(paths).size, paths.length, "no path twice in one batch");
    assert.deepEqual(gga.EquipmentOrder, before.EquipmentOrder, "the preview changes nothing");
    save(plan.writes);
    assert.deepEqual(gga.EquipmentOrder[0].slice(0, 6), [
        "EquipmentHats1",
        "EquipmentWands9",
        "EquipmentShirts36",
        "Blank",
        "EquipmentPants27",
        "EquipmentRings35",
    ]);
    // Cosmetic slots (premium hat, trophy, cape, nametag) are never touched.
    for (const slot of [8, 10, 12, 14]) assert.equal(gga.EquipmentOrder[0][slot], before.EquipmentOrder[0][slot]);
    assert.ok(!paths.includes("EquipmentOrder[0][12]"));
    // Prayers on the live copy and the saved one; cards in play, in the preset and in the saved copy.
    assert.deepEqual(gga.PrayersActive.slice(0, 3), [0, 3, -1]);
    assert.deepEqual(gga.PlayerDATABASE.h.Lumi.h.Prayers, gga.PrayersActive);
    assert.deepEqual(gga.Cards[2], ["w7b7", "wolfB", "B", "B", "B", "B", "B", "B"]);
    assert.deepEqual(gga.CardPreset[0], gga.Cards[2]);
    assert.deepEqual(gga.PlayerDATABASE.h.Lumi.h.CardEquip, gga.Cards[2]);
    assert.deepEqual(gga.Cards[3].h, { "{%_Card_Set_7": 30 }, "set 7 at card level 5, x6");
    assert.deepEqual(gga.PlayerDATABASE.h.Lumi.h.CSetEq.h, gga.Cards[3].h);
    assert.deepEqual(gga.Lab[1].slice(0, 3), [3, 4, -1]);
    // Obols: "Keep" keeps, "Blank" empties, a locked slot stays locked.
    assert.deepEqual(gga.ObolEquippedOrder, [
        ["ObolHyper0", "ObolHyperB0", "Blank", "ObolKruk"],
        ["Blank", "Blank", "LockedHexagon", "LockedSparkle"],
    ]);
    assert.equal(gga.ObolEquippedMap[0][0].h.UQ1txt, "%_DROP_CHANCE");
    reset();
});

test("rebuilt gear: town stones of the world reached, the crafting bonus, and the extra crafted slot", () => {
    reset();
    const plan = read("preview", { loadout: savedLoadout() });
    const stats = (path) => plan.writes.find((write) => write.path === path).value;
    // A crafted shirt: 9 slots + 1, Armor Stone V (Defence 10, main stat 6), +8 WIS from crafting.
    assert.equal(stats("EquipmentMap[0][2].h").Defence, 100);
    assert.equal(stats("EquipmentMap[0][2].h").WIS, 68);
    assert.equal(stats("EquipmentMap[0][2].h").Upgrade_Slots_Left, -9);
    // A wand: 5 slots, Weapon Stone V; not crafted.
    assert.equal(stats("EquipmentMap[0][1].h").Weapon_Power, 25);
    assert.equal(stats("EquipmentMap[0][1].h").WIS, 25);
    // The chat ring takes the premium stone of the class's main stat.
    assert.equal(stats("EquipmentMap[0][13].h").WIS, 3);
    // A keychain gets its preferred rolls, or what the saved loadout kept.
    assert.deepEqual(stats("EquipmentMap[0][9].h"), {});
    assert.deepEqual(keychainRoll("EquipmentKeychain22", "WIS"), {
        UQ1txt: "%_MOB_RESPAWN",
        UQ1val: 6,
        UQ2txt: "%_MOB_RESPAWN",
        UQ2val: 6,
    });
});

test("the preview says which picks aren't available, and keeps the current item for them", () => {
    reset();
    set("w3.prayer", false);
    const plan = read("preview", { loadout: "rare-drops" });
    const notes = plan.notes.join("\n");
    assert.match(
        notes,
        /Prehistoric Battlehair requires Character level 650; current level is 500\. Kept current item/
    );
    assert.match(
        notes,
        /Prehistoric Traps requires Trapping level 100; current level is 50\. Equipping Cardboard Traps/
    );
    assert.match(notes, /Golden Bread: food slot 6 is locked/);
    assert.match(notes, /Mini Kruk: card or card slot not unlocked/);
    assert.match(notes, /Chip Gold 10: chip or lab slot not unlocked/);
    const equipment = plan.sections.find((section) => section.title === "Equipment & specials");
    assert.equal(equipment.items[0], "Keep current item");
    assert.equal(equipment.items[1], "Diabolical Wand", "the mage's weapon");
    assert.equal(
        plan.sections.find((section) => section.title === "Tools").items[6],
        "No eligible tool at your current skill level"
    );
    // Golden food gets the largest golden stack, other food the capacity; a locked slot shows no stack.
    assert.deepEqual(plan.sections.find((section) => section.title === "Food").quantities, [
        25000,
        25000,
        25000,
        25000,
        25000,
        null,
    ]);
    assert.ok(plan.sections.some((section) => section.title === "Prayers"));
});

test("with the prayer cheat on, the loadout takes its longer prayer list up to the open slots", () => {
    reset();
    set("w3.prayer", true);
    const plan = read("preview", { loadout: "rare-drops" });
    const prayers = plan.sections.find((section) => section.title === "Prayers · prayer cheat on");
    assert.equal(prayers.items.filter((name) => name !== "Empty").length, 7, "6 wizard slots + 1 bought");
    assert.equal(plan.notes.filter((note) => /prayer or prayer slot not unlocked/.test(note)).length, 5);
    set("w3.prayer", false);
});

test("the fingerprint ignores food eaten since the preview and sees anything else", () => {
    reset();
    const first = read("preview", { loadout: "rare-drops" });
    gga.EquipmentQuantity[2][0] -= 3;
    assert.equal(read("preview", { loadout: "rare-drops" }).fingerprint, first.fingerprint);
    gga.Lv0[0] = 700;
    assert.notEqual(read("preview", { loadout: "rare-drops" }).fingerprint, first.fingerprint, "the helmet fits now");
    reset();
});

test("refusals: another class's loadout, a broken saved one, an unknown one, a name the paths can't hold", () => {
    reset();
    assert.throws(
        () => read("preview", { loadout: savedLoadout({ classes: ["Warrior"] }) }),
        /not valid for the active class/
    );
    assert.throws(() => read("preview", { loadout: savedLoadout({ equipment: ["Blank"] }) }), /Invalid saved loadout/);
    assert.throws(() => read("preview", { loadout: savedLoadout({ id: "rare-drops" }) }), /Invalid saved loadout/);
    assert.throws(() => read("preview", { loadout: "no-such-loadout" }), /Unknown wardrobe loadout/);
    gga.UserInfo = ["Lumi.Two"];
    gga.GetPlayersUsernames = ["Lumi.Two"];
    assert.throws(() => read("preview", { loadout: savedLoadout() }), /can't be changed from the Wardrobe/);
    reset();
    gga.PixelHelperActor = [{}, {}, {}, {}, {}, {}, { behaviors: { getBehavior: () => ({ _GenINFO: [] }) } }];
    assert.throws(() => read("preview", { loadout: savedLoadout() }), /Open Cards once/);
    reset();
});

test("save current: the loadout worn now comes back as a valid saved loadout that plans the same gear", () => {
    reset();
    const captured = read("capture");
    assert.match(captured.id, /^saved-[a-z0-9]+$/);
    assert.deepEqual(captured.classes, ["Mage"]);
    for (const slot of [8, 10, 12, 14]) assert.equal(captured.equipment[slot], "Keep");
    assert.deepEqual(captured.food, ["FoodG2", "FoodHealth1", "Blank", "Blank", "Blank", "Blank"]);
    assert.deepEqual(captured.obolSlots[1], ["Blank", "Blank", "Keep", "Keep"], "locked obol slots are kept");
    assert.deepEqual(validateSavedWardrobe({ ...captured, name: "  Mine  " }).name, "Mine");
    assert.deepEqual(captureWardrobe(gga, gga.CustomLists.h).equipment, captured.equipment);
    const plan = read("preview", { loadout: { ...captured, name: "Mine" } });
    assert.ok(!plan.writes.some((write) => write.path === "EquipmentOrder[0][1]"), "the worn sword is kept");
    assert.match(plan.notes.join("\n"), /Diabolical Flesh Ripper: class or special-equipment requirement not met/);
});

test("after a loadout lands: wide wardrobestats works the stats out again, then each food stack gets its size", async () => {
    reset();
    const plan = read("preview", { loadout: savedLoadout(), goldenFood: { Lumi: 40000 } });
    save(plan.writes);
    gga.DNSM.h.TotStatMAP.h = { STR: 5 };
    const calls = game.calls.length;
    assert.deepEqual(await cheat("wide wardrobestats"), {
        ok: true,
        message: "Worked out the stats of the character in play again",
    });
    assert.deepEqual(game.calls.slice(calls), [
        "_customBlock_ActionBlock",
        "_customBlock_TalentCalc",
        "_customBlock_TotalStats",
    ]);
    assert.deepEqual(gga.DNSM.h.TotStatMAP.h, {});
    assert.equal(gga.DNSM.h.PrayNonEq, undefined);
    const food = read("food", { goldenMaximum: plan.foodLimits.golden, character: "Lumi" });
    assert.deepEqual(food.writes, [
        { path: "EquipmentQuantity[2][0]", value: 40000 },
        { path: "EquipmentQuantity[2][1]", value: 1500 },
    ]);
    save(food.writes);
    assert.equal(readPath("gga.EquipmentQuantity[2][0]").value, 40000);
    reset();
});

test("an item that doesn't fit its slot is refused, so a hand-edited saved loadout can't put a shirt in the weapon slot", () => {
    reset();
    const equipment = savedLoadout().equipment.slice();
    equipment[1] = "EquipmentShirts36";
    assert.throws(
        () => read("preview", { loadout: savedLoadout({ equipment }) }),
        /Serrated Chest of the Divine doesn't go in Equipment & specials slot 2\. Nothing changed/
    );
    const food = savedLoadout().food.slice();
    food[0] = "EquipmentHats1";
    assert.throws(() => read("preview", { loadout: savedLoadout({ food }) }), /doesn't go in Food slot 1/);
    const tools = savedLoadout().tools.slice();
    tools[1] = "EquipmentTools15";
    assert.throws(() => read("preview", { loadout: savedLoadout({ tools }) }), /doesn't go in Tools slot 2/);
    // What the character wears always fits: a captured loadout plans.
    assert.ok(read("preview", { loadout: { ...read("capture"), name: "Mine" } }).writes.length);
});

test("the food and Perfect Equipped steps refuse a character other than the one they were planned for", () => {
    reset();
    const before = snapshot();
    for (const name of ["food", "perfect", "perfectFood"])
        assert.throws(() => read(name, { character: "Lumi_Alt" }), /Lumi is in play now, not Lumi_Alt/, name);
    assert.deepEqual(read("perfectFood", { character: "Lumi" }), [{ path: "EquipmentQuantity[2][1]", value: 1500 }]);
    assert.deepEqual(gga.EquipmentQuantity, before.EquipmentQuantity, "nothing written");
});

test("Perfect Equipped from the page: the gear's upgrades as writes, then the food below capacity raised", () => {
    reset();
    gga.EquipmentOrder[0][2] = "EquipmentShirts36";
    gga.EquipmentMap[0][2].h = { STR: 3, Defence: 2 };
    const perfect = read("perfect");
    assert.deepEqual(perfect.items, ["EquipmentHats1", "EquipmentSword5", "EquipmentShirts36"]);
    assert.deepEqual(perfect.skipped, ["EquipmentCape3"], "a cape has no upgrade slots");
    const shirt = perfect.writes.find((write) => write.path === "EquipmentMap[0][2].h").value;
    assert.deepEqual([shirt.Defence, shirt.WIS, shirt.STR], [100, 68, 0], "old rolls replaced");
    save(perfect.writes);
    assert.deepEqual(read("perfectFood"), [{ path: "EquipmentQuantity[2][1]", value: 1500 }], "golden 25000 stays");
    reset();
});

test("wide perfectequipped refuses with no character in play and changes nothing", async () => {
    reset();
    gga.UserInfo = [0];
    const before = JSON.stringify(gga.EquipmentMap);
    assert.deepEqual(await cheat("wide perfectequipped"), {
        ok: false,
        message: "Select a character in the game first.",
    });
    assert.equal(JSON.stringify(gga.EquipmentMap), before);
    reset();
});

test("wide perfectequipped still rebuilds the gear and raises the food at once", async () => {
    reset();
    const result = await cheat("wide perfectequipped");
    assert.equal(result.ok, true);
    assert.match(result.message, /Perfect Equipped: rebuilt 2 items for WIS; increased 1 food stacks/);
    assert.equal(gga.EquipmentQuantity[2][1], 1500);
    assert.equal(gga.EquipmentMap[0][0].h.Defence, 10, "Farmer Brim: one slot of Armor Stone V");
    reset();
});

test("perfect equipment leaves premium, keychain and protected items alone", () => {
    const a = wardrobeGame().gga;
    a.EquipmentMap[0][0].h = { Premiumified: 1 };
    const plan = planPerfectEquipment(
        a,
        wardrobeGame().definitions,
        wardrobeGame().lists,
        { extraSlot: false, statBonus: 0 },
        0,
        {},
        5
    );
    assert.deepEqual(plan.skipped, ["EquipmentHats1", "EquipmentCape3"]);
    assert.deepEqual(
        plan.equipment.map(({ item }) => item),
        ["EquipmentSword5"]
    );
});

test("food stacks: golden keeps the largest stack seen, other food the capacity", () => {
    const a = wardrobeGame().gga;
    assert.deepEqual(foodStackLimits(a, 1500, 0), { golden: 25000, regular: 1500 });
    assert.deepEqual(foodStackLimits(a, 1500, 90000), { golden: 90000, regular: 1500 });
    assert.throws(() => foodStackLimits(a, -1, 0), /Invalid food capacity/);
});

test("special gear rolls: arcane by drop quality, tempest by the world it drops in", () => {
    assert.deepEqual(arcaneRoll("EquipmentRingsArc0", 300), { UQ1val: 60, UQ2val: 60, AwesomeStats: 1 });
    assert.throws(() => arcaneRoll("EquipmentWandsArc0", 0), /quality is unavailable/);
    assert.deepEqual(tempestRoll("EquipmentBowsTempest2", 3), {
        Speed: 6,
        Weapon_Power: 46,
        UQ1val: 30,
        AwesomeStats: 1,
    });
    assert.throws(() => tempestRoll("EquipmentBowsTempest2", -1), /No unlocked world/);
});
