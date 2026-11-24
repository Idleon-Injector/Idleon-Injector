// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// What every minigame cheat does to the game, written down from the hooks before they moved to defineHook (#14).
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadGame } from "../known-bugs/index.mjs";

const { context, gga, state } = await loadGame({ setupDone: false });
const { cheatState, cheatConfig } = state;
const calls = [];

/** A game class whose methods record their call; `methods` replaces some with the game's own work. */
function gameClass(number, names, methods = {}) {
    function ActorEvents() {}
    for (const name of names) {
        const work = methods[name];
        ActorEvents.prototype[name] = function (...args) {
            calls.push(`${number}.${name}`);
            return work ? work.apply(this, args) : `${name} result`;
        };
    }
    context[`scripts.ActorEvents_${number}`] = ActorEvents;
    return (fields = {}) => Object.assign(new ActorEvents(), fields);
}

/** A game image: alpha, scaleX and a color transform the hooks tint. */
function image() {
    return {
        alpha: 1,
        scaleX: 0,
        color: { redMultiplier: 1, greenMultiplier: 1, blueMultiplier: 1 },
        set_alpha(alpha) {
            this.alpha = alpha;
        },
        set_scaleX(x) {
            this.scaleX = x;
        },
        get_transform() {
            const transform = { color: { ...this.color } };
            transform.get_colorTransform = () => transform.color;
            transform.set_colorTransform = (color) => (transform.color = color);
            return transform;
        },
        set_transform(transform) {
            this.color = transform.color;
        },
    };
}
const tinted = (img) => [img.color.redMultiplier, img.color.greenMultiplier, img.color.blueMultiplier];
const indexes = (length) => Array.from({ length }, (_, i) => i);

const new229 = gameClass(229, ["init", "_customEvent_MiningGameOver"], {
    init() {
        this._GenInfo = indexes(40);
        this._GenInfo[4] = [
            [600, 2],
            [100, 3],
            [200, 5],
            [50, 6],
        ];
        this._GenInfo[8] = [321];
        this._GenInfo[13] = [5, 5, 5, 5];
        this._GenInfo[33] = [1, 2, 3, 4, 5];
    },
});
const new116 = gameClass(116, ["init", "_event_STORAGECHEST", "_event_AttacksPage"], {
    init() {
        this._GeneralINFO = indexes(10);
    },
});
const new510 = gameClass(510, ["init"], {
    init() {
        this._GenINFO = indexes(140);
    },
});
const new670 = gameClass(
    670,
    ["init", "_event_OwlEvent", "_event_Events", "_event_7", "_customEvent_CavernStuffz3", "_event_monumentgameplay"],
    {
        _event_OwlEvent() {
            return this.duringOwl?.();
        },
    }
);
const new577 = gameClass(577, ["_event_Gaming", "_customEvent_W5stuffzz", "_event_3"], {
    _event_Gaming() {
        this._GenINFO[58][1] = 55; // the game moves the AI paddle
        return this._GenINFO[58][1];
    },
});
const new741 = gameClass(741, [
    "_event_Minehead",
    "_event_Sushi",
    "_event_pressed",
    "_event_SushiandRG",
    "_customEvent_sushistuff",
]);

const { setup } = await importRepo("src/cheats/core/setup.js");
const { hookFailures } = await setup.call(context);
const minigame = cheatState.minigame;

test("every minigame hook installs on the game classes", () => {
    assert.deepEqual(hookFailures, []);
});

test("mining: the game over is skipped only while the cheat is on", () => {
    const actor = new229();
    minigame.mining = true;
    calls.length = 0;
    assert.equal(actor._customEvent_MiningGameOver(), undefined);
    assert.deepEqual(calls, [], "the game's game over must not run");
    minigame.mining = false;
    assert.equal(actor._customEvent_MiningGameOver(), "_customEvent_MiningGameOver result");
    assert.deepEqual(calls, ["229._customEvent_MiningGameOver"]);
});

test("catching: the fly and hoops hold still", () => {
    const actor = new229();
    actor.init();
    minigame.catching = true;
    assert.equal(actor._GenInfo[31], 70);
    assert.deepEqual(actor._GenInfo[33], [95, 95, 95, 95, 95]);
    minigame.catching = false;
    assert.equal(actor._GenInfo[31], 31);
    assert.deepEqual(actor._GenInfo[33], [1, 2, 3, 4, 5]);
});

test("fishing: the best active fish that isn't a bomb (or a skipped whale) snaps to the bobber", () => {
    const actor = new229();
    actor.init();
    minigame.fishing = true;
    cheatConfig.minigame.fishing.skipWhale = true;
    const fishes = actor._GenInfo[4];
    assert.deepEqual(fishes[1], [321, 3]);
    assert.deepEqual(actor._GenInfo[13], [5, 0, 5, 5]);
    cheatConfig.minigame.fishing.skipWhale = false;
    void actor._GenInfo[4];
    assert.deepEqual(fishes[3], [321, 6], "without skipWhale the whale is the best fish");
    minigame.fishing = false;
    const other = new229();
    other.init();
    assert.deepEqual(other._GenInfo[4][1], [100, 3], "off, the fish stay where they swim");
});

test("choppin: the gold zone fills the bar", () => {
    const actor = new116();
    actor.init();
    minigame.choppin = true;
    assert.deepEqual(actor._GeneralINFO[7], [100, -1, 0, 2, 0, 220, -1, 0, -1, 0, -1, 0, 0, 220, 0, 0, 1]);
    minigame.choppin = false;
    assert.equal(actor._GeneralINFO[7], 7);
});

test("hoops and darts: perfect positions, darts only while a dart flies", () => {
    const actor = new510();
    actor.init();
    minigame.hoops = true;
    assert.deepEqual(
        [107, 95, 108, 96, 91].map((i) => actor._GenINFO[i]),
        [600, 600, 300, 300, 620]
    );
    minigame.hoops = false;
    assert.equal(actor._GenINFO[107], 107);
    minigame.darts = true;
    assert.equal(actor._GenINFO[138], 138, "no dart in the air");
    actor._GenINFO[137] = 1;
    assert.deepEqual([actor._GenINFO[138], actor._GenINFO[139]], [938, 292]);
    minigame.darts = false;
    assert.equal(actor._GenINFO[138], 138);
});

/** An event-minigame actor (ActorEvents_670) with the arrays and images the hooks read. */
function eventActor() {
    const info = indexes(280);
    info[212] = indexes(60);
    info[212][50] = 1;
    const ui = indexes(70).map(() => []);
    ui[68] = indexes(40).map(image);
    ui[67] = indexes(100).map(image);
    const actor = new670({ actor: {}, _UIinventory15: ui });
    actor._GenINFO = info;
    actor.init();
    return actor;
}

test("scratch and wisdom: every zone is revealed and insta matches never run out", () => {
    const actor = eventActor();
    minigame.scratch = true;
    const zones = actor._GenINFO[212];
    assert.deepEqual(zones.slice(25, 50), Array(25).fill(1));
    assert.equal(actor._UIinventory15[68][1].alpha, 0, "the cover image is hidden");
    minigame.scratch = false;
    minigame.wisdom = true;
    assert.equal(actor._GenINFO[200], 10);
    minigame.wisdom = false;
    assert.equal(actor._GenINFO[200], 200);
});

test("valentine: the chocolates that aren't barf are tinted", () => {
    const actor = eventActor();
    const info = actor._GenINFO;
    info[213] = 2;
    info[228] = indexes(36).map((i) => (i === 0 ? 0 : 1));
    info[229] = Array(36).fill(0);
    minigame.valentine = true;
    actor._event_OwlEvent();
    const covers = actor._UIinventory15[68];
    assert.deepEqual(tinted(covers[0]), [0, 1, 0]);
    assert.deepEqual(tinted(covers[1]), [1, 1, 1]);
    minigame.valentine = false;
});

test("event card game: lives stay full before and after the game's turn", () => {
    const actor = eventActor();
    const info = actor._GenINFO;
    Object.assign(info, { 213: 4, 255: 1, 226: 0, 271: indexes(10) });
    const lives = [];
    actor.duringOwl = function () {
        lives.push(this._GenINFO[226]);
        this._GenINFO[226] -= 1;
    };
    minigame.card = true;
    actor._event_OwlEvent();
    assert.deepEqual(lives, [2], "the game's turn sees full lives");
    assert.equal(info[226], 2, "and lives are topped up after it");
    minigame.card = false;
    actor._event_OwlEvent();
    assert.equal(info[226], 1);
});

test("event wheel: the spin is retargeted into the tier's band, and instawheel lands it at once", () => {
    const actor = eventActor();
    const info = actor._GenINFO;
    Object.assign(info, { 213: 0, 147: 1, 241: 1, 144: 100, 145: 1000 });
    minigame.wheel = true;
    actor._event_Events();
    assert.equal(info[145], 1000 - 280 + (0 + 51.7) / 2);
    minigame.wheel = false;
    minigame.instawheel = true;
    actor._event_Events();
    assert.equal(info[144], info[145]);
    minigame.instawheel = false;
});

test("gold pot rush: one coin a tick jumps to the payout line", () => {
    const actor = eventActor();
    const info = actor._GenINFO;
    Object.assign(info, { 213: 3, 255: 1, 256: [10], 254: [indexes(11), indexes(11), indexes(11)] });
    info[254][0][10] = 95;
    minigame.goldrush = true;
    actor._event_7();
    assert.deepEqual(
        info[254].map((ball) => ball[10]),
        [95, 90, 10]
    );
    minigame.goldrush = false;
    actor._event_7();
    assert.equal(info[254][2][10], 10);
});

test("gold pot rush: a coin queued in an earlier round doesn't land in the next one", () => {
    const actor = eventActor();
    const info = actor._GenINFO;
    info[213] = 3;
    info[255] = 0;
    const behavior = context["com.stencyl.behavior.Script"];
    const queued = [];
    const runLater = (behavior.runLater = (delay, callback, target) => queued.push({ callback, target }));
    const landed = [];
    // The game starts a round in its owl event and queues the round's coins there, through behavior.runLater.
    actor.duringOwl = function () {
        this._GenINFO[255] = 1;
        const coin = `coin ${queued.length + 1}`;
        behavior.runLater(500, () => landed.push(coin), this.actor);
    };
    actor._event_OwlEvent();
    assert.equal(behavior.runLater, runLater, "runLater is put back after the owl event");
    queued[0].callback();
    assert.deepEqual(landed, ["coin 1"], "a coin lands in its own round");

    info[255] = 0; // the round ends
    actor.duringOwl = undefined;
    actor._event_OwlEvent();
    actor.duringOwl = function () {
        this._GenINFO[255] = 1;
        behavior.runLater(500, () => landed.push("coin 2"), this.actor);
    };
    actor._event_OwlEvent();
    queued[0].callback();
    queued[1].callback();
    assert.deepEqual(landed, ["coin 1", "coin 2"], "round 1's coin doesn't land in round 2");
    assert.equal(queued[1].target, actor.actor);
});

test("poing: the AI paddle leaves the screen and stays there", () => {
    const actor = new577({ _GenINFO: indexes(60) });
    actor._GenINFO[57] = 1;
    actor._GenINFO[58] = [10, 20];
    minigame.poing = true;
    assert.equal(actor._event_Gaming(), 999, "the game's own move of the AI paddle is blocked");
    assert.deepEqual([actor._GenINFO[58][0], actor._GenINFO[58][1]], [10, 999]);
    minigame.poing = false;
    const off = new577({ _GenINFO: indexes(60) });
    off._GenINFO[57] = 1;
    off._GenINFO[58] = [10, 20];
    assert.equal(off._event_Gaming(), 55);
});

test("wide nogamingpop: hidden popups jump to age 120, the rest and the list itself are left alone", () => {
    const gaming = (popups) => {
        const actor = new577({ _GenINFO: indexes(60) });
        actor._GenINFO[57] = -1; // Poing isn't running
        actor._GenINFO[58] = [10, 20];
        actor._GenINFO[39] = popups;
        return actor;
    };
    // [value, age, x, y, type, extra]: one popup of every type the game draws
    const types = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20];
    const popups = () => types.map((type) => [type * 10, 5, 100, 200, type, 7]);
    const ages = (actor) => actor._GenINFO[39].map((popup) => popup[1]);

    cheatState.wide.nogamingpop = true;
    const on = gaming(popups());
    const list = on._GenINFO[39];
    assert.equal(on._event_Gaming(), 55, "the game's own update still runs and its result is kept");
    assert.equal(on._GenINFO[39], list, "the list is the game's own array");
    assert.equal(list.length, types.length, "nothing is added or removed, so the game still saves each nugget");
    assert.deepEqual(ages(on), [120, 120, 120, 120, 120, 120, 120, 5, 5, 5, 5, 120, 120, 5]);
    assert.deepEqual(
        list.map((popup) => [popup[0], popup[2], popup[3], popup[4], popup[5]]),
        types.map((type) => [type * 10, type === 1 ? -9999 : 100, 200, type, 7]),
        "only the age changes, and the DNA glyph (1), drawn without a fade, moves off screen"
    );
    assert.equal(list[types.indexOf(4)][2], 100, "a nugget is never moved");

    for (const empty of [undefined, []]) {
        const actor = gaming(empty);
        assert.equal(actor._event_Gaming(), 55, `a ${empty ? "empty" : "missing"} list is fine`);
        assert.deepEqual(actor._GenINFO[39], empty);
    }

    cheatState.wide.nogamingpop = false;
    const off = gaming(popups());
    off._event_Gaming();
    assert.deepEqual(off._GenINFO[39], popups(), "with the cheat off nothing changes");
});

test("log: card types are shown by tint", () => {
    const cards = indexes(10).map(image);
    const actor = new577({ _GenINFO: indexes(60), _UIinventory13: { 41: cards } });
    actor._GenINFO[53] = 1;
    actor._GenINFO[54] = indexes(10).map((i) => (i === 0 ? 1 : 0));
    minigame.log = true;
    actor._customEvent_W5stuffzz();
    assert.deepEqual(tinted(cards[0]), [1, 0, 0]);
    assert.deepEqual(tinted(cards[1]), [0, 1, 0]);
    minigame.log = false;
});

test("wisdom: the monument's cards are turned over and matched pairs tinted", () => {
    gga.GetPlayersUsernames = ["me"];
    gga.UserInfo = ["me"];
    gga.Holes = [[12]];
    for (const method of ["_customEvent_CavernStuffz3", "_event_monumentgameplay"]) {
        const actor = eventActor();
        const info = actor._GenINFO;
        info[55] = 1;
        info[197] = indexes(44).map((i) => (i === 1 ? 0 : 1));
        info[198] = indexes(44).map((i) => (i === 0 ? 1 : 0));
        minigame.wisdom = true;
        actor[method]();
        const cards = actor._UIinventory15[67];
        assert.equal(cards[44].scaleX, 1, method);
        assert.deepEqual(tinted(cards[44]), [0, 1, 0], method);
        assert.equal(cards[45].scaleX, 0, `${method}: an empty slot stays hidden`);
        assert.deepEqual(tinted(cards[46]), [1, 1, 1], `${method}: an unmatched card isn't tinted`);
        minigame.wisdom = false;
    }
});

test("minehead: mines are shown while the cheat is on, and hidden again after", () => {
    const layers = { 27: [image(), image()], 28: [image(), image()], 29: [image(), image()] };
    const info = indexes(40);
    info[32] = [0, 1];
    info[33] = [0, 0];
    info[28] = 1;
    const actor = new741({ _GenINFO: info, _UIinventory17: layers });
    minigame.minehead = true;
    actor._event_Minehead();
    assert.deepEqual(
        [27, 28, 29].map((layer) => [layers[layer][0].alpha, layers[layer][1].alpha]),
        [
            [0.2, 1],
            [0.2, 1],
            [0.2, 1],
        ]
    );
    minigame.minehead = false;
    actor._event_Minehead();
    assert.equal(layers[27][0].alpha, 1);
});
