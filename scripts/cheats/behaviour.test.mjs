// What a sample of cheats with real logic do, written against the cheats before they became defineCheat rows (#16):
// the answer each command gives and what it changes in the (fake) game, state and config.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadGame } from "../known-bugs/index.mjs";

const game = await loadGame();
const { gga, cheat } = game;
const { cheatState, cheatConfig } = game.state;
const run = async (action, on) => await cheat(action, on);

test("commands that change the save answer as before and change the same values", async () => {
    gga.OptionsListAccount = Array(400).fill(7);
    gga.ItemQuantity = [1, 1];
    gga.Ribbon = Array(28).fill(4);
    gga.Ribbon[3] = 0;
    gga.InventoryOrder = ["Copper", "Iron", "Gold"];
    gga.TimeAway = { h: {} };

    assert.deepEqual(await run("w2 killroyreset"), { ok: true, message: "Killroy weekly progress has been reset" });
    assert.equal(gga.OptionsListAccount[113], 0);

    assert.deepEqual(await run("qnty inv 25"), { ok: true, message: "Inventory slot 1 qty: 25" });
    assert.equal(gga.ItemQuantity[0], 25);

    assert.deepEqual(await run("w4 ribbon 12"), { ok: true, message: "Added ribbon 12 at storage index 3." });
    assert.equal(gga.Ribbon[3], 12);
    assert.deepEqual(await run("w4 ribbon 30"), { ok: true, message: "Please provide a ribbon lvl between 1 and 25" });

    assert.deepEqual(await run("unlock islands"), { ok: true, message: "All fishing islands unlocked" });
    assert.equal(gga.OptionsListAccount[169], "abcde_", "the default from config.js");

    assert.deepEqual(await run("wipe invslot 1"), {
        ok: true,
        message: "Wipe inventory slot could result in a crash: Should be fine after restart",
    });
    assert.deepEqual(gga.InventoryOrder, ["Copper", "Blank", "Gold"]);
    assert.deepEqual(await run("wipe invslot x"), { ok: true, message: "Specify a valid slot number" });

    assert.deepEqual(await run("lvl furnace 5"), { ok: true, message: "Furnace has been changed to 5." });
    assert.deepEqual(gga.FurnaceLevels, [16, 5, 5, 5, 5, 5]);
    assert.deepEqual(await run("lvl furnace x"), { ok: true, message: "The lvl value has to be numeric!" });

    assert.deepEqual(await run("daily"), { ok: true, message: "The daily shop restock has been triggered" });
    assert.equal(gga.TimeAway.h.ShopRestock, 1);

    assert.deepEqual(await run("noob"), { ok: true, message: "The amount of health is set to 0" });
    assert.equal(gga.PlayerHP, 0);
});

test("toggles, groups and value cheats set the same state and config", async () => {
    assert.deepEqual(await run("godlike", true), { ok: true, message: "Activated all godlike powers" });
    assert.ok(Object.values(cheatState.godlike).every(Boolean));
    assert.equal(cheatState.godlikes, true);
    assert.deepEqual(await run("godlike reach", false), { ok: true, message: "Deactivated reach set to 666." });
    assert.equal(cheatState.godlike.reach, false);
    assert.deepEqual(await run("godlike reach"), { ok: true, message: "Activated reach set to 666." });

    assert.deepEqual(await run("godlike speed 3"), { ok: true, message: "Set godlike speed to 3" });
    assert.equal(cheatConfig.godlike.speed, 3);
    assert.deepEqual(await run("godlike speed abc"), {
        ok: false,
        message: "Invalid value. Must be a number or boolean.",
    });

    assert.deepEqual(await run("multiply damage 2"), { ok: true, message: "Set multiply damage to 2" });
    assert.equal(cheatState.multiply.damage, true);
    assert.equal(cheatConfig.multiply.damage, 2);
    assert.deepEqual(await run("multiply"), { ok: false, message: "multiply is not a valid option." });

    // No allowToggleChildren: the group toggles its own "minigames" flag, not the children.
    assert.deepEqual(await run("minigame"), { ok: true, message: "Activated unlimited minigames." });
    assert.equal(cheatState.minigames, true);
    assert.equal(cheatState.minigame.fishing, false);

    assert.deepEqual(await run("equipall", true), {
        ok: true,
        message: "Activated !danger! Equip any item at any class/level.",
    });
    assert.equal(cheatState.equipall, true);

    assert.equal((await run("cloudz")).message.split(":")[0], "Activated the cloudsave jammer");
    assert.equal(cheatState.cloudz, true);

    assert.deepEqual(await run("w6 sumunit reset"), { ok: true, message: "summoning units has been reset to default" });
    assert.equal(cheatState.w6.sumunit, false);
    assert.equal(cheatConfig.w6.sumunit.UnitTypeDraw(5), 5);
});

test("refusals and errors come back as before", async () => {
    assert.deepEqual(await run("bogus"), { ok: false, message: "bogus is not a valid option." });
    assert.deepEqual(await run("w1 anvil 5"), { ok: false, message: "This cheat doesn't accept values" });
    const wrong = await run("w1 nope");
    assert.equal(wrong.ok, false);
    assert.match(wrong.message, /^Wrong subcommand, use one of these:\nw1 anvil \(anvil cost and duration/);
    assert.deepEqual(await run("chng 1+1"), {
        ok: true,
        message: "chng command is currently disabled in config.js Enable it ONLY if you know what you are doing.",
    });
    assert.deepEqual(await run("class"), {
        ok: false,
        message: "Cannot read properties of undefined (reading 'toLowerCase')",
    });
    assert.deepEqual(await run("w7 sushitools knowledge 1"), {
        ok: false,
        message: "Use knowledge <tier> <quantity>.",
    });
    assert.deepEqual(await run("w7 sushitools status now"), {
        ok: false,
        message: "status does not accept arguments.",
    });
    assert.equal((await run("nomore (")).ok, false, "a broken regex");
    assert.deepEqual(await run("fix_write"), { ok: true, message: "No attribute specified" });
    assert.deepEqual(await run("keychain reset"), { ok: true, message: "Reset keychain override to default RNG" });
});

test("the cheats command lists every command", async () => {
    const lines = (await run("cheats")).message.split("\n");
    assert.equal(lines.length, 270);
    assert.ok(lines.includes("automation shops (buy switched-on town shop items into the chest with chest coins)"));
    assert.ok(lines.includes("drop (drop items)"));
    assert.ok(lines.includes("wide attire (the bonuses of the outfits chosen on the Attire Rack page)"));
    assert.ok(
        lines.includes("wide perfectequipped (Permanently rebuild current gear for your class; increase food stacks.)")
    );
    assert.ok(lines.includes("w7 sushitools knowledge (Add crafting-tree Knowledge XP: <tier> <quantity>)"));
});
