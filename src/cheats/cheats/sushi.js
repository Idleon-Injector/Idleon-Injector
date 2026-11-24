import { defineCheat } from "../core/registration.js";
import { defineAutomation } from "../core/automations.js";
import { busy, enabled, getSushiStatus, sortSushi, start, stop, switchSushi, tick } from "../helpers/sushi/autoPlay.js";
import { simulateSushiKnowledge } from "./sushi/knowledge.js";

defineAutomation({
    id: "w7.sushi",
    cheat: "w7 sushitools",
    label: "Sushi Auto Play",
    // It starts only with the in-game Sushi board open, which it never is at launch.
    whenOff: "Starts only with the Sushi board open in game.",
    startup: false,
    interval: 50,
    tick,
    status: () => getSushiStatus().message,
    start,
    stop,
});

const commands = {
    "": {
        fn: (params, on) => switchSushi(on),
        message: "Enable or disable Sushi automation; settings in config",
    },
    status: { fn: getSushiStatus, message: "Read Sushi tools status" },
    sort: { fn: sortSushi, message: "Sort the Sushi board" },
    knowledge: {
        fn: (params) => {
            if (enabled || busy) throw new Error("Disable Auto Play before adding Knowledge XP.");
            if (params.length !== 2) throw new Error("Use knowledge <tier> <quantity>.");
            return { enabled, message: simulateSushiKnowledge(Number(params[0]), Number(params[1])) };
        },
        needsParam: true,
        message: "Add crafting-tree Knowledge XP: <tier> <quantity>",
    },
};

for (const [action, { fn, message, needsParam = false }] of Object.entries(commands)) {
    defineCheat({
        name: action ? "w7 sushitools " + action : "w7 sushitools",
        category: "w7",
        needsParam,
        message,
        fn: (params, on) => {
            if (!needsParam && params.length)
                throw new Error(`${action || "w7 sushitools"} does not accept arguments.`);
            return JSON.stringify(fn(params, on));
        },
    });
}
