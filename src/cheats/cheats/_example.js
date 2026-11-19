/**
 * Example cheat: copy this file to start a new one.
 *
 * The build picks up every file in this folder, so adding the file is all it takes; there is no list to edit.
 * Files starting with "_" are skipped, so this one never runs. A row's `config` becomes cheatConfig[name] in
 * config.js: after changing it, run `npm run config:generate` (npm run check fails until you do).
 */

import { defineCheat } from "../core/registration.js";
import { gga } from "../core/globals.js";

// A command: `fn` gets the words after its name. Return the message for the player, or throw to report an
// error: either way the player gets { ok, message }.
defineCheat({
    name: "examplehp",
    message: "Set your HP to a value",
    needsParam: true,
    fn: (params) => {
        const hp = parseInt(params[0]);
        if (isNaN(hp)) throw new Error("Give the HP as a number, e.g. examplehp 100");
        gga.PlayerHP = hp;
        return `The amount of health is set to ${hp}`;
    },
});

// A group of toggles: "example speed" flips cheatState.example.speed, and a hook in src/cheats/hooks/ reads it.
// "example" alone turns them all on or off (allowToggleChildren). Set `dangerous: true` on anything that can
// damage an account.
defineCheat({
    name: "example",
    message: "example cheats",
    allowToggleChildren: true,
    subcheats: [
        { name: "speed", message: "faster example bars (see config)" },
        { name: "reset", message: "Reset the example bars", dangerous: true, fn: () => "The example bars were reset" },
    ],
    // cheatConfig.example: what a hook reads while the toggle is on. Players override it in config.custom.js.
    config: {
        speed: { default: (t) => t * 2, description: "Example: bar speed. (higher is faster)" },
    },
});
