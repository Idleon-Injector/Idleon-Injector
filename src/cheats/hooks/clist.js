/**
 * Custom list hooks (cList)
 *
 * - MTX (gem shop costs and limits)
 * - Refinery costs
 * - Vial unlock chances
 * - Salt lick upgrade costs
 * - Prayer requirements
 * - Post office order costs
 * - Guild task requirements
 * - Task requirements
 * - Star sign unlock requirements
 * - Worship costs
 * - Card stats (godlike card)
 * - Artifact rarity (sailing)
 *
 * Each hook goes on every entry of its list; the game's writes to a hooked entry are dropped.
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { cList } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";
import { nodesAt } from "../utils/traverse.js";

// Nullify MTX cost
for (const index of [3, 7]) {
    defineHook({ id: "wide.mtx", targets: () => nodesAt(cList.MTXinfo, 3), property: index }, (stored) =>
        cheatState.wide.mtx ? 0 : stored
    );
}

// Nullify refinery cost
for (const index of [6, 7, 8, 9, 10, 11]) {
    defineHook({ id: "w3.refinery", targets: () => nodesAt(cList.RefineryInfo, 1), property: index }, (stored) =>
        cheatState.w3.refinery ? "0" : stored
    );
}

// Nullify Salt Lick upgrade cost
defineHook({ id: "w3.saltlick", targets: () => nodesAt(cList.SaltLicks, 1), property: 2 }, (stored) =>
    cheatState.w3.saltlick ? "0" : stored
);

// Nullify prayer requirements (indexes 4 and 6)
for (const index of [4, 6]) {
    defineHook({ id: "w3.prayer", targets: () => nodesAt(cList.PrayerInfo, 1), property: index }, (stored) =>
        cheatState.w3.prayer ? "0" : stored
    );
}

// Nullify post office order cost
defineHook({ id: "wide.post", targets: () => nodesAt(cList.PostOfficePossibleOrders, 3), property: 1 }, (stored) =>
    cheatState.wide.post ? "0" : stored
);

// Nullify guild task requirements
defineHook({ id: "wide.guild", targets: () => nodesAt(cList.GuildGPtasks, 1), property: 1 }, (stored) =>
    cheatState.wide.guild ? "0" : stored
);

// Nullify task requirements (indexes 5-14)
for (const index of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    defineHook({ id: "wide.task", targets: () => nodesAt(cList.TaskDescriptions, 2), property: index }, (stored) =>
        cheatState.wide.task ? "0" : stored
    );
}

// Nullify star sign unlock requirement
defineHook({ id: "wide.star", targets: () => nodesAt(cList.SSignInfoUI, 1), property: 4 }, (stored) =>
    cheatState.wide.star ? "0" : stored
);

// Reduce worship cost to the minimum
defineHook({ id: "w3.freeworship", targets: () => nodesAt(cList.WorshipBASEinfos, 1), property: 6 }, (stored) =>
    cheatState.w3.freeworship ? "1" : stored
);

// Gem buy limit
defineHook({ id: "wide.gembuylimit", targets: () => nodesAt(cList.MTXinfo, 3), property: 5 }, (stored) =>
    cheatState.wide.gembuylimit ? Math.max(stored, cheatConfig.wide?.gembuylimit ?? 0) : stored
);

// Vials unlock at rolling 1+
defineHook({ id: "w2.vialrng", target: () => cList, property: "AlchemyVialItemsPCT" }, (stored) =>
    cheatState.w2.vialrng ? new Array(stored.length).fill(99) : stored
);

// Prayer description override (part of prayer cheat)
defineHook({ id: "w3.prayer", targets: () => nodesAt(cList.PrayerInfo, 1), property: 2 }, (stored) =>
    cheatState.w3.prayer ? "None._Even_curses_need_time_off_every_now_and_then" : stored
);

// Godlike card boost
defineHook({ id: "godlike.card", targets: () => nodesAt(cList.CardStuff, 2), property: 4 }, (stored) =>
    cheatState.godlike.card ? String(parseFloat(stored) * 100) : stored
);

// Artifact rarity
defineHook({ id: "w5.sailing", targets: () => nodesAt(cList.ArtifactInfo, 1), property: 2 }, (stored) =>
    cheatState.w5.sailing ? cheatConfig.w5.sailing.ArtifactRarity(stored) : stored
);
