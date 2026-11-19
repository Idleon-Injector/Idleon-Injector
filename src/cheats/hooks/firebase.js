/**
 * FirebaseStorage hooks (the re-apply on character select is in core/hooks.js)
 *
 * - Companion management (delete, swap, set, get)
 * - Party members
 * - Unban (cleanMarkedFiles)
 * - Steam achievements (prevent duplicates)
 */

import { cheatConfig, cheatState } from "../core/state.js";
import { cList, firebase, gga, monsterDefs } from "../core/globals.js";
import { defineHook } from "../core/hooks.js";

let readingOwned = false;

/** The player's real companion entries, bypassing the W1 Companion spoof. */
export function getOwnedCompanions() {
    readingOwned = true;
    try {
        return firebase.getCompanionInfoMe() || [];
    } finally {
        readingOwned = false;
    }
}

// Around: the fake companion list must not delete or reorder the real ones.
defineHook({ id: "w1.companion", target: () => firebase, method: "deleteCompanion", around: true }, (callOriginal) => {
    if (cheatState.w1.companion) return Promise.resolve(1);
    return callOriginal();
});

// Around: the fake companion list must not delete or reorder the real ones.
defineHook(
    { id: "w1.companion", target: () => firebase, method: "swapCompanionOrder", around: true },
    (callOriginal) => {
        if (cheatState.w1.companion) return Promise.resolve(1);
        return callOriginal();
    }
);

// Around: the game may ask for the current follower while it sets one, so the choice is remembered first.
defineHook(
    { id: "w1.companion", target: () => firebase, method: "setCompanionFollower", around: true },
    (callOriginal, id) => {
        if (cheatState.w1.companion) {
            cheatConfig.w1.companion.current = String(id);
        }
        return callOriginal();
    }
);

const companionEntryId = (entry) => parseInt(String(entry).split(",")[0]);

// A configured list names the pets to fake-own, it does not describe the whole
// collection: the player's real companions are merged back in, entries the config
// mentions winning on id. Partial lists must preserve unrelated owned pets.
const mergeWithOwnedCompanions = (entries, owned) => {
    const byId = new Map(owned.map((entry) => [companionEntryId(entry), entry]));
    entries.forEach((entry) => byId.set(companionEntryId(entry), entry));
    return [...byId.values()];
};

defineHook({ id: "w1.companion", target: () => firebase, method: "getCompanionInfoMe" }, (base) => {
    if (!cheatState.w1.companion || readingOwned) return base;
    // Pet-token picks (OptionsListAccount[606]) stay out of the fake list: the game
    // refunds a token whose pet looks owned, which would drop it from the save.
    const tokenIds = gga.OptionsListAccount[606] ? String(gga.OptionsListAccount[606]).split(",") : [];
    const isNotToken = (entry) => !tokenIds.includes(String(companionEntryId(entry)));
    if (!cheatConfig.w1.companion.companions) {
        return Array.from({ length: cList.CompanionDB.length }, (_, index) => `${index},0,0,0,1`).filter(
            (entry) => monsterDefs[cList.CompanionDB[parseInt(entry)][0]]?.h.Name && isNotToken(entry)
        );
    }
    const companions = cheatConfig.w1.companion.companions;
    if (typeof companions === "string") {
        const entries = companions
            .split(",")
            .map((entry) => entry.trim().split(":"))
            .filter(([id]) => /^\d+$/.test(id))
            // Bare IDs retain the legacy Pets+ tier; :0 requests the normal tier.
            .map(([id, tier]) => `${Number(id)},0,0,0,${tier === "0" ? "0" : "1"}`);
        return mergeWithOwnedCompanions(entries.filter(isNotToken), base || []);
    }
    if (Array.isArray(companions)) {
        const entries = companions.map((entry) => {
            if (typeof entry === "number") return `${entry},0,0,0,1`;
            if (typeof entry === "string" && !entry.includes(",")) return `${entry},0,0,0,1`;
            return entry;
        });
        return mergeWithOwnedCompanions(entries.filter(isNotToken), base || []);
    }
    return companions;
});

// Around: the game would ask the server for the real follower, which the fake list replaces.
defineHook(
    { id: "w1.companion", target: () => firebase, method: "getCurrentCompanion", around: true },
    (callOriginal) => {
        if (cheatState.w1.companion) return cheatConfig.w1.companion.current;
        return callOriginal();
    }
);

// Around: cleaning marked files is what the unban prevents, so it must not run.
defineHook({ id: "unban", target: () => firebase, method: "cleanMarkedFiles", around: true }, (callOriginal) => {
    if (cheatConfig.unban) return;
    return callOriginal();
});

defineHook({ id: "wide.autoparty", target: () => firebase, method: "getPartyMembers" }, (base) => {
    if (!cheatState.wide.autoparty) return base;

    if (Array.isArray(base) && base.length > 0 && base.length < 10) {
        const playersToAdd = 11 - base.length;
        const otherPlayers = gga.OtherPlayers.h;
        const names = Object.keys(otherPlayers).slice(1, playersToAdd);
        for (const name of names) {
            base.push([name, base[0][1], 0]);
        }
    }
    return base;
});

const achieveList = [];

// Around: an achievement sent twice can't be unsent, so repeats must not reach the game.
defineHook({ id: "steamachieve", target: () => firebase, method: "areaCheck", around: true }, (callOriginal, id) => {
    if (!cheatConfig.steamachieve) return;
    if (achieveList.includes(id)) return;
    achieveList.push(id);
    return callOriginal();
});
