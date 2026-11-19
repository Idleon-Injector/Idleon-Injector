// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// What wide autoloot does to a drop as it spawns, written down before its hook moved to defineHook (#15).
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, actor, set, setup, state, gga } = await loadHookGame();
const { cheatConfig } = state;
gga.ItemDefinitionsGET = {
    h: {
        COIN1: { h: { Type: "FISTICUFF" } },
        Cards1: { h: { Type: "CARD" } },
        Copper: { h: { Type: "ORE" } },
        Grasslands1: { h: { Type: "MONSTER_DROP" } },
        Sword: { h: { Type: "WEAPON" } },
        Timecandy1: { h: { Type: "TIME_CANDY" } },
    },
};
const recycled = [];
game.returns.recycleActor = (a) => recycled.push(a);
game.returns._customBlock_Dungon = () => -1;
game.returns.init = () => "spawned";
const { hookFailures, error } = await setup();

function world() {
    gga.OptionsListAccount = Array(100).fill(0);
    gga.Money = 10;
    gga.MoneyBANK = 100;
    gga.InventoryOrder = ["Copper", "Sword", "Copper", "Blank"];
    gga.ItemQuantity = [4, 1, 6, 0];
    gga.LockedSlots = [false, false, true, false];
    gga.ChestOrder = ["Iron", "Blank", "Blank"];
    gga.ChestQuantity = [1, 0, 0];
    recycled.length = 0;
}

function drop(type, amount, fields = {}) {
    const pickups = [];
    return actor(44, {
        actor: `${type} actor`,
        _DropType: type,
        _DropAmount: amount,
        _PlayerDroppedItem: 0,
        _BlockAutoLoot: 0,
        _DungItemStatus: 0,
        _CollectedStatus: 5,
        pickups,
        // The game's pickup; `left` is what doesn't fit in the inventory.
        _customEvent_ItemPickupInTheFirstPlace() {
            pickups.push([this._CollectedStatus, gga.DummyNumber4]);
            if ("left" in this) this._DropAmount = this.left;
        },
        ...fields,
    });
}

test("every hook these tests use installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("off: a drop spawns as the game made it", () => {
    world();
    const coin = drop("COIN1", 50);
    assert.equal(coin.init(), "spawned");
    assert.deepEqual(coin.pickups, []);
    assert.equal(gga.MoneyBANK, 100);
});

test("coins go to the bank, or the wallet, and the drop is recycled", () => {
    world();
    set("wide.autoloot");
    const coin = drop("COIN1", 50);
    assert.equal(coin.init(), undefined);
    assert.deepEqual(coin.pickups, [[0, 23.34]], "the game's own pickup runs first");
    assert.equal(gga.MoneyBANK, 150);
    assert.deepEqual(recycled, ["COIN1 actor"]);
    assert.deepEqual([coin._DropAmount, coin._ImageInst], [0, null]);
    cheatConfig.wide.autoloot.moneytochest = false;
    drop("COIN1", 5).init();
    assert.equal(gga.Money, 15);
    cheatConfig.wide.autoloot.moneytochest = true;
    set("wide.autoloot", false);
});

test("cards are picked up and recycled", () => {
    world();
    set("wide.autoloot");
    const card = drop("Cards1", 1);
    assert.equal(card.init(), undefined);
    assert.deepEqual(recycled, ["Cards1 actor"]);
    set("wide.autoloot", false);
});

test("items go to the chest: the ground remainder, then unlocked inventory stacks", () => {
    world();
    set("wide.autoloot");
    const ore = drop("Copper", 3);
    assert.equal(ore.init(), undefined);
    assert.deepEqual(gga.ChestOrder, ["Iron", "Copper", "Blank"]);
    assert.deepEqual(gga.ChestQuantity, [1, 3 + 4, 0]);
    assert.deepEqual(gga.InventoryOrder, ["Blank", "Sword", "Copper", "Blank"], "the locked stack stays");
    assert.deepEqual(gga.ItemQuantity, [0, 1, 6, 0]);
    assert.equal(ore._CollectedStatus, 1);
    assert.deepEqual(recycled, ["Copper actor"]);
    set("wide.autoloot", false);
});

test("a full chest leaves the remainder on the ground and the drop alive", () => {
    world();
    gga.ChestOrder = ["Iron", "Gold", "Tin"];
    set("wide.autoloot");
    const ore = drop("Copper", 3);
    assert.equal(ore.init(), undefined);
    assert.equal(ore._DropAmount, 3);
    assert.equal(ore._CollectedStatus, 0);
    assert.deepEqual(recycled, []);
    set("wide.autoloot", false);
});

test("multiple stacks: a configured item fills new chest slots up to its stack count", () => {
    world();
    gga.ChestOrder = ["Copper", "Blank", "Blank"];
    gga.ChestQuantity = [1049999999, 0, 0];
    gga.InventoryOrder = ["Blank"];
    gga.ItemQuantity = [0];
    cheatConfig.multiplestacks = { items: new Map([["Copper", 2]]) };
    set("wide.autoloot");
    const ore = drop("Copper", 5);
    ore.init();
    assert.deepEqual(gga.ChestOrder, ["Copper", "Copper", "Blank"]);
    assert.deepEqual(gga.ChestQuantity, [1050000000, 4, 0]);
    delete cheatConfig.multiplestacks;
    set("wide.autoloot", false);
});

test("zenith and material farming keep drops in the inventory", () => {
    world();
    set("wide.autoloot");
    cheatConfig.wide.autoloot.materialfarm = true;
    const mat = drop("Grasslands1", 2, { left: 0 });
    mat.init();
    assert.deepEqual(gga.ChestOrder, ["Iron", "Blank", "Blank"]);
    assert.deepEqual(recycled, ["Grasslands1 actor"]);
    cheatConfig.wide.autoloot.materialfarm = false;
    set("wide.autoloot", false);
});

test("drops the cheat must leave alone", () => {
    set("wide.autoloot");
    for (const [label, make] of [
        ["dungeon item", () => drop("Copper", 1, { _DungItemStatus: 1 })],
        ["player dropped", () => drop("Copper", 1, { _PlayerDroppedItem: 1 })],
        ["blocked", () => drop("Copper", 1, { _BlockAutoLoot: 1 })],
        ["not lootable", () => drop("Sword", 1)],
    ]) {
        world();
        const item = make();
        assert.equal(item.init(), "spawned", label);
        assert.deepEqual([item.pickups, recycled], [[], []], label);
    }
    world();
    game.returns._customBlock_Dungon = () => 2;
    assert.equal(drop("Copper", 1).init(), "spawned", "in a dungeon");
    game.returns._customBlock_Dungon = () => -1;
    world();
    gga.OptionsListAccount[83] = 1;
    assert.equal(drop("Copper", 1).init(), "spawned", "the game's autoloot is off");
    set("wide.autoloot", false);
});
