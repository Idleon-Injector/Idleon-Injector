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
        input.value = "15";
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
    assert.equal(gga.UpgVault[1], 15);
});

test("task board: Refresh shows the game's new progress, and the target follows the stages saved", async () => {
    const root = await openPage("src/ui/pages/account/task-board/tasks.js");
    const row = byClass(root, "account-row")[0];
    const note = () => text(byClass(row, "account-row__note")[0]);
    gga.Tasks[1][0][0] = 0;
    gga.Tasks[0][0][0] = 77777;
    await button(root, "Refresh").listeners.click({});
    await until(() => /^77,777 of /.test(note()), "Refresh to show the new progress");
    // The fake game's stage targets are 10, 100, 1000, 5000.
    assert.equal(note(), "77,777 of 10");
    await saveRow(row, 2);
    assert.match(saveState(row), /save-state--success/);
    assert.equal(note(), "77,777 of 1,000");
});

const CARDS = "src/ui/pages/account/cards/cards.js";
const press = (node) => node.listeners.click({ preventDefault() {}, currentTarget: node });
const cardWrites = () => requests.filter((entry) => /write/.test(entry)).length;
const refuseWrites = (object, key) => {
    const kept = object[key];
    Object.defineProperty(object, key, { get: () => kept, set() {}, configurable: true, enumerable: true });
    return () =>
        Object.defineProperty(object, key, { value: kept, writable: true, configurable: true, enumerable: true });
};
// The tray's All to: its step buttons after the "All to" label, and the tray's line (what it acts on, or its question).
const allTo = (root, tier) => {
    const group = elements(root).find(
        (node) => classes(node).includes("tabbed-list__tool-group") && /^All to/.test(text(node))
    );
    return elements(group).find((node) => node.nodeName === "button" && text(node).trim() === String(tier));
};
const trayLine = (root) => text(byClass(root, "tabbed-list__tools-label")[0]);
const answer = (root) => byClass(root, "tabbed-list__yes")[0];

test("card search: All to a tier that would lower cards asks in the tray, and lowers them on the answer", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 37;
    cards.mob1 = 74;
    const root = await openPage(CARDS);
    const before = cardWrites();
    await press(allTo(root, 1));
    assert.equal(trayLine(root), "Lower 2 cards to tier 1?", "it asks");
    assert.equal(cardWrites(), before, "nothing written");

    await press(answer(root));
    await until(() => cards.mob0 === 6 && cards.mob1 === 6, "the cards to come down to tier 1");
    assert.equal(trayLine(root), "All 2 cards in Blunder Hills");
});

test("card search: All to a tier that only raises runs on one press", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 0;
    cards.mob1 = 0;
    const root = await openPage(CARDS);
    await press(allTo(root, 2));
    await until(() => cards.mob0 === 21 && cards.mob1 === 21, "the cards to reach tier 2");
    assert.equal(trayLine(root), "All 2 cards in Blunder Hills", "it didn't ask");
});

test("card search: a card's tier pick sets its amount to the tier's least", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 0;
    const root = await openPage(CARDS);
    const row = byClass(root, "account-row")[0];
    const tier = (n) => elements(row).find((node) => node.nodeName === "button" && text(node).trim() === String(n));
    await press(tier(3));
    await until(() => cards.mob0 === 46, "the amount to become tier 3's least");
    assert.equal(text(byClass(row, "account-row__note")[0]), "Next tier at 126");
});

test("card search: a refused All to says why on the tray's line, and the next press clears it", async () => {
    const cards = gga.Cards[0].h;
    cards.mob0 = 0;
    cards.mob1 = 0;
    const root = await openPage(CARDS);
    const restore = refuseWrites(cards, "mob0");
    try {
        await press(allTo(root, 4));
        await until(() => trayLine(root) === "Game kept old value.", "the reason");
    } finally {
        restore();
    }
    await press(allTo(root, 4));
    await until(() => trayLine(root) === "All 2 cards in Blunder Hills", "the retry to clear it");
});

const BUNDLES = "src/ui/pages/account/bundles/bundles.js";
// A bundle is a switch: on is owned. A flip buys it (on) or marks it not received (off).
const switchOf = (row) => elements(row).find((node) => node.attributes.role === "switch");
const isOn = (row) => {
    const checked = switchOf(row).attributes.checked;
    return Boolean(typeof checked === "function" ? checked() : checked);
};
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
// What a single flip says: the switch's word, or why its flip failed.
const switchWords = (row) => text(byClass(row, "state-switch__words")[0]);
// A row owned ("Unbuy" could take it away) or not ("Buy" could buy it), as the tests named them before the switch.
const rowWith = (root, label) =>
    byClass(root, "bundle-row").find((row) => (label === "Unbuy" ? isOn(row) : !isOn(row)));
// Why a Buy all left a bundle without it, on the row's line under its name.
const rowReason = (row) => text(byClass(row, "bundle-row__said")[0]);
// Buy all, in the tray; the tray's line says how many bundles it acts on and how many are owned, or its question.
const buyAllOf = (root) => button(root, "Buy all");
const buyable = (root) => {
    const [, total, owned] = /(\d+) (?:matching )?bundles? · (\d+) owned/.exec(trayLine(root)) ?? [];
    return Number(total) - Number(owned);
};
const pressBuyAll = (root) => buyAllOf(root).listeners.click({ preventDefault() {}, currentTarget: buyAllOf(root) });
const answerYes = (root) => byClass(root, "tabbed-list__yes")[0].listeners.click({});

const ownedFlag = (row) => row.attributes["data-code"];

test("bundles: a refused switch-off says why on its switch, once, and the next try clears it", async () => {
    const root = await openPage(BUNDLES);
    const row = rowWith(root, "Unbuy");
    const received = gga.BundlesReceived.h;
    const restore = refuseWrites(received, ownedFlag(row));
    try {
        await flip(row, false);
        assert.equal(switchWords(row), "game kept old value");
        assert.equal(rowReason(row), "", "said once: on the switch, not again under the name");
    } finally {
        restore();
    }
    await flip(row, false);
    assert.equal(switchWords(row), "", "the retry cleared it");
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
        await flip(row, true);
        // The switch says why (until the read after the failure shows it owned, which takes the reason away).
        assert.ok(["the game is busy", "Owned"].includes(switchWords(row)));
        await until(() => isOn(row), "the row to show the bundle owned");
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
        await flip(row, false);
        await until(() => !isOn(row), "the row to show the bundle not owned");
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
        await flip(row, false);
        await until(() => held, "the read after the failure");
        received[code] = 0; // the player gives it back in game
        await button(root, "Refresh").listeners.click({});
        await until(() => !isOn(row), "the Refresh to show it not owned");
        release();
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.ok(!isOn(row), "the older read didn't put Unbuy back");
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
    await until(() => isOn(second), "the second bundle to show owned");
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
        await flip(first, false);
        await until(() => held, "the read after the first failure");
        await flip(second, false);
        release();
        await until(() => !isOn(second), "the second bundle to show not owned");
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
    await until(() => isOn(second), "the second bundle to show owned");
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
        await flip(first, false);
        await until(() => held, "the read after the failure");
        await flip(second, false); // lands
        assert.ok(!isOn(second));
        release();
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.ok(!isOn(second), "the older read didn't put Unbuy back");
    } finally {
        globalThis.fetch = realFetch;
        release();
        received[code] = 0;
        received[ownedFlag(first)] = 1;
    }
});

test("bundles: Buy all ends when its ownership poll fails after another read showed a bundle owned", async () => {
    const root = await openPage(BUNDLES);
    const count = buyable(root) - 1; // Robot Pack isn't out yet, so Buy all leaves it out
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
        await pressBuyAll(root); // asks in the tray first
        void answerYes(root);
        await until(() => /Some bundles didn't arrive/.test(trayLine(root)), "Buy all to end and say why");
    } finally {
        globalThis.fetch = realFetch;
        // Every bundle back as it was, the ones this test bought first included.
        for (const code of Object.keys(received)) received[code] = before[code] ?? 0;
    }
});

test("bundles: a flip whose buy fails says why on its switch; Buy all says why on the row's line and the tray's", async () => {
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
        await flip(row, true);
        assert.equal(switchWords(row), "the cheat didn't run");
        assert.equal(rowReason(row), "", "a single flip isn't said twice");

        await pressBuyAll(root); // asks in the tray first
        await answerYes(root);
        await until(() => /Some bundles didn't arrive/.test(trayLine(root)), "Buy all to say why");
        assert.equal(rowReason(row), "the cheat didn't run");
    } finally {
        globalThis.fetch = realFetch;
    }
});

// Robot Pack (bon_q) isn't sold yet: the game has no picture for it and buying gives nothing.
test("bundles: Robot Pack says Not out yet, can't be switched on, and Buy all leaves it out", async () => {
    const root = await openPage(BUNDLES);
    const robot = () => byClass(root, "bundle-row").find((row) => row.attributes["data-code"] === "bon_q");
    await until(() => robot(), "the Robot Pack row");
    assert.equal(isOn(robot()), false);
    assert.equal(switchWords(robot()), "Not out yet");
    const locked = switchOf(robot()).attributes.disabled;
    assert.ok(typeof locked === "function" ? locked() : locked, "its switch is locked");

    const notOwned = buyable(root);
    pressBuyAll(root);
    await until(() => /^Buy \d+ bundles?\?/.test(trayLine(root)), "Buy all to ask");
    assert.equal(Number(/^Buy (\d+)/.exec(trayLine(root))[1]), notOwned - 1, "Buy all asks for every pack but Robot");
});

// A pack's picture comes from the player's running game, the name small under it; the fake game has none.
const pictureOf = (row) => elements(row).find((node) => node.nodeName === "img");
const bundleRow = (root, code) => byClass(root, "bundle-row").find((row) => row.attributes["data-code"] === code);

test("bundles: without pictures from the game every row shows just its name, as before", async () => {
    const root = await openPage(BUNDLES);
    const rows = byClass(root, "bundle-row");
    assert.equal(rows.filter(pictureOf).length, 0, "no row asks for a picture");
    assert.equal(text(byClass(bundleRow(root, "bun_a"), "account-row__name")[0]), "Lava Supporter Pack");
});

test("bundles: a pack the game has a picture of shows it above its name; one that doesn't load leaves the name", async () => {
    const catalog = game.page.getBundleCatalog;
    // The real game's catalog: every pack's picture is loaded, but Robot Pack's, which the game hasn't got.
    game.page.getBundleCatalog = () => catalog().map((bundle) => ({ ...bundle, picture: !bundle.notOutYet }));
    try {
        const root = await openPage(BUNDLES);
        const lava = bundleRow(root, "bun_a");
        const picture = pictureOf(lava);
        assert.ok(picture, "the Lava Supporter Pack row has its picture");
        assert.equal(picture.attributes.src, "/api/game/bundle-picture?code=bun_a");
        assert.equal(picture.attributes.alt, "", "the name says it, so the picture stays quiet for screen readers");
        const group = byClass(lava, "account-row__name-group")[0];
        const [first, name] = group.childNodes.filter((node) => node?.nodeType === 1);
        assert.equal(first, picture, "the picture comes first");
        assert.equal(text(name), "Lava Supporter Pack", "the name sits under it");
        assert.equal(pictureOf(bundleRow(root, "bon_q")), undefined, "Robot Pack has no picture to ask for");
        assert.equal(switchWords(bundleRow(root, "bon_q")), "Not out yet");

        picture.onerror(); // the game closed, or wouldn't hand it over: a 404
        assert.equal(picture.hidden, true);
        assert.equal(text(name), "Lava Supporter Pack");
    } finally {
        game.page.getBundleCatalog = catalog;
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

test("bundles: a pack the game didn't give says the free slots it needs, not a time-out", async () => {
    const received = gga.BundlesReceived.h;
    const before = received.bun_b;
    received.bun_b = 0; // an earlier test's Buy all bought it
    const root = await openPage(BUNDLES);
    const row = byClass(root, "account-row").find((node) => ownedFlag(node) === "bun_b");
    const realFetch = globalThis.fetch;
    const realTimeout = globalThis.setTimeout;
    // The game takes the buy but drops the pack, so it is never received.
    globalThis.fetch = async (url, options) =>
        String(url).includes("/toggle")
            ? new Response(JSON.stringify({ ok: true, message: "bun_b has been sent!" }), {
                  headers: { "content-type": "application/json" },
              })
            : realFetch(url, options);
    globalThis.setTimeout = (fn, ms, ...args) => realTimeout(fn, ms >= 1000 ? 0 : ms, ...args); // the poll's waits
    try {
        await flip(row, true);
        assert.equal(switchWords(row), "Needs 3 free inventory slots.");
    } finally {
        globalThis.fetch = realFetch;
        globalThis.setTimeout = realTimeout;
        received.bun_b = before;
    }
});

// #28: the count and Buy all covered every bundle, whatever the top bar's search showed.
test("bundles: the count and Buy all follow the top bar's search, and a search changed while it asks drops the question", async () => {
    const { searchHits } = await importRepo("src/ui/menu/pageSearch.js");
    const root = await openPage(BUNDLES);
    const received = gga.BundlesReceived.h;
    // The top bar's search leaves the rows whose code matches (null: not searching).
    const typeSearch = (value) =>
        (searchHits.val = value
            ? new Set(byClass(root, "account-row").filter((row) => ownedFlag(row).includes(value)))
            : null);
    const codes = byClass(root, "bundle-row").map(ownedFlag);
    const notOwned = codes.filter((code) => !received[code]);
    assert.ok(notOwned.length >= 2, "the fixture has two bundles to buy");
    const [first, second] = notOwned;
    const allBuyable = buyable(root);

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
        await until(() => trayLine(root) === "1 matching bundle · 0 owned", "the tray to count the one bundle shown");

        typeSearch("no bundle is called this");
        await until(() => buyable(root) === 0, "the tray to count nothing");
        assert.equal(buyAllOf(root).attributes["aria-disabled"], "true", "nothing shown, nothing to buy");

        typeSearch("");
        await until(() => buyable(root) === allBuyable, "a cleared search to count every bundle again");

        // Asked about the first, then the search moved on: the question goes, and the next press asks about the second.
        typeSearch(first);
        await until(() => buyable(root) === 1, "the first bundle alone");
        await pressBuyAll(root);
        assert.match(trayLine(root), /^Buy 1 bundle\?/);
        typeSearch(second);
        await until(() => trayLine(root) === "1 matching bundle · 0 owned", "the question to go with the search");
        assert.deepEqual(bought, [], "a changed search buys nothing");
        await pressBuyAll(root);
        await answerYes(root);
        await until(() => bought.length === 1 && buyable(root) === 0, "the second bundle bought");
        assert.deepEqual(bought, [second], "only the bundle shown when it was asked");
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
    assert.match(warning(), /Some values may have saved/);
});

test("upgrade vault: a failed Max all says why on the tray's line until the next press", async () => {
    const root = await openPage(VAULT);
    const maxAll = button(root, "Max all");
    const line = () => text(byClass(root, "tabbed-list__tools-label")[0]);
    gga.UpgVault[0] = 0;
    const restore = refuseWrites(gga.UpgVault, 0);
    try {
        await maxAll.listeners.click({ preventDefault() {}, currentTarget: maxAll });
        await until(() => line() === "Game kept old value.", "Max all to fail");
        await until(() => classes(maxAll).includes("account-btn--error"), "the button to show the failure");
        await until(() => !classes(maxAll).includes("account-btn--error"), "the button's failure to fade");
        assert.equal(line(), "Game kept old value.", "it stays");
    } finally {
        restore();
    }
    await maxAll.listeners.click({ preventDefault() {}, currentTarget: maxAll });
    await until(() => line() === "All 30 vault upgrades", "the retry to save");
});

// #28: a vault level is typed up to its real max (the max was only a note before).
test("upgrade vault: a level typed above its real max is refused beside the field and writes nothing", async () => {
    const root = await openPage(VAULT);
    const row = byClass(root, "account-row")[1]; // its real max is 20 on the fake game
    const before = gga.UpgVault[1];
    const writesBefore = requests.filter((entry) => /write/.test(entry)).length;
    await saveRow(row, 21);
    assert.match(saveState(row), /save-state--error/);
    assert.equal(words(row), "max 20");
    assert.equal(gga.UpgVault[1], before);
    assert.equal(requests.filter((entry) => /write/.test(entry)).length, writesBefore, "nothing written");
});

test("bubba: an upgrade's level saves and clears the game's cached level total after it", async () => {
    const root = await openPage("src/ui/pages/account/clickers/3-bubba.js");
    const row = byClass(root, "value-row")[0];
    const levelField = byClass(row, "number-input-wrapper")
        .map((wrapper) => elements(wrapper).find((node) => node.nodeName === "input"))
        .find(Boolean);
    const since = requests.length;
    levelField.value = "3";
    levelField.listeners.input({ target: levelField });
    row.listeners.keydown({ key: "Enter", target: levelField, preventDefault() {} });
    await until(() => /save-state--(success|error)/.test(saveState(row)), "the save to finish");
    assert.match(saveState(row), /save-state--success/);
    assert.equal(gga.Bubba[1][0], 3);
    const after = requests.slice(since);
    const write = after.findIndex((entry) => /write/.test(entry));
    assert.ok(
        write >= 0 && after.slice(write).some((entry) => /gga\/delete/.test(entry)),
        "the cache clear follows the write"
    );
});

test("task board: picking a world shows that world's tasks, achievements and merit shop", async () => {
    const root = await openPage("src/ui/pages/account/task-board/tasks.js");
    const line = () => text(byClass(root, "tabbed-list__tools-label")[0]);
    assert.match(line(), /in World 1$/);
    const option = elements(byClass(root, "account-page-toolbar")[0]).find(
        (node) => node.attributes.role === "option" && node.attributes["data-id"] === "2"
    );
    option.listeners.click({});
    await until(() => /in World 3$/.test(line()), "the tray to follow the world");
    const row = byClass(root, "account-row")[0];
    const before = gga.Tasks[1][2][0];
    const next = before === 3 ? 1 : 3;
    await saveRow(row, next);
    assert.equal(gga.Tasks[1][2][0], next, "the third world's task saved");
    gga.Tasks[1][2][0] = before;
});
