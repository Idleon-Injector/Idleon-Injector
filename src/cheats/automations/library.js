/**
 * Max books, always (#311): while "w3 bookcap" is on, every character's talent books stay at the book cap, what the
 * Library page's Max books sets them to, and follow it when it rises.
 *
 * Books are the talents of a character's class pages, less the ones the Library has no book for (RANDOlist[16]); the
 * special talents have no cap and are left alone, and so is a locked talent (max level -1). A book is only ever raised
 * to the cap: one already at it or above is left as it is, so nothing is written while nothing changed.
 *
 * The character in play has its max levels in the live SkillLevelsMAX. The others have theirs in their PlayerDATABASE
 * entry, which the game loads as the live copy when that character is played (LoadPlayerInfo) and writes there itself
 * (Tasks unlocks, account-wide books). The cloud save keeps only the character in play's SkillLevelsMAX, so another
 * character's raised books reach the cloud once that character is played; till then this raises them again each start.
 */

import { defineAutomation } from "../core/automations.js";
import { cList, events, gga } from "../core/globals.js";
import { characterInPlay } from "../helpers/wardrobe/perfect.js";

// The Library's class pages: a class's path from its family's first class (the page's getLibraryClassPageIds).
const PARENT_OFFSETS = [null, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7];
const classPages = (classId) => {
    if (classId < 6) return Array.from({ length: Math.max(0, classId) }, (_, i) => i + 1);
    const base = 6 + 12 * Math.floor((classId - 6) / 12);
    const pages = [];
    for (let offset = classId - base; offset !== null; offset = PARENT_OFFSETS[offset]) pages.unshift(base + offset);
    return pages;
};

let status = "";

defineAutomation({
    id: "w3.bookcap",
    cheat: "w3 bookcap",
    interval: 2000,
    tick() {
        let active;
        try {
            active = characterInPlay();
        } catch {
            // Character select: the live values belong to no one yet.
            status = "Waiting for a character in play";
            return;
        }
        const cap = Number(events(345)._customBlock_WorkbenchStuff("maxBookLv", 0, 0));
        if (!(cap > 0)) {
            status = "No book cap yet";
            return;
        }
        const noBook = new Set(Array.from(cList.RANDOlist[16], Number));
        let raised = 0;
        for (const name of gga.GetPlayersUsernames) {
            const player = name === active ? gga : gga.PlayerDATABASE.h[name]?.h;
            if (!player?.SkillLevelsMAX) continue;
            for (const page of classPages(Number(player.CharacterClass))) {
                for (let slot = 0; slot < 15; slot++) {
                    const talent = cList.TalentOrder[15 * (page - 1) + slot];
                    if (talent === undefined || talent === null || noBook.has(Number(talent))) continue;
                    const level = Number(player.SkillLevelsMAX[talent]);
                    // -1 is locked; NaN is a talent this character has no entry for.
                    if (level === -1 || !(level < cap)) continue;
                    player.SkillLevelsMAX[talent] = cap;
                    raised++;
                }
            }
        }
        status = raised ? `Raised ${raised} book${raised === 1 ? "" : "s"} to ${cap}` : `Every book at ${cap}`;
    },
    status: () => status || "Starting",
    start() {
        status = "";
    },
});
