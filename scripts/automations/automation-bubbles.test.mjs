// Automation (#92), World 2 › Alchemy: "automation bubbles" raises the switched-on alchemy bubbles every second with
// the alchemy menu's own upgrade (BubbleHoldDown), paying what the game charges. Decided with Lumi on 2026-11-17: the
// bubble with the lowest % of its max goes first, up to one page-wide target %; bubbles without a max need a stop-at,
// which caps any bubble; no Save for it and no saving; a Particles row waits until the particle buy is open; buying pauses
// while the alchemy menu is open or Bargain Tags are held; affordability is checked here, since the game's own check
// only covers cost icons on screen; and the "+n" popup the buy spawns with the menu closed is taken away.
// A fake alchemy menu stands in for the game, paying the way the game's event does with the menu closed: no check.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
// The game's setup installs the hooks; the popup one is on createRecycledActor.
(await importRepo("src/cheats/core/hooks.js")).installHooks();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

const script = context["com.stencyl.behavior.Script"];
const recycled = [];
script.recycleActor = (actor) => recycled.push(actor);

// Cauldron 0: two bubbles with a max (decay, x2 = 50), one without (add), one undiscovered, and a placeholder.
const row = (name, formula, items, description = "+{_Base_STR") => [
    name,
    "1",
    "50",
    formula,
    "0",
    ...items,
    description,
    "0",
];
const ROWS = [
    row("Roid_Ragin", "decay", ["CopperOre", "Liquid1", "Blank", "Blank"]),
    row("Warriors_Rule", "decay", ["OakTree", "Liquid1", "Blank", "Blank"]),
    row("Hearty_Diggy", "add", ["CopperOre", "Blank", "Blank", "Blank"]),
    row("Not_Found_Yet", "decay", ["CopperOre", "Blank", "Blank", "Blank"]),
    row("BUBBLE", "decay", ["Blank", "Blank", "Blank", "Blank"]),
];
const LIQUID_SHOP_PRICE = 999; // what CauldronCosts answers while the menu's last tab is the liquid shop

let store; // what the menu counts as owned
let menu;
let buys; // "cauldron:bubble" per paid upgrade
let spawned; // the popups the game's buy created
let doubles; // bubbles whose next upgrade rolls a free extra level
let costScale; // grows item costs, to open the particle buy
const stats = () => context["scripts.ActorEvents_189"]._customBlock_CauldronStats;

const setGame = ({ levels = [10, 40, 5, 0, 0], owned = {} } = {}) => {
    context["com.stencyl.Engine"].engine.scene = { name: "Alchemy_Map" };
    Object.assign(gga.CustomLists.h, {
        MapName: ["Alchemy_Map"],
        AlchemyDescription: [ROWS, [ROWS[4]], [ROWS[4]], [ROWS[4]]],
    });
    Object.assign(gga.ItemDefinitionsGET.h, {
        CopperOre: { h: { displayName: "Copper_Ore" } },
        OakTree: { h: { displayName: "Oak_Logs" } },
    });
    Object.assign(gga, {
        CurrentMap: 0,
        MenuType2: 0,
        OptionsListAccount: Array(200).fill(0),
        Atoms: [0, 0, 0, 0, 0],
        Divinity: Array(40).fill(0),
        CauldronInfo: [[...levels], [0], [0], [0]],
        DNSM: { h: { AlchBubbles: { h: {} } } },
    });
    store = { CopperOre: 1e6, OakTree: 1e6, Liquid1: 1000, ...owned };
    buys = [];
    spawned = [];
    recycled.length = 0;
    doubles = new Set();
    costScale = 1;
    menu = {
        _GenINFO: Object.assign([], { 17: 0, 39: [3, 3] }),
        _TRIGGERtext2: "bubbleNormal",
        _ParticleAfford: 0,
        _customEvent_PostOfficeIMG() {
            if (this._TRIGGERtext === "z") this._ItemsAndStorageOWNED = { h: { ...store } };
        },
        // The game's buy with the menu closed: no affordability check, currencies may go below 0.
        _customEvent_BubbleHoldDown() {
            const [c, b] = this._GenINFO[39];
            const items = gga.CustomLists.h.AlchemyDescription[c][b].slice(5, 9);
            const cost = (slot) => stats()("CauldronCosts", c, b, slot);
            if (this._TRIGGERtext2 === "bubbleParticle") {
                if (this._ParticleAfford !== 1 || !(gga.OptionsListAccount[135] > 0)) return;
                items.forEach((item, slot) => item.startsWith("Liquid") && (store[item] -= cost(slot)));
                gga.Divinity[39] -= context["scripts.ActorEvents_579"]._customBlock_AtomCollider(
                    "AtomBubbleUpgCost",
                    b,
                    cost(0)
                );
                gga.OptionsListAccount[135] -= 1;
            } else items.forEach((item, slot) => item !== "Blank" && (store[item] -= cost(slot)));
            gga.CauldronInfo[c][b] += doubles.has(`${c}:${b}`) ? 2 : 1;
            gga.OptionsListAccount[62] = 0; // every Bargain Tag is used up
            spawned.push(script.createRecycledActor({ ID: 40 }, 0, 0, 0));
            buys.push(`${c}:${b}`);
        },
    };
    gga.PixelHelperActor[5] = { behaviors: { getBehavior: (name) => (name === "ActorEvents_232" ? menu : null) } };
    // Liquids cost 5 + 1 per 20 levels; items 10 per level (times costScale).
    context["scripts.ActorEvents_189"]._customBlock_CauldronStats = (kind, c, b, slot) => {
        const level = gga.CauldronInfo[c][b];
        if (kind === "BubbleBonus") return 2 * level;
        if (menu._GenINFO[17] === 1) return LIQUID_SHOP_PRICE;
        const item = gga.CustomLists.h.AlchemyDescription[c][b][5 + slot];
        return item.startsWith("Liquid") ? 5 + Math.floor(level / 20) : 10 * (level + 1) * costScale;
    };
    context["scripts.ActorEvents_579"]._customBlock_AtomCollider = () => 100;
};
const setBubbles = (items, target = 90) =>
    state.updateCheatConfig({ automation: { bubbles: items, bubblesTarget: target } });
const bubbles = () => getAutomations().find(({ id }) => id === "w2.automation.bubbles");
const levels = () => gga.CauldronInfo[0].slice(0, 4);
const tick = () => mock.timers.tick(1000);

test("the Bubbles tab reads each cauldron's bubbles: bonus, level, % of max, costs and the particle option", () => {
    setGame({ owned: { Liquid1: 3 } });
    const { value } = readComputed("automation", "bubbles");
    assert.deepEqual(
        value.cauldrons.map(({ name, bubbles: list }) => [name, list.length]),
        [
            ["POWER CAULDRON", 4],
            ["QUICC CAULDRON", 0],
            ["HIGH-IQ CAULDRON", 0],
            ["KAZAM CAULDRON", 0],
        ],
        "placeholder rows are left out"
    );
    const [roid, , hearty, unfound] = value.cauldrons[0].bubbles;
    assert.deepEqual(roid, {
        id: "0:0",
        name: "Roid_Ragin",
        level: 10,
        percent: (100 * 10) / 60,
        bonus: "+20_Base_STR",
        costs: [
            { name: "Copper_Ore", cost: 110, short: false, liquid: false },
            { name: "Water Droplets", cost: 5, short: true, liquid: true },
        ],
        particle: { cost: null, waiting: "Particles wait for the Atom Collider" },
    });
    assert.equal(hearty.percent, null, "an add bubble has no max");
    assert.equal(unfound.level, 0);
    assert.equal(value.waiting, null);
    assert.equal(menu._GenINFO[17], 0, "the menu's fields are put back");
});

test("the bubble with the lowest progress buys first, up to the target %; a stop-at caps any bubble", async () => {
    setGame();
    setBubbles(
        [
            { id: "0:0", on: true },
            { id: "0:1", on: true },
            { id: "0:2", on: true, stopAt: 6 },
            { id: "0:3", on: true },
        ],
        50
    );
    await cheat("automation bubbles", true);
    tick();
    // Roid (16.7% of its max, a third of the way to 50%) rises until it passes Hearty's 5 of 6 (at level 36, 41.9%).
    assert.deepEqual(buys.slice(0, 27), [...Array(26).fill("0:0"), "0:2"]);
    // Then both decay bubbles to 50%: level 50 of x2 = 50. Hearty stops at its stop-at; the undiscovered one waits.
    assert.deepEqual(levels(), [50, 50, 6, 0]);
    assert.equal(buys.length, 40 + 10 + 1);
    // The game's own costs: Copper 10 per level, Oak for Warriors, liquid 5 + 1 per 20 levels.
    assert.deepEqual(store, {
        CopperOre: 1e6 - 10 * (1275 - 55) - 60,
        OakTree: 1e6 - 10 * (1275 - 820),
        Liquid1: 1000 - (50 + 120 + 70) - 70,
    });
    tick();
    assert.equal(buys.length, 51, "nothing buys past the goals");
    assert.equal(bubbles().status, "Raising 4 bubbles to 50%; 51 levels since it started");
    await cheat("automation bubbles", false);
});

test("a stop-at under the target stops a decay bubble there, and 0 never raises it", async () => {
    setGame();
    setBubbles(
        [
            { id: "0:0", on: true, stopAt: 0 },
            { id: "0:1", on: true, stopAt: 45 },
        ],
        99.9
    );
    await cheat("automation bubbles", true);
    tick();
    assert.deepEqual(levels(), [10, 45, 5, 0]);
    await cheat("automation bubbles", false);
});

test("without a stop-at, a bubble that has no max never buys", async () => {
    setGame();
    setBubbles([{ id: "0:2", on: true }]);
    await cheat("automation bubbles", true);
    tick();
    assert.deepEqual(buys, []);
    await cheat("automation bubbles", false);
});

test("a bubble it can't afford waits and the next one buys; no currency goes below 0", async () => {
    setGame({ owned: { CopperOre: 250, Liquid1: 12 } });
    setBubbles([
        { id: "0:0", on: true },
        { id: "0:1", on: true },
    ]);
    await cheat("automation bubbles", true);
    tick();
    // Roid: 110 + 120 Copper (10 liquid), then 130 is out of reach; Warriors (Oak) has liquid for none after that.
    assert.deepEqual(buys, ["0:0", "0:0"]);
    assert.deepEqual(levels(), [12, 40, 5, 0]);
    assert.ok(
        Object.values(store).every((left) => left >= 0),
        JSON.stringify(store)
    );

    store.Liquid1 = 7;
    tick();
    assert.deepEqual(buys.slice(2), ["0:1"], "Warriors buys once Roid can't");
    assert.ok(Object.values(store).every((left) => left >= 0));
    await cheat("automation bubbles", false);
});

test("it pauses while the alchemy menu is open, while Bargain Tags are held and outside a character's map", async () => {
    setGame();
    setBubbles([{ id: "0:0", on: true, stopAt: 11 }]);
    await cheat("automation bubbles", true);

    gga.MenuType2 = 21;
    tick();
    assert.equal(bubbles().status, "Paused while the alchemy menu is open");
    gga.MenuType2 = 0;

    gga.OptionsListAccount[62] = 2;
    tick();
    assert.equal(bubbles().status, "Paused while you hold Bargain Tags");
    gga.OptionsListAccount[62] = 0;

    context["com.stencyl.Engine"].engine.scene = { name: "CharSelect" };
    tick();
    assert.equal(bubbles().status, "Waiting for a character to be in game");
    assert.deepEqual(buys, []);

    context["com.stencyl.Engine"].engine.scene = { name: "Alchemy_Map" };
    tick();
    assert.deepEqual(buys, ["0:0"]);
    setBubbles([]);
    assert.equal(bubbles().status, "No bubble is switched on");
    await cheat("automation bubbles", false);
});

test("it reads costs on the Bubbles tab and puts the menu's selection back, even when left on the liquid shop", async () => {
    setGame();
    Object.assign(menu, { _TRIGGERtext2: "bubbleParticle", _ParticleAfford: 0 });
    menu._GenINFO[17] = 1;
    const selected = menu._GenINFO[39];
    setBubbles([{ id: "0:0", on: true, stopAt: 11 }]);
    await cheat("automation bubbles", true);
    tick();
    assert.deepEqual(buys, ["0:0"]);
    assert.equal(store.CopperOre, 1e6 - 110, `paid the bubble price, not ${LIQUID_SHOP_PRICE}`);
    assert.equal(menu._GenINFO[17], 1);
    assert.equal(menu._GenINFO[39], selected);
    assert.equal(menu._TRIGGERtext2, "bubbleParticle");
    assert.equal(menu._ParticleAfford, 0);
    await cheat("automation bubbles", false);
});

test("the +n popup each buy spawns is taken away", async () => {
    setGame();
    setBubbles([{ id: "0:0", on: true, stopAt: 12 }]);
    await cheat("automation bubbles", true);
    tick();
    assert.equal(spawned.length, 2);
    assert.equal(recycled.length, 2);
    spawned.forEach((actor, i) => assert.equal(recycled[i], actor));

    // An actor the game creates outside a bubble buy stays.
    script.createRecycledActor({ ID: 40 }, 0, 0, 0);
    assert.equal(recycled.length, 2);
    await cheat("automation bubbles", false);
});

test("a Particles row waits until the particle buy is open, then pays particles, a charge and liquid only", async () => {
    setGame();
    setBubbles([{ id: "0:0", on: true, stopAt: 12, pay: "particles" }]);
    await cheat("automation bubbles", true);
    tick();
    assert.deepEqual(buys, [], "no Atom Collider");

    gga.Atoms[4] = 1;
    tick();
    assert.deepEqual(buys, [], "the first cost is under 100M");
    assert.equal(
        readComputed("automation", "bubbles").value.cauldrons[0].bubbles[0].particle.waiting,
        "Particles open once the first cost reaches 100M"
    );

    costScale = 1e7;
    tick();
    assert.deepEqual(buys, [], "no charge");

    gga.OptionsListAccount[135] = 5;
    gga.Divinity[39] = 150;
    tick();
    // One buy: 100 particles leaves 50, too few for a second.
    assert.deepEqual(buys, ["0:0"]);
    assert.equal(gga.Divinity[39], 50);
    assert.equal(gga.OptionsListAccount[135], 4);
    assert.equal(store.Liquid1, 1000 - 5);
    assert.equal(store.CopperOre, 1e6, "materials are left alone");
    assert.equal(
        readComputed("automation", "bubbles").value.cauldrons[0].bubbles[0].particle.waiting,
        "Not enough particles"
    );
    await cheat("automation bubbles", false);
});

test("bubbles have no Save for it: one in the config file doesn't move a bubble ahead", async () => {
    setGame();
    setBubbles([
        { id: "0:0", on: true, stopAt: 11 },
        { id: "0:1", on: true, stopAt: 41, save: true },
    ]);
    await cheat("automation bubbles", true);
    tick();
    assert.deepEqual(buys, ["0:0", "0:1"], "Roid (16.7% of max) is further behind than Warriors (44.4%)");
    await cheat("automation bubbles", false);
});

test("a stop-at only caps a decay bubble; the lowest % of max still goes first", async () => {
    setGame();
    // Roid is 10 of its stop-at 11 but only 16.7% of max; Warriors has no stop-at and is at 44.4%.
    setBubbles([
        { id: "0:0", on: true, stopAt: 11 },
        { id: "0:1", on: true },
    ]);
    await cheat("automation bubbles", true);
    tick();
    assert.equal(buys[0], "0:0", "Roid buys before Warriors takes the shared liquid");
    assert.equal(levels()[0], 11);
    await cheat("automation bubbles", false);
});

test("the status says 1 level after a single level", async () => {
    setGame();
    setBubbles([{ id: "0:0", on: true, stopAt: 11 }]);
    await cheat("automation bubbles", true);
    tick();
    assert.equal(bubbles().status, "Raising 1 bubble to 90%; 1 level since it started");
    await cheat("automation bubbles", false);
});

test("a free extra level can pass the stop-at, and the status counts levels", async () => {
    setGame();
    doubles.add("0:0");
    setBubbles([{ id: "0:0", on: true, stopAt: 11 }]);
    await cheat("automation bubbles", true);
    tick();
    assert.deepEqual(buys, ["0:0"]);
    assert.equal(levels()[0], 12);
    assert.equal(bubbles().status, "Raising 1 bubble to 90%; 2 levels since it started");
    await cheat("automation bubbles", false);
});

test("the overview lists Bubbles with the other automations that have a label", () => {
    const list = readComputed("automation", "list").value;
    assert.ok(list.some(({ id, label }) => id === "w2.automation.bubbles" && label === "Bubbles"));
    assert.ok(list.every(({ label }) => label));
    assert.ok(!list.some(({ cheat: name }) => name === "wide autoboss"), "autoboss stays a cheat");
});
