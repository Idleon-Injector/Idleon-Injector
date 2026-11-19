/**
 * Item definition hooks (itemDefs)
 *
 * Toggleable instead of rewriting the definitions:
 * - godlike speed: weapon attack speed
 * - upstones rng: upgrade stone 100% success
 * - upstones use: upgrade stones use no slot
 * - equipall: any item equippable by any class at level 1
 * - wide candytime: custom time candy duration
 *
 * The game's writes to a hooked field are dropped.
 */

import { cheatState, cheatConfig } from "../core/state.js";
import { itemDefs } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

/** The definitions (item.h) that pass `test`. */
const items = (test) =>
    Object.values(itemDefs)
        .map((item) => item.h)
        .filter((item) => item && test(item));

// Weapon speed (godlike speed)
defineHook(
    { id: "godlike.speed", targets: () => items((item) => item.typeGen === "aWeapon"), property: "Speed" },
    (stored) => (cheatState.godlike.speed ? (cheatConfig.godlike.speed ?? 9) : stored)
);

// Upgrade stone success (upstones rng)
defineHook(
    { id: "upstones.rng", targets: () => items((item) => item.typeGen === "dStone"), property: "Amount" },
    (stored) => (cheatState.upstones.rng ? 100 : stored)
);

// Upgrade stone slot use (upstones use)
defineHook(
    { id: "upstones.use", targets: () => items((item) => item.typeGen === "dStone"), property: "Trigger" },
    (stored) => (cheatState.upstones.use ? 0 : stored)
);

// Equip all
defineHook({ id: "equipall", targets: () => items((item) => item.Class !== undefined), property: "Class" }, (stored) =>
    cheatState.equipall ? "ALL" : stored
);
defineHook(
    { id: "equipall", targets: () => items((item) => item.lvReqToEquip !== undefined), property: "lvReqToEquip" },
    (stored) => (cheatState.equipall ? 1 : stored)
);

// Time candy, single item
defineHook({ id: "wide.candytime", target: () => itemDefs.Timecandy1.h, property: "ID" }, (stored) =>
    cheatState.wide.candytime ? (cheatConfig.wide.candytime ?? 600) : stored
);
