// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// What the hooks on FirebaseStorage do, cheat on and off, written down before they moved to defineHook (#15):
// W1 companions, auto party, unban and Steam achievements.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "../known-bugs/index.mjs";
import { loadHookGame } from "./game-double.mjs";

const { game, set, setup, state, gga, context } = await loadHookGame();
const { cheatConfig } = state;
const firebase = context.FirebaseStorage;

gga.CustomLists = { h: { CompanionDB: [["mushG"], ["frogG"], ["gone"], ["beanG"]], ItemToCraftEXP: {} } };
gga.MonsterDefinitionsGET = {
    h: { mushG: { h: { Name: "Mush" } }, frogG: { h: { Name: "Frog" } }, beanG: { h: { Name: "" } } },
};
gga.OptionsListAccount = Array(610).fill(0);
gga.OtherPlayers = { h: { me: 0, Ann: 0, Bob: 0, Cyd: 0 } };
const owned = ["1,0,0,0,0", "7,1,2,3,0"];
game.returns.getCompanionInfoMe = () => owned.slice();
const { hookFailures, error } = await setup();
const { getPetTokens } = await importRepo("src/cheats/helpers/petTokens.js");

test("every hook these tests use installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("companions: deleting and reordering do nothing while the fake list is on", async () => {
    game.returns.deleteCompanion = () => "deleted";
    game.returns.swapCompanionOrder = () => "swapped";
    assert.equal(firebase.deleteCompanion(1), "deleted");
    assert.equal(firebase.swapCompanionOrder(1, 2), "swapped");
    set("w1.companion");
    game.calls.length = 0;
    assert.equal(await firebase.deleteCompanion(1), 1);
    assert.equal(await firebase.swapCompanionOrder(1, 2), 1);
    assert.deepEqual(game.calls, []);
    set("w1.companion", false);
});

test("companions: the chosen follower is remembered while on and still sent to the game", () => {
    game.returns.setCompanionFollower = (id) => `follow ${id}`;
    game.returns.getCurrentCompanion = () => "game's";
    assert.equal(firebase.setCompanionFollower(3), "follow 3");
    assert.equal(cheatConfig.w1.companion.current, "11");
    assert.equal(firebase.getCurrentCompanion(), "game's");
    set("w1.companion");
    assert.equal(firebase.setCompanionFollower(4), "follow 4");
    assert.equal(cheatConfig.w1.companion.current, "4");
    assert.equal(firebase.getCurrentCompanion(), "4");
    set("w1.companion", false);
    cheatConfig.w1.companion.current = "11";
});

test("companions: every named companion with no list configured, minus pet-token picks", () => {
    assert.deepEqual(firebase.getCompanionInfoMe(), owned);
    set("w1.companion");
    cheatConfig.w1.companion.companions = "";
    assert.deepEqual(firebase.getCompanionInfoMe(), ["0,0,0,0,1", "1,0,0,0,1"]);
    gga.OptionsListAccount[606] = "1";
    assert.deepEqual(firebase.getCompanionInfoMe(), ["0,0,0,0,1"]);
    gga.OptionsListAccount[606] = 0;
    set("w1.companion", false);
});

test("companions: a configured list is merged with the owned companions, the config winning", () => {
    set("w1.companion");
    cheatConfig.w1.companion.companions = " 3 , 7:0, x, 9:1";
    assert.deepEqual(firebase.getCompanionInfoMe(), ["1,0,0,0,0", "7,0,0,0,0", "3,0,0,0,1", "9,0,0,0,1"]);
    cheatConfig.w1.companion.companions = [2, "5", "1,9,9,9,0"];
    assert.deepEqual(firebase.getCompanionInfoMe(), ["1,9,9,9,0", "7,1,2,3,0", "2,0,0,0,1", "5,0,0,0,1"]);
    gga.OptionsListAccount[606] = "2,5";
    assert.deepEqual(firebase.getCompanionInfoMe(), ["1,9,9,9,0", "7,1,2,3,0"]);
    gga.OptionsListAccount[606] = 0;
    const other = { custom: true };
    cheatConfig.w1.companion.companions = other;
    assert.equal(firebase.getCompanionInfoMe(), other);
    cheatConfig.w1.companion.companions = "";
    set("w1.companion", false);
});

test("companions: pet tokens see the real owned companions while the fake list is on", () => {
    set("w1.companion");
    assert.deepEqual(getPetTokens().ownedPets, [
        { id: 1, plus: false },
        { id: 7, plus: false },
    ]);
    game.returns.getCompanionInfoMe = () => null;
    assert.deepEqual(getPetTokens().ownedPets, []);
    game.returns.getCompanionInfoMe = () => owned.slice();
    set("w1.companion", false);
});

test("auto party: a short party is filled with other online players", () => {
    game.returns.getPartyMembers = () => [["me", "w1", 1]];
    assert.deepEqual(firebase.getPartyMembers(), [["me", "w1", 1]]);
    set("wide.autoparty");
    assert.deepEqual(firebase.getPartyMembers(), [
        ["me", "w1", 1],
        ["Ann", "w1", 0],
        ["Bob", "w1", 0],
        ["Cyd", "w1", 0],
    ]);
    game.returns.getPartyMembers = () => [];
    assert.deepEqual(firebase.getPartyMembers(), []);
    game.returns.getPartyMembers = () => "offline";
    assert.equal(firebase.getPartyMembers(), "offline");
    set("wide.autoparty", false);
});

test("unban: the game's marked-file cleanup never runs while unban is configured", () => {
    game.returns.cleanMarkedFiles = () => "cleaned";
    assert.equal(firebase.cleanMarkedFiles(), undefined);
    cheatConfig.unban = false;
    assert.equal(firebase.cleanMarkedFiles(), "cleaned");
    cheatConfig.unban = true;
});

test("steam achievements: each one is sent once, and none while disabled", () => {
    const sent = [];
    game.returns.areaCheck = (id) => sent.push(id);
    cheatConfig.steamachieve = false;
    assert.equal(firebase.areaCheck("a"), undefined);
    cheatConfig.steamachieve = true;
    firebase.areaCheck("a");
    firebase.areaCheck("b");
    assert.equal(firebase.areaCheck("a"), undefined);
    assert.deepEqual(sent, ["a", "b"]);
});
