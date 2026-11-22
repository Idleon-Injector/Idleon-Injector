// No character in play (character select, the game's PlayerSelect scene): the per-character values there are
// placeholders the game drops on PLAY, even after a character was clicked and UserInfo[0] names it. Pages say
// NO_CHARACTER instead of showing them, and refuse saves without changing the game; in a map all works as before.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
const gga = game.gga;
const { bEngine } = await importRepo("src/cheats/core/globals.js");
const { CHARACTER_CHANGED, NO_CHARACTER, writeManyVerified, writeVerified } = await importRepo(
    "src/ui/components/views/account/accountShared.js"
);
globalThis.requestAnimationFrame ??= (fn) => setTimeout(fn, 0);

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => {
    const value = node?.attributes?.class;
    return String((typeof value === "function" ? value() : value) ?? "");
};
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));
const buttonIn = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);
const click = (node) => node.listeners.click({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 });
async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
const quietly = async (task) => {
    const realError = console.error;
    console.error = () => {};
    try {
        return await task();
    } finally {
        console.error = realError;
    }
};
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
const saveLabel = (row) => text(byClass(row, "save-state__label")[0]);
const typeAndEnter = async (row, value) => {
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    const sent = requests.length;
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    // This save asked the game something; the class is read live and the words are drawn a moment later.
    await until(() => {
        const done =
            requests.length > sent && /save-state--(success|error)/.test(classes(byClass(row, "save-state")[0]));
        return done && saveLabel(row) !== "" && !/saving/.test(saveLabel(row));
    }, "the save to finish");
};
const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const gameWrites = () => requests.filter((entry) => entry.includes("/write")).length;

// The two moments before PLAY: nobody clicked yet, and a character clicked (UserInfo[0] names it already).
const AT_SELECT = { "at character select": 0, "after clicking a character, before PLAY": "Lumi_Main" };
const atSelect = (userInfo) => {
    bEngine.scene.name = "PlayerSelect";
    gga.UserInfo[0] = userInfo;
};
const inPlay = () => {
    bEngine.scene.name = "";
    gga.UserInfo[0] = "Lumi_Main";
};

const ANVIL = "src/ui/pages/world-1/anvil/anvil.js";
// The points left the page shows: worked out from every stat with the game's formula (talent 281 gives 2 in the fake
// game), so they follow an edit an earlier test made.
const { anvilPointsLeft } = await importRepo(ANVIL);
const pointsLeft = () =>
    `${anvilPointsLeft({ smithingLevel: gga.Lv0[2], talentLevel: gga.SkillLevels[281], talentNumber: 2, stats: gga.AnvilPAstats })} points left`;
const openAnvil = async () => {
    const root = (await importRepo(ANVIL)).default.component();
    await until(() => text(root).includes(pointsLeft()), "the Anvil to load");
    return root;
};

for (const [moment, userInfo] of Object.entries(AT_SELECT)) {
    test(`${moment}: a write for the character in play is refused and the game keeps its values`, async () => {
        atSelect(userInfo);
        const before = structuredClone(gga.AnvilPAstats);
        try {
            await assert.rejects(
                writeManyVerified([{ path: "AnvilPAstats[3]", value: 99 }], { character: "Lumi_Main" }),
                {
                    message: NO_CHARACTER,
                }
            );
            await assert.rejects(writeVerified("AnvilPAstats[3]", 99, { character: "Lumi_Main" }), {
                message: NO_CHARACTER,
            });
            assert.deepEqual(gga.AnvilPAstats, before, "nothing landed in the game");
        } finally {
            inPlay();
        }
    });

    test(`${moment}: a page opened there says ${NO_CHARACTER} instead of placeholder numbers`, async () => {
        atSelect(userInfo);
        try {
            const root = (await importRepo(ANVIL)).default.component();
            await quietly(() => until(() => text(root).includes(NO_CHARACTER), "the Anvil to say no character"));
            assert.ok(!text(root).includes(pointsLeft()), "the placeholder points aren't shown");
        } finally {
            inPlay();
        }
    });

    test(`${moment}: an Anvil save from a page opened in play is refused where it was made`, async () => {
        inPlay();
        const root = await openAnvil();
        const row = rowNamed(root, "Bonus Exp");
        const before = structuredClone(gga.AnvilPAstats);
        atSelect(userInfo);
        try {
            await quietly(() => typeAndEnter(row, 7));
            assert.match(classes(byClass(row, "save-state")[0]), /save-state--error/);
            assert.equal(saveLabel(row), NO_CHARACTER);
            assert.deepEqual(gga.AnvilPAstats, before, "the placeholders are as they were");
        } finally {
            inPlay();
        }
    });
}

test("a save before the page read who is in play is refused, not sent unchecked", async () => {
    atSelect("Lumi_Main");
    const before = structuredClone(gga.AnvilPAstats);
    try {
        const root = (await importRepo(ANVIL)).default.component();
        const row = rowNamed(root, "Bonus Exp");
        await quietly(() => typeAndEnter(row, 8));
        assert.equal(saveLabel(row), NO_CHARACTER);
        assert.deepEqual(gga.AnvilPAstats, before);
    } finally {
        inPlay();
    }
});

const LEVELS = "src/ui/pages/account/player/1-levels.js";
test("Player levels: a Money save after going back to character select is refused, then lands in play", async () => {
    inPlay();
    const root = (await importRepo(LEVELS)).default.component();
    await until(() => rowNamed(root, "Money") && pageRead(root), "Player to load");
    const row = rowNamed(root, "Money");
    const money = gga.Money;
    for (const userInfo of Object.values(AT_SELECT)) {
        atSelect(userInfo);
        try {
            await quietly(() => typeAndEnter(row, money + 5));
            assert.equal(saveLabel(row), NO_CHARACTER);
            assert.equal(gga.Money, money, "the game keeps its money");
        } finally {
            inPlay();
        }
    }
    await typeAndEnter(row, money + 5);
    assert.match(classes(byClass(row, "save-state")[0]), /save-state--success/);
    assert.equal(gga.Money, money + 5);
});

test("in play: the Anvil saves as before", async () => {
    inPlay();
    const root = await openAnvil();
    const row = rowNamed(root, "Bonus Exp");
    await typeAndEnter(row, 7);
    assert.match(classes(byClass(row, "save-state")[0]), /save-state--success/);
    assert.equal(gga.AnvilPAstats[3], 7);
});

test("a page opened at character select shows the real values after a Refresh once in play", async () => {
    atSelect("Lumi_Main");
    const root = (await importRepo(ANVIL)).default.component();
    await quietly(() => until(() => text(root).includes(NO_CHARACTER), "the Anvil to say no character"));
    inPlay();
    click(buttonIn(root, "Refresh"));
    await until(
        () => !text(root).includes(NO_CHARACTER) && rowNamed(root, "Bonus Exp"),
        "the Refresh to read the game"
    );
    assert.ok(text(root).includes(pointsLeft()), "the points the character has");
});

// Review of #154: the Anvil read who is in play, then its values; a switch in between showed the new character's
// values under the old one's name. It now asks again once the values are in, and says the character changed.
test("the Anvil says the character changed when another one comes into play while it reads", async () => {
    inPlay();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        if (String(options.body ?? "").includes("AnvilPAstats")) gga.UserInfo[0] = "Lumi_Alt";
        return realFetch(url, options);
    };
    try {
        const root = (await importRepo(ANVIL)).default.component();
        await quietly(() =>
            until(() => text(root).includes(CHARACTER_CHANGED), "the Anvil to say the character changed")
        );
    } finally {
        globalThis.fetch = realFetch;
        inPlay();
    }
});

// Every page that reads the character in play's own values says the one line at character select, then reads them in play.
const PAGES = {
    "src/ui/pages/account/player/1-levels.js": "LEVELS & MONEY",
    "src/ui/pages/world-1/statues/statues.js": "Statues",
    "src/ui/pages/world-2/post-office/post-office.js": "Delivery complete",
    "src/ui/pages/world-3/library/library.js": "Library",
    "src/ui/pages/world-3/prayers/prayers.js": "PRAYERS",
    "src/ui/pages/world-3/traps/traps.js": "TRAPPING",
    "src/ui/pages/world-3/worship/worship.js": "WORSHIP",
    "src/ui/pages/world-3/death-note/death-note.js": "DEATH NOTE",
    "src/ui/pages/account/player/2-attire-rack.js": "ATTIRE",
    "src/ui/pages/account/player/3-wardrobe.js": "WARDROBE",
};
for (const [file, title] of Object.entries(PAGES)) {
    test(`${file.split("/").pop()}: says ${NO_CHARACTER} at character select and loads after a Refresh in play`, async () => {
        atSelect("Lumi_Main");
        const writesBefore = gameWrites();
        let root;
        try {
            root = (await importRepo(file)).default.component();
            await quietly(() => until(() => text(root).includes(NO_CHARACTER), `${file} to say no character`));
            assert.ok(text(root).includes(title), "the page is the one asked for");
        } finally {
            inPlay();
        }
        assert.equal(gameWrites(), writesBefore, "opening it wrote nothing");
        await quietly(async () => {
            click(buttonIn(root, "Refresh"));
            await until(() => !text(root).includes(NO_CHARACTER), `${file} to read the game in play`);
        });
    });
}
