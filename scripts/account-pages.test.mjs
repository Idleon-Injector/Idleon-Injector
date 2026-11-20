// Account pages on the fake game: a row keeps its node through a reload, so a save's or an undo's result is said
// where the player acted, and what a row shows follows each read of the game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
const { requests } = await loadUi(router);
const gga = game.gga;
// A "Click again" tooltip places itself on the next frame, and its question is read out from a live region on the page.
globalThis.requestAnimationFrame = () => {};
globalThis.document.body = globalThis.document.createElement("body");
globalThis.document.body.appendChild = (child) => globalThis.document.body.append(child);

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
    for (let i = 0; i < 500; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`timed out waiting for ${what}`);
}

const pageRead = (root) =>
    !byClass(root, "account-page-shell__body").some((node) =>
        String(node.attributes.class).includes("is-hidden-until-ready")
    );
async function openPage(file) {
    const root = (await importRepo(file)).default.component();
    await until(() => byClass(root, "account-row").length > 0 && pageRead(root), `${file} to load`);
    return root;
}
const saveState = (row) => classes(byClass(row, "save-state")[0]);
const words = (row) => text(byClass(row, "save-state__label")[0]);
const field = (row) => elements(row).find((node) => node.nodeName === "input");
const button = (root, label) =>
    elements(root).find((node) => node.nodeName === "button" && text(node).trim() === label);

async function saveRow(row, value) {
    const input = field(row);
    input.value = String(value);
    input.listeners.input({ target: input });
    row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => /save-state--(success|error)/.test(saveState(row)), "the save to finish");
}

const VAULT = "src/ui/pages/account/upgrade-vault/upgrade-vault.js";

test("upgrade vault: a refused undo says why on the row the player clicked, through the reload", async () => {
    const root = await openPage(VAULT);
    const row = byClass(root, "account-row")[0];
    await saveRow(row, 7);
    assert.match(saveState(row), /save-state--success/);
    gga.UpgVault[0] = 3; // the game moved on
    await byClass(row, "save-state__undo")[0].listeners.click({});
    await until(() => String(field(row).attributes.value) === "3", "the reload to show 3");
    assert.equal(byClass(root, "account-row")[0], row, "the row kept its node");
    assert.equal(words(row), "changed since: now 3");
});

test("upgrade vault: Refresh while a save runs keeps that save's result on the row", async () => {
    const root = await openPage(VAULT);
    const row = byClass(root, "account-row")[1];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    let held = false;
    let reread = false;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) {
            held = true;
            await gate;
        }
        const response = await realFetch(url, options);
        // The Refresh's last read: the real maxes.
        if (held && String(url).includes("/computed/read-many")) reread = true;
        return response;
    };
    try {
        const input = field(row);
        input.value = "55";
        input.listeners.input({ target: input });
        row.listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
        await until(() => held, "the write to start");
        await button(root, "Refresh").listeners.click({});
        await until(() => reread, "the Refresh to read the game");
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await until(() => /save-state--(success|error)/.test(saveState(row)), "the save to finish");
    assert.equal(byClass(root, "account-row")[1], row, "the row kept its node");
    assert.match(saveState(row), /save-state--success/);
    assert.equal(gga.UpgVault[1], 55);
});

test("task board: Refresh shows the game's new progress, and Target follows the stages saved", async () => {
    const root = await openPage("src/ui/pages/account/task-board/tasks.js");
    const row = byClass(root, "account-row")[0];
    const sub = () => text(byClass(row, "account-row__sub-label")[0]);
    gga.Tasks[1][0][0] = 0;
    gga.Tasks[0][0][0] = 77777;
    await button(root, "Refresh").listeners.click({});
    await until(() => /^Progress 77777 /.test(sub()), "Refresh to show the new progress");
    // The fake game's stage targets are 10, 100, 1000, 5000.
    assert.equal(sub(), "Progress 77777 · Target 10");
    await saveRow(row, 2);
    assert.match(saveState(row), /save-state--success/);
    assert.equal(sub(), "Progress 77777 · Target 1000");
});

const CARDS = "src/ui/pages/account/card-search/cards.js";
const regionSelects = (root) =>
    elements(root).filter((node) => node.nodeName === "select" && classes(node).includes("card-region__tier-select"));
const regionSelect = (root) => regionSelects(root)[0];
// A region's tier is a pick, then Set all beside it.
const pick = (select, tierIndex) => {
    select.value = String(tierIndex);
    select.listeners.change({ target: select });
};
const setAllOf = (select) => button(select.parentNode, "Set all");
const press = (node) => node.listeners.click({ preventDefault() {}, currentTarget: node });
const cardWrites = () => requests.filter((entry) => /write/.test(entry)).length;
const refuseWrites = (object, key) => {
    const kept = object[key];
    Object.defineProperty(object, key, { get: () => kept, set() {}, configurable: true, enumerable: true });
    return () =>
        Object.defineProperty(object, key, { value: kept, writable: true, configurable: true, enumerable: true });
};

test("card search: a region Set all that would lower cards asks first, and lowers them on the second press", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 37;
    cards.mob1 = 74;
    const root = await openPage(CARDS);
    const select = regionSelect(root);
    const setAll = setAllOf(select);

    pick(select, 0);
    assert.deepEqual([cards.mob0, cards.mob1], [37, 74], "picking a tier writes nothing");
    const before = cardWrites();
    await press(setAll);
    assert.equal(setAll.attributes["data-again"], "Click again", "the first press asks");
    assert.equal(setAll.attributes["aria-label"], "Click again to lower 2 cards in Blunder Hills W1 to tier 1.");
    assert.equal(cardWrites(), before, "nothing written");

    await press(setAll);
    assert.deepEqual([cards.mob0, cards.mob1], [6, 6]);
});

test("card search: a region Set all that only raises runs on one press", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 0;
    cards.mob1 = 0;
    const root = await openPage(CARDS);
    const select = regionSelect(root);
    const setAll = setAllOf(select);
    pick(select, 0);
    await press(setAll);
    assert.equal(setAll.attributes["data-again"], undefined, "it didn't ask");
    assert.deepEqual([cards.mob0, cards.mob1], [6, 6]);
});

test("card search: changing the region's pick between the two presses asks again", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 37;
    cards.mob1 = 74;
    const root = await openPage(CARDS);
    const select = regionSelect(root);
    const setAll = setAllOf(select);

    pick(select, 0);
    await press(setAll);
    pick(select, 1);
    await press(setAll);
    assert.equal(setAll.attributes["aria-label"], "Click again to lower 2 cards in Blunder Hills W1 to tier 2.");
    assert.deepEqual([cards.mob0, cards.mob1], [37, 74], "the new pick asked instead of running");

    await press(setAll);
    assert.deepEqual([cards.mob0, cards.mob1], [21, 21]);
});

test("card search: arrow keys on the closed region select only move the pick", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 37;
    cards.mob1 = 74;
    const root = await openPage(CARDS);
    const select = regionSelect(root);
    const before = cardWrites();
    // Chromium changes a closed select on each arrow press; every press used to land on TIER 1 and apply it.
    for (const tierIndex of [0, 0, 1]) {
        select.listeners.keydown?.({ key: "ArrowDown", target: select });
        pick(select, tierIndex);
    }
    assert.equal(cardWrites(), before, "nothing written");
    assert.deepEqual([cards.mob0, cards.mob1], [37, 74]);
    assert.equal(setAllOf(select).attributes["data-again"], undefined, "nothing asked either");
});

test("card search: Set all with no tier picked, or one that isn't a tier, is refused and writes nothing", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 0;
    cards.mob1 = 0;
    const root = await openPage(CARDS);
    const select = regionSelect(root);
    const setAll = setAllOf(select);
    const { TooltipContainer } = await importRepo("src/ui/components/Tooltip.js");
    const tooltip = TooltipContainer();
    const before = cardWrites();

    await press(setAll);
    assert.equal(select.attributes["data-refused"], "", "the pick pulses");
    await until(() => text(tooltip) === "Pick a tier first", "the pick to say why");
    pick(select, 9);
    await press(setAll);
    assert.equal(cardWrites(), before, "nothing written");
    assert.deepEqual([cards.mob0, cards.mob1], [0, 0]);
    assert.equal(setAll.attributes["data-again"], undefined);
});

test("card search: a refused region Set all says why under the region, and the next press clears it", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 0;
    cards.mob1 = 0;
    const root = await openPage(CARDS);
    const select = regionSelect(root);
    const region = elements(root).find((node) => classes(node).split(" ").includes("card-region"));
    const reason = () => text(byClass(region, "card-region__said")[0]);
    const restore = refuseWrites(cards, "mob0");
    try {
        pick(select, 3);
        await press(setAllOf(select));
        await until(() => reason() !== "", "the reason");
        assert.match(reason(), /game kept old value/);
    } finally {
        restore();
    }
    pick(select, 5);
    await press(setAllOf(select));
    assert.equal(reason(), "", "the retry cleared it");
});

test("card search: a Set all pressed in a second region while the first saves waits its turn instead of being dropped", async () => {
    const cards = gga.Cards[0].h;
    for (const id of Object.keys(cards)) cards[id] = 0;
    const root = await openPage(CARDS);
    const [first, second] = regionSelects(root);
    const before = cardWrites();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    let held = false;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("write") && !held) {
            held = true;
            await gate;
        }
        return realFetch(url, options);
    };
    let presses;
    try {
        pick(first, 5); // the top tier only raises, so neither asks
        pick(second, 5);
        const firstPress = press(setAllOf(first));
        await until(() => held, "the first region's write to start");
        presses = Promise.all([firstPress, press(setAllOf(second))]);
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await presses;
    assert.equal(cardWrites() - before, 2, "both regions were written");
});

const BUNDLES = "src/ui/pages/account/bundles/bundles.js";
const rowWith = (root, label) =>
    byClass(root, "account-row").find((row) =>
        elements(row).some((node) => node.nodeName === "button" && text(node).trim() === label)
    );
const rowReason = (row) => text(byClass(row, "bundle-row__said")[0]);
const ownedFlag = (row) => text(byClass(row, "bundle-row__code")[0]);

test("bundles: a refused Unbuy says why on its row, and the next try clears it", async () => {
    const root = await openPage(BUNDLES);
    const row = rowWith(root, "Unbuy");
    const received = gga.BundlesReceived.h;
    const restore = refuseWrites(received, ownedFlag(row));
    try {
        await button(row, "Unbuy").listeners.click({});
        assert.equal(rowReason(row), "game kept old value");
        assert.equal(byClass(row, "bundle-row__said")[0].attributes.role, "status");
    } finally {
        restore();
    }
    await button(row, "Unbuy").listeners.click({});
    assert.equal(rowReason(row), "", "the retry cleared it");
    received[ownedFlag(row)] = 1;
});

test("bundles: a Buy whose cheat fails says why on its row, and Buy all says why beside it", async () => {
    const root = await openPage(BUNDLES);
    const row = rowWith(root, "Buy");
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) =>
        String(url).includes("/toggle")
            ? new Response(JSON.stringify({ error: "the cheat didn't run" }), {
                  status: 500,
                  headers: { "content-type": "application/json" },
              })
            : realFetch(url, options);
    try {
        await button(row, "Buy").listeners.click({});
        assert.equal(rowReason(row), "the cheat didn't run");

        const buyAll = elements(root).find(
            (node) => node.nodeName === "button" && /^Buy all \(\d+\)$/.test(text(node).trim())
        );
        const click = () => buyAll.listeners.click({ currentTarget: buyAll });
        await click(); // asks first
        await click();
        const said = text(byClass(root, "said--buy-all")[0]);
        assert.match(said, /One or more bundle purchases could not be completed/);
        assert.equal(rowReason(row), "the cheat didn't run");
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("levels: fields stay enabled while a save runs, and a second field's save waits its turn", async () => {
    const root = await openPage("src/ui/pages/account/player/1-levels.js");
    const row = (label) =>
        byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
    const money = row("Money");
    const mining = row("Mining level");
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    let held = false;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("write") && !held) {
            held = true;
            await gate;
        }
        return realFetch(url, options);
    };
    const level = gga.Lv0[2] + 3;
    try {
        const moneyInput = field(money);
        moneyInput.value = "1234";
        moneyInput.listeners.input({ target: moneyInput });
        money.listeners.keydown({ key: "Enter", target: moneyInput, preventDefault() {} });
        await until(() => held, "the Money write to start");
        assert.notEqual(moneyInput.attributes.disabled, true, "the field being saved stays enabled");
        assert.notEqual(field(mining).attributes.disabled, true, "the next field stays enabled");
        const miningInput = field(mining);
        miningInput.value = String(level);
        miningInput.listeners.input({ target: miningInput });
        mining.listeners.keydown({ key: "Enter", target: miningInput, preventDefault() {} });
    } finally {
        globalThis.fetch = realFetch;
        release();
    }
    await until(() => /save-state--(success|error)/.test(saveState(money)), "Money to save");
    await until(() => /save-state--(success|error)/.test(saveState(mining)), "Mining to save");
    assert.match(saveState(money), /save-state--success/);
    assert.match(saveState(mining), /save-state--success/);
    assert.equal(gga.Money, 1234);
    assert.equal(gga.Lv0[2], level);
});

test("levels: a save that waited its turn keeps the warning of the failed save before it", async () => {
    const root = await openPage("src/ui/pages/account/player/1-levels.js");
    const row = (label) =>
        byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
    const money = row("Money");
    const mining = row("Mining level");
    const warning = () => text(byClass(root, "write-status")[0]);
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    let held = false;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("write") && !held) {
            held = true;
            await gate;
        }
        return realFetch(url, options);
    };
    const restore = refuseWrites(gga.Lv0, 2);
    try {
        const miningInput = field(mining);
        miningInput.value = String(gga.Lv0[2] + 3);
        miningInput.listeners.input({ target: miningInput });
        mining.listeners.keydown({ key: "Enter", target: miningInput, preventDefault() {} });
        await until(() => held, "the Mining write to start");
        const moneyInput = field(money);
        moneyInput.value = "4321";
        moneyInput.listeners.input({ target: moneyInput });
        money.listeners.keydown({ key: "Enter", target: moneyInput, preventDefault() {} });
        release();
        await until(() => /save-state--(success|error)/.test(saveState(mining)), "Mining to fail");
        await until(() => /save-state--(success|error)/.test(saveState(money)), "Money to save");
    } finally {
        globalThis.fetch = realFetch;
        release();
        restore();
    }
    assert.match(saveState(mining), /save-state--error/);
    assert.match(saveState(money), /save-state--success/);
    assert.match(warning(), /some writes may have applied/);
});

test("upgrade vault: a failed Max all says why until the next press", async () => {
    const root = await openPage(VAULT);
    const maxAll = button(root, "Max all");
    const feedback = () => text(byClass(root, "account-write-feedback")[0]);
    gga.UpgVault[0] = 0;
    const restore = refuseWrites(gga.UpgVault, 0);
    try {
        await maxAll.listeners.click({ preventDefault() {}, currentTarget: maxAll });
        await until(() => /^Failed/.test(feedback()), "Max all to fail");
        assert.equal(feedback(), "Failed to save all vault upgrades: game kept old value");
        await until(() => classes(maxAll).includes("account-btn--error"), "the button to show the failure");
        await until(() => !classes(maxAll).includes("account-btn--error"), "the button's failure to fade");
        assert.equal(feedback(), "Failed to save all vault upgrades: game kept old value", "it stays");
    } finally {
        restore();
    }
    await maxAll.listeners.click({ preventDefault() {}, currentTarget: maxAll });
    await until(() => feedback() === "All vault upgrades saved", "the retry to save");
});
