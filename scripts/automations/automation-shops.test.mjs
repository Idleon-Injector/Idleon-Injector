// Automation (#92): the buying rule every system shares ("Save for it" and saving %, decided with Lumi on 2026-11-10,
// one switch since #205), and the shop automation on top of it: "automation shops" buys the switched-on town shop items into the
// chest with chest coins, cheapest first, up to the stop-at, only what the chest can take, every second.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { choosePurchase, buyCheapestFirst } = await importRepo("src/cheats/helpers/automation/engine.js");
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const item = (name, cost, save = false) => ({ name, cost, save });
const pick = (items, money, saving = 10) => choosePurchase(items, money, saving)?.name ?? null;

test("without Save for it, items buy cheapest first, and nothing buys what the money can't reach", () => {
    const items = [item("b", 30), item("a", 10), item("c", 20)];
    assert.equal(pick(items, 100), "a");
    assert.equal(pick(items, 5), null);
    assert.equal(pick([], 100), null);
});

test("an affordable saved-for item goes first, even before a cheaper one", () => {
    assert.equal(pick([item("cheap", 1), item("saved", 50, true)], 60), "saved");
});

test("saved-for items are saved for cheapest first", () => {
    const items = [item("big goal", 900, true), item("small goal", 300, true)];
    assert.equal(pick(items, 500), "small goal");
    assert.equal(pick(items, 200), null, "200 saves for the 300");
});

test("while saving, at least (100 − saving)% of the goal stays, and only the rest buys other items", () => {
    const items = [item("goal", 1000, true), item("small", 90), item("big", 150)];
    // 10%: 900 of the 1000 stays put. With 1000 nothing does; with 950 only the 50 above it may buy.
    assert.equal(pick(items, 500, 10), null, "500 is under the 900 kept for the goal");
    assert.equal(pick([item("goal", 2000, true), item("small", 90)], 1890, 10), "small", "90 above the 1800 kept");
    assert.equal(pick([item("goal", 2000, true), item("small", 90)], 1889, 10), null, "1 short of keeping 1800");
    assert.equal(pick(items, 1000, 10), "goal", "the goal buys once affordable");
    assert.equal(pick([item("goal", 1000, true), item("small", 1)], 999, 0), null, "0% keeps everything for the goal");
    assert.equal(pick([item("goal", 1000, true), item("big", 150)], 500, 100), "big", "100% keeps nothing back");
    // A saving % above 100, typed into the config file, still never buys past the money held.
    assert.equal(pick([item("goal", 1000, true), item("big", 600)], 500, 200), null, "600 is more than the 500 held");
    assert.equal(pick([item("goal", 1000, true), item("big", 150)], 500, 200), "big");
});

test("the saving % caps what the other items spend in all, not each buy", () => {
    // Saving 50% of a 2000 goal keeps 1000: from 1300, three 100s buy and the fourth waits.
    let money = 1300;
    const read = () => [
        { cost: 2000, save: true, buy: () => assert.fail("the goal isn't affordable") },
        { cost: 100, save: false, buy: () => (money -= 100) },
    ];
    assert.equal(
        buyCheapestFirst(read, () => money, 50),
        3
    );
    assert.equal(money, 1000, "half the goal kept");
});

test("Lumi's numbers: 1.73T feathers saving for a 2.5T reset keep every feather at 10%", () => {
    const items = [item("mega reset", 2.5e12, true), item("feather", 5e9)];
    // Per buy, each 5B buy was under 10% of 2.5T, so it spent down to 131B; now 2.25T stays, more than it holds.
    assert.equal(pick(items, 1.73e12), null);
    // A 10B restart is the cheaper goal: it still buys first.
    assert.equal(pick([...items, item("restart", 10e9, true)], 65e9), "restart");
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
        [
            ["w7.automation.bubba", "Bubba", false],
            ["w2.automation.bubbles", "Bubbles", false],
            ["w1.automation.orion", "Orion", false],
            ["w2.automation.poppy", "Poppy", false],
            ["w2.automation.tarpit", "Tar Pit", false],
            ["w3.automation.construction", "Construction", false],
            ["w4.automation.cooking", "Cooking", false],
            ["classes.automation.grimoire", "Grimoire", false],
            ["account.automation.shops", "Shops", true],
            ["w6.automation.sneaking", "Sneaking", false],
            ["w6.automation.summoning", "Summoning", false],
        ],
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

test("it buys whole items only, even when a stop-at in the config file has a fraction", async () => {
    setShopGame();
    setShops([{ id: "0:CopperOre", on: true, stopAt: 40.5 }]);
    await cheat("automation shops", true);
    mock.timers.tick(1000);
    assert.deepEqual(given, [], "half an item is no buy");
    assert.deepEqual(gga.ShopStock[0], [100, 2]);

    setShops([{ id: "0:CopperOre", on: true, stopAt: 45.7 }]);
    mock.timers.tick(1000);
    assert.deepEqual(given, [["CopperOre", 5, "YESputInChest8910nocap"]]);
    assert.equal(gga.MoneyBANK, 990);
    await cheat("automation shops", false);
});
