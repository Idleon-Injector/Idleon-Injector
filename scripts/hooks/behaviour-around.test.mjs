// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// What the hooks that act around the game's own call do, cheat on and off, written down before they moved to
// defineHook (#15): RNG, timers, damage text, inventory items, presets, workbench, breeding, cogs, smithing,
// abilities, quests, model size, item notifications, animations, names, spelunk depth and passive cards.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, events, actor, set, setup, state, gga, context } = await loadHookGame();
const { cheatState, cheatConfig } = state;
const script = context["com.stencyl.behavior.Script"];
const echo = (...args) => args; // a game method that returns the arguments it got

// Game data the hooks read, in place before setup as the game has it.
const removed = [];
context.HxOverrides = { remove: (list, item) => removed.push([list, item]) };
gga.ItemGetPixelQueue = ["queue"];
gga.ItemDefinitionsGET = {
    h: {
        Timecandy1: { h: { Type: "TIME_CANDY", ID: 3600 } },
        Pearl6: { h: { Type: "PEARL" } },
        StoneM: { h: { Type: "STONE", typeGen: "dStone", Effect: "Mystery_Stat3" } },
        StoneW: { h: { Type: "STONE", typeGen: "dStone", Effect: "Weapon_Stat" } },
    },
};
const genInfo577 = [];
gga.PixelHelperActor[23] = { getValue: (_, key) => (key === "_GenINFO" ? genInfo577 : undefined) };
gga.InventoryOrder = ["Timecandy1", "Pearl6", "StoneM", "StoneW"];
gga.CurrentMap = 42;
gga.AFKtarget = "Cooking";
gga.Exp0 = [0, 0, 10, 0, 0, 0];
gga.ExpReq0 = [0, 0, 100, 0, 0, 0];
gga.ExpType = 4;
gga.MenuType2 = 0;
gga.CustomLists = { h: { ItemToCraftEXP: { a: [1, 2], b: [1] } } };
context["scripts.CustomMaps"] = { atkMoveMap: { h: { Fireball: { h: { cooldown: 5, castTime: 1, manaCost: 3 } } } } };
const questDefs = {
    Scripticus: [
        "intro",
        [
            ["q", 0, "a", [["Copper", 5, 0, 7]], 0, 0, 0, 0, "a"],
            ["q", 0, "b", [3, 4], 0, 0, 0, 0, "c"],
            ["short", 1],
        ],
    ],
};
context["scripts.DialogueDefinitions"] = { dialogueDefs: { h: JSON.parse(JSON.stringify(questDefs)) } };
const { hookFailures, error } = await setup();

test("every hook these tests use installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("rng: random floats between two values roll high, low or a fixed value", () => {
    game.returns.randomFloatBetween = () => "game";
    assert.equal(script.randomFloatBetween(1, 9), "game");
    for (const [rng, expected] of [
        ["high", 9],
        ["low", 1],
        [0.25, 0.25],
        [false, "game"],
    ]) {
        cheatState.rng = rng;
        assert.equal(script.randomFloatBetween(1, 9), expected, String(rng));
    }
});

test("rng: random integers roll high, low, a fixed value, a queue of values, or the max VIP book", () => {
    game.returns.randomInt = () => "game";
    for (const [rngInt, expected] of [
        ["high", 9],
        ["low", 1],
        [5, 5],
        [false, "game"],
    ]) {
        cheatState.rngInt = rngInt;
        assert.equal(script.randomInt(1, 9), expected, String(rngInt));
    }
    cheatState.rngInt = ["high", 3, "low"];
    assert.deepEqual([script.randomInt(1, 9), script.randomInt(1, 9), script.randomInt(1, 9)], [9, 3, 1]);
    assert.equal(cheatState.rngInt, "low", "the last queued value stays");
    assert.equal(script.randomInt(1, 9), 1);
    cheatState.rngInt = false;
    set("w3.book");
    gga.MenuType2 = 31;
    assert.equal(script.randomInt(1, 20), 20);
    assert.equal(script.randomInt(2, 20), "game");
    gga.MenuType2 = 0;
    assert.equal(script.randomInt(1, 20), "game");
    set("w3.book", false);
});

test("rng: random floats roll 1, 0 or a fixed value", () => {
    game.returns.randomFloat = () => "game";
    for (const [rngF, expected] of [
        ["high", 1],
        ["low", 0],
        [0.5, 0.5],
        [false, "game"],
    ]) {
        cheatState.rngF = rngF;
        assert.equal(script.randomFloat(), expected, String(rngF));
    }
});

test("godlike intervention and poison: the game's timers for them run at once; other timers are unchanged", () => {
    const owner = (name) => ({ behaviors: { behaviors: [{ name }] } });
    game.returns.runLater = echo;
    game.returns.runPeriodically = echo;
    const cb = () => {};
    game.calls.length = 0;
    assert.equal(script.runLater(2400, cb, owner("ActorEvents_481")), undefined, "the game's result is dropped");
    set("godlike.intervention");
    set("godlike.poison");
    const args = [];
    game.returns.runLater = (...a) => args.push(["runLater", ...a]);
    game.returns.runPeriodically = (...a) => args.push(["runPeriodically", ...a]);
    script.runLater(2400, cb, owner("ActorEvents_481"));
    script.runLater(2400, cb, owner("ActorEvents_1"));
    script.runLater(2400, cb, undefined);
    script.runPeriodically(2e3, cb, owner("ActorEvents_575"));
    script.runPeriodically(2e3, cb, owner("ActorEvents_481"));
    assert.deepEqual(
        args.map((call) => call.slice(0, 2)),
        [
            ["runLater", 0],
            ["runLater", 2400],
            ["runLater", 2400],
            ["runPeriodically", 5],
            ["runPeriodically", 2e3],
        ]
    );
    set("godlike.intervention", false);
    set("godlike.poison", false);
    args.length = 0;
    script.runLater(2400, cb, owner("ActorEvents_481"));
    script.runPeriodically(2e3, cb, owner("ActorEvents_575"));
    assert.deepEqual(
        args.map((call) => call.slice(0, 2)),
        [
            ["runLater", 2400],
            ["runPeriodically", 2e3],
        ]
    );
});

test("no damage text: damage numbers are never created, other actors are", () => {
    game.returns.createRecycledActor = () => "actor";
    assert.equal(script.createRecycledActor({ ID: 10 }), "actor");
    set("wide.nodmg");
    game.calls.length = 0;
    assert.equal(script.createRecycledActor({ ID: 10 }), null);
    assert.deepEqual(game.calls, [], "the game never creates it");
    assert.equal(script.createRecycledActor({ ID: 11 }), "actor");
    assert.equal(script.createRecycledActor(10), "actor");
    set("wide.nodmg", false);
});

test("big model: a player grows to the configured size while it inits, and growTo is put back", () => {
    const grown = [];
    const growTo = function (...args) {
        grown.push(args);
    };
    const player = actor(20, { actor: { growTo } });
    game.returns.init = function () {
        this.actor.growTo(1, 1, 0.5, "ease");
        return "init";
    };
    assert.equal(player.init(), "init");
    assert.deepEqual(grown, [[1, 1, 0.5, "ease"]]);
    set("wide.bigmodel");
    cheatConfig.wide.bigmodel = 150;
    assert.equal(player.init(), "init");
    assert.deepEqual(grown[1], [1.5, 1.5, 0.5, "ease"]);
    assert.equal(player._PlayerSize, 150);
    assert.equal(player.actor.growTo, growTo);
    set("wide.bigmodel", false);
    delete game.returns.init;
});

test("autoloot notifications: hidden pickups are removed and recycled instead of shown", () => {
    const pickup = actor(34, { actor: "pickup", _Deployment: 0 });
    game.returns._event_ItemGet = () => "shown";
    game.returns.recycleActor = (a) => `recycled ${a}`;
    assert.equal(pickup._event_ItemGet(), "shown");
    set("wide.autoloot");
    game.calls.length = 0;
    assert.equal(pickup._event_ItemGet(), "recycled pickup");
    assert.deepEqual(removed, [[gga.ItemGetPixelQueue, "pickup"]]);
    assert.ok(!game.calls.includes("_event_ItemGet"), "the game never shows it");
    pickup._Deployment = 2;
    assert.equal(pickup._event_ItemGet(), "shown");
    pickup._Deployment = 1;
    cheatConfig.wide.autoloot.hidenotifications = false;
    assert.equal(pickup._event_ItemGet(), "shown");
    cheatConfig.wide.autoloot.hidenotifications = true;
    set("wide.autoloot", false);
});

const dragging = (slot) => actor(38, { actor: { getValue: (_, key) => (key === "_ItemDragID" ? slot : 0) } });

test("candy anywhere: a time candy is used as if on map 1, cooking and lab count as mushrooms, and both come back", () => {
    const seen = [];
    game.returns._event_InvItem4custom = () => {
        seen.push([gga.CurrentMap, `${gga.AFKtarget}`, `${gga.AFKtarget}`]);
        return "used";
    };
    assert.equal(dragging(0)._event_InvItem4custom(), "used");
    assert.deepEqual(seen, [[42, "Cooking", "Cooking"]]);
    set("wide.candy");
    assert.equal(dragging(0)._event_InvItem4custom(), "used");
    assert.deepEqual(seen[1], [1, "mushG", "mushG"]);
    assert.equal(gga.CurrentMap, 42);
    assert.equal(gga.AFKtarget, "Cooking");
    assert.equal(genInfo577[86], 1);
    gga.AFKtarget = "Mining";
    dragging(0)._event_InvItem4custom();
    assert.deepEqual(seen[2], [1, "Mining", "Mining"]);
    gga.AFKtarget = "Cooking";
    dragging(1)._event_InvItem4custom();
    assert.deepEqual(seen[3], [42, "Cooking", "Cooking"], "not a candy");
    set("wide.candy", false);
});

test("divinity pearl: the pearl gives 40% of the level to the right skill without the game's own use", () => {
    game.returns._event_InvItem4custom = () => "used";
    const pearl = Object.assign(dragging(1), { _PixelType: 2, _DummyType2Dead: 7 });
    assert.equal(pearl._event_InvItem4custom(), "used");
    set("unlock.divinitypearl");
    game.calls.length = 0;
    gga.CurrentMap = 0;
    assert.equal(pearl._event_InvItem4custom(), undefined);
    assert.equal(gga.Exp0[2], 10 + 40);
    assert.ok(!game.calls.includes("_event_InvItem4custom"));
    gga.CurrentMap = 7;
    pearl._event_InvItem4custom();
    assert.equal(gga.Exp0[4], 0 + 0.4 * 0);
    pearl._DummyType2Dead = 6;
    assert.equal(pearl._event_InvItem4custom(), "used");
    gga.CurrentMap = 42;
    set("unlock.divinitypearl", false);
});

test("mystery stones: the stat roll is forced while the stone is used, then RNG is free again", () => {
    const seen = [];
    game.returns._event_InventoryItem = () => {
        seen.push([cheatState.rng, cheatState.rngInt]);
        return "rolled";
    };
    cheatState.rng = false;
    cheatState.rngInt = false;
    assert.equal(dragging(2)._event_InventoryItem(), "rolled");
    set("upstones.misc");
    assert.equal(dragging(2)._event_InventoryItem(), "rolled");
    assert.equal(dragging(3)._event_InventoryItem(), "rolled");
    assert.deepEqual(seen, [
        [false, false],
        [0.85, "high"],
        [false, false],
    ]);
    assert.deepEqual([cheatState.rng, cheatState.rngInt], [false, false]);
    set("upstones.misc", false);
});

test("presets anywhere: talent presets reset as if in town, and the map comes back", () => {
    const maps = [];
    game.returns._event_resetTalPresets = () => maps.push(gga.CurrentMap);
    const menu = actor(312);
    assert.equal(menu._event_resetTalPresets(), 1);
    set("unlock.presets");
    assert.equal(menu._event_resetTalPresets(), undefined);
    assert.deepEqual(maps, [42, 0]);
    assert.equal(gga.CurrentMap, 42);
    set("unlock.presets", false);
});

test("workbench: books, flags, buildings and printing", () => {
    const wb = events(345);
    game.returns._customBlock_WorkbenchStuff = (key) =>
        ({ maxBookLv: 99, minBookLv: 1, PlayerBuildSpd: 4, ExtraPrinting: 2, AdditionExtraPrinting: 3 })[key] ?? 7;
    const call = (...args) => wb._customBlock_WorkbenchStuff(...args);
    assert.deepEqual(
        ["minBookLv", "FlagReq", "TowerSaltCost", "TowerBuildReq", "BookReqTime", "TotalFlags", "ExtraPrinting"].map(
            (key) => call(key)
        ),
        [1, 7, 7, 7, 7, 7, 2]
    );
    for (const [cheat, key, expected] of [
        ["w3.book", "minBookLv", 99],
        ["w3.flagreq", "FlagReq", 0],
        ["w3.freebuildings", "TowerSaltCost", 0],
        ["w3.freebuildings", "TowerMatCost", 0],
        ["w3.instabuild", "TowerBuildReq", 0],
        ["w3.booktime", "BookReqTime", 1],
        ["w3.totalflags", "TotalFlags", 10],
        ["w3.buildspd", "PlayerBuildSpd", cheatConfig.w3.buildspd(4)],
    ]) {
        set(cheat);
        assert.equal(call(key, "x"), expected, `${cheat} ${key}`);
        set(cheat, false);
    }
    cheatConfig.multiply = { printer: 5 };
    set("multiply.printer");
    game.calls.length = 0;
    assert.equal(call("ExtraPrinting", "rest"), 3 * 5);
    assert.deepEqual(game.calls, ["_customBlock_WorkbenchStuff", "_customBlock_WorkbenchStuff"]);
    set("multiply.printer", false);
});

test("breeding: pet quantity rolls, capacities, chances and costs", () => {
    const br = events(345);
    const seen = [];
    game.returns._customBlock_Breeding = (key, a, b) => {
        seen.push([key, b, cheatState.rng]);
        return 10;
    };
    cheatState.rng = false;
    assert.equal(br._customBlock_Breeding("PetQTYonBreed", 1, 2), 10);
    set("w4.petrng");
    const random = Math.random;
    Math.random = () => 0.5;
    assert.equal(br._customBlock_Breeding("PetQTYonBreed", 1, 2), Math.round(10 * 1.1));
    Math.random = random;
    assert.deepEqual(seen, [
        ["PetQTYonBreed", 2, false],
        ["PetQTYonBreed", 8, "low"],
    ]);
    assert.equal(cheatState.rng, false);
    set("w4.petrng", false);
    for (const [cheat, key, expected] of [
        ["w4.petchance", "TotalBreedChance", cheatConfig.w4.petchance(10)],
        ["w4.genes", "GeneticCost", 0],
        ["w4.fasteggs", "TotalTimeForEgg", cheatConfig.w4.fasteggs(10)],
        ["w4.petupgrades", "PetUpgCostREAL", cheatConfig.w4.petupgrades(10)],
    ]) {
        assert.equal(br._customBlock_Breeding(key), 10, `${cheat} off`);
        set(cheat);
        assert.equal(br._customBlock_Breeding(key), expected, cheat);
        set(cheat, false);
    }
});

test("slot cheats never lower a late account; a dropped egg item fills the raised incubator", () => {
    const br = events(345);
    let capacity;
    const free = 4; // what the game says one dragged egg item uses, counted inside its own capacity
    game.returns._customBlock_Breeding = (key, using) => (using === "UsingEggInv" ? free : capacity);
    for (const [cheat, key, floor] of [
        ["w4.eggcap", "TotalEggCapacity", 13],
        ["w4.fenceyard", "FenceYardSlots", 27],
        ["w4.battleslots", "PetBattleSlots", 6],
    ]) {
        capacity = 2;
        assert.equal(br._customBlock_Breeding(key, "0", 0, 0), 2, `${cheat} off`);
        set(cheat);
        assert.equal(br._customBlock_Breeding(key, "0", 0, 0), floor, `${cheat} raises an early account`);
        capacity = floor + 2;
        assert.equal(br._customBlock_Breeding(key, "0", 0, 0), floor + 2, `${cheat} keeps a late account`);
        set(cheat, false);
    }

    gga.Breeding = [[3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
    capacity = 5;
    assert.equal(
        br._customBlock_Breeding("TotalEggCapacity", "UsingEggInv", 0, 0),
        free,
        "cheat off: the game's count"
    );
    set("w4.eggcap");
    assert.equal(br._customBlock_Breeding("TotalEggCapacity", "UsingEggInv", 0, 0), 11, "free slots inside 13");
    capacity = 15;
    assert.equal(br._customBlock_Breeding("TotalEggCapacity", "UsingEggInv", 0, 0), 13, "free slots inside 15");
    gga.Breeding[0].fill(1, 0, 15);
    assert.equal(
        br._customBlock_Breeding("TotalEggCapacity", "UsingEggInv", 0, 0),
        15,
        "full: every slot, as the game"
    );
    set("w4.eggcap", false);
});

test("better cogs: a cog rolls high while the workbench makes it", () => {
    const seen = [];
    game.returns._customEvent_WorkbenchStuff2 = () => seen.push(cheatState.rng);
    const bench = actor(481, { _TRIGGEREDtext: "k1" });
    cheatState.rng = false;
    bench._customEvent_WorkbenchStuff2();
    set("w3.bettercog");
    bench._customEvent_WorkbenchStuff2();
    bench._TRIGGEREDtext = "d1";
    bench._customEvent_WorkbenchStuff2();
    assert.deepEqual(seen, [false, "high", false]);
    assert.equal(cheatState.rng, false);
    set("w3.bettercog", false);
});

test("free smithing: every recipe costs nothing, sized like the game's lists", () => {
    const lists = context["scripts.CustomLists"];
    game.returns.ItemToCraftCostTYPE = () => "game";
    assert.equal(lists.ItemToCraftCostTYPE(), "game");
    set("w1.smith");
    const free = [["Copper", "0"]];
    assert.deepEqual(lists.ItemToCraftCostTYPE(), [[free, free], [free]]);
    assert.equal(lists.ItemToCraftCostTYPE(), lists.ItemToCraftCostTYPE(), "the same lists every time");
    set("w1.smith", false);
    assert.equal(lists.ItemToCraftCostTYPE(), "game");
});

test("godlike ability: no cooldown, cast time or mana cost; the game's own stays untouched", () => {
    const moves = context["scripts.CustomMaps"].atkMoveMap.h;
    assert.deepEqual(moves.Fireball.h, { cooldown: 5, castTime: 1, manaCost: 3 });
    set("godlike.ability");
    assert.deepEqual(moves.Fireball.h, { cooldown: 0, castTime: 0.1, manaCost: 0 });
    set("godlike.ability", false);
    assert.deepEqual(moves.Fireball.h, { cooldown: 5, castTime: 1, manaCost: 3 });
});

test("free quests: quest requirements read as zero, the game's own stay", () => {
    const defs = context["scripts.DialogueDefinitions"].dialogueDefs.h;
    assert.deepEqual(defs.Scripticus, questDefs.Scripticus);
    set("wide.quest");
    assert.deepEqual(defs.Scripticus[1][0][3], [["Copper", 0, 0, 0]]);
    assert.deepEqual(defs.Scripticus[1][1][3], [0, 0]);
    assert.deepEqual(defs.Scripticus[1][2], ["short", 1]);
    set("wide.quest", false);
    assert.deepEqual(defs.Scripticus, questDefs.Scripticus);
    assert.deepEqual(Object.keys(defs), ["Scripticus"]);
});

test("no animations: actors update without animation time", () => {
    const seen = [];
    game.returns.internalUpdate = (elapsed, anim) => seen.push([elapsed, anim]);
    const model = Object.create(context["com.stencyl.models.Actor"].prototype);
    model.internalUpdate(16, true);
    set("wide.noanim");
    model.internalUpdate(16, true);
    assert.deepEqual(seen, [
        [16, true],
        [16, false],
    ]);
    set("wide.noanim", false);
});

test("hide names: name tags under players are made invisible as they init and update", () => {
    const image = () => ({
        alpha: 1,
        set_alpha(a) {
            this.alpha = a;
        },
    });
    const tags = [[image(), image()], "x", [null, image()]];
    const player = actor(91, { _NameImgInst: tags });
    player._event_Updating();
    assert.equal(tags[0][0].alpha, 1);
    set("wide.hidenames");
    player._event_Updating();
    assert.deepEqual([tags[0][0].alpha, tags[0][1].alpha, tags[2][1].alpha], [0, 0, 0]);
    tags[0][0].alpha = 1;
    player.init();
    assert.equal(tags[0][0].alpha, 0);
    assert.equal(actor(91, { _NameImgInst: undefined }).init(), game.base, "an actor without names is fine");
    set("wide.hidenames", false);
});

test("spelunk depth: the next dive starts at the configured depth once, only in the spelunking menu", () => {
    const menu = actor(713, { _GenINFO: [] });
    cheatConfig.w7.spelunkdepth = 5;
    menu._customEvent_SpelunkStuff();
    assert.equal(menu._GenINFO[70], undefined, "not in the menu");
    gga.MenuType2 = 82;
    assert.equal(menu._customEvent_SpelunkStuff(), game.base);
    assert.equal(menu._GenINFO[70], 4);
    assert.equal(cheatConfig.w7.spelunkdepth, 0);
    menu._GenINFO[70] = 1;
    menu._customEvent_SpelunkStuff();
    assert.equal(menu._GenINFO[70], 1);
    gga.MenuType2 = 0;
});

test("card passive: owned cards that aren't equipped add their missing passive bonus when talents rebuild", () => {
    const bonus = { Dmg: 1, Hp: 9 };
    gga.Cards = [0, 0, ["A", "B", ...Array(8).fill("B")]];
    gga.DNSM = { h: { CardBonusS: { h: bonus }, CardBonusS_old: { h: { Dmg: 0, Hp: 4 } } } };
    gga.PixelHelperActor[6] = {
        behaviors: {
            getBehavior: () => ({
                _GenINFO: Object.assign([], {
                    45: {
                        h: {
                            Blank: [0, 0, 0, "Dmg", "9"],
                            A: [0, 0, 0, "Dmg", "2"],
                            C: [0, 0, 0, "Dmg", "2"],
                            D: [0, 0, 0, "Hp", "1"],
                        },
                    },
                }),
            }),
        },
    };
    game.returns._customBlock_RunCodeOfTypeXforThingY = (key, id) => (key === "CardLv" ? { A: 1, C: 3, D: 2 }[id] : 0);
    const talents = events(124);
    talents._customBlock_TalentCalc(-4);
    assert.deepEqual(bonus, { Dmg: 1, Hp: 9 }, "off: untouched");
    set("wide.cardpassive");
    talents._customBlock_TalentCalc(-3);
    assert.deepEqual(bonus, { Dmg: 1, Hp: 9 }, "only the card-bonus rebuild");
    assert.equal(talents._customBlock_TalentCalc(-4), game.base);
    assert.deepEqual(bonus, { Dmg: 6, Hp: 9 }, "C adds 3 x 2 minus the 1 already passive; D's 2 is already passive");
    set("wide.cardpassive", false);
});
