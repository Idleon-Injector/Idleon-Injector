// The pieces a system's automation tab is built from (#92), beyond the Shops tab's: a pick row's own settings
// (priority, a pay-with choice), a system-wide setting (a saving %, a target) with its field, the page's read after
// every save, and Enable all / Disable all. Each save sends cheatConfig.automation[key] to the game and the file.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { fake, updates, text, byClass, row, field: numberField, saveState, settle, until, selected } = kit;
const tagged = kit.byTag;
const lastUpdate = kit.sent;
const lastSave = kit.fileSent;

const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const ui = await importRepo("src/ui/components/views/account/automation.js");
const { BulkActionBar } = await importRepo("src/ui/components/views/account/BulkActionBar.js");
const { div } = van.tags;

let reads = 0; // the page's reads after a save
const afterSave = async () => {
    reads++;
};
const PAY = {
    field: "payWith",
    title: "Pay with",
    options: [
        { value: null, label: "Materials" },
        { value: "particles", label: "Particles" },
    ],
};
const picks = ui.createAutomationPicks("shops", { afterSave });
const saving = ui.createAutomationSetting("testSaving", { afterSave });
const target = ui.createAutomationSetting("testTarget", { afterSave });
const perCurrency = ui.createAutomationSetting("testPerCurrency", { afterSave });
picks.sync([]);
saving.sync(10);
target.sync(90);
perCurrency.sync([5, 6]);
const page = div(
    ui.PickRow({
        picks,
        id: "0:item0",
        name: "Lucky Whisker",
        badge: "LV 1",
        detail: "Costs 5 coins",
        selects: [ui.PRIORITY, PAY],
    }),
    ui.PickRow({ picks, id: "1:item3", name: "Royal Pebble", badge: "LV 2" }),
    ui.SettingRow({ setting: saving, name: "Coins", title: "Saving %" }),
    ui.SettingRow({ setting: target, name: "Every bubble", title: "Raise to %", mode: "float", max: 99.9 }),
    ui.SettingRow({ setting: perCurrency, index: 1, name: "Second coin", title: "Saving %" })
);
const whisker = () => row(page, "Lucky Whisker");
const select = (title) => tagged(whisker(), "select").find((node) => node.attributes["aria-label"].endsWith(title));
const choose = async (title, index) => {
    const since = updates.length;
    select(title).listeners.change({ target: { value: String(index) } });
    await until(() => updates.length > since, `the ${title} save`);
    await ui.inTurn(() => {});
    await settle();
};
const type = async (name, value) => {
    const node = row(page, name);
    const input = numberField(node);
    input.listeners.input({ target: { value } });
    const since = updates.length;
    byClass(node, "account-field-metric")[0].listeners.keydown({ key: "Enter", target: input, preventDefault() {} });
    await until(() => updates.length > since || /save-state--error/.test(saveState(node)), `${name}'s save`);
    await ui.inTurn(() => {});
    await settle();
};

test("a pick row shows its lines under the name and its picks beside the stop-at", () => {
    assert.match(text(whisker()), /Costs 5 coins/);
    assert.deepEqual(
        tagged(select("save for it"), "option").map(text),
        ["No", "Yes"],
        "Save for it: off is the default"
    );
    assert.equal(selected(select("save for it")), "No", "nothing picked yet shows the default");
    assert.ok(select("pay with"));
    assert.equal(tagged(row(page, "Royal Pebble"), "select").length, 0, "a row without selects has none");
});

test("a priority saves on the item with the rest of the list, and the page reads the game after it", async () => {
    const before = reads;
    await choose("save for it", 1);
    assert.deepEqual(lastUpdate("shops"), [{ id: "0:item0", on: false, save: true }], "kept while switched off");
    assert.deepEqual(lastSave("shops"), lastUpdate("shops"), "the file gets the same list");
    assert.equal(picks.field("0:item0", "save").val, true);
    assert.ok(reads > before, "the page's read ran after the save");
});

test("another setting and a switch keep the item's priority; the default is left out", async () => {
    await choose("pay with", 1);
    assert.deepEqual(lastUpdate("shops"), [{ id: "0:item0", on: false, save: true, payWith: "particles" }]);
    await choose("save for it", 0); // No, the default
    assert.deepEqual(lastUpdate("shops"), [{ id: "0:item0", on: false, payWith: "particles" }]);
    await choose("pay with", 0); // Materials, the default
    assert.deepEqual(lastUpdate("shops"), [], "a switched-off item with no setting left drops out");
});

test("a read of the list keeps every setting an item carries", async () => {
    picks.sync([{ id: "0:item0", on: true, save: true, payWith: "particles", stopAt: 4 }]);
    assert.equal(picks.field("0:item0", "save").val, true);
    assert.equal(numberField(whisker()).value ?? picks.get("0:item0").draft.val, "4");
    await choose("pay with", 0);
    assert.deepEqual(lastUpdate("shops"), [{ id: "0:item0", on: true, save: true, stopAt: 4 }]);
});

test("a refused pick goes back to what the game holds and says why at the row", async () => {
    fake.refuseUpdates = true;
    try {
        await choose("save for it", 0);
    } finally {
        fake.refuseUpdates = false;
    }
    await until(() => /save-state--error/.test(saveState(whisker())), "the row to say the save failed");
    assert.equal(picks.field("0:item0", "save").val, true, "still saved for, as the game holds");
    assert.match(text(whisker()), /the game is busy/);
});

test("a saving % saves on Enter, to the game and the file, and the page reads after it", async () => {
    const before = reads;
    await type("Coins", "25");
    assert.equal(lastUpdate("testSaving"), 25);
    assert.equal(lastSave("testSaving"), 25);
    assert.equal(saving.get().value.val, 25);
    assert.ok(reads > before);
});

test("a saving % above 100, or empty, is refused at the field without a save", async () => {
    for (const typed of ["101", ""]) {
        const since = updates.length;
        await type("Coins", typed);
        assert.equal(updates.length, since, `${JSON.stringify(typed)} isn't sent`);
        assert.match(text(row(page, "Coins")), /a whole number from 0 to 100/);
    }
    assert.equal(saving.get().value.val, 25, "the saved value stands");
});

test("a target with one decimal saves; two decimals or above its max are refused", async () => {
    await type("Every bubble", "92.5");
    assert.equal(lastUpdate("testTarget"), 92.5);
    for (const typed of ["92.55", "100"]) {
        const since = updates.length;
        await type("Every bubble", typed);
        assert.equal(updates.length, since);
        assert.match(text(row(page, "Every bubble")), /a number from 0 to 99.9, with one decimal at most/);
    }
});

test("a setting by index changes only its own place in the list", async () => {
    await type("Second coin", "40");
    assert.deepEqual(lastUpdate("testPerCurrency"), [5, 40]);
});

test("a refused setting goes back to what the game holds and says why", async () => {
    fake.refuseUpdates = true;
    try {
        await type("Coins", "30");
    } finally {
        fake.refuseUpdates = false;
    }
    assert.equal(saving.get().value.val, 25);
    assert.match(text(row(page, "Coins")), /the game is busy/);
    await type("Coins", "30");
    assert.equal(lastUpdate("testSaving"), 30, "the next try saves");
    assert.doesNotMatch(text(row(page, "Coins")), /the game is busy/, "and the failure goes");
});

test("Enable all switches every listed item on in one save; Disable all asks first", async () => {
    const waiting = ui.useStillWaiting();
    const ids = ["0:item0", "1:item3"];
    const bulk = ui.usePicksBulk({
        targets: () => [[picks, ids]],
        done: (on, total) => on === total,
        noun: (n) => `${n} items`,
        waiting,
    });
    const [enable, disable] = bulk.actions(() => false);
    const before = reads;
    await enable.onClick();
    assert.deepEqual(
        lastUpdate("shops").map(({ id, on }) => [id, on]),
        [
            ["0:item0", true],
            ["1:item3", true],
        ]
    );
    assert.ok(reads > before, "the page reads after a bulk save too");
    assert.equal(enable.disabled(), true, "nothing left to switch on");
    assert.equal(disable.confirm(), "switch off 2 items.");
    // Through the button the player clicks: the first click only asks.
    const bar = BulkActionBar({ actions: bulk.actions(() => false) });
    const button = tagged(bar, "button").find((node) => text(node).trim() === "Disable all");
    const since = updates.length;
    await button.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(updates.length, since, "the first Disable all click saves nothing");
    assert.equal(button.attributes["data-again"], "Click again");
    await button.listeners.click({ preventDefault() {} });
    await until(() => updates.length > since, "the second click's save");
    await ui.inTurn(() => {});
    await settle();
    assert.deepEqual(
        lastUpdate("shops").map(({ id, on }) => [id, on]),
        [["0:item0", false]],
        "the item that carries settings stays, switched off"
    );
});

test("Enable all queues every target's save at the click, so a row edit made after it lands last", async () => {
    const other = ui.createAutomationPicks("testOther");
    other.sync([]);
    const waiting = ui.useStillWaiting();
    const bulk = ui.usePicksBulk({
        targets: () => [
            [picks, ["0:item0"]],
            [other, ["a", "b"]],
        ],
        done: () => false,
        noun: (n) => `${n} items`,
        waiting,
    });
    const since = updates.length;
    const click = bulk.actions(() => false)[0].onClick();
    const edit = picks.set("0:item0", { stopAt: 9 }); // clicked right after Enable all
    await Promise.all([click, edit]);
    const keys = updates.slice(since).map((body) => Object.keys(body.cheatConfig.automation)[0]);
    assert.deepEqual(keys, ["shops", "testOther", "shops"]);
    assert.equal(lastUpdate("shops")[0].stopAt, 9);
});

test("while a bulk save reached the game but not the file, Enable all and Disable all stay to save it again", async () => {
    const waiting = ui.useStillWaiting();
    const ids = ["0:item0", "1:item3"];
    const bulk = ui.usePicksBulk({
        targets: () => [[picks, ids]],
        done: (on, total) => on === total,
        noun: (n) => `${n} items`,
        waiting,
    });
    const [enable, disable] = bulk.actions(() => false);
    fake.failSave = true;
    try {
        await enable.onClick();
    } finally {
        fake.failSave = false;
    }
    assert.equal(picks.fileBehind(), true);
    assert.equal(enable.disabled(), false, "every item is on, but the file doesn't have it yet");
    await enable.onClick();
    assert.equal(picks.fileBehind(), false);
    assert.equal(enable.disabled(), true);
    assert.equal(disable.disabled(), false);
});

test("the tab's read after a refused save doesn't take the server's copy of the refused edit", async () => {
    const reads = [];
    const tab = ui.useAutomationTab({
        label: "Test automation",
        cheats: [],
        read: async (automation) => {
            reads.push(automation.testTabSaving);
            tabSaving.sync(automation.testTabSaving);
        },
    });
    const tabSaving = ui.createAutomationSetting("testTabSaving", { afterSave: tab.afterSave });
    await tab.load();
    await tabSaving.set(null, 10); // the game holds 10
    const before = reads.length;
    fake.refuseUpdates = true;
    fake.serverCopyOnly = true;
    try {
        await tabSaving.set(null, 55).catch(() => {});
    } finally {
        fake.refuseUpdates = false;
        fake.serverCopyOnly = false;
    }
    assert.equal(reads.length, before, "the server's copy isn't read into the tab");
    assert.equal(tabSaving.get().value.val, 10, "the game's value stands");
});

test("before the first read of the game, a save or a bulk save sends nothing and says to refresh", async () => {
    const unread = ui.createAutomationPicks("testUnread");
    const unreadSaving = ui.createAutomationSetting("testUnreadSaving");
    const since = updates.length;
    await assert.rejects(unread.setAll(["a"], true), /not read from the game yet: press Refresh/);
    await assert.rejects(unreadSaving.set(1, 5), /not read from the game yet/);
    assert.equal(updates.length, since, "nothing overwrote what the game holds");
    assert.equal(unread.get("a").on.val, false, "the click doesn't stay shown");

    const bulk = ui.usePicksBulk({
        targets: () => [[unread, []]], // a page whose read failed has no rows
        done: (on, total) => on === total,
        noun: (n) => `${n} items`,
        waiting: ui.useStillWaiting(),
    });
    const [enable, disable] = bulk.actions(() => false);
    assert.equal(enable.disabled(), true);
    assert.equal(disable.disabled(), true);
});

test("a tab whose first read only reaches the server's copy reads nothing in and can't save over the game", async () => {
    const reads = [];
    const tab = ui.useAutomationTab({
        label: "Test automation",
        cheats: [],
        read: async (automation) => {
            reads.push(automation);
            lateSaving.sync(automation.testLateSaving);
        },
    });
    const lateSaving = ui.createAutomationSetting("testLateSaving", { afterSave: tab.afterSave });
    fake.serverCopyOnly = true;
    try {
        await tab.load();
    } finally {
        fake.serverCopyOnly = false;
    }
    assert.equal(reads.length, 0, "the server's copy isn't taken as what the game holds");
    assert.match(tab.error.val, /the game didn't answer with its settings: press Refresh/);
    const since = updates.length;
    await assert.rejects(lateSaving.set(1, 5), /not read from the game yet/);
    assert.equal(updates.length, since);
    await tab.load();
    assert.equal(reads.length, 1, "Refresh reads the game");
    assert.equal(tab.error.val, null);
});

test("after a save the game didn't answer and nothing read back, the next save waits for a read", async () => {
    const unsure = ui.createAutomationSetting("testUnsure");
    await unsure.set(null, 0).catch(() => {}); // not read yet: refused
    unsure.sync([5, 6]);
    fake.dropNextUpdate = true;
    fake.failConfigReads = 1;
    await assert.rejects(unsure.set(0, 10), /connection dropped|500|error/i);
    const since = updates.length;
    await assert.rejects(unsure.set(1, 40), /not read from the game yet: press Refresh/);
    assert.equal(updates.length, since, "the untouched 10 the game may hold isn't sent back as 5");
    unsure.sync([10, 6]); // a read (Refresh) of what the game holds
    await unsure.set(1, 40);
    assert.deepEqual(lastUpdate("testUnsure"), [10, 40]);
});

test("after a save the game didn't answer, a read-back of only the server's copy doesn't let the next save through", async () => {
    const unsure = ui.createAutomationSetting("testUnsureServer");
    unsure.sync([5, 6]);
    fake.dropNextUpdate = true;
    fake.serverCopyOnly = true;
    try {
        await assert.rejects(unsure.set(0, 10), /connection dropped|500|error/i);
    } finally {
        fake.serverCopyOnly = false;
    }
    const since = updates.length;
    await assert.rejects(unsure.set(1, 40), /not read from the game yet: press Refresh/);
    assert.equal(updates.length, since);
});

test("the picks too: after a save the game didn't answer, the next save waits for a read of the game", async () => {
    for (const reachesServerOnly of [false, true]) {
        const unsure = ui.createAutomationPicks("testUnsurePicks");
        unsure.sync([{ id: "a", on: false, stopAt: 5 }]);
        fake.dropNextUpdate = true;
        if (reachesServerOnly) fake.serverCopyOnly = true;
        else fake.failConfigReads = 1;
        try {
            await assert.rejects(unsure.set("a", { stopAt: 10 }), /connection dropped|500|error/i);
        } finally {
            fake.serverCopyOnly = false;
            fake.failConfigReads = 0;
        }
        const since = updates.length;
        await assert.rejects(unsure.set("b", { on: true }), /not read from the game yet: press Refresh/);
        assert.equal(
            updates.length,
            since,
            `nothing sent (read-back: ${reachesServerOnly ? "server copy" : "failed"})`
        );
        unsure.sync([{ id: "a", on: false, stopAt: 10 }]); // a read of the game
        await unsure.set("b", { on: true });
        assert.deepEqual(lastUpdate("testUnsurePicks"), [
            { id: "a", on: false, stopAt: 10 },
            { id: "b", on: true },
        ]);
    }
});

test("a page read that throws at once after a refused save leaves the save's own reason", async () => {
    const throwing = ui.createAutomationSetting("testThrowingRead", {
        afterSave: () => {
            throw new Error("the page's read broke");
        },
    });
    throwing.sync(5);
    fake.refuseUpdates = true;
    try {
        await assert.rejects(throwing.set(null, 7), /the game is busy/);
    } finally {
        fake.refuseUpdates = false;
    }
});

test("a row switch waiting behind its own stop-at save doesn't undo a Disable all clicked after it", async () => {
    picks.sync([{ id: "1:item3", on: false }]);
    const pebble = row(page, "Royal Pebble");
    const bulk = ui.usePicksBulk({
        targets: () => [[picks, ["1:item3"]]],
        done: () => false,
        noun: (n) => `${n} items`,
        waiting: ui.useStillWaiting(),
    });
    let release;
    fake.holdUpdates = new Promise((resolve) => (release = resolve));
    const since = updates.length;
    try {
        const input = numberField(pebble);
        input.listeners.input({ target: { value: "3" } });
        byClass(pebble, "account-field-metric")[0].listeners.keydown({
            key: "Enter",
            target: input,
            preventDefault() {},
        });
        await until(() => updates.length > since, "the stop-at save to reach the game");
        const box = tagged(pebble, "input").find((node) => node.attributes.type === "checkbox");
        box.listeners.change({ target: { checked: true } }); // waits behind the stop-at save
        void bulk.actions(() => false)[1].onClick(); // Disable all, clicked after
    } finally {
        fake.holdUpdates = null;
        release();
    }
    await until(() => !bulk.busy(), "Disable all to end");
    await ui.inTurn(() => {});
    await ui.inTurn(() => {});
    await settle();
    assert.equal(lastUpdate("shops").find(({ id }) => id === "1:item3")?.on ?? false, false, "Disable all wins");
});
