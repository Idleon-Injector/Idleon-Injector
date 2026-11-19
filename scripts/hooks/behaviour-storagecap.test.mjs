// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// What wide storagecap does to the game's deposits, written down before its hooks moved to defineHook (#15):
// item grants, anvil quick deposits, printer deposits, chest condensing, and the scope they share.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, events, actor, set, setup, gga } = await loadHookGame();
const actions = [];
game.returns._customBlock_ActionBlock = (key) => actions.push(key);
gga.DummyNumbersStatManager = { h: {} };
gga.DNSM = { h: {} };
const { hookFailures, error } = await setup();
const chest = () => {
    gga.ChestOrder = ["Copper", "Blank", "Iron"];
    gga.ChestQuantity = [5, 0, 3];
    return gga.ChestQuantity;
};

test("every hook these tests use installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("condensing the chest awards nothing and destroys nothing while on", () => {
    const block = events(345)._customBlock_ActionBlock;
    actions.length = 0;
    block("CondenseChest2B");
    set("wide.storagecap");
    assert.equal(block("CondenseChest2B"), undefined);
    block("Other");
    set("wide.storagecap", false);
    assert.deepEqual(actions, ["CondenseChest2B", "Other"]);
});

test("item grants: a capped chest merge lands as the real total, atoms still award", () => {
    chest();
    const grant = gga.DummyNumbersStatManager.h;
    Object.assign(grant, { ItemGiverDT22: "YESputInChest8910nocap", ItemGiverMaxCap: 5e9, ItemGiverAmount: 7e9 });
    game.returns._customBlock_GiveItem = (item, amount) => {
        gga.ChestQuantity[0] = 2e9; // the game's merge ceiling
        gga.ChestQuantity[2] = 2e9; // a different item's slot
        events(345)._customBlock_ActionBlock("GiveAtoms");
        return `gave ${item} ${amount}`;
    };
    actions.length = 0;
    assert.equal(events(124)._customBlock_GiveItem("Copper", 1), "gave Copper 1");
    assert.deepEqual([...gga.ChestQuantity], [2e9, 0, 2e9], "off: the game's cap");
    const quantities = chest();
    set("wide.storagecap");
    assert.equal(events(124)._customBlock_GiveItem("Copper", 1), "gave Copper 1");
    assert.deepEqual([...gga.ChestQuantity], [5 + 7e9, 0, 2e9]);
    assert.equal(gga.ChestQuantity, quantities, "the game's own list");
    assert.deepEqual(actions, ["GiveAtoms", "GiveAtoms"]);
    grant.ItemGiverDT22 = "other";
    grant.ItemGiverMaxCap = 2e9;
    chest();
    events(124)._customBlock_GiveItem("Copper", 1);
    assert.deepEqual([...gga.ChestQuantity], [2e9, 0, 2e9], "a regular capacity split stays");
    set("wide.storagecap", false);
});

test("the chest list is the game's own again after a deposit", () => {
    const quantities = chest();
    set("wide.storagecap");
    let during;
    game.returns._customBlock_GiveItem = () => {
        during = gga.ChestQuantity;
    };
    events(124)._customBlock_GiveItem("Copper", 1);
    assert.notEqual(during, quantities, "a stand-in while the game deposits");
    assert.equal(gga.ChestQuantity, quantities);
    game.returns._customBlock_GiveItem = () => {
        throw new Error("game error");
    };
    assert.throws(() => events(124)._customBlock_GiveItem("Copper", 1), /game error/);
    assert.equal(gga.ChestQuantity, quantities, "even when the game throws");
    set("wide.storagecap", false);
});

test("anvil quick deposits: a capped slot lands as the real total, the anvil cheat still applies", () => {
    const anvil = events(189);
    gga.AnvilPA = [
        [0, 0],
        [4e9, 0],
    ];
    gga.PlayerDATABASE = { h: { Bob: { h: { AnvilPA: [[0], [6e9]] } } } };
    Object.assign(gga.DNSM.h, { AnvilPAqd2: 0, AnvilPAqd3: 1 });
    game.returns._customBlock_AnvilProduceStats = (key) => {
        if (key.startsWith("QuickDesposit")) gga.ChestQuantity[0] = 2e9;
        return 50;
    };
    chest();
    anvil._customBlock_AnvilProduceStats("QuickDespositALL");
    assert.equal(gga.ChestQuantity[0], 2e9);
    set("wide.storagecap");
    set("w1.anvil");
    chest();
    assert.equal(anvil._customBlock_AnvilProduceStats("QuickDespositALL"), 50);
    assert.equal(gga.ChestQuantity[0], 5 + 4e9);
    gga.AnvilPA[1][0] = 0;
    chest();
    anvil._customBlock_AnvilProduceStats("QuickDespositALLautoALL");
    assert.equal(gga.ChestQuantity[0], 5 + 6e9);
    assert.equal(anvil._customBlock_AnvilProduceStats("Costs1"), 0);
    set("wide.storagecap", false);
    assert.equal(anvil._customBlock_AnvilProduceStats("Costs1"), 0);
    set("w1.anvil", false);
    assert.equal(anvil._customBlock_AnvilProduceStats("Costs1"), 50);
});

test("printer deposits: the printed amount goes to the chest uncapped, without atoms or the capped write", () => {
    gga.DummyText2 = "YESputInChest8910nocap";
    const gifts = [];
    game.returns._customBlock_GiveItem = (item, amount) => {
        gifts.push([item, amount]);
        gga.ChestQuantity[2] = 105e7; // what the nested grant sees
        return "given";
    };
    const printer = actor(481, { _TRIGGEREDtext: "d1", _DNprint: 0 });
    game.returns._customEvent_anotherThing = function () {
        this._DNprint = 3.6e9;
        events(345)._customBlock_ActionBlock("GiveAtoms");
        gga.ChestQuantity[0] = 105e7;
        events(124)._customBlock_GiveItem("Copper", 105e7);
        this._DNprint = 0;
        return "printed";
    };
    actions.length = 0;
    chest();
    assert.equal(printer._customEvent_anotherThing(), "printed");
    assert.deepEqual(gifts, [["Copper", 105e7]]);
    assert.deepEqual(actions, ["GiveAtoms"], "off: atoms award");
    assert.equal(gga.ChestQuantity[0], 105e7);

    set("wide.storagecap");
    actions.length = 0;
    chest();
    assert.equal(printer._customEvent_anotherThing(), "printed");
    assert.deepEqual(gifts[1], ["Copper", 3.6e9]);
    assert.deepEqual(actions, [], "no atoms for a printed deposit");
    assert.deepEqual([...gga.ChestQuantity], [5, 0, 105e7]);
    assert.equal(printer._DNprint, 0);
    assert.ok(Object.getOwnPropertyDescriptor(printer, "_DNprint").writable, "the field is plain again");

    printer._TRIGGEREDtext = "k1";
    chest();
    printer._customEvent_anotherThing();
    assert.deepEqual(gifts[2], ["Copper", 105e7], "not a deposit trigger");
    set("wide.storagecap", false);
});

test("printer deposits: a deposit that printed nothing, or not to the chest, is the game's own", () => {
    const gifts = [];
    game.returns._customBlock_GiveItem = (item, amount) => gifts.push(amount);
    const printer = actor(481, { _TRIGGEREDtext: "d1" });
    game.returns._customEvent_anotherThing = function () {
        events(124)._customBlock_GiveItem("Copper", 9);
        this._DNprint = 4e9;
        gga.DummyText2 = "other";
        events(124)._customBlock_GiveItem("Copper", 8);
        gga.DummyText2 = "YESputInChest8910nocap";
    };
    set("wide.storagecap");
    chest();
    printer._customEvent_anotherThing();
    assert.deepEqual(gifts, [9, 8]);
    assert.equal(printer._DNprint, 4e9);
    set("wide.storagecap", false);
});
