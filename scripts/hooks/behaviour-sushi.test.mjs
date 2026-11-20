// Each file runs in its own process, so each scenario gets a fresh copy of the cheat code.
// The W7 Sushi Station hooks, written down before they moved to defineHook (#15): the in-game Auto Play buttons
// on the station's UI actor, which the game creates while it loads, and the East Wind chain options.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "../known-bugs/index.mjs";
import { loadHookGame } from "./game-double.mjs";

// Where configureSushiWind lives (the only line that follows the code around).
const SUSHI_WIND_MODULE = "src/cheats/helpers/sushi/autoPlay.js";

const { context, gga, game, setup, state } = await loadHookGame();
const { cheatConfig } = state;
const window = (globalThis.window = {});
// As in the game: cheats.js loads, then the game's script registers its classes, then creates the UI actors.
context["scripts.ActorEvents_741"] = undefined; // the game hasn't defined this class yet
(await importRepo("src/cheats/core/hooks.js")).installEarlyHooks();
window.__idleon_cheats__ = context;
const calls = [];
function ActorEvents741() {}
context["scripts.ActorEvents_741"] = ActorEvents741;
ActorEvents741.prototype = {
    init() {},
    _event_Sushi() {
        calls.push("update");
    },
    _event_pressed() {
        calls.push("pressed");
    },
    _event_SushiandRG() {
        calls.push("released");
    },
    _event_Minehead() {},
    _customEvent_sushistuff() {
        calls.push("wind");
        this._GenINFO[157].push(this.gameChain);
        return "wind";
    },
};

// Haxe's $bind: one bound closure per method and actor, cached by the method's id.
let uid = 1;
const bind = (owner, method) => {
    method.__id__ ??= uid++;
    owner.hx__closures__ ??= {};
    return (owner.hx__closures__[method.__id__] ??= method.bind(owner));
};
const engine = context["com.stencyl.Engine"].engine;
const signals = {
    update: { listeners: [] },
    pressed: (engine.whenMousePressed = { listeners: [] }),
    released: (engine.whenMouseReleased = { listeners: [] }),
};
const ui = new context["scripts.ActorEvents_741"]();
const uiActor = {
    whenUpdated: signals.update,
    allEventReferences: [],
    allListeners: { h: {} },
    behaviors: { getBehavior: () => ui },
};
Object.assign(ui, {
    actor: uiActor,
    wrapper: { enabled: true },
    _UIinventory17On: Object.assign([], { 64: 1 }),
    _GenINFO: Object.assign([], { 142: 0, 150: 0, 151: -1, 157: [], 158: 0 }),
});
for (const [name, method] of [
    ["update", "_event_Sushi"],
    ["pressed", "_event_pressed"],
    ["released", "_event_SushiandRG"],
]) {
    const listener = bind(ui, ui[method]);
    signals[name].listeners.push(listener);
    uiActor.allListeners.h[uiActor.allEventReferences.push(signals[name]) - 1] = [listener];
}
gga.PixelHelperActor[27] = uiActor;

// The images the buttons draw, by label.
const images = {};
const removed = [];
Object.assign(game.returns, {
    newImage: (width) => ({ width, dispose() {} }),
    getExternalImage: () => ({ width: 30, height: 30 }),
    getSubImage: () => ({ width: 1, height: 1, dispose() {} }),
    resizeImage: () => ({ dispose() {} }),
    drawImageOnImage: () => {},
    getFont: () => ({ getTextWidth: (text) => text.length * 10 }),
    drawTextOnImage: (bitmap, label) => (bitmap.label = label),
    _customBlock_imginstACTOR: (bitmap) =>
        (images[bitmap.label] = {
            visible: true,
            alpha: 1,
            set_visible(v) {
                this.visible = v;
            },
            set_alpha(a) {
                this.alpha = a;
            },
            set_imgY(y) {
                this.imgY = y;
            },
            get_scaleX: () => 1,
            get_scaleY: () => 1,
            set_scaleX() {},
            set_scaleY() {},
        }),
    attachImageToActor: (image, actor, x, y) => Object.assign(image, { x, y }),
    removeImage: (image) => removed.push(image),
    _customBlock_IsXYmouseWithinBounds: (x1, x2, top) => (top === game.hover ? 1 : 0),
    _customBlock_SushiStuff: (key) => ({ UpgradeQTY: 1, MaxTier: 10, UniqueSushi: 20 })[key],
});
gga.MenuType2 = 102;
gga.Sushi = [[], []];
const { hookFailures, error } = await setup();
const fire = (name) => signals[name].listeners.forEach((listener) => listener());

test("every hook these tests use installs", () => {
    assert.deepEqual([hookFailures, error], [[], undefined]);
});

test("buttons: none while the setting is off, the game's update still runs", () => {
    cheatConfig.w7.sushitools.ingameButtons = false;
    calls.length = 0;
    fire("update");
    assert.deepEqual(calls, ["update"]);
    assert.deepEqual(Object.keys(images), []);
});

test("buttons: the station actor the game made before setup shows Start and Sort", () => {
    cheatConfig.w7.sushitools.ingameButtons = true;
    fire("update");
    assert.deepEqual(Object.keys(images).sort(), ["SORT", "START", "STOP"]);
    assert.deepEqual(
        ["START", "STOP", "SORT"].map((label) => images[label].visible),
        [true, false, true]
    );
    assert.equal(images.START.alpha, 1);
});

// The fake board has no slots, so Sort fails with this reason.
const BOARD_ERROR =
    "The Sushi board save has 0 slots instead of 120, so the Sushi tools can't use it. Please report this on the injector's GitHub.";

test("buttons: hovering, pressing and releasing Sort runs it, and its error shows on the button", () => {
    game.hover = 370;
    fire("update");
    assert.equal(images.SORT.alpha, 0.9, "hovered");
    calls.length = 0;
    fire("pressed");
    fire("update");
    assert.equal(images.SORT.alpha, 0.55, "pressed");
    fire("released");
    fire("update");
    assert.deepEqual(calls, ["pressed", "update", "released", "update"], "the game's own listeners still run");
    // Issue #79: the reason, not just ERROR, on the pressed button, which grows left to fit it.
    const error = images[BOARD_ERROR];
    const width = BOARD_ERROR.length * 10 + 24;
    assert.deepEqual([error.visible, error.x, error.y, images.SORT.visible], [true, 764 + 174 - width, 370, false]);
    game.hover = -1;
});

test("buttons: a Start that fails says why on the Start button, replacing the last reason", () => {
    const sortError = images[BOARD_ERROR];
    game.hover = 332;
    fire("update");
    fire("pressed");
    fire("released");
    fire("update");
    const error = images["Choose a valid target tier and 0–119 reserved slots."]; // the default target tier is past 10
    assert.notEqual(error, sortError, "a new image for this press");
    assert.ok(removed.includes(sortError), "the last reason is gone");
    assert.deepEqual([error.visible, error.y, images.START.visible, images.SORT.visible], [true, 332, false, true]);
    // It shows for 4 seconds, then Start is back.
    const now = Date.now;
    Date.now = () => now() + 4001;
    fire("update");
    Date.now = now;
    assert.deepEqual([error.visible, images.START.visible], [false, true]);
    game.hover = -1;
    removed.length = 0;
});

test("buttons: closing the board removes them", () => {
    gga.MenuType2 = 0;
    fire("update");
    assert.equal(removed.length, 4);
    gga.MenuType2 = 102;
});

test("East Wind: the game's chain is untouched until a chain option is set", async () => {
    const { configureSushiWind } = await importRepo(SUSHI_WIND_MODULE);
    gga.Sushi = [
        [0, 0, 0, 5, 4, 3, 9, 2],
        [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const wind = (fields = {}) => {
        const station = Object.assign(new context["scripts.ActorEvents_741"](), {
            _TRIGGEREDtext: "i3",
            _GenINFO: Object.assign([], { 157: [], 158: 0 }),
            gameChain: [4],
            ...fields,
        });
        assert.equal(station._customEvent_sushistuff(), "wind");
        return station._GenINFO[157];
    };
    assert.deepEqual(wind(), [[4]]);
    configureSushiWind(true, false);
    assert.deepEqual(wind(), [[4, 5]], "extended: as far as each next sushi is lower");
    configureSushiWind(false, true);
    assert.deepEqual(wind(), [[4, 5]], "higher tier");
    assert.deepEqual(wind({ _TRIGGEREDtext: "x3" }), [[4]], "not a merge");
    assert.deepEqual(wind({ _GenINFO: Object.assign([], { 157: [], 158: 1 }) }), [[4]], "busy");
    assert.deepEqual(wind({ gameChain: [], _TRIGGEREDtext: "i6" }), [[7]], "a chain the game left empty");
    assert.deepEqual(wind({ gameChain: [], _TRIGGEREDtext: "i8" }), [[]], "past the board");
    // Issue #4: a board the game's own East Wind grew past slot 119 still chains only on the 120 real slots.
    const [board, plates] = gga.Sushi;
    gga.Sushi = [Array(117).fill(-1).concat(5, 4, 3, 2, 1), Array(120).fill(0)];
    assert.deepEqual(wind({ gameChain: [], _TRIGGEREDtext: "i117" }), [[118, 119]], "stops at the last slot");
    gga.Sushi = [board, plates];
    configureSushiWind(false, false);
    assert.deepEqual(wind(), [[4]]);
    assert.deepEqual(wind({ _TRIGGEREDtext: 5 }), [[4]]);
});
