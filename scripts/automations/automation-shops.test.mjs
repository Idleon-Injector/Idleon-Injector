// Automation (#92): the buying rule every system shares (High / Low / Balanced and saving %, decided with Lumi on
// 2026-11-10), and the shop automation on top of it: "automation shops" buys the switched-on town shop items into the
// chest with chest coins, cheapest first, up to the stop-at, only what the chest can take, every second.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { choosePurchase, buyCheapestFirst } = await importRepo("src/cheats/helpers/automation/engine.js");
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const HIGH = 1;
const LOW = 2;
const item = (name, cost, priority) => ({ name, cost, priority });
const pick = (items, money, saving = 10) => choosePurchase(items, money, saving)?.name ?? null;

test("Balanced items buy cheapest first, and nothing buys what the money can't reach", () => {
    const items = [item("b", 30), item("a", 10), item("c", 20)];
    assert.equal(pick(items, 100), "a");
    assert.equal(pick(items, 5), null);
    assert.equal(pick([], 100), null);
});

test("an affordable High item goes first, even before a cheaper Balanced one", () => {
    assert.equal(pick([item("cheap", 1), item("high", 50, HIGH)], 60), "high");
});

test("while saving for the cheapest High or Low item, Balanced items may only cost up to saving % of it", () => {
    const items = [item("goal", 1000, LOW), item("small", 90), item("big", 150)];
    assert.equal(pick(items, 500, 10), "small", "90 is under 10% of 1000");
    assert.equal(pick([item("goal", 1000, LOW), item("big", 150)], 500, 10), null, "150 waits for the goal");
    assert.equal(pick(items, 1000, 10), "goal", "the goal buys once affordable");
    assert.equal(pick([item("goal", 1000, LOW), item("big", 150)], 500, 0), null, "0% saves everything");
});

test("Lumi's numbers: with 65B, a 10B Low restart buys while a 2.5T High reset is out of reach", () => {
    const items = [item("mega reset", 2.5e12, HIGH), item("restart", 10e9, LOW), item("feather", 5e9)];
    assert.equal(pick(items, 65e9), "restart", "no group blocks another");
    // Saving for the 2.5T reset alone, 10% lets Balanced items up to 250B buy.
    assert.equal(pick([items[0], items[2]], 65e9), "feather");
});

test("buying re-reads after every buy and stops after 100 in one tick", () => {
    let money = 35;
    const stock = { a: 3, b: 1 };
    const read = () =>
        Object.entries(stock)
            .filter(([, left]) => left > 0)
            .map(([name], i) => ({ cost: 10 + i, buy: () => (stock[name]--, (money -= 10 + i)) }));
    assert.equal(
        buyCheapestFirst(read, () => money),
        3
    );
    assert.deepEqual(stock, { a: 0, b: 1 });

    let buys = 0;
    const endless = () => [{ cost: 0, buy: () => buys++ }];
    assert.equal(
        buyCheapestFirst(endless, () => 0),
        100
    );
    assert.equal(buys, 100);
});

// Two shops: shop 0 in a W1 town (map 3), shop 1 in a W3 town (map 101).
const given = [];
const setShopGame = () => {
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    Object.assign(gga.CustomLists.h, {
        ShopNames: [
            ["CopperOre", "Sword"],
            ["Bread", "Cloth"],
        ],
        ShopLocations: ["3", "101"],
        MapDispName: Object.assign(Array(110).fill("Somewhere"), { 3: "Blunder_Hills", 101: "Frostbite_Town" }),
        MapName: Object.assign(Array(110).fill("Other"), { 3: "Town" }),
    });
    Object.assign(gga.ItemDefinitionsGET.h, {
        CopperOre: { h: { displayName: "Copper_Ore", typeGen: "dOre" } },
        Sword: { h: { displayName: "Wooden_Sword", typeGen: "aWeapon" } },
        Bread: { h: { displayName: "Bread", typeGen: "cFood" } },
        Cloth: { h: { displayName: "Cloth", typeGen: "dCloth" } },
    });
    Object.assign(gga, {
        CurrentMap: 3,
        ShopStock: [
            [100, 2],
            [50, 10],
        ],
        ChestOrder: ["CopperOre", "Blank", "Blank", "Bread", "Locked"],
        ChestQuantity: [40, 0, 0, 5, 0],
        ChestSlotsOwned: 4,
        MoneyBANK: 1000,
    });
    const prices = { CopperOre: 2, Sword: 100, Bread: 5, Cloth: 1 };
    context["scripts.ActorEvents_12"]._customBlock_RunCodeOfTypeXforThingY = (kind, name) =>
        kind === "BuyPrice" ? prices[name] : 0;
    given.length = 0;
    // Like the game: a stack merges into its slot or takes a blank one; equipment takes one blank slot each.
    context["scripts.ActorEvents_124"]._customBlock_GiveItem = (name, amount) => {
        given.push([name, amount, gga.DummyText2]);
        const stacks = gga.DummyText2.endsWith("nocap");
        for (let left = stacks ? 1 : amount; left > 0; left--) {
            let slot = stacks ? gga.ChestOrder.indexOf(name) : -1;
            if (slot < 0) slot = gga.ChestOrder.indexOf("Blank");
            gga.ChestOrder[slot] = name;
            gga.ChestQuantity[slot] += stacks ? amount : 1;
        }
        return "done";
    };
};
const setShops = (entries) => state.updateCheatConfig({ automation: { shops: entries } });
const shops = () => getAutomations().find(({ id }) => id === "account.automation.shops");

test("the Shops tab reads every shop by world, with today's stock", () => {
    setShopGame();
    assert.deepEqual(readComputed("automation", "shops").value, [
        {
            shop: 0,
            world: 1,
            town: "Blunder_Hills",
            items: [
                { item: "CopperOre", name: "Copper_Ore", stock: 100 },
                { item: "Sword", name: "Wooden_Sword", stock: 2 },
            ],
        },
        {
            shop: 1,
            world: 3,
            town: "Frostbite_Town",
            items: [
                { item: "Bread", name: "Bread", stock: 50 },
                { item: "Cloth", name: "Cloth", stock: 10 },
            ],
        },
    ]);
});

test("automation shops buys switched-on items into the chest each second, cheapest first, up to the stop-at", async () => {
    setShopGame();
    setShops([
        { id: "0:CopperOre", on: true, stopAt: 100 },
        { id: "1:Bread", on: true },
        { id: "1:Cloth", on: false },
    ]);
    assert.equal((await cheat("automation shops")).ok, true);
    assert.equal(shops().on, true);
    assert.deepEqual(
        readComputed("automation", "list").value.map(({ id, label, on }) => [id, label, on]),
        [["account.automation.shops", "Shops", true]],
        "the overview lists only the automation toggles"
    );

    mock.timers.tick(1000);
    // Copper (2 each) first: the chest holds 40, so 60 more reach the stop-at; then Bread (5 each), all 50.
    assert.deepEqual(given, [
        ["CopperOre", 60, "YESputInChest8910nocap"],
        ["Bread", 50, "YESputInChest8910nocap"],
    ]);
    assert.equal(gga.MoneyBANK, 1000 - 120 - 250);
    assert.deepEqual(gga.ShopStock, [
        [40, 2],
        [0, 10],
    ]);
    assert.equal(gga.DummyText2, "done");
    assert.equal(shops().status, "Buying 2 items; 110 bought since it started");

    // Nothing left to buy: the chest holds the stop-at and Bread is sold out.
    assert.deepEqual(gga.ChestQuantity, [100, 0, 0, 55, 0]);
    mock.timers.tick(1000);
    assert.equal(given.length, 2);

    await cheat("automation shops", false);
    assert.equal(shops().on, false);
});

test("it buys only what the coins and the chest can take, and nothing outside a character's map", async () => {
    setShopGame();
    gga.MoneyBANK = 250;
    gga.ChestOrder = ["CopperOre", "Blank", "Bread", "Bread", "Locked"];
    setShops([
        { id: "0:Sword", on: true },
        { id: "1:Cloth", on: true },
    ]);
    await cheat("automation shops", true);

    // Character select: the scene isn't the current map's.
    context["com.stencyl.Engine"].engine.scene = { name: "CharSelect" };
    mock.timers.tick(1000);
    assert.deepEqual(given, []);
    assert.equal(shops().status, "Waiting for a character to be in game");

    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    mock.timers.tick(1000);
    // Cloth (1 each) takes the one blank slot; the swords (equipment, one per slot) then find no room.
    assert.deepEqual(given, [["Cloth", 10, "YESputInChest8910nocap"]]);
    assert.equal(gga.MoneyBANK, 240);
    assert.deepEqual(gga.ShopStock[0], [100, 2]);

    // With a blank slot again, coins buy two 100-coin swords; equipment goes in with the capped chest flag.
    gga.ChestOrder[2] = "Blank";
    gga.ChestOrder[3] = "Blank";
    mock.timers.tick(1000);
    assert.deepEqual(given.at(-1), ["Sword", 2, "YESputInChest8910"]);
    assert.equal(gga.MoneyBANK, 40);

    setShops([]);
    assert.equal(shops().status, "No shop item is switched on");
    await cheat("automation shops", false);
});
