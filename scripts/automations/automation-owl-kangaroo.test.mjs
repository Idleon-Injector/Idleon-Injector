// Automation (#92): Orion the owl, Poppy the kangaroo and her Tar Pit. "automation orion", "automation poppy" and
// "automation tarpit" buy their switched-on upgrades every second through the owl menu's own buy event: cheapest
// first, High / Low / Balanced with the saving %, up to each stop-at level, only unlocked rows, and Poppy's two only
// while her menu is open (decided with Lumi on 2026-11-10 and 2026-11-11).
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat, state } = await loadGame();
const { getAutomations } = await importRepo("src/cheats/core/automations.js");
const { readComputed } = await importRepo("src/cheats/api/stateAccessors.js");

// Owlz rows: 0-8 Orion, 9-20 Poppy, 21-28 the Tar Pit; [0] is the name ("_" and "|" for spaces), [3] what unlocks it.
const ORION = ["Feather_Generation", "Bonuses_of_Orion", "Feather_Multiplier", "Feather_Cheapener"];
const ORION_ROWS = [...ORION, "Feather|Restart", "Super_Feathers", "Shiny_Feathers", "Super_Cheapener"];
const owlz = [
    ...[...ORION_ROWS, "The_Great_Mega_Reset"].map((name, i) => [name, "0", "0", String(i * 100)]),
    ...Array.from({ length: 12 }, (_, i) => [`Poppy_${i}`, "0", "0", String(i * 10)]),
    ...Array.from({ length: 8 }, (_, i) => [`Tar_${i}`, "0", "0", "0"]),
];
// Each row's base price; a level costs base × (level + 1).
const BASE = { a: [10, 30, 20, 50, 400, 60, 70, 80, 2000], b: [5, 7, 9, 11, 13, 15, 100, 17, 19, 21, 23, 200] };
BASE.h = [3, 4, 6, 8, 10, 12, 14, 16];
const MONEY = { a: 253, b: 267, h: 296 };
const LEVELS = { a: 254, b: 268, h: 297 };
const cost = (letter, i) => BASE[letter][i] * (gga.OptionsListAccount[LEVELS[letter] + i] + 1);
const events = []; // every buy event the automation sent, "a3" and so on

// The owl menu's buy event, as the game has it: it checks the price, takes it and adds a level; a restart or the
// mega reset sets feathers to 5 and levels back to 0; Poppy's resets are refused mid shiny catch.
const owlMenu = {
    _GenINFO: { 22: 0 },
    _customEvent_OwlStuffz() {
        events.push(this._TRIGGEREDtext);
        const letter = this._TRIGGEREDtext[0];
        const i = Number(this._TRIGGEREDtext.slice(1));
        const ola = gga.OptionsListAccount;
        if (ola[MONEY[letter]] < cost(letter, i)) return;
        if (letter === "b" && (i === 6 || i === 11) && this._GenINFO[22] !== 0) return;
        ola[MONEY[letter]] -= cost(letter, i);
        ola[LEVELS[letter] + i]++;
        if (letter === "a" && (i === 4 || i === 8)) {
            ola[253] = 5;
            for (const row of [0, 2, 3]) ola[254 + row] = 0;
        }
    },
};

const setGame = () => {
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    gga.CurrentMap = 3;
    gga.MenuType2 = 0;
    Object.assign(gga.CustomLists.h, { Owlz: owlz, MapName: Object.assign(Array(10).fill("Other"), { 3: "Town" }) });
    gga.OptionsListAccount = Array(320).fill(0);
    gga.PixelHelperActor[25] = { behaviors: { getBehavior: (name) => name === "ActorEvents_670" && owlMenu } };
    owlMenu._GenINFO[22] = 0;
    const formulas = {
        OwlCost: (i) => cost("a", i),
        RooCost: (i) => cost("b", i),
        RooCost_T: (i) => cost("h", i),
        OwlFeatherRate: () => 42,
        RooTarOwned: () => 3,
    };
    context["scripts.ActorEvents_579"]._customBlock_Summoning = (name, i) => formulas[name](i);
    events.length = 0;
};
const configure = (settings) =>
    state.updateCheatConfig({
        automation: {
            orion: [],
            poppy: [],
            tarpit: [],
            orionSaving: 10,
            poppySaving: 10,
            tarpitSaving: 10,
            ...settings,
        },
    });
const entry = (key) => getAutomations().find(({ cheat: name }) => name === `automation ${key}`);
const levels = (letter, count) => gga.OptionsListAccount.slice(LEVELS[letter], LEVELS[letter] + count);
const on = (id, extra = {}) => ({ id: String(id), on: true, ...extra });

test("the overview lists Orion, Poppy and the Tar Pit beside Shops", () => {
    const listed = readComputed("automation", "list").value.map(({ cheat: name, label }) => [name, label]);
    for (const pair of [
        ["automation orion", "Orion"],
        ["automation poppy", "Poppy"],
        ["automation tarpit", "Tar Pit"],
    ])
        assert.deepEqual(
            listed.find(([name]) => name === pair[0]),
            pair
        );
});

test("Orion's preset keeps The Great Mega Reset High and Feather Restart Low, both switched off", () => {
    const { cheatConfig } = state;
    const defaults = (key) => cheatConfig.automation?.[key];
    // loadGame starts from config.js, before any test changes it.
    assert.deepEqual(defaults("orion"), [
        { id: "8", on: false, priority: 1 },
        { id: "4", on: false, priority: 2 },
    ]);
    assert.equal(defaults("orionSaving"), 10);
});

test("each tab reads its currency and every upgrade, locked ones with what unlocks them", () => {
    setGame();
    Object.assign(gga.OptionsListAccount, { 253: 1234, 263: 150, 255: 2 });
    const orion = readComputed("automation", "orion").value;
    assert.equal(orion.money, 1234);
    assert.equal(orion.rate, 42);
    assert.equal(orion.upgrades.length, 9);
    assert.deepEqual(orion.upgrades[1], {
        id: 1,
        name: "Bonuses_of_Orion",
        level: 2,
        cost: 90,
        unlockAt: 100,
        unlocked: true,
    });
    assert.equal(orion.upgrades[2].unlocked, false, "200 feathers produced unlock it; 150 so far");
    assert.equal(orion.upgrades[0].unlockAt, 0, "the first upgrade is always open");

    const poppy = readComputed("automation", "poppy").value;
    assert.equal(poppy.upgrades.length, 12);
    assert.equal(poppy.rate, null);
    const tarpit = readComputed("automation", "tarpit").value;
    assert.deepEqual(
        tarpit.upgrades.map(({ unlocked }) => unlocked),
        [true, true, true, false, false, false, false, false],
        "RooTarOwned (3) rows are open"
    );
});

test("Orion buys switched-on upgrades cheapest first each second, never past the stop-at", async () => {
    setGame();
    gga.OptionsListAccount[253] = 200;
    gga.OptionsListAccount[263] = 1000;
    configure({ orion: [on(0, { stopAt: 3 }), on(2), { id: "3", on: false }] });
    assert.equal((await cheat("automation orion")).ok, true);
    assert.equal(entry("orion").on, true);

    mock.timers.tick(1000);
    // Row 0 costs 10, 20, 30 (it stops at level 3); row 2 costs 20, 40, 60, 80. Cheapest first (a tie goes to the
    // first row): 10, 20, 20, 30, 40, 60, and the 80 waits with 20 feathers left.
    assert.deepEqual(events, ["a0", "a0", "a2", "a0", "a2", "a2"]);
    assert.deepEqual(levels("a", 4), [3, 0, 3, 0]);
    assert.equal(gga.OptionsListAccount[253], 20);
    assert.equal(entry("orion").status, "Buying cheapest first; 6 levels bought since it started");

    gga.OptionsListAccount[253] = 1000;
    mock.timers.tick(1000);
    assert.equal(levels("a", 1)[0], 3, "row 0 stays at its stop-at");
    assert.equal(levels("a", 4)[3], 0, "row 3 is switched off");
    await cheat("automation orion", false);
});

test("it never sends a buy the feathers can't pay for", async () => {
    setGame();
    gga.OptionsListAccount[253] = 9;
    configure({ orion: [on(0)] });
    await cheat("automation orion", true);
    mock.timers.tick(1000);
    assert.deepEqual(events, []);
    gga.OptionsListAccount[253] = 10;
    mock.timers.tick(1000);
    assert.deepEqual(events, ["a0"]);
    await cheat("automation orion", false);
});

test("a locked upgrade switched on ahead waits until the run has produced enough", async () => {
    setGame();
    gga.OptionsListAccount[253] = 500;
    gga.OptionsListAccount[263] = 199;
    configure({ orion: [on(2, { stopAt: 1 })] });
    await cheat("automation orion", true);
    mock.timers.tick(1000);
    assert.deepEqual(events, [], "the buy event skips the unlock check, so the automation must");
    gga.OptionsListAccount[263] = 200;
    mock.timers.tick(1000);
    assert.deepEqual(events, ["a2"]);
    await cheat("automation orion", false);
});

test("High buys first, Low is saved for, and Balanced may spend only saving % of the goal meanwhile", async () => {
    setGame();
    gga.OptionsListAccount[263] = 1e6;
    gga.OptionsListAccount[253] = 300;
    // Feather Restart (400) Low, Mega Reset (2000) High, Feather Generation (10, 20, ...) Balanced.
    configure({ orion: [on(4, { priority: 2 }), on(8, { priority: 1 }), on(0)], orionSaving: 10 });
    await cheat("automation orion", true);
    mock.timers.tick(1000);
    // Saving for the 400 restart: Balanced may cost up to 40, so 10, 20, 30, 40 buy and 50 waits.
    assert.deepEqual(events, ["a0", "a0", "a0", "a0"]);
    assert.equal(gga.OptionsListAccount[253], 200);
    assert.equal(entry("orion").status, "Saving for Feather Restart (400); 4 levels bought since it started");

    gga.OptionsListAccount[253] = 400;
    mock.timers.tick(1000);
    assert.equal(events.at(4), "a4", "the goal buys once affordable");
    assert.equal(gga.OptionsListAccount[258], 1);

    events.length = 0;
    gga.OptionsListAccount[253] = 5000;
    mock.timers.tick(1000);
    assert.equal(events[0], "a8", "an affordable High goes before cheaper upgrades");

    // The goal's cost reads the way the game writes numbers.
    gga.OptionsListAccount[253] = 0;
    gga.OptionsListAccount[258] = 12344; // Feather Restart costs 400 × 12345
    gga.OptionsListAccount[262] = 1e6;
    assert.match(entry("orion").status, /^Saving for Feather Restart \(4\.94M\);/);
    await cheat("automation orion", false);
});

test("with saving 0 Balanced waits for the whole goal", async () => {
    setGame();
    gga.OptionsListAccount[263] = 1e6;
    gga.OptionsListAccount[253] = 300;
    configure({ orion: [on(4, { priority: 2 }), on(0)], orionSaving: 0 });
    await cheat("automation orion", true);
    mock.timers.tick(1000);
    assert.deepEqual(events, []);
    await cheat("automation orion", false);
});

test("nothing buys outside a character's map", async () => {
    setGame();
    gga.OptionsListAccount[253] = 100;
    configure({ orion: [on(0)] });
    await cheat("automation orion", true);
    context["com.stencyl.Engine"].engine.scene = { name: "CharSelect" };
    mock.timers.tick(1000);
    assert.deepEqual(events, []);
    assert.equal(entry("orion").status, "Waiting for a character to be in game");
    configure({ orion: [] });
    assert.equal(entry("orion").status, "No upgrade is switched on");
    await cheat("automation orion", false);
    gga.OptionsListAccount[253] = 100;
    context["com.stencyl.Engine"].engine.scene = { name: "Town" };
    configure({ orion: [on(0)] });
    mock.timers.tick(1000);
    assert.deepEqual(events, [], "switched off, it buys nothing");
});

test("Poppy and the Tar Pit buy only while Poppy's menu is open", async () => {
    setGame();
    Object.assign(gga.OptionsListAccount, { 267: 100, 280: 1000, 296: 100 });
    configure({ poppy: [on(0, { stopAt: 2 })], tarpit: [on(1, { stopAt: 1 }), on(4)] });
    await cheat("automation poppy", true);
    await cheat("automation tarpit", true);
    mock.timers.tick(1000);
    assert.deepEqual(events, []);
    assert.equal(entry("poppy").status, "Waiting for Poppy's menu to be open");
    assert.equal(entry("tarpit").status, "Waiting for Poppy's menu to be open");

    gga.MenuType2 = 65;
    mock.timers.tick(1000);
    // Tar Pit row 4 is past RooTarOwned (3), so only row 1 buys there.
    assert.deepEqual(events, ["b0", "b0", "h1"]);
    assert.deepEqual(levels("b", 1), [2]);
    assert.deepEqual(levels("h", 5), [0, 1, 0, 0, 0]);
    await cheat("automation poppy", false);
    await cheat("automation tarpit", false);
});

test("Poppy's resets wait while a shiny catch runs", async () => {
    setGame();
    gga.MenuType2 = 65;
    Object.assign(gga.OptionsListAccount, { 267: 1000, 280: 1000 });
    owlMenu._GenINFO[22] = 1;
    configure({ poppy: [on(6, { stopAt: 1 }), on(11, { stopAt: 1 })] });
    await cheat("automation poppy", true);
    mock.timers.tick(1000);
    assert.deepEqual(events, [], "the game would refuse both");
    owlMenu._GenINFO[22] = 0;
    mock.timers.tick(1000);
    assert.deepEqual(events, ["b6", "b11"]);
    await cheat("automation poppy", false);
});
