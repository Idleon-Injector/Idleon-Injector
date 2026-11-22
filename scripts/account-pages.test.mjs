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

// Holds the first write until released, and counts how many writes were in flight at once.
const holdFirstWrite = () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    let held = false;
    let inFlight = 0;
    let most = 0;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("write")) return realFetch(url, options);
        most = Math.max(most, ++inFlight);
        try {
            if (!held) {
                held = true;
                await gate;
            }
            return await realFetch(url, options);
        } finally {
            inFlight--;
        }
    };
    return {
        held: () => held,
        release: () => release(),
        mostAtOnce: () => most,
        restore: () => {
            globalThis.fetch = realFetch;
            release();
        },
    };
};

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
    assert.equal(setAll.attributes["aria-label"], "Click again to lower 2 cards in BLUNDER HILLS W1 to tier 1.");
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
    assert.equal(setAll.attributes["aria-label"], "Click again to lower 2 cards in BLUNDER HILLS W1 to tier 2.");
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
    const writes = holdFirstWrite();
    try {
        pick(first, 5); // the top tier only raises, so neither asks
        pick(second, 5);
        const firstPress = press(setAllOf(first));
        await until(writes.held, "the first region's write to start");
        const presses = Promise.all([firstPress, press(setAllOf(second))]);
        writes.release();
        await presses;
    } finally {
        writes.restore();
    }
    assert.equal(cardWrites() - before, 2, "both regions were written");
    assert.equal(writes.mostAtOnce(), 1, "the second region's write started after the first answered");
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

const failCatalogOnce = () => {
    const realFetch = globalThis.fetch;
    let failed = false;
    globalThis.fetch = async (url, options) => {
        if (!failed && String(url).includes("/game/bundles")) {
            failed = true;
            return new Response(JSON.stringify({ error: "the game is busy" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        }
        return realFetch(url, options);
    };
    return () => (globalThis.fetch = realFetch);
};

test("bundles: a Buy whose first ownership read fails reads the game again, so the row shows it owned", async () => {
    const root = await openPage(BUNDLES);
    const row = rowWith(root, "Buy");
    const code = ownedFlag(row);
    const received = gga.BundlesReceived.h;
    const before = received[code];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/toggle")) return realFetch(url, options);
        received[code] = 1; // the game took the purchase
        return new Response(JSON.stringify({ ok: true, message: "bought" }), {
            headers: { "content-type": "application/json" },
        });
    };
    const restore = failCatalogOnce();
    try {
        await button(row, "Buy").listeners.click({});
        assert.equal(rowReason(row), "the game is busy");
        await until(() => button(row, "Unbuy"), "the row to show the bundle owned");
    } finally {
        restore();
        globalThis.fetch = realFetch;
        received[code] = before;
    }
});

test("bundles: a failed Unbuy reads the game again, so the row shows what the game holds", async () => {
    const root = await openPage(BUNDLES);
    const row = rowWith(root, "Unbuy");
    const code = ownedFlag(row);
    const received = gga.BundlesReceived.h;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/write")) return realFetch(url, options);
        received[code] = 0; // it landed, but the answer was lost
        return new Response(JSON.stringify({ error: "the connection dropped" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    try {
        await button(row, "Unbuy").listeners.click({});
        await until(() => button(row, "Buy"), "the row to show the bundle not owned");
    } finally {
        globalThis.fetch = realFetch;
        received[code] = 1;
    }
});

test("bundles: the read after a failed Unbuy that answers after a newer Refresh doesn't put old ownership back", async () => {
    const root = await openPage(BUNDLES);
    const row = rowWith(root, "Unbuy");
    const code = ownedFlag(row);
    const received = gga.BundlesReceived.h;
    const realFetch = globalThis.fetch;
    let release;
    const answer = new Promise((resolve) => (release = resolve));
    let held = false;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write"))
            return new Response(JSON.stringify({ error: "the game refused" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        const response = await realFetch(url, options);
        if (String(url).includes("/game/bundles") && !held) {
            held = true; // the read after the failure: the game still holds the bundle then
            await answer;
        }
        return response;
    };
    try {
        await button(row, "Unbuy").listeners.click({});
        await until(() => held, "the read after the failure");
        received[code] = 0; // the player gives it back in game
        await button(root, "Refresh").listeners.click({});
        await until(() => button(row, "Buy"), "the Refresh to show it not owned");
        release();
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.ok(button(row, "Buy"), "the older read didn't put Unbuy back");
    } finally {
        globalThis.fetch = realFetch;
        release();
        received[code] = 1;
    }
});

test("bundles: an Unbuy that fails while the read after another failure runs gets a read of its own", async () => {
    const root = await openPage(BUNDLES);
    const received = gga.BundlesReceived.h;
    const first = rowWith(root, "Unbuy");
    const second = rowWith(root, "Buy");
    const code = ownedFlag(second);
    received[code] = 1; // a second owned bundle
    await button(root, "Refresh").listeners.click({});
    await until(() => button(second, "Unbuy"), "the second bundle to show owned");
    const realFetch = globalThis.fetch;
    let release;
    const answer = new Promise((resolve) => (release = resolve));
    let held = false;
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) {
            if (++writes === 2) received[code] = 0; // the second Unbuy lands, but its answer is lost
            return new Response(JSON.stringify({ error: "the connection dropped" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        }
        const response = await realFetch(url, options);
        if (String(url).includes("/game/bundles") && !held) {
            held = true; // the read after the first failure: the second bundle is still owned then
            await answer;
        }
        return response;
    };
    try {
        await button(first, "Unbuy").listeners.click({});
        await until(() => held, "the read after the first failure");
        await button(second, "Unbuy").listeners.click({});
        release();
        await until(() => button(second, "Buy"), "the second bundle to show not owned");
    } finally {
        globalThis.fetch = realFetch;
        release();
        received[code] = 0;
        received[ownedFlag(first)] = 1;
    }
});

test("bundles: the read after a failure that answers after another bundle's Unbuy landed doesn't show it owned again", async () => {
    const root = await openPage(BUNDLES);
    const received = gga.BundlesReceived.h;
    const first = rowWith(root, "Unbuy");
    const second = rowWith(root, "Buy");
    const code = ownedFlag(second);
    received[code] = 1; // a second owned bundle
    await button(root, "Refresh").listeners.click({});
    await until(() => button(second, "Unbuy"), "the second bundle to show owned");
    const realFetch = globalThis.fetch;
    let release;
    const answer = new Promise((resolve) => (release = resolve));
    let held = false;
    let writes = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write") && ++writes === 1)
            return new Response(JSON.stringify({ error: "the game refused" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        const response = await realFetch(url, options);
        if (String(url).includes("/game/bundles") && !held) {
            held = true; // the read after the first failure: the second bundle is still owned then
            await answer;
        }
        return response;
    };
    try {
        await button(first, "Unbuy").listeners.click({});
        await until(() => held, "the read after the failure");
        await button(second, "Unbuy").listeners.click({}); // lands
        assert.ok(button(second, "Buy"));
        release();
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.ok(button(second, "Buy"), "the older read didn't put Unbuy back");
    } finally {
        globalThis.fetch = realFetch;
        release();
        received[code] = 0;
        received[ownedFlag(first)] = 1;
    }
});

test("bundles: Buy all ends when its ownership poll fails after another read showed a bundle owned", async () => {
    const root = await openPage(BUNDLES);
    const buyAll = elements(root).find(
        (node) => node.nodeName === "button" && /^Buy all \(\d+\)$/.test(text(node).trim())
    );
    const count = Number(/\((\d+)\)/.exec(text(buyAll))[1]);
    const received = gga.BundlesReceived.h;
    const before = { ...received };
    const realFetch = globalThis.fetch;
    let toggles = 0;
    let catalogReads = 0;
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/toggle")) {
            const code = JSON.parse(options.body).action.split(" ")[1];
            // The last buy fails (its failure reads the catalog, which shows the others owned); the rest land.
            if (++toggles === count)
                return new Response(JSON.stringify({ error: "the cheat didn't run" }), {
                    status: 500,
                    headers: { "content-type": "application/json" },
                });
            received[code] = 1;
            return new Response(JSON.stringify({ ok: true, message: "bought" }), {
                headers: { "content-type": "application/json" },
            });
        }
        // The ownership poll's read (the second catalog read after the press) fails.
        if (String(url).includes("/game/bundles") && toggles > 0 && ++catalogReads === 2)
            return new Response(JSON.stringify({ error: "the game is busy" }), {
                status: 500,
                headers: { "content-type": "application/json" },
            });
        return realFetch(url, options);
    };
    try {
        const click = () => buyAll.listeners.click({ currentTarget: buyAll });
        await click(); // asks first
        void click();
        await until(
            () => /One or more bundle purchases/.test(text(byClass(root, "said--buy-all")[0])),
            "Buy all to end and say why"
        );
    } finally {
        globalThis.fetch = realFetch;
        Object.assign(received, before);
    }
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

// #197: 33 packs need free inventory slots. Without them the game drops the pack: no items, and never received.
test("bundles: a buy is refused without the free inventory slots the game needs", async () => {
    const { firebase } = await importRepo("src/cheats/core/globals.js");
    await importRepo("src/cheats/cheats/standalone.js");
    const { cheats } = await importRepo("src/cheats/core/registration.js");
    const sent = [];
    firebase.addToMessageQueue = (...args) => sent.push(args);
    const keys = ["InventorySlotsOwned", "InventoryOrder", "ItemQuantity"];
    const saved = keys.map((key) => [key, gga[key]]);
    gga.InventorySlotsOwned = 4;
    gga.InventoryOrder = ["Copper", "Blank", "Blank", "Blank", "Blank"]; // the fifth slot isn't owned
    gga.ItemQuantity = [5, 0, 0, 0, 0];
    try {
        assert.throws(() => cheats.buy.fn(["bun_d"]), { message: "Needs 4 free inventory slots." });
        assert.deepEqual(sent, [], "nothing was sent");
        cheats.buy.fn(["bun_e"]); // needs 3
        assert.deepEqual(sent, [["SERVER_CODE", "SERVER_ITEM_BUNDLE", "bun_e"]]);
    } finally {
        for (const [key, value] of saved) value === undefined ? delete gga[key] : (gga[key] = value);
        delete firebase.addToMessageQueue;
    }
});

// #28: the count and Buy all covered every bundle, whatever the search showed.
test("bundles: the count and Buy all follow the search, and a search changed before the second press asks again", async () => {
    const root = await openPage(BUNDLES);
    const received = gga.BundlesReceived.h;
    const search = elements(root).find((node) => node.attributes.placeholder === "SEARCH BUNDLES OR CODES");
    const typeSearch = (value) => search.listeners.input({ target: { value } });
    const buyAll = () =>
        elements(root).find((node) => node.nodeName === "button" && /^Buy all \(\d+\)$/.test(text(node).trim()));
    const shownCount = () => Number(/\((\d+)\)/.exec(text(buyAll()))[1]);
    const note = () => text(elements(root).find((node) => /^\d+ BUNDLES, /.test(text(node))));
    const press = () => buyAll().listeners.click({ currentTarget: buyAll() });
    const codes = byClass(root, "bundle-row__code").map(text);
    const notOwned = codes.filter((code) => !received[code]);
    assert.ok(notOwned.length >= 2, "the fixture has two bundles to buy");
    const [first, second] = notOwned;
    const allBuyable = shownCount();

    // The game takes a buy as its cheat would: the bundle is received.
    const bought = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (!String(url).includes("/toggle")) return realFetch(url, options);
        const code = JSON.parse(options.body).action.replace(/^buy /, "");
        bought.push(code);
        received[code] = 1;
        return new Response(JSON.stringify({ ok: true, message: "bought" }), {
            headers: { "content-type": "application/json" },
        });
    };
    try {
        typeSearch(first);
        await until(() => shownCount() === 1, "Buy all to count the one bundle shown");
        assert.match(note(), /^1 BUNDLES, 0 OWNED, 1 NOT OWNED/);

        typeSearch("no bundle is called this");
        await until(() => shownCount() === 0, "Buy all to count nothing");
        assert.equal(buyAll().attributes.disabled, true, "nothing shown, nothing to buy");
        assert.match(note(), /^0 BUNDLES/);

        typeSearch("");
        await until(() => shownCount() === allBuyable, "a cleared search to count every bundle again");

        // Asked about the first, then the search moved on: the second press asks about the second.
        typeSearch(first);
        await until(() => shownCount() === 1, "the first bundle alone");
        await press();
        assert.equal(buyAll().attributes["data-again"], "Click again");
        typeSearch(second);
        await until(() => shownCount() === 1 && note().startsWith("1 BUNDLES"), "the second bundle alone");
        await press();
        assert.deepEqual(bought, [], "a changed search asks again instead of buying");
        await press();
        await until(() => bought.length === 1 && shownCount() === 0, "the second bundle bought");
        assert.deepEqual(bought, [second], "only the bundle shown at the second press");
        assert.equal(received[first] ?? 0, 0, "the first one stays not owned");
    } finally {
        globalThis.fetch = realFetch;
        for (const code of bought) received[code] = 0;
        typeSearch("");
    }
});

test("levels: fields stay enabled while a save runs, and a second field's save waits its turn", async () => {
    const root = await openPage("src/ui/pages/account/player/1-levels.js");
    const row = (label) =>
        byClass(root, "account-row").find((node) => text(byClass(node, "account-row__name")[0]) === label);
    const money = row("Money");
    const mining = row("Mining level");
    const writes = holdFirstWrite();
    const level = gga.Lv0[2] + 3;
    try {
        const moneyInput = field(money);
        moneyInput.value = "1234";
        moneyInput.listeners.input({ target: moneyInput });
        money.listeners.keydown({ key: "Enter", target: moneyInput, preventDefault() {} });
        await until(writes.held, "the Money write to start");
        assert.notEqual(moneyInput.attributes.disabled, true, "the field being saved stays enabled");
        assert.notEqual(field(mining).attributes.disabled, true, "the next field stays enabled");
        const miningInput = field(mining);
        miningInput.value = String(level);
        miningInput.listeners.input({ target: miningInput });
        mining.listeners.keydown({ key: "Enter", target: miningInput, preventDefault() {} });
        writes.release();
        await until(() => /save-state--(success|error)/.test(saveState(money)), "Money to save");
        await until(() => /save-state--(success|error)/.test(saveState(mining)), "Mining to save");
    } finally {
        writes.restore();
    }
    assert.equal(writes.mostAtOnce(), 1, "Mining's write started after Money's answered");
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
