// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// What the hooks on the game's data do, cheat on and off, written down before they moved to defineHook (#15):
// game attributes (gems, HP, revives, W5 values, currencies, cloud saves, respawn, account options, vials),
// the custom lists (costs and requirements) and item definitions, and that character select hooks rebuilt data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHookGame } from "./game-double.mjs";

const { game, set, setup, state, gga, context } = await loadHookGame();
const { cheatState, cheatConfig } = state;

function gameAttributes() {
    gga.GemsOwned = 100;
    gga.PlayerHP = 50;
    gga.PersonalValuesMap = { h: { InstaRevives: 2 } };
    gga.Gaming = Object.assign(Array(14).fill(0), { 13: 5 });
    gga.Divinity = Array(39).fill(0);
    gga.Rift = [3, 50];
    gga.Holes = Object.assign(Array(12).fill(0), { 11: Object.assign(Array(85).fill(0), { 84: 12 }) });
    gga.CurrenciesOwned = { h: { WorldTeleports: 0, ColosseumTickets: 5, ObolFragments: 0, SilverPens: 2, Other: 1 } };
    gga.CloudSaveCD = [100, 5];
    gga.MonsterRespawnTime = [10, 20];
    gga.OptionsListAccount = Array(420).fill(5);
    gga.CauldronP2W = [0, 0, 0, 0, 0, [2, 9]];
}

const row = (length, value = "cost") => Array.from({ length }, (_, i) => `${value}${i}`);
function customLists() {
    return {
        MTXinfo: [[[[0, 0, 0, 300, 0, 5, 0, 700]]]],
        RefineryInfo: [row(12)],
        SaltLicks: [row(3)],
        PrayerInfo: [row(7)],
        PostOfficePossibleOrders: [[[row(2)]]],
        GuildGPtasks: [row(2)],
        TaskDescriptions: [[row(15)]],
        SSignInfoUI: [row(5)],
        WorshipBASEinfos: [row(7)],
        AlchemyVialItemsPCT: [5, 10, 20],
        CardStuff: [[[0, 0, 0, "Dmg", "1.5"]]],
        ArtifactInfo: [[0, 0, 40]],
        RiftStuff: [0, 0, 0, 0, [0, 0, 0, 9]],
        ItemToCraftEXP: {},
    };
}

function itemDefinitions() {
    return {
        Sword: { h: { typeGen: "aWeapon", Speed: 4, Class: "WARRIOR", lvReqToEquip: 30 } },
        StoneA: { h: { typeGen: "dStone", Amount: 30, Trigger: 1 } },
        Hat: { h: { typeGen: "aHelmet", Speed: 2 } },
        Timecandy1: { h: { typeGen: "dTimeCandy", ID: 3600 } },
    };
}

gameAttributes();
gga.CustomLists = { h: customLists() };
gga.ItemDefinitionsGET = { h: itemDefinitions() };
const { hookFailures, error } = await setup();

test("every hook these tests use installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("freeze gems: the game can't change the gem count while it's on", () => {
    gga.GemsOwned = 90;
    assert.equal(gga.GemsOwned, 90);
    set("wide.gems");
    gga.GemsOwned = 10;
    assert.equal(gga.GemsOwned, 90);
    set("wide.gems", false);
    gga.GemsOwned = 10;
    assert.equal(gga.GemsOwned, 10);
});

test("godlike hp: any HP the game sets becomes the max HP", () => {
    game.returns._customBlock_PlayerHPmax = () => 999;
    gga.PlayerHP = 40;
    assert.equal(gga.PlayerHP, 40);
    set("godlike.hp");
    gga.PlayerHP = 1;
    assert.equal(gga.PlayerHP, 999);
    set("godlike.hp", false);
    gga.PlayerHP = 1;
    assert.equal(gga.PlayerHP, 1);
});

test("revives: always 10 and never used while on", () => {
    const values = gga.PersonalValuesMap.h;
    assert.equal(values.InstaRevives, 2);
    set("unlock.revive");
    assert.equal(values.InstaRevives, 10);
    values.InstaRevives = 1;
    set("unlock.revive", false);
    assert.equal(values.InstaRevives, 2);
    values.InstaRevives = 1;
    assert.equal(values.InstaRevives, 1);
});

test("W5 values: snail mail, divinity unlinks, rift progress and the blinding lantern", () => {
    cheatConfig.w5.gaming.SnailMail = 7;
    cheatState.w5.gaming = false;
    assert.equal(gga.Gaming[13], 5);
    set("w5.gaming");
    assert.equal(gga.Gaming[13], 7);
    cheatConfig.w5.gaming.SnailMail = false;
    assert.equal(gga.Gaming[13], 5);
    gga.Gaming[13] = 6;
    assert.equal(gga.Gaming[13], 6, "writes land");
    set("w5.gaming", false);

    assert.equal(gga.Divinity[38], 0);
    set("w5.divinity");
    assert.equal(gga.Divinity[38], 1);
    cheatConfig.w5.divinity.unlinks = false;
    assert.equal(gga.Divinity[38], 0);
    cheatConfig.w5.divinity.unlinks = true;
    set("w5.divinity", false);

    set("unlock.rifts");
    assert.equal(gga.Rift[1], 50, "rift 3 is a 9 in RiftStuff, so it stays");
    gga.Rift[0] = 2;
    assert.equal(gga.Rift[1], 1e8);
    set("unlock.rifts", false);
    assert.equal(gga.Rift[1], 50);

    assert.equal(gga.Holes[11][84], 12);
    set("w5.lantern");
    assert.equal(gga.Holes[11][84], 0);
    gga.Holes[11][84] = 13;
    set("w5.lantern", false);
    assert.equal(gga.Holes[11][84], 13);
});

test("currencies: teleports, tickets, obol fragments and silver pens", () => {
    const owned = () => gga.CurrenciesOwned.h;
    set("unlock.teleports");
    set("unlock.tickets");
    set("unlock.obolfrag");
    set("unlock.silvpen");
    assert.deepEqual(
        [owned().WorldTeleports, owned().ColosseumTickets, owned().ObolFragments, owned().SilverPens, owned().Other],
        [1, 5, 9001, 2, 1]
    );
    owned().WorldTeleports = 7;
    owned().ColosseumTickets = 3;
    owned().ColosseumTickets = 8;
    owned().ObolFragments = 4;
    owned().SilverPens = 1;
    owned().Other = 2;
    for (const cheat of ["teleports", "tickets", "obolfrag", "silvpen"]) set(`unlock.${cheat}`, false);
    assert.deepEqual(
        [owned().WorldTeleports, owned().ColosseumTickets, owned().ObolFragments, owned().SilverPens, owned().Other],
        [0, 8, 4, 2, 2]
    );
    owned().WorldTeleports = 7;
    owned().SilverPens = 1;
    assert.deepEqual([owned().WorldTeleports, owned().SilverPens], [7, 1]);
});

test("cloud save pause: the cooldown reads and stays at 235", () => {
    assert.equal(gga.CloudSaveCD[0], 100);
    set("cloudz");
    assert.equal(gga.CloudSaveCD[0], 235);
    gga.CloudSaveCD[0] = 3;
    gga.CloudSaveCD[1] = 4;
    set("cloudz", false);
    assert.deepEqual([gga.CloudSaveCD[0], gga.CloudSaveCD[1]], [235, 4]);
    gga.CloudSaveCD[0] = 3;
    assert.equal(gga.CloudSaveCD[0], 3);
    assert.equal(gga.CloudSaveCD.length, 2);
});

test("respawn: monster respawn times the game writes are shortened", () => {
    gga.MonsterRespawnTime[0] = 30;
    assert.equal(gga.MonsterRespawnTime[0], 30);
    set("godlike.respawn");
    gga.MonsterRespawnTime[0] = 30;
    assert.equal(gga.MonsterRespawnTime[0], cheatConfig.godlike.respawn(30));
    set("godlike.respawn", false);
});

test("account options: toggles read their fixed value and keep it", () => {
    const options = gga.OptionsListAccount;
    for (const [cheat, index, value] of [
        ["unban", 26, 0],
        ["wide.eventitems", 29, 0],
        ["minigames", 33, 1],
        ["unlock.quickref", 34, 0],
        ["w4.spiceclaim", 100, 0],
        ["w4.arena", 88, 1],
        ["wide.eventspins", 325, 10],
        ["w6.emperor", 370, -10],
        ["w5.skillcaverns", 318, 0],
        ["w3.jeweledcogs", 414, 0],
    ]) {
        assert.equal(options[index], 5, `${cheat} off`);
        set(cheat);
        assert.equal(options[index], value, cheat);
        options[index] = 6;
        set(cheat, false);
        assert.equal(options[index], 5, `${cheat}: the game's write was dropped`);
    }
    set("w2.boss");
    options[185] = 10;
    assert.equal(options[185], 0);
    options[185] = 9;
    assert.equal(options[185], 9);
    set("w2.boss", false);
    options[185] = 10;
    assert.equal(options[185], 10);
});

test("account options: capped currencies are clamped on read and write", () => {
    const options = gga.OptionsListAccount;
    const { maxval } = cheatConfig;
    for (const [indexes, cap] of [
        [[71, 72], "creditcap"],
        [[73], "flurbocap"],
        [[329], "totalbones"],
        [[330, 333], "bones"],
        [[357, 361], "dust"],
        [[362], "totaldust"],
        [[388, 393], "tach"],
        [[394], "totaltach"],
    ]) {
        for (const index of indexes) {
            options[index] = Infinity;
            assert.equal(options[index], maxval[cap], `${cap} write ${index}`);
            options[index] = 3;
            assert.equal(options[index], 3);
        }
    }
    options[329] = NaN;
    assert.equal(options[329], maxval.totalbones, "NaN reads as the cap");
    options[400] = Infinity;
    assert.equal(options[400], Infinity, "uncapped");
    assert.equal(options.length, 420);
    assert.equal(JSON.stringify(options.slice(0, 2)), "[5,5]");
});

test("vial attempts: the attempts never go down while on", () => {
    const attempts = gga.CauldronP2W[5];
    assert.equal(attempts[0], 2);
    set("w2.vialattempt");
    assert.equal(attempts[0], 9);
    attempts[0] = 1;
    set("w2.vialattempt", false);
    assert.equal(attempts[0], 2);
    attempts[0] = 1;
    assert.equal(attempts[0], 1);
});

test("custom lists: costs and requirements read as nothing while their cheat is on", () => {
    const lists = gga.CustomLists.h;
    for (const [cheat, read, zero, original] of [
        ["wide.mtx", () => lists.MTXinfo[0][0][0][3], 0, 300],
        ["wide.mtx", () => lists.MTXinfo[0][0][0][7], 0, 700],
        ["w3.refinery", () => lists.RefineryInfo[0][6], "0", "cost6"],
        ["w3.refinery", () => lists.RefineryInfo[0][11], "0", "cost11"],
        ["w3.saltlick", () => lists.SaltLicks[0][2], "0", "cost2"],
        ["w3.prayer", () => lists.PrayerInfo[0][4], "0", "cost4"],
        ["w3.prayer", () => lists.PrayerInfo[0][6], "0", "cost6"],
        ["w3.prayer", () => lists.PrayerInfo[0][2], "None._Even_curses_need_time_off_every_now_and_then", "cost2"],
        ["wide.post", () => lists.PostOfficePossibleOrders[0][0][0][1], "0", "cost1"],
        ["wide.guild", () => lists.GuildGPtasks[0][1], "0", "cost1"],
        ["wide.task", () => lists.TaskDescriptions[0][0][5], "0", "cost5"],
        ["wide.task", () => lists.TaskDescriptions[0][0][14], "0", "cost14"],
        ["wide.star", () => lists.SSignInfoUI[0][4], "0", "cost4"],
        ["w3.freeworship", () => lists.WorshipBASEinfos[0][6], "1", "cost6"],
        ["w2.vialrng", () => lists.AlchemyVialItemsPCT, [99, 99, 99], [5, 10, 20]],
        ["godlike.card", () => lists.CardStuff[0][0][4], "150", "1.5"],
        ["w5.sailing", () => lists.ArtifactInfo[0][2], cheatConfig.w5.sailing.ArtifactRarity(40), 40],
    ]) {
        assert.deepEqual(read(), original, `${cheat} off`);
        set(cheat);
        assert.deepEqual(read(), zero, cheat);
        set(cheat, false);
    }
    assert.equal(lists.RefineryInfo[0][5], "cost5", "other entries are untouched");
});

test("custom lists: the gem buy limit is raised to the configured one", () => {
    const entry = gga.CustomLists.h.MTXinfo[0][0][0];
    set("wide.gembuylimit");
    cheatConfig.wide.gembuylimit = 50;
    assert.equal(entry[5], 50);
    cheatConfig.wide.gembuylimit = 2;
    assert.equal(entry[5], 5);
    delete cheatConfig.wide.gembuylimit;
    assert.equal(entry[5], 5);
    set("wide.gembuylimit", false);
});

test("custom lists and item definitions: the game's writes to hooked entries are dropped", () => {
    const lists = gga.CustomLists.h;
    lists.SaltLicks[0][2] = "changed";
    assert.equal(lists.SaltLicks[0][2], "cost2");
    lists.SaltLicks[0][1] = "changed";
    assert.equal(lists.SaltLicks[0][1], "changed");
    const sword = gga.ItemDefinitionsGET.h.Sword.h;
    sword.Speed = 1;
    assert.equal(sword.Speed, 4);
});

test("item definitions: weapon speed, upgrade stones, equip all and candy time", () => {
    const items = gga.ItemDefinitionsGET.h;
    const read = () => [
        items.Sword.h.Speed,
        items.Hat.h.Speed,
        items.StoneA.h.Amount,
        items.StoneA.h.Trigger,
        items.Sword.h.Class,
        items.Sword.h.lvReqToEquip,
        items.Hat.h.Class,
        items.Timecandy1.h.ID,
    ];
    assert.deepEqual(read(), [4, 2, 30, 1, "WARRIOR", 30, undefined, 3600]);
    for (const cheat of ["godlike.speed", "upstones.rng", "upstones.use", "equipall", "wide.candytime"]) set(cheat);
    assert.deepEqual(read(), [9, 2, 100, 0, "ALL", 1, undefined, 600]);
    cheatConfig.godlike.speed = 3;
    cheatConfig.wide.candytime = 60;
    assert.deepEqual(
        read().filter((_, i) => i === 0 || i === 7),
        [3, 60]
    );
    delete cheatConfig.godlike.speed;
    delete cheatConfig.wide.candytime;
    for (const cheat of ["godlike.speed", "upstones.rng", "upstones.use", "equipall", "wide.candytime"]) {
        set(cheat, false);
    }
    assert.deepEqual(read(), [4, 2, 30, 1, "WARRIOR", 30, undefined, 3600]);
});

test("character select: the rebuilt data is hooked, and what's kept isn't hooked twice", () => {
    const keptLists = gga.CustomLists.h;
    set("wide.mtx");
    set("wide.gems");
    context.FirebaseStorage.playButton();
    set("wide.mtx", false);
    assert.equal(keptLists.MTXinfo[0][0][0][3], 300, "a list hooked again would keep the cheat's 0");
    set("wide.gems", false);
    gga.GemsOwned = 70;
    assert.equal(gga.GemsOwned, 70);

    gameAttributes();
    gga.CustomLists = { h: customLists() };
    gga.ItemDefinitionsGET = { h: itemDefinitions() };
    context.FirebaseStorage.playButton();
    for (const cheat of ["wide.mtx", "equipall", "w5.lantern", "cloudz", "unlock.teleports", "w2.vialattempt"])
        set(cheat);
    assert.equal(gga.CustomLists.h.MTXinfo[0][0][0][3], 0);
    assert.equal(gga.ItemDefinitionsGET.h.Sword.h.Class, "ALL");
    assert.equal(gga.Holes[11][84], 0);
    assert.equal(gga.CloudSaveCD[0], 235);
    assert.equal(gga.CurrenciesOwned.h.WorldTeleports, 1);
    assert.equal(gga.CauldronP2W[5][0], 9);
    for (const cheat of ["wide.mtx", "equipall", "w5.lantern", "cloudz", "unlock.teleports", "w2.vialattempt"]) {
        set(cheat, false);
    }
    assert.equal(gga.CustomLists.h.MTXinfo[0][0][0][3], 300);
    assert.equal(gga.CloudSaveCD[0], 100);
    gga.CloudSaveCD[0] = 4;
    assert.equal(gga.CloudSaveCD[0], 4);
});
