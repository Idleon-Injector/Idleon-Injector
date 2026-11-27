/**
 * ActorEvents_312 hooks: items menu
 *
 * - Talent preset reset anywhere
 * - Card drop labels for nomore matches
 */

import { cheatConfig, cheatState, nomoreBlocks } from "../core/state.js";
import { bEngine, events, gga, itemDefs } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

// Around: the game checks the map while it resets, so the map reads as town during the call.
defineHook(
    { id: "unlock.presets", target: () => events(312).prototype, method: "_event_resetTalPresets", around: true },
    (callOriginal) => {
        if (cheatState.unlock.presets) {
            const originalMap = gga.CurrentMap;
            gga.CurrentMap = 0;
            callOriginal();
            gga.CurrentMap = originalMap;
            return;
        }
        return callOriginal();
    }
);

let cardDropDraw = null;
// Around: scope the label replacement to the Cards renderer, whose drawing listener binds before setup.
defineHook(
    { id: "nomore", early: "scripts.ActorEvents_312", method: "_event_3", around: true },
    function (callOriginal, graphics) {
        if (
            gga === null ||
            !cheatConfig.nomore?.items.length ||
            !this.wrapper.enabled ||
            gga.MenuType !== 3 ||
            gga.OptionsList[12] !== 3 ||
            this._UIinventoryOn7[32] !== 1
        )
            return callOriginal();

        const previous = cardDropDraw;
        cardDropDraw = { ui: this, graphics };
        try {
            return callOriginal();
        } finally {
            cardDropDraw = previous;
        }
    }
);

// Around: replace only the drop-chance text; native filters keep their red glyph and their saved slots.
defineHook(
    { id: "nomore", target: () => bEngine.g, method: "drawString", around: true },
    function (callOriginal, text, x, y) {
        if (cardDropDraw?.graphics !== this) return callOriginal();
        const ui = cardDropDraw.ui;
        const index = ui._DRI;
        const row = Math.floor(index / 2);
        if (x !== 707 + 141 * (index - 2 * row) || y !== 264 + 44 * row) return callOriginal();
        const item = ui._GenINFO[40][index][0];
        if (!itemDefs[item] || ui._GenINFO[133].includes(item) || !nomoreBlocks(item)) return callOriginal();

        // Keep the native chance font (white), distinct from the filter page's red FILTERED OUT glyph.
        return callOriginal(["FILTERED OUT", x - 5, y]);
    }
);
