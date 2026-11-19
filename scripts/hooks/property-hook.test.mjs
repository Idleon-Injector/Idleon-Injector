// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// The defineHook core for game data: property hooks (an accessor, or a Proxy in the property's place) and arguments
// an around hook changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

await loadGame({ setupDone: false });
const hooks = await importRepo("src/cheats/core/hooks.js");
let on = false;

// Game data character select rebuilds.
let data = { gems: 5, cost: "100", list: [{ price: 1 }, { price: 2 }] };
hooks.defineHook({ id: "test.read", target: () => data, property: "cost" }, (stored) => (on ? "0" : stored));
hooks.defineHook(
    { id: "test.write", target: () => data, property: "gems" },
    {
        get(stored) {
            return on ? this.cost : stored;
        },
        set: (value, stored) => (on ? stored : value),
    }
);
hooks.defineHook({ id: "test.list", targets: () => data.list, property: "price" }, (stored) => (on ? 0 : stored));
let options = { list: [1, 2, 3] };
hooks.defineHook(
    { id: "test.proxy", target: () => options, property: "list", proxy: true },
    { get: (obj, prop) => (on && prop === "0" ? 9 : Reflect.get(obj, prop)) }
);
const game = { roll: (min, max) => `${min}-${max}` };
hooks.defineHook({ id: "test.args", target: () => game, method: "roll", around: true }, (callOriginal, min, max) =>
    on ? callOriginal([max, max]) : callOriginal()
);
hooks.installHooks();

test("a getter hook reads through the handler and drops the game's writes", () => {
    assert.equal(data.cost, "100");
    on = true;
    assert.equal(data.cost, "0");
    data.cost = "5";
    on = false;
    assert.equal(data.cost, "100");
    assert.ok(Object.keys(data).includes("cost"), "still enumerable, as the game's own");
});

test("a get/set hook stores what set returns, and gets the object read as this", () => {
    data.gems = 7;
    assert.equal(data.gems, 7);
    on = true;
    data.gems = 1;
    assert.equal(data.gems, "0", "this.cost, itself hooked");
    on = false;
    assert.equal(data.gems, 7, "the write was kept out");
});

test("a list hook goes on every object of the list", () => {
    on = true;
    assert.deepEqual(
        data.list.map((entry) => entry.price),
        [0, 0]
    );
    on = false;
    assert.deepEqual(
        data.list.map((entry) => entry.price),
        [1, 2]
    );
});

test("a proxy hook replaces the property's object, which the game keeps using", () => {
    const list = options.list;
    on = true;
    assert.deepEqual([list[0], list[1], list.length], [9, 2, 3]);
    on = false;
    list.push(4);
    assert.deepEqual([...options.list], [1, 2, 3, 4]);
});

test("an around hook can give the game's method other arguments", () => {
    assert.equal(game.roll(1, 6), "1-6");
    on = true;
    assert.equal(game.roll(1, 6), "6-6");
    on = false;
});

test("installing again hooks nothing twice; rebuilt data and an accessor the game removed are hooked again", () => {
    const proxied = options.list;
    hooks.installHooks();
    assert.equal(options.list, proxied, "the proxy isn't wrapped in another");
    on = true;
    assert.equal(data.cost, "0");
    on = false;
    assert.equal(data.cost, "100", "an accessor installed twice would keep the cheat's value");

    delete data.cost;
    data.cost = "200";
    hooks.installHooks();
    on = true;
    assert.equal(data.cost, "0", "the removed accessor is back");
    on = false;
    assert.equal(data.cost, "200");

    options.list = [5];
    data = { gems: 1, cost: "300", list: [{ price: 3 }] };
    hooks.installHooks();
    on = true;
    assert.deepEqual([data.cost, data.list[0].price, options.list[0]], ["0", 0, 9]);
    on = false;
    assert.deepEqual(hooks.getHookFailures(), []);
});

test("an empty list or a missing object is reported, and hooked once it is there", () => {
    data = { gems: 1, cost: "1", list: [] };
    options = { list: undefined };
    hooks.installHooks();
    assert.deepEqual(hooks.getHookFailures(), [
        "test.list: data.list.price not found",
        "test.proxy: options.list not found",
    ]);
    data.list.push({ price: 4 });
    options.list = [1];
    hooks.installHooks();
    assert.deepEqual(hooks.getHookFailures(), []);
});
