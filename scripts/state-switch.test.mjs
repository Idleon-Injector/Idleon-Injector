// The on/off switch (#26, PR #108 review): a flip is never lost, a refused save puts the switch back to what the game
// holds, and a failed save says why on the switch.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
const ola = game.gga.OptionsListAccount;

const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(typeof node.attributes.class === "function" ? "" : node.attributes.class);
const byClass = (root, name) => elements(root).filter((node) => classes(node).split(" ").includes(name));

async function until(check, what) {
    for (let i = 0; i < 300; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// The game keeps the old value whatever is written there.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};
// Hold the game's writes until released, to act while a save runs.
const holdWrites = () => {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) await gate;
        return realFetch(url, options);
    };
    return () => {
        globalThis.fetch = realFetch;
        release();
    };
};

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) => classes(node).includes("is-hidden-until-ready"));
const openPage = async (file, ready) => {
    const root = (await importRepo(file)).default.component();
    await until(() => ready(root), `${file} to load`);
    return root;
};
const rowNamed = (root, name) =>
    byClass(root, "account-row").find((row) => text(byClass(row, "account-row__name")[0]) === name);
const switchOf = (row) => elements(row).find((node) => node.attributes.role === "switch");
const wordsOf = (row) => text(byClass(row, "state-switch__words")[0]);
// The player flips the switch: the browser has already moved the box, then reports the change.
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });

const BRIBES = "src/ui/pages/world-1/bribes/bribes.js";

test("bribes: a switch flipped while another row saves still saves", async () => {
    const status = game.gga.BribeStatus;
    status[2] = 0;
    status[3] = 0;
    const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Sleeping On the Job"));
    const first = rowNamed(root, "Mandatory Fire Sale");
    const second = rowNamed(root, "Sleeping On the Job");
    const release = holdWrites();
    const saves = [flip(first, true)];
    await tick();
    saves.push(flip(second, true));
    await tick();
    release();
    await Promise.all(saves);
    assert.equal(status[2], 1);
    assert.equal(status[3], 1, "the second row's flip waited its turn instead of being dropped");
    assert.equal(wordsOf(second), "Owned");
    status[2] = 0;
    status[3] = 0;
});

test("bribes: flipping one switch on and back off while it saves ends with the last flip saved", async () => {
    const status = game.gga.BribeStatus;
    status[2] = 0;
    const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Mandatory Fire Sale"));
    const row = rowNamed(root, "Mandatory Fire Sale");
    const release = holdWrites();
    const save = flip(row, true);
    await tick();
    await flip(row, false); // lands while the first save runs, so it waits for it
    release();
    await save;
    assert.equal(status[2], 0, "the newest flip (off) is what the game holds");
    assert.equal(wordsOf(row), "Not owned");
});

const KILLROY = "src/ui/pages/world-2/killroy/killroy.js";

test("killroy: a save the game doesn't keep says why on the switch, and the next flip clears it", async () => {
    ola[115] = 0;
    const root = await openPage(KILLROY, (root) => pageRead(root) && rowNamed(root, "AIRHORN RESET"));
    const row = rowNamed(root, "AIRHORN RESET");
    const restore = refuseWrites(ola, 115);
    try {
        await flip(row, true);
    } finally {
        restore();
    }
    assert.equal(ola[115], 0);
    assert.equal(wordsOf(row), "game kept old value");
    assert.equal(switchOf(row).checked, false, "the switch shows what the game holds");
    await flip(row, true);
    assert.equal(ola[115], 1);
    assert.equal(wordsOf(row), "On", "a save that lands clears the reason");
    ola[115] = 0;
});

test("account options: a refused on/off save puts the switch back to what the game holds", async () => {
    const index = 690; // past the schema, so its row's editor follows the value: a switch
    ola[index] = true;
    const { AccountOptionsTab } = await importRepo("src/ui/components/views/account/AccountOptionsTab.js");
    const root = AccountOptionsTab();
    const optionRow = () => elements(root).find((node) => node.attributes["data-index"] === index);
    await until(() => optionRow() && switchOf(optionRow()), "Account Options to load");
    const row = optionRow();
    const restore = refuseWrites(ola, index);
    try {
        await flip(row, false);
    } finally {
        restore();
    }
    assert.equal(ola[index], true);
    assert.equal(switchOf(row).checked, true, "the refused Off doesn't stay on screen");
    assert.equal(wordsOf(row), "game kept old value");
    ola[index] = (index * 13) % 50;
});

// Two switches showing `off`, flipped on while the first one's save runs: both land.
const twoFlipsLand = async (file, off, on, gameValue) => {
    const root = await openPage(file, (root) => pageRead(root) && byClass(root, "state-switch").length > 1);
    const rows = byClass(root, "account-row").filter((row) => switchOf(row) && wordsOf(row) === off);
    assert.ok(rows.length >= 2, `two rows show ${off}`);
    const [first, second] = rows;
    const release = holdWrites();
    const saves = [flip(first, true)];
    await tick();
    saves.push(flip(second, true));
    await tick();
    release();
    await Promise.all(saves);
    await until(() => wordsOf(second) === on, "the second row to show its save");
    assert.equal(wordsOf(first), on);
    assert.ok(gameValue(), "the game holds both");
};

test("event shop: a switch flipped while another row saves still saves", async () => {
    const before = ola[311];
    await twoFlipsLand(
        "src/ui/pages/account/event-shop/event-shop.js",
        "Not owned",
        "Owned",
        () => String(ola[311]).length === String(before).length + 2
    );
    ola[311] = before;
});

test("weekly bosses: a skin switch flipped while another skin saves still saves", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    const locked = Object.keys(weekly).filter((key) => key.startsWith("UI_") && Number(weekly[key]) === 0);
    await twoFlipsLand("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", "Locked", "Unlocked", () =>
        locked.slice(0, 2).every((key) => Number(weekly[key]) === 1)
    );
    for (const key of locked) weekly[key] = 0;
});

test("slab: an item switch flipped while another item saves still saves", async () => {
    await twoFlipsLand("src/ui/pages/world-5/slab/slab.js", "Missing", "Registered", () => true);
});

test("islands (the shared toggle row): a save the game doesn't keep says why on the switch", async () => {
    const root = await openPage(
        "src/ui/pages/world-2/islands/islands.js",
        (root) => pageRead(root) && rowNamed(root, "Trash Island")
    );
    const row = rowNamed(root, "Trash Island");
    const was = wordsOf(row);
    const restore = refuseWrites(ola, 169);
    try {
        await flip(row, was !== "Unlocked");
    } finally {
        restore();
    }
    assert.equal(wordsOf(row), "game kept old value");
    assert.equal(switchOf(row).checked, was === "Unlocked", "the switch shows what the game holds");
});

test("jade emporium: two upgrades flipped at once both stay bought (they share one string)", async () => {
    const before = String(game.gga.Ninja[102][9] ?? "");
    await twoFlipsLand(
        "src/ui/pages/world-6/sneaking/2-jade.js",
        "Locked",
        "Bought",
        () => String(game.gga.Ninja[102][9]).length === before.length + 2
    );
    game.gga.Ninja[102][9] = before;
});
