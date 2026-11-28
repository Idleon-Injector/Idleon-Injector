// "w3 maxbooks" (#311): Lumi asked for the Library's Max books "for all characters all the time": while it is on, every
// character's talent books are raised to the book cap, the character in play's in its live SkillLevelsMAX and the
// others' in their PlayerDATABASE entry, and they follow the cap when it rises. Locked talents (-1), the special
// talents, the talents the Library has no book for, and books at or above the cap are never written.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { loadGame } from "../known-bugs/index.mjs";

mock.timers.enable({ apis: ["setInterval"] });
const { gga, context, cheat } = await loadGame();

const CHEAT = "w3 maxbooks";
const SPECIAL = 620; // a special talent: on no class page
let cap = 150;
let scene = "Town";
context["com.stencyl.behavior.Script"].getCurrentSceneName = () => scene;
context["scripts.ActorEvents_345"]._customBlock_WorkbenchStuff = (key) => (key === "maxBookLv" ? cap : 0);

let writes = []; // every write to a SkillLevelsMAX, as "who[talent]=value"
const tracked = (who, levels) =>
    new Proxy(levels, {
        set(target, key, value) {
            writes.push(`${who}[${key}]=${value}`);
            target[key] = value;
            return true;
        },
    });
const levels = (entries) => {
    const out = Array(700).fill(0);
    for (const [talent, level] of Object.entries(entries)) out[talent] = level;
    return out;
};

/**
 * Ann (class 1: page 1, talents 0-14) is in play, Bob (class 7: pages 6 and 7, talents 75-104) is not. Talent n sits on
 * page floor(n / 15) + 1. Talent 0 has no book (RANDOlist[16]).
 */
function setGame() {
    cap = 150;
    scene = "Town";
    writes = [];
    Object.assign(gga.CustomLists.h, {
        TalentOrder: Array.from({ length: 700 }, (_, i) => i),
        RANDOlist: Object.assign([], { 16: ["0"] }),
    });
    const ann = { 0: 1, 1: 100, 2: -1, 3: 150, 4: 180, [SPECIAL]: 5 };
    const bob = { 75: 100, 90: 149, 91: -1, 104: 0, 1: 1, [SPECIAL]: 5 };
    Object.assign(gga, {
        UserInfo: ["Ann"],
        GetPlayersUsernames: ["Ann", "Bob"],
        CharacterClass: 1,
        SkillLevelsMAX: tracked("Ann", levels(ann)),
        PlayerDATABASE: {
            h: {
                // The game's snapshot of Ann, from before she was played: replaced at her next save.
                Ann: { h: { CharacterClass: 1, SkillLevelsMAX: tracked("Ann saved", levels(ann)) } },
                Bob: { h: { CharacterClass: 7, SkillLevelsMAX: tracked("Bob", levels(bob)) } },
            },
        },
    });
}
const tick = () => mock.timers.tick(2000);
const bob = () => gga.PlayerDATABASE.h.Bob.h.SkillLevelsMAX;

test("books under the cap rise to it, for the character in play and the others; nothing else is written", async () => {
    setGame();
    assert.deepEqual(await cheat(CHEAT), {
        ok: true,
        message: `Activated keep every character's talent books at the book cap.`,
    });
    tick();
    const ann = ["Ann[1]=150", ...[5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((t) => `Ann[${t}]=150`)];
    const bobs = [
        "Bob[75]=150",
        ...[76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90].map((t) => `Bob[${t}]=150`),
        ...[92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104].map((t) => `Bob[${t}]=150`),
    ];
    assert.deepEqual(writes, [...ann, ...bobs]);
    assert.equal(gga.SkillLevelsMAX[0], 1, "a talent without a book stays");
    assert.equal(gga.SkillLevelsMAX[2], -1, "locked stays locked");
    assert.equal(gga.SkillLevelsMAX[4], 180, "above the cap is never lowered");
    assert.equal(gga.SkillLevelsMAX[SPECIAL], 5, "a special talent has no cap");
    assert.equal(bob()[91], -1);
    assert.equal(bob()[1], 1, "another class's talent isn't Bob's book");
    assert.equal(bob()[SPECIAL], 5);
    await cheat(CHEAT, false);
});

test("at the cap nothing is written; a higher cap is followed without the menu", async () => {
    setGame();
    await cheat(CHEAT, true);
    tick();
    writes = [];
    tick();
    tick();
    assert.deepEqual(writes, [], "nothing changed, nothing written");

    cap = 200;
    tick();
    assert.equal(gga.SkillLevelsMAX[1], 200);
    assert.equal(gga.SkillLevelsMAX[4], 200, "180 is under the new cap");
    assert.equal(bob()[90], 200);
    assert.equal(gga.SkillLevelsMAX[2], -1);
    writes = [];
    tick();
    assert.deepEqual(writes, []);
    await cheat(CHEAT, false);
});

test("a character switch: the new character's live copy is raised, the last one's snapshot is left to the game", async () => {
    setGame();
    await cheat(CHEAT, true);
    tick();
    // The game loads Bob's entry as the live copy (LoadPlayerInfo), and saves Ann's to her entry.
    gga.PlayerDATABASE.h.Ann.h.SkillLevelsMAX = tracked("Ann saved", [...gga.SkillLevelsMAX]);
    Object.assign(gga, { UserInfo: ["Bob"], CharacterClass: 7, SkillLevelsMAX: bob() });
    cap = 160;
    writes = [];
    tick();
    assert.ok(writes.includes("Bob[75]=160") && writes.includes("Ann saved[1]=160"), writes.join(" "));
    assert.equal(gga.SkillLevelsMAX[75], 160);
    await cheat(CHEAT, false);
});

test("nothing is written at character select, with no cap, or once it is off", async () => {
    setGame();
    await cheat(CHEAT, true);
    scene = "PlayerSelect";
    tick();
    assert.deepEqual(writes, [], "character select");

    scene = "Town";
    cap = 0;
    tick();
    assert.deepEqual(writes, [], "no cap");

    cap = 150;
    await cheat(CHEAT, false);
    tick();
    tick();
    assert.deepEqual(writes, [], "off");
    assert.equal(gga.SkillLevelsMAX[1], 100);
});
