// The pieces a system's automation tab is built from (#92), beyond the Shops tab's: a pick row's own settings
// ("Save for it", a pay-with choice), a system-wide setting (a saving %, a target) with its field, the page's read after
// every save, and Enable all / Disable all. Each save sends cheatConfig.automation[key] to the game and the file.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo } from "./known-bugs/index.mjs";
import { automationTabKit } from "./automation-tab-kit.mjs";

const kit = await automationTabKit();
const { fake, updates, text, byClass, row, field: numberField, saveState, settle, until, selected } = kit;
const { saveSwitch } = kit;
const tagged = kit.byTag;
const lastUpdate = kit.sent;
const lastSave = kit.fileSent;

const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const ui = await importRepo("src/ui/components/views/account/automation.js");
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
        detail: "Costs 5 coins",
        values: [{ name: "Level", text: "1" }],
        selects: [PAY],
        save: true,
    }),
    ui.PickRow({ picks, id: "1:item3", name: "Royal Pebble", values: [{ name: "Level", text: "2" }] }),
    ui.SettingRow({ setting: saving, name: "Coins", title: "Saving %" }),
    ui.SettingRow({ setting: target, name: "Every bubble", title: "Raise to %", mode: "float", max: 99.9 }),
    ui.SettingRow({ setting: perCurrency, index: 1, name: "Second coin", title: "Saving %" })
);
const whisker = () => row(page, "Lucky Whisker");
const picker = (title) =>
    byClass(whisker(), "step-picker").find((node) => node.attributes["aria-label"].endsWith(title));
const choose = async (title, index) => {
    const since = updates.length;
    tagged(picker(title), "button")[index].listeners.click({});
    await until(() => updates.length > since, `the ${title} save`);
    await ui.inTurn(() => {});
    await settle();
};
const flipSave = async (on) => {
    const since = updates.length;
    saveSwitch(whisker()).listeners.change({ target: { checked: on } });
    await until(() => updates.length > since, "the save-for-it save");
    await ui.inTurn(() => {});
    await settle();
};
// A list's tray tools (Enable all, Disable all), with the question Disable all asks caught instead of shown.
const trayOf = (bulk) => {
    let asked = null;
    const node = bulk.tools((question) => (asked = question));
    const [enable, disable] = tagged(node, "button");
    const press = async (button) => {
        await button.listeners.click({ preventDefault() {} });
        await until(() => !bulk.busy(), "the bulk save");
        await ui.inTurn(() => {});
        await settle();
    };
    return { enable, disable, asked: () => asked, press };
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

test("a pick row shows its lines under the name, its values, its picks and its Save for it switch", () => {
    assert.match(text(whisker()), /Costs 5 coins/);
    assert.deepEqual(tagged(picker("pay with"), "button").map(text), ["Materials", "Particles"]);
    assert.equal(selected(picker("pay with")), "Materials", "nothing picked yet shows the default");
    assert.equal(saveSwitch(whisker()).checked ?? false, false);
    assert.equal(byClass(row(page, "Royal Pebble"), "step-picker").length, 0, "a row without selects has none");
    assert.equal(saveSwitch(row(page, "Royal Pebble")), undefined, "nor a Save for it switch unless asked");
});

test("Save for it saves on the item with the rest of the list, and the page reads the game after it", async () => {
    const before = reads;
    await flipSave(true);
    assert.deepEqual(lastUpdate("shops"), [{ id: "0:item0", on: false, save: true }], "kept while switched off");
    assert.deepEqual(lastSave("shops"), lastUpdate("shops"), "the file gets the same list");
    assert.equal(picks.field("0:item0", "save").val, true);
    assert.ok(reads > before, "the page's read ran after the save");
});

test("another setting and a switch keep the item's Save for it; off is the default and left out", async () => {
    await choose("pay with", 1);
    assert.deepEqual(lastUpdate("shops"), [{ id: "0:item0", on: false, save: true, payWith: "particles" }]);
    await flipSave(false);
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
        await flipSave(false);
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

test("Enable all switches every listed item on in one save; Disable all asks in the tray first", async () => {
    const waiting = ui.useStillWaiting();
    const ids = ["0:item0", "1:item3"];
    const bulk = ui.usePicksBulk({
        targets: () => [[picks, ids]],
        done: (on, total) => on === total,
        words: ["item", "items"],
        waiting,
    });
    const { enable, disable, asked, press } = trayOf(bulk);
    assert.equal(bulk.label(), "All 2 items", "the tray's line says what the tools act on");
    const before = reads;
    await press(enable);
    assert.deepEqual(
        lastUpdate("shops").map(({ id, on }) => [id, on]),
        [
            ["0:item0", true],
            ["1:item3", true],
        ]
    );
    assert.ok(reads > before, "the page reads after a bulk save too");
    assert.equal(enable.attributes.disabled, true, "nothing left to switch on");
    // Disable all only asks; the change waits for the answer.
    const since = updates.length;
    await disable.listeners.click({ preventDefault() {} });
    await settle();
    assert.equal(updates.length, since, "asking saves nothing");
    assert.equal(asked().question, "Disable 2 items?");
    assert.equal(asked().confirmLabel, "Disable them");
    await asked().onConfirm();
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
        words: ["item", "items"],
        waiting,
    });
    const since = updates.length;
    const click = trayOf(bulk).press(trayOf(bulk).enable);
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
        words: ["item", "items"],
        waiting,
    });
    const { enable, disable, press } = trayOf(bulk);
    fake.failSave = true;
    try {
        await press(enable);
    } finally {
        fake.failSave = false;
    }
    assert.equal(picks.fileBehind(), true);
    assert.equal(enable.attributes.disabled, false, "every item is on, but the file doesn't have it yet");
    await press(enable);
    assert.equal(picks.fileBehind(), false);
    assert.equal(enable.attributes.disabled, true);
    assert.equal(disable.attributes.disabled, false);
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
        words: ["item", "items"],
        waiting: ui.useStillWaiting(),
    });
    const { enable, disable } = trayOf(bulk);
    assert.equal(enable.attributes.disabled, true);
    assert.equal(disable.attributes.disabled, true);
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
        words: ["item", "items"],
        waiting: ui.useStillWaiting(),
    });
    const tray = trayOf(bulk);
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
        tray.disable.listeners.click({ preventDefault() {} }); // Disable all, pressed after...
        void tray.asked()?.onConfirm(); // ...and answered (the row's switch counts as on while it waits)
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

// CodeRabbit on #209: a group the page search left with no rows doesn't send its whole list again.
test("a bulk save skips a group the search left empty, unless its file still lacks its last save", async () => {
    const empty = ui.createAutomationPicks("testEmptyGroup");
    empty.sync([{ id: "x", on: false }]);
    const sentFor = (since) => updates.slice(since).some((body) => "testEmptyGroup" in body.cheatConfig.automation);
    const bulk = ui.usePicksBulk({
        targets: () => [
            [empty, []],
            [picks, ["1:item3"]],
        ],
        done: () => false,
        words: ["item", "items"],
        waiting: ui.useStillWaiting(),
    });
    const { enable, press } = trayOf(bulk);
    const since = updates.length;
    await press(enable);
    assert.equal(sentFor(since), false, "nothing is sent for the group with no rows");

    // A file save that failed leaves the group behind: the next press saves it again.
    fake.failSave = true;
    try {
        await empty.set("x", { on: true }).catch(() => {});
    } finally {
        fake.failSave = false;
    }
    assert.equal(empty.fileBehind(), true);
    const again = updates.length;
    await press(enable);
    assert.equal(sentFor(again), true, "the group's list is saved again for the file");
    assert.equal(empty.fileBehind(), false);
});

// CodeRabbit on #209: the tray's answer isn't the Disable all button, so the outcome is said for screen readers.
test("a confirmed Disable all says its outcome for screen readers", async () => {
    const said = () =>
        kit
            .elements(globalThis.document.body)
            .filter((node) => node.attributes.role === "status")
            .map((node) => String(node.textContent ?? text(node)))
            .find((line) => line.startsWith("Disable all:"));
    const bulk = ui.usePicksBulk({
        targets: () => [[picks, ["1:item3"]]],
        done: () => false,
        words: ["item", "items"],
        waiting: ui.useStillWaiting(),
    });
    const tray = trayOf(bulk);
    for (const [refused, outcome] of [
        [false, "Disable all: done"],
        [true, "Disable all: failed"],
    ]) {
        await picks.set("1:item3", { on: true });
        await tray.disable.listeners.click({ preventDefault() {} });
        fake.refuseUpdates = refused;
        try {
            await tray.asked().onConfirm();
        } finally {
            fake.refuseUpdates = false;
        }
        assert.equal(said(), outcome);
    }
});
