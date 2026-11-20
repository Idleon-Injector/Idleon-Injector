// World 3 pages on the fake game (review sweep, world-3a): a change starts from what the game holds now, goes to the
// character or slot it was asked for, and its result shows where the player acted.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
const gga = game.gga;
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

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root) && pageRead(root), `${file} to load`);
    return root;
};

// The game answers these writes with a failure, as when it refuses or the connection drops.
const failWrites = (pattern) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && pattern.test(JSON.parse(options.body).path)) {
            return new Response(JSON.stringify({ error: "the game refused" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        }
        return realFetch(url, options);
    };
    return () => (globalThis.fetch = realFetch);
};
const quietly = async (task) => {
    const realError = console.error;
    console.error = () => {};
    try {
        return await task();
    } finally {
        console.error = realError;
    }
};
const settledButton = (node) => /account-btn--(success|error)/.test(classes(node));

const HAT_RACK = "src/ui/pages/world-3/hat-rack/hat-rack.js";
const hat = (n) => `EquipmentHatsPrem${n}`;
const rackRows = (root) => byClass(root, "hat-rack-row");
const rackRowFor = (root, itemId) =>
    rackRows(root).find((row) => text(byClass(row, "account-row__sub-label")[0]) === itemId);
const setRack = (rack, slab) => {
    gga.Spelunk[46] = rack;
    gga.Cards[1] = slab;
};

test("Hat Rack: Add all and Remove keep what the game added after the page read it", async () => {
    setRack([hat(1), hat(2)], [hat(6), hat(7)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);

    // The player keeps playing: the game adds loot to the Slab and a hat to the rack.
    gga.Cards[1].push("NewLoot");
    gga.Spelunk[46].push(hat(3));

    const addAll = buttonIn(root, "Add all");
    click(addAll);
    await until(() => settledButton(addAll), "Add all to finish");
    assert.match(classes(addAll), /account-btn--success/);
    assert.ok(gga.Cards[1].includes("NewLoot"), "the loot the game added stays in the Slab");
    assert.equal(gga.Spelunk[46][2], hat(3), "the hat the game added stays on the rack");

    gga.Cards[1].push("LaterLoot");
    gga.Spelunk[46].push("InGameHat");
    await until(() => rackRowFor(root, hat(1)), "the rack to show");
    const before = rackRows(root).length;
    click(buttonIn(rackRowFor(root, hat(1)), "Remove"));
    await until(() => !gga.Spelunk[46].includes(hat(1)) && rackRows(root).length === before, "Remove to finish");
    assert.ok(gga.Spelunk[46].includes("InGameHat"), "the hat the game added stays on the rack");
    assert.ok(gga.Cards[1].includes("LaterLoot"), "the loot the game added stays in the Slab");
});

test("Hat Rack: a half-done Add all shows the hats that landed, and the next Remove keeps them", async () => {
    setRack([hat(1), hat(2)], []);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);

    const restore = failWrites(/Spelunk\[46\]\[4\]$/); // the third hat of Add all
    const addAll = buttonIn(root, "Add all");
    try {
        await quietly(async () => {
            click(addAll);
            await until(() => settledButton(addAll), "Add all to finish");
        });
    } finally {
        restore();
    }
    assert.match(classes(addAll), /account-btn--error/);
    const landed = gga.Spelunk[46].slice(2);
    assert.equal(landed.length, 2, "two hats landed before the refusal");
    await until(() => rackRows(root).length === 4, "the page to show what landed");

    click(buttonIn(rackRowFor(root, hat(1)), "Remove"));
    await until(() => !gga.Spelunk[46].includes(hat(1)), "Remove to finish");
    for (const itemId of landed) assert.ok(gga.Spelunk[46].includes(itemId), `${itemId} stays on the rack`);
});

test("Hat Rack: a removal the Slab refuses stays on its row, red, and can be pressed again", async () => {
    setRack([hat(1), hat(2)], [hat(1)]);
    const root = await openPage(HAT_RACK, (r) => rackRows(r).length === 2);

    const restore = failWrites(/^gga\.Cards\[1\]$/);
    const row = rackRowFor(root, hat(1));
    const remove = buttonIn(row, "Remove");
    try {
        await quietly(async () => {
            click(remove);
            await until(() => settledButton(remove), "Remove to finish");
        });
    } finally {
        restore();
    }
    assert.match(classes(remove), /account-btn--error/);
    assert.ok(rackRows(root).includes(row), "the row that asked is still on the page");
    assert.deepEqual([...gga.Spelunk[46]], [hat(1), hat(2)], "the hat is still on the rack");

    await until(() => !classes(remove).includes("account-btn--error"), "the red to clear");
    click(remove);
    await until(() => !gga.Spelunk[46].includes(hat(1)), "the second press to remove it");
    assert.deepEqual([...gga.Cards[1]], []);
});

const SMITHY = "src/ui/pages/world-3/armor-smithy/armor-smithy.js";
const smithyRows = (root) => byClass(root, "smithy-row");

test("Smithy: Remove and Add keep a set the game stored after the page read the list", async () => {
    gga.OptionsListAccount[379] = "0,COPPER_SET,GOLD_SET";
    const root = await openPage(SMITHY, (r) => smithyRows(r).length === 2);

    // In game, the player completes a set and the game stores it.
    gga.OptionsListAccount[379] += ",IRON_SET";
    const gold = smithyRows(root).find((row) => text(row).includes("GOLD_SET"));
    click(buttonIn(gold, "Remove"));
    await until(() => !gga.OptionsListAccount[379].includes("GOLD_SET"), "Remove to finish");
    assert.equal(gga.OptionsListAccount[379], "0,COPPER_SET,IRON_SET");

    gga.OptionsListAccount[379] += ",PLATINUM_SET";
    await until(() => smithyRows(root).length === 2, "the page to read the game again");
    const addAll = buttonIn(root, "Add all");
    click(addAll);
    await until(() => settledButton(addAll), "Add all to finish");
    for (const setKey of ["COPPER_SET", "IRON_SET", "PLATINUM_SET"]) {
        assert.ok(gga.OptionsListAccount[379].split(",").includes(setKey), `${setKey} stays stored`);
    }
});

// The game switches characters: the one in play saves its live copy, and the next one's copy becomes the live one.
const switchCharacter = (name) => {
    const db = gga.PlayerDATABASE.h;
    const from = gga.UserInfo[0];
    for (const key of Object.keys(db[from].h)) if (key in gga) db[from].h[key] = structuredClone(gga[key]);
    for (const key of Object.keys(db[name].h)) if (key in gga) gga[key] = structuredClone(db[name].h[key]);
    gga.UserInfo[0] = name;
};
const typeAndEnter = async (row, value) => {
    const [input] = elements(row).filter((node) => node.nodeName === "input");
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--(success|error)/.test(classes(byClass(row, "save-state")[0])), "the save to finish");
};

test("Death Note: a kill count saves to the character on its row, whoever is in play now", async () => {
    gga.UserInfo[0] = "Lumi_Main";
    // The real game keeps numbers for the kill requirement.
    gga.CustomLists.h.MapDetails = gga.CustomLists.h.MapDetails.map((map) => [[Number(map[0][0]), 0, 0]]);
    const required = gga.CustomLists.h.MapDetails[0][0][0];
    const db = gga.PlayerDATABASE.h;
    gga.KillsLeft2Advance[0][0] = required - 2;
    db.Lumi_Main.h.KillsLeft2Advance[0][0] = required - 2;
    db.Lumi_Alt.h.KillsLeft2Advance[0][0] = required - 5;
    const root = await openPage("src/ui/pages/world-3/death-note/death-note.js", (r) =>
        byClass(r, "dn-player-row").some((row) => text(row).includes("(selected)"))
    );
    const firstRowOf = (name) =>
        byClass(root, "dn-player-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
    const mainRow = firstRowOf("Lumi_Main");
    const altRow = firstRowOf("Lumi_Alt");

    switchCharacter("Lumi_Alt");
    await typeAndEnter(mainRow, 7);
    assert.match(classes(byClass(mainRow, "save-state")[0]), /save-state--success/);
    assert.equal(db.Lumi_Main.h.KillsLeft2Advance[0][0], required - 7, "Main's kills changed");
    assert.equal(gga.KillsLeft2Advance[0][0], required - 5, "Alt, in play, keeps its kills");

    await typeAndEnter(altRow, 9);
    assert.equal(gga.KillsLeft2Advance[0][0], required - 9, "Alt's live kills, the copy the game keeps, changed");
    assert.equal(db.Lumi_Alt.h.KillsLeft2Advance[0][0], required - 9);
    switchCharacter("Lumi_Main");
});
