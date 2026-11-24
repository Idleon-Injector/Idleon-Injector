import { bEngine, behavior, events, gga } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { getGamingSettings } from "../helpers/automation/gaming.js";

let schedulingShovel = 0,
    nuggetCallback = 0;
const hiddenImages = new Map();
let drawingEffects = null;

defineHook(
    {
        id: "gaming.shovel",
        target: () => events(577).prototype,
        method: "_customEvent_W5stuffzz",
        // Around: identify shovel scheduling before the native event queues its callbacks.
        around: true,
    },
    function (callOriginal) {
        const shovel = this._TRIGGEREDtext === "j1";
        if (shovel) schedulingShovel++;
        try {
            return callOriginal();
        } finally {
            if (shovel) schedulingShovel--;
        }
    }
);

defineHook(
    {
        id: "gaming.nugget-callbacks",
        target: () => behavior,
        method: "runLater",
        // Around: tag only the shovel's callbacks before passing them to the native scheduler.
        around: true,
    },
    function (callOriginal, ...args) {
        if (schedulingShovel && typeof args[1] === "function") {
            const callback = args[1];
            args[1] = function (...values) {
                nuggetCallback++;
                try {
                    return Reflect.apply(callback, this, values);
                } finally {
                    nuggetCallback--;
                }
            };
        }
        return callOriginal(args);
    }
);

defineHook(
    {
        id: "gaming.nugget-bias",
        target: () => behavior,
        method: "randomFloatBetween",
    },
    (base, low, high) => {
        if (!nuggetCallback || low !== 0.00001 || high !== 1) return base;
        const settings = getGamingSettings();
        if (!settings.nuggetBiasEnabled) return base;
        const exponent = Number(settings.nuggetBias);
        if (!Number.isFinite(exponent) || exponent < 1 || exponent > 20)
            throw new Error("Nugget bias must be 1 to 20.");
        if (exponent === 1) return base;
        return low + (high - low) * Math.pow(Math.max(0, Math.min(1, (base - low) / (high - low))), exponent);
    }
);

for (const method of ["drawString", "drawCircle"]) {
    defineHook(
        {
            id: "gaming.effect-drawing",
            target: () => bEngine.g,
            method,
            // Around: suppress only transient effect primitives, not the garden's header or native reward work.
            around: true,
        },
        function (callOriginal) {
            if (drawingEffects && drawingEffects.rows.has(drawingEffects.station._DL1)) return;
            return callOriginal();
        }
    );
}

defineHook(
    {
        id: "gaming.effects",
        target: () => events(577).prototype,
        method: "_event_3",
        // Around: scope rendering suppression while the native method advances effect ages and pays rewards.
        around: true,
    },
    function (callOriginal) {
        for (const [image, visible] of hiddenImages) image.set_visible(visible);
        hiddenImages.clear();
        if (!this.wrapper.enabled || gga.MenuType2 !== 45 || !getGamingSettings().hideEffects) return callOriginal();
        const previous = drawingEffects;
        drawingEffects = { station: this, rows: new Set(this._GenINFO[39]) };
        try {
            return callOriginal();
        } finally {
            drawingEffects = previous;
            for (const row of this._GenINFO[39]) {
                const image = row[6];
                if (image && typeof image.get_visible === "function" && !hiddenImages.has(image)) {
                    hiddenImages.set(image, image.get_visible());
                    image.set_visible(false);
                }
            }
        }
    }
);
