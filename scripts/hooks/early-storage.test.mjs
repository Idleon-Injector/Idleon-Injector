// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// The early storage hooks, written down from how they worked before they moved to defineHook (#14).
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

const { context, gga, state } = await loadGame({ setupDone: false });
const window = (globalThis.window = {});
// cheats/main.js installs the early hooks when cheats.js loads, before the game's own script runs.
(await importRepo("src/cheats/core/hooks.js")).installEarlyHooks();

// The game's script then makes its class registry and registers each class before giving it a prototype.
const registry = {};
window.__idleon_cheats__ = registry;
const calls = [];
const scripts = {};
registry["com.stencyl.behavior.Script"] = {
    runLater(delay, callback) {
        scripts.runLater = callback;
    },
    runPeriodically(delay, callback) {
        scripts.runPeriodically = callback;
    },
};
const Script = registry["com.stencyl.behavior.Script"];
const { runLater, runPeriodically } = Script;

function register(number, methods) {
    function ActorEvents() {}
    registry[`scripts.ActorEvents_${number}`] = ActorEvents;
    ActorEvents.prototype = methods;
    return { ActorEvents, originals: { ...methods } };
}
const class116 = register(116, {
    init() {
        calls.push(["init", this._dummytext, this._DummyText]);
        this._event_STORAGECHEST();
        this._dummytext = "3e+5";
    },
    _event_STORAGECHEST() {
        calls.push(["chest", this._dummytext]);
    },
    _event_AttacksPage() {
        calls.push(["attacks", this._DummyText]);
    },
});
const class203 = register(203, {
    init() {}, // every actor class has one; the game sets the prototype in one go
    _event_Click() {
        events345._customBlock_ActionBlock("GiveAtoms");
        gga.ChestQuantity[1] = 105e7;
        return "clicked";
    },
    _customEvent_AutoClaimio() {
        events345._customBlock_ActionBlock("GiveAtoms");
        gga.ChestQuantity[2] = 105e7;
        return "claimed";
    },
});
const class481 = register(481, {
    init() {
        Script.runLater(500, () => ["ChestQuantity", 105e7, "GiveAtoms"], this.actor);
        Script.runLater(6000, () => ["AtomThreshold", "GiveAtoms"], this.actor);
        Script.runPeriodically(6000, () => "CondenseChest2B", this.actor);
        Script.runLater(500, () => "someone else's timer", {});
        return "init done";
    },
    _customEvent_anotherThing() {},
    _customEvent_WorkbenchStuff2() {},
});
const events345 = context["scripts.ActorEvents_345"];
const actionBlocks = [];
events345._customBlock_ActionBlock = (...args) => actionBlocks.push(args[0]);

test("the early hooks are in place the first time the game looks a class up, before setup", () => {
    for (const { ActorEvents, originals } of [class116, class203]) {
        const Found =
            registry[ActorEvents === class116.ActorEvents ? "scripts.ActorEvents_116" : "scripts.ActorEvents_203"];
        assert.equal(Found, ActorEvents);
        for (const name of Object.keys(originals).filter(
            (name) => ActorEvents !== class203.ActorEvents || name !== "init"
        ))
            assert.notEqual(Found.prototype[name], originals[name], name);
    }
    assert.notEqual(registry["scripts.ActorEvents_481"].prototype.init, class481.originals.init);
    assert.equal(
        registry["scripts.ActorEvents_481"].prototype._customEvent_anotherThing,
        class481.originals._customEvent_anotherThing,
        "only the timer hook is early"
    );
    assert.equal(state.setupDone, false);
    assert.ok(
        "value" in Object.getOwnPropertyDescriptor(registry, "scripts.ActorEvents_116"),
        "a hooked class is a plain registry entry again"
    );
});

test("storage counts: big counts are written out in digits while the storage chest builds", () => {
    const actor = Object.assign(new class116.ActorEvents(), { _dummytext: "2e+10Coins", _DummyText: 7 });
    calls.length = 0;
    actor.init();
    assert.deepEqual(calls, [
        ["init", "20000000000Coins", 7],
        ["chest", "20000000000Coins"],
    ]);
    assert.deepEqual(Object.getOwnPropertyDescriptor(actor, "_dummytext"), {
        value: "300000",
        writable: true,
        enumerable: true,
        configurable: true,
    });
    calls.length = 0;
    actor._DummyText = "1.5e+3";
    actor._event_AttacksPage();
    assert.deepEqual(calls, [["attacks", "1500"]]);
});

test("storage deposits: uncapped stacks land as their real total", () => {
    const actor = Object.assign(new class203.ActorEvents(), { _DummyText: "Copper", _ItemsToDROP: [["Copper", 7]] });
    gga.ChestOrder = ["Iron", "Copper", "Blank"];
    const quantities = [1, 5, 0];
    gga.ChestQuantity = quantities;

    state.cheatState.wide.storagecap = true;
    assert.equal(actor._event_Click(), "clicked");
    assert.deepEqual(actionBlocks, [], "the capped atom award is skipped");
    assert.deepEqual(quantities, [1, 12, 0]);
    assert.equal(gga.ChestQuantity, quantities);

    actor._DummyText = "Gold";
    actor._ItemsToDROP = [["Gold", 4]];
    actor._customEvent_AutoClaimio();
    assert.deepEqual(quantities, [1, 12, 4], "a new item goes to the first blank slot");

    state.cheatState.wide.storagecap = false;
    actor._event_Click();
    assert.deepEqual(actionBlocks, ["GiveAtoms"]);
    assert.deepEqual(quantities, [1, 105e7, 4]);
});

test("storage timers: the cap, Collider and condense timers pause while storagecap is on", () => {
    const actor = Object.assign(new class481.ActorEvents(), { actor: {} });
    state.cheatState.wide.storagecap = true;
    assert.equal(actor.init(), "init done");
    assert.equal(Script.runLater, runLater, "runLater is put back after init");
    assert.equal(Script.runPeriodically, runPeriodically);
    assert.equal(scripts.runPeriodically(), undefined, "condense paused");
    assert.equal(scripts.runLater(), "someone else's timer", "another actor's timer is left alone");

    const timers = [];
    Script.runLater = (delay, callback) => timers.push(callback);
    actor.init();
    assert.deepEqual(
        timers.map((callback) => callback()),
        [undefined, undefined, "someone else's timer"]
    );
    state.cheatState.wide.storagecap = false;
    assert.deepEqual(
        timers.map((callback) => callback()),
        [["ChestQuantity", 105e7, "GiveAtoms"], ["AtomThreshold", "GiveAtoms"], "someone else's timer"]
    );
    Script.runLater = runLater;
});
