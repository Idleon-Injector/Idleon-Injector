// The on/off switch (#26, PR #108 review): a flip is never lost, a refused save puts the switch back to what the game
// holds, a failed save says why once, on the switch, and a save that waits keeps the click that asked for it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "./known-bugs/index.mjs";
import { createFakeApi } from "./page-shots/fake-api.mjs";

const { router, game } = await createFakeApi();
await loadUi(router);
// Asking in place (Click again) draws on the next frame; the test DOM has no frames.
globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
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

// The game keeps the old value whatever is written there; `restore()` lets writes land again.
const refuseWrites = (list, index) => {
    const kept = list[index];
    Object.defineProperty(list, index, { get: () => kept, set() {}, configurable: true });
    return () => Object.defineProperty(list, index, { value: kept, writable: true, configurable: true });
};
// Hold the game's writes until released, to act while a save runs. `held()` counts the writes waiting.
const holdWrites = () => {
    const realFetch = globalThis.fetch;
    let release;
    let held = 0;
    const gate = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url, options) => {
        if (String(url).includes("/write")) {
            held++;
            await gate;
        }
        return realFetch(url, options);
    };
    const done = () => {
        globalThis.fetch = realFetch;
        release();
    };
    done.held = () => held;
    return done;
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
// What a row tells screen readers about its save, besides its switch's own words.
const rowStatusOf = (row) =>
    byClass(row, "account-write-feedback")
        .filter((node) => !classes(node.parentNode).includes("state-switch"))
        .map(text)
        .join("");
// The player flips the switch: the browser has already moved the box, then reports the change.
const flip = (row, on) => switchOf(row).listeners.change({ target: { checked: on } });
const click = (button) => button.listeners.click({ currentTarget: button, target: button, preventDefault() {} });
const buttonNamed = (root, name) => elements(root).find((node) => node.nodeName === "button" && text(node) === name);

// Flip `first` on, and once its write is waiting on the game, flip `second` on; then let the game answer.
const flipBothWhileFirstSaves = async (first, second) => {
    const release = holdWrites();
    try {
        const saves = [flip(first, true)];
        await until(() => release.held() > 0, "the first save to reach the game");
        saves.push(flip(second, true));
        release();
        await Promise.all(saves);
    } finally {
        release();
    }
};

const BRIBES = "src/ui/pages/world-1/bribes/bribes.js";
const bribes = () => game.gga.BribeStatus;
const resetBribes = () => bribes().splice(0, 4, 1, 1, 0, 0);

test("bribes: a switch flipped while another row saves still saves", async () => {
    try {
        resetBribes();
        const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Sleeping On the Job"));
        const second = rowNamed(root, "Sleeping On the Job");
        await flipBothWhileFirstSaves(rowNamed(root, "Mandatory Fire Sale"), second);
        assert.equal(bribes()[2], 1);
        assert.equal(bribes()[3], 1, "the second row's flip waited its turn instead of being dropped");
        assert.equal(wordsOf(second), "Owned");
    } finally {
        resetBribes();
    }
});

test("bribes: flipping one switch on and back off while it saves ends with the last flip saved", async () => {
    const release = holdWrites();
    try {
        resetBribes();
        const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Mandatory Fire Sale"));
        const row = rowNamed(root, "Mandatory Fire Sale");
        const save = flip(row, true);
        await until(() => release.held() > 0, "the first save to reach the game");
        await flip(row, false); // lands while the first save runs, so it waits for it
        release();
        await save;
        assert.equal(bribes()[2], 0, "the newest flip (off) is what the game holds");
        assert.equal(wordsOf(row), "Not owned");
    } finally {
        release();
        resetBribes();
    }
});

test("bribes: a refused save says why once, short, on the switch, and a later bulk save clears it", async () => {
    let restore = () => {};
    try {
        resetBribes();
        const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Mandatory Fire Sale"));
        const row = rowNamed(root, "Mandatory Fire Sale");
        restore = refuseWrites(bribes(), 2);
        await flip(row, true);
        assert.equal(wordsOf(row), "game kept old value", "the short reason, not the page's longer note");
        assert.equal(rowStatusOf(row), "", "the row doesn't also announce the failure");
        assert.equal(text(byClass(root, "write-status--error")[0]), "", "nor does the page");
        restore();
        restore = () => {};
        await click(buttonNamed(root, "Enable all"));
        await until(() => bribes()[2] === 1, "Enable all to land");
        await until(() => wordsOf(row) === "Owned", "the switch to show the game's state, not the old failure");
    } finally {
        restore();
        resetBribes();
    }
});

const KILLROY = "src/ui/pages/world-2/killroy/killroy.js";

test("killroy: a save the game doesn't keep says why on the switch, and the next flip clears it", async () => {
    let restore = () => {};
    try {
        ola[115] = 0;
        const root = await openPage(KILLROY, (root) => pageRead(root) && rowNamed(root, "AIRHORN RESET"));
        const row = rowNamed(root, "AIRHORN RESET");
        restore = refuseWrites(ola, 115);
        await flip(row, true);
        restore();
        restore = () => {};
        assert.equal(ola[115], 0);
        assert.equal(wordsOf(row), "game kept old value");
        assert.equal(switchOf(row).checked, false, "the switch shows what the game holds");
        await flip(row, true);
        assert.equal(ola[115], 1);
        assert.equal(wordsOf(row), "On", "a save that lands clears the reason");
    } finally {
        restore();
        ola[115] = 0;
    }
});

test("account options: a refused on/off save goes back, and says why once (in the row's save state)", async () => {
    const index = 690; // past the schema, so its row's editor follows the value: a switch
    let restore = () => {};
    try {
        ola[index] = true;
        const { AccountOptionsTab } = await importRepo("src/ui/components/views/account/AccountOptionsTab.js");
        const root = AccountOptionsTab();
        const optionRow = () => elements(root).find((node) => node.attributes["data-index"] === index);
        await until(() => optionRow() && switchOf(optionRow()), "Account Options to load");
        const row = optionRow();
        restore = refuseWrites(ola, index);
        await flip(row, false);
        assert.equal(ola[index], true);
        assert.equal(switchOf(row).checked, true, "the refused Off doesn't stay on screen");
        assert.equal(text(byClass(row, "save-state__label")[0]), "game kept old value");
        assert.equal(wordsOf(row), "On", "the switch doesn't say it a second time");
    } finally {
        restore();
        ola[index] = (index * 13) % 50;
    }
});

// Two switches showing `off`, the second flipped on while the first one's save waits on the game: both land.
const twoFlipsLand = async (file, off, on, gameHoldsBoth) => {
    const root = await openPage(file, (root) => pageRead(root) && byClass(root, "state-switch").length > 1);
    const rows = byClass(root, "account-row").filter((row) => switchOf(row) && wordsOf(row) === off);
    assert.ok(rows.length >= 2, `two rows show ${off}`);
    const [first, second] = rows;
    await flipBothWhileFirstSaves(first, second);
    await until(() => wordsOf(first) === on && wordsOf(second) === on, "both rows to show their saves");
    assert.ok(gameHoldsBoth(), "the game holds both");
};

test("event shop: a switch flipped while another row saves still saves", async () => {
    const before = ola[311];
    try {
        await twoFlipsLand(
            "src/ui/pages/account/event-shop/event-shop.js",
            "Not owned",
            "Owned",
            () => String(ola[311]).length === String(before).length + 2
        );
    } finally {
        ola[311] = before;
    }
});

test("weekly bosses: a skin switch flipped while another skin saves still saves", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    const locked = Object.keys(weekly).filter((key) => key.startsWith("UI_") && Number(weekly[key]) === 0);
    try {
        await twoFlipsLand("src/ui/pages/world-2/weekly-bosses/weekly-bosses.js", "Locked", "Unlocked", () =>
            locked.slice(0, 2).every((key) => Number(weekly[key]) === 1)
        );
    } finally {
        for (const key of locked) weekly[key] = 0;
    }
});

test("slab: an item switch flipped while another item saves still saves", async () => {
    const before = [...game.gga.Cards[1]];
    try {
        await twoFlipsLand(
            "src/ui/pages/world-5/slab/slab.js",
            "Missing",
            "Registered",
            () => game.gga.Cards[1].length === before.length + 2
        );
    } finally {
        game.gga.Cards[1] = before;
    }
});

test("jade emporium: two upgrades flipped at once both stay bought (they share one string)", async () => {
    const before = String(game.gga.Ninja[102][9] ?? "");
    try {
        await twoFlipsLand(
            "src/ui/pages/world-6/sneaking/2-jade.js",
            "Locked",
            "Bought",
            () => String(game.gga.Ninja[102][9]).length === before.length + 2
        );
    } finally {
        game.gga.Ninja[102][9] = before;
    }
});

for (const [name, file, path] of [
    ["omni jade", "src/ui/pages/world-6/sneaking/3-omni-jade.js", 6],
    ["menagerie", "src/ui/pages/world-7/menagerie/menagerie.js", 2],
]) {
    test(`${name}: a switch flipped while another saves still saves`, async () => {
        const menagerie = game.gga.Menagerie;
        const before = structuredClone(menagerie);
        try {
            await twoFlipsLand(file, "Off", "On", () => toggledOn(menagerie[path], before[path]) >= 2);
        } finally {
            menagerie.splice(0, menagerie.length, ...before);
        }
    });
}
const toggledOn = (now, was) => [...now].filter((value, i) => Number(value) >= 1 && !(Number(was[i]) >= 1)).length;

test("history: a save while two actions wait isn't named after the newest click", async () => {
    const changeLog = await importRepo("src/ui/services/changeLog.js");
    const store = (await importRepo("src/ui/state/store.js")).default;
    const root = globalThis.document.createElement("div");
    changeLog.startChangeLog(store.app, root);
    // The character pick field (the test DOM has no closest(), so the click's target answers it for the log).
    const pickRow = { getAttribute: (name) => (name === "data-change-label" ? "Character pick" : null) };
    const page = { closest: (selector) => (selector.includes("data-change-label") ? pickRow : null) };
    let finishA;
    let finishB;
    changeLog.withAction({}, () => new Promise((resolve) => (finishA = resolve)));
    root.listeners.pointerdown({ target: page }); // a click on another control while the first save waits
    changeLog.withAction({}, () => new Promise((resolve) => (finishB = resolve)));
    try {
        const { action } = await changeLog.startChange(["OptionsListAccount[1]"]);
        assert.equal(action.label, "", "not named after the pick");
    } finally {
        finishA();
        finishB();
    }
});

test("bribes: Enable all keeps its button's click even when another control is clicked while it reads", async () => {
    const changeLog = await importRepo("src/ui/services/changeLog.js");
    const store = (await importRepo("src/ui/state/store.js")).default;
    try {
        resetBribes();
        const page = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Mandatory Fire Sale"));
        const root = globalThis.document.createElement("div");
        root.append(page);
        changeLog.startChangeLog(store.app, root);
        const enableAll = buttonNamed(page, "Enable all");
        const before = changeLog.lastBulkAction.val;
        root.listeners.pointerdown({ target: enableAll });
        const done = click(enableAll);
        // While Enable all reads the game, the player clicks another row's switch (without flipping it yet).
        root.listeners.pointerdown({ target: switchOf(rowNamed(page, "Sleeping On the Job")) });
        await done;
        await until(() => changeLog.lastBulkAction.val !== before, "Enable all to log its action");
        const { action } = changeLog.lastBulkAction.val;
        // (The test DOM has no closest(), so the action's label can't be read here; its anchor shows whose click it kept.)
        assert.equal(action.anchor, enableAll, "its Undo all sits beside the button");
    } finally {
        resetBribes();
    }
});

for (const [name, file, list, index, off] of [
    ["event shop", "src/ui/pages/account/event-shop/event-shop.js", () => ola, 311, "Not owned"],
    ["slab", "src/ui/pages/world-5/slab/slab.js", () => game.gga.Cards, 1, "Missing"],
]) {
    test(`${name}: a refused row save is said once, on the switch`, async () => {
        let restore = () => {};
        try {
            const root = await openPage(file, (root) => pageRead(root) && byClass(root, "state-switch").length > 1);
            const row = byClass(root, "account-row").find((row) => switchOf(row) && wordsOf(row) === off);
            restore = refuseWrites(list(), index);
            await flip(row, true);
            await until(() => wordsOf(row) !== off, "the switch to say why");
            assert.match(wordsOf(row), /game kept old value/);
            assert.equal(rowStatusOf(row), "", "the row doesn't also announce the failure");
        } finally {
            restore();
        }
    });
}

// ---- Round 2 (PR #108 at b471846) ----

// Hold each write until let through one at a time with `next()`; `all()` lets the rest through.
const holdEachWrite = () => {
    const realFetch = globalThis.fetch;
    const waiting = [];
    let open = false;
    let held = 0;
    globalThis.fetch = async (url, options) => {
        if (!open && String(url).includes("/write")) {
            held++;
            await new Promise((resolve) => waiting.push(resolve));
        }
        return realFetch(url, options);
    };
    return {
        held: () => held,
        next: () => waiting.shift()?.(),
        all: () => {
            open = true;
            globalThis.fetch = realFetch;
            while (waiting.length) waiting.shift()();
        },
    };
};
const switchLabelOf = (row) => byClass(row, "state-switch")[0];
const switchStatusOf = (row) => text(byClass(switchLabelOf(row), "account-write-feedback")[0]);
const shown = (row) => switchOf(row).attributes.checked; // what the box shows (VanJS writes the binding here)
const startLog = async (page) => {
    const changeLog = await importRepo("src/ui/services/changeLog.js");
    const store = (await importRepo("src/ui/state/store.js")).default;
    const root = globalThis.document.createElement("div");
    root.append(page);
    changeLog.startChangeLog(store.app, root);
    return { changeLog, store, root };
};

test("killroy: while a later flip waits, the box shows that flip, not the state the first save left", async () => {
    const writes = holdEachWrite();
    try {
        ola[115] = 0;
        const root = await openPage(KILLROY, (root) => pageRead(root) && rowNamed(root, "AIRHORN RESET"));
        const row = rowNamed(root, "AIRHORN RESET");
        const save = flip(row, true);
        await until(() => writes.held() === 1, "the On save to reach the game");
        void flip(row, false); // asked for while On saves
        writes.next(); // On lands
        await until(() => writes.held() === 2, "the Off save to reach the game");
        assert.equal(wordsOf(row), "On", "the words say what the game holds");
        assert.equal(shown(row), false, "the box shows the Off still to come");
        writes.all();
        await save;
        assert.equal(ola[115], 0);
        assert.equal(switchOf(row).checked, false);
    } finally {
        writes.all();
        ola[115] = 0;
    }
});

test("killroy: an old failure goes once the game holds something else, and stays gone", async () => {
    let restore = () => {};
    try {
        ola[115] = 0;
        const root = await openPage(KILLROY, (root) => pageRead(root) && rowNamed(root, "AIRHORN RESET"));
        const row = rowNamed(root, "AIRHORN RESET");
        restore = refuseWrites(ola, 115);
        await flip(row, true);
        restore();
        restore = () => {};
        assert.equal(wordsOf(row), "game kept old value");
        const refresh = buttonNamed(root, "Refresh");
        ola[115] = 1; // changed elsewhere (in the game, or a bulk action)
        await click(refresh);
        await until(() => wordsOf(row) === "On", "the switch to show the new state");
        ola[115] = 0; // and back
        await click(refresh);
        await until(() => wordsOf(row) !== "On", "the second refresh");
        assert.equal(wordsOf(row), "Off", "the old failure stays gone");
    } finally {
        restore();
        ola[115] = 0;
    }
});

test("islands (the shared toggle row): the switch reads out saving and saved", async () => {
    const writes = holdEachWrite();
    const before = ola[169];
    try {
        const root = await openPage(
            "src/ui/pages/world-2/islands/islands.js",
            (root) => pageRead(root) && rowNamed(root, "Trash Island")
        );
        const row = rowNamed(root, "Trash Island");
        const save = flip(row, wordsOf(row) !== "Unlocked");
        await until(() => writes.held() === 1, "the save to reach the game");
        await until(() => switchStatusOf(row) === "Saving…", "the switch to say it is saving");
        writes.all();
        await save;
        await until(() => switchStatusOf(row) === "Saved", "the switch to say it saved");
    } finally {
        writes.all();
        ola[169] = before;
    }
});

test("bribes: a row flip that Enable all already covered claims no save", async () => {
    const writes = holdEachWrite();
    try {
        resetBribes();
        const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Mandatory Fire Sale"));
        const row = rowNamed(root, "Mandatory Fire Sale");
        const bulk = click(buttonNamed(root, "Enable all"));
        await until(() => writes.held() === 1, "Enable all to reach the game");
        const rowSave = flip(row, true); // waits behind Enable all, which turns it on
        writes.all();
        await Promise.all([bulk, rowSave]);
        assert.equal(bribes()[2], 1);
        assert.equal(rowStatusOf(row), "", "nothing to save, so no SAVED");
        assert.doesNotMatch(classes(row), /account-row--success/);
    } finally {
        writes.all();
        resetBribes();
    }
});

test("event shop: a confirmed Enable all keeps its button's action through the queue", async () => {
    const before = ola[311];
    try {
        const page = await openPage(
            "src/ui/pages/account/event-shop/event-shop.js",
            (root) => pageRead(root) && byClass(root, "state-switch").length > 1
        );
        const { changeLog } = await startLog(page);
        const enableAll = buttonNamed(page, "Enable all");
        const logged = changeLog.lastBulkAction.val;
        await click(enableAll); // asks in place
        await click(enableAll); // confirmed
        await until(() => changeLog.lastBulkAction.val !== logged, "Enable all to log its action");
        assert.equal(changeLog.lastBulkAction.val.action.anchor, enableAll, "its Undo all sits beside the button");
    } finally {
        ola[311] = before;
    }
});

test("bribes: a queued save is logged on the page it was asked for on, after the player moved on", async () => {
    const writes = holdEachWrite();
    try {
        resetBribes();
        const page = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Sleeping On the Job"));
        const { changeLog, store } = await startLog(page);
        store.openMenu({ view: "PAGES" });
        store.openMenu({ world: 1 });
        const askedOn = changeLog.currentPlace();
        const logged = changeLog.lastBulkAction.val;
        const first = flip(rowNamed(page, "Mandatory Fire Sale"), true);
        await until(() => writes.held() === 1, "the first save to reach the game");
        const second = flip(rowNamed(page, "Sleeping On the Job"), true); // waits its turn
        store.openMenu({ view: "HISTORY" }); // the player moves on before it runs
        assert.notEqual(changeLog.currentPlace().view, askedOn.view);
        writes.all();
        await Promise.all([first, second]);
        await until(() => changeLog.lastBulkAction.val !== logged, "the saves to be logged");
        assert.deepEqual(changeLog.lastBulkAction.val.action.place, askedOn, "logged where it was asked for");
    } finally {
        writes.all();
        resetBribes();
    }
});

test("stamps: leaving a level field for the row's switch saves the level", async () => {
    const levels = game.gga.StampLevel[0];
    const before = levels[0];
    try {
        const root = await openPage(
            "src/ui/pages/world-1/stamps/stamps.js",
            (root) => pageRead(root) && rowNamed(root, "Stamp A1")
        );
        const row = rowNamed(root, "Stamp A1");
        const field = elements(row).find((node) => node.nodeName === "input" && node !== switchOf(row));
        field.value = String(before + 1);
        field.listeners.input({ target: field });
        row.listeners.focusout({ currentTarget: row, target: field, relatedTarget: switchOf(row) });
        await until(() => levels[0] === before + 1, "the level to save");
    } finally {
        levels[0] = before;
    }
});

test("a save that failed part-way says some changes may have applied, not that the game kept the old value", async () => {
    const { saveFailureReason } = await importRepo("src/ui/components/views/account/autoSave.js");
    assert.equal(
        saveFailureReason(new Error("Some changes may have applied. Write mismatch at BribeStatus[5]")),
        "some changes may have applied"
    );
    assert.equal(saveFailureReason(new Error("Write mismatch at BribeStatus[2]")), "game kept old value");
});
