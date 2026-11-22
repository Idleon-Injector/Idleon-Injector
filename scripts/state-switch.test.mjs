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

async function until(check, what, tries = 300) {
    for (let i = 0; i < tries; i++) {
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
        const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Sleeping on the Job"));
        const second = rowNamed(root, "Sleeping on the Job");
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
        assert.equal(wordsOf(row), "", "an off bribe says nothing");
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
        root.listeners.pointerdown({ target: switchOf(rowNamed(page, "Sleeping on the Job")) });
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
            assert.equal(wordsOf(row), "game kept old value", "one value: it landed or it didn't");
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
// Start the change log on `page`; `done()` puts the menu back where it was, so later tests don't start elsewhere.
const cleanups = [];
// Last registered, first undone: a refusal comes off before the value it guarded is put back.
const runCleanups = async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
};
const startLog = async (page) => {
    const changeLog = await importRepo("src/ui/services/changeLog.js");
    const store = (await importRepo("src/ui/state/store.js")).default;
    const root = globalThis.document.createElement("div");
    root.append(page);
    changeLog.startChangeLog(store.app, root);
    const { activeTab, menuWorld, menuPage } = store.app;
    const done = () => Object.assign(store.app, { activeTab, menuWorld, menuPage });
    return { changeLog, store, root, done };
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
        const { changeLog, done } = await startLog(page);
        cleanups.push(done);
        const enableAll = buttonNamed(page, "Enable all");
        const logged = changeLog.lastBulkAction.val;
        await click(enableAll); // asks in place
        await click(enableAll); // confirmed
        await until(() => changeLog.lastBulkAction.val !== logged, "Enable all to log its action");
        assert.equal(changeLog.lastBulkAction.val.action.anchor, enableAll, "its Undo all sits beside the button");
    } finally {
        await runCleanups();
        ola[311] = before;
    }
});

test("bribes: a queued save is logged on the page it was asked for on, after the player moved on", async () => {
    const writes = holdEachWrite();
    try {
        resetBribes();
        const page = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Sleeping on the Job"));
        const { changeLog, store, done } = await startLog(page);
        cleanups.push(done);
        store.openMenu({ view: "PAGES" });
        store.openMenu({ world: 1 });
        const askedOn = changeLog.currentPlace();
        const logged = changeLog.lastBulkAction.val;
        const first = flip(rowNamed(page, "Mandatory Fire Sale"), true);
        await until(() => writes.held() === 1, "the first save to reach the game");
        const second = flip(rowNamed(page, "Sleeping on the Job"), true); // waits its turn
        store.openMenu({ view: "HISTORY" }); // the player moves on before it runs
        assert.notEqual(changeLog.currentPlace().view, askedOn.view);
        writes.all();
        await Promise.all([first, second]);
        await until(() => changeLog.lastBulkAction.val !== logged, "the saves to be logged");
        assert.deepEqual(changeLog.lastBulkAction.val.action.place, askedOn, "logged where it was asked for");
    } finally {
        await runCleanups();
        writes.all();
        resetBribes();
    }
});

const STAMPS = "src/ui/pages/world-1/stamps/stamps.js";
const saveWordsOf = (row) => text(byClass(row, "save-state__label")[0]);
const levelFieldOf = (row) => elements(row).find((node) => node.nodeName === "input" && node !== switchOf(row));
const typeLevel = (row, value) => {
    const field = levelFieldOf(row);
    field.value = String(value);
    field.listeners.input({ target: field });
    return field;
};
const exalted = () => game.gga.Compass[4].includes("_0");
// Sword Stamp, Not exalted, with its level, its cap and the exalted codes put back afterwards.
const openStampA1 = async () => {
    const levels = game.gga.StampLevel[0];
    const caps = game.gga.StampLevelMAX[0];
    const before = { level: levels[0], cap: caps[0], exalted: [...game.gga.Compass[4]] };
    cleanups.push(() => {
        levels[0] = before.level;
        caps[0] = before.cap;
        game.gga.Compass[4] = before.exalted;
    });
    assert.equal(exalted(), false, "Sword Stamp starts Not exalted");
    const root = await openPage(STAMPS, (root) => pageRead(root) && rowNamed(root, "Sword Stamp"));
    return { root, row: rowNamed(root, "Sword Stamp"), levels, before: before.level };
};
// Log the game requests in order ("switch read", "level write", …); the first that `holdIf` picks waits for
// `release()`, and "held answered" is logged once the game answers it. `levels` lists the stamp levels written.
// Its cleanup lets the held request go and waits for it, and for what `track()` was given, before the fixture is
// put back (cleanups registered before it run after it).
const watchRequests = (holdIf) => {
    const realFetch = globalThis.fetch;
    const log = [];
    const bodies = []; // each request as "url body", in the same order as `log`
    const levels = [];
    const started = [];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let held = 0;
    globalThis.fetch = async (url, options) => {
        const body = String(options?.body ?? "");
        const name = body.includes("Compass[4]") ? "switch" : body.includes("StampLevel") ? "level" : "other";
        const isWrite = String(url).includes("/write");
        log.push(`${name} ${isWrite ? "write" : "read"}`);
        bodies.push(`${url} ${body}`);
        if (isWrite && name === "level")
            levels.push(JSON.parse(body).writes.find((write) => write.path.includes("StampLevel[")).value);
        if (!holdIf(String(url), body) || held++ > 0) return realFetch(url, options);
        const answered = gate.then(() => realFetch(url, options));
        started.push(answered);
        const response = await answered;
        log.push("held answered");
        bodies.push("held answered");
        return response;
    };
    cleanups.push(async () => {
        release();
        await Promise.allSettled(started);
        globalThis.fetch = realFetch;
    });
    const track = (operation) => (started.push(operation), operation);
    return { log, bodies, levels, held: () => held > 0, release, track };
};
const isLevelWrite = (url, body) => url.includes("/write") && body.includes("StampLevel");
// The switch asked the game something, and only once the held request was answered.
const switchStartedAfterHeld = (log) => {
    const answered = log.indexOf("held answered");
    const firstSwitch = log.findIndex((entry) => entry.startsWith("switch"));
    assert.ok(firstSwitch >= 0, "the switch saved");
    assert.ok(answered >= 0 && firstSwitch > answered, `the switch waited: ${log.join(", ")}`);
};

test("stamps: leaving a level field for the row's switch saves the level", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        const field = typeLevel(row, before + 1);
        row.listeners.focusout({ currentTarget: row, target: field, relatedTarget: switchOf(row) });
        await until(() => levels[0] === before + 1, "the level to save");
    } finally {
        await runCleanups();
    }
});

test("stamps: a switch flipped while the level saves waits for it, and says its own failure", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        cleanups.push(refuseWrites(game.gga.Compass, 4));
        const requests = watchRequests(isLevelWrite);
        const field = typeLevel(row, before + 1);
        row.listeners.focusout({ currentTarget: row, target: field, relatedTarget: switchOf(row) });
        await until(requests.held, "the level's write to reach the game");
        const flipped = requests.track(flip(row, true));
        requests.release();
        await flipped;
        await until(() => levels[0] === before + 1 && saveWordsOf(row) !== "saving…", "both saves to end");
        switchStartedAfterHeld(requests.log);
        assert.equal(wordsOf(row), "game kept old value", "the switch says why it wasn't saved");
        assert.equal(saveWordsOf(row), "saved", "once: the row keeps the level's ✓");
    } finally {
        await runCleanups();
    }
});

test("stamps: a refused level stays said when the switch flipped behind it saves; the switch says its ✓", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        cleanups.push(refuseWrites(levels, 0));
        const field = typeLevel(row, before + 1);
        row.listeners.focusout({ currentTarget: row, target: field, relatedTarget: switchOf(row) });
        await flip(row, true); // waits for the level's save, then saves
        await until(() => exalted() && saveWordsOf(row) !== "saving…", "both saves to end");
        assert.equal(saveWordsOf(row), "game kept old value", "the switch's ✓ doesn't hide the unsaved level");
        assert.equal(field.value, String(before + 1), "the typed level is still there to fix");
        assert.equal(switchStatusOf(row), "Saved", "the switch reads out its own save");
    } finally {
        await runCleanups();
    }
});

// #111: the switch says its own save, so a level fixed while it saves keeps one steady reason until the level saves.
test("stamps: a level fixed while the switch saves shows its ✓ once it saves, not the old reason", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        let field = typeLevel(row, -5);
        row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        await until(() => saveWordsOf(row) === "min 0", "the level's reason");
        const requests = watchRequests((url, body) => url.includes("/write") && body.includes("Compass[4]"));
        const flipped = requests.track(flip(row, true));
        await until(requests.held, "the switch's write to reach the game");
        field = typeLevel(row, before + 1);
        row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} }); // waits behind the switch
        const saved = requests.track(
            until(() => levels[0] === before + 1 && saveWordsOf(row) === "saved", "the fixed level to save")
        );
        assert.equal(saveWordsOf(row), "min 0", "the reason stays while the switch saves");
        requests.release();
        await Promise.all([flipped, saved]);
        assert.equal(wordsOf(row), "Exalted");
    } finally {
        await runCleanups();
    }
});

test("stamps: a switch's save is read out once, by the switch", async () => {
    try {
        const { row } = await openStampA1();
        const requests = watchRequests((url, body) => url.includes("/write") && body.includes("Compass[4]"));
        const flipped = requests.track(flip(row, true));
        await until(() => requests.held() && switchStatusOf(row) === "Saving…", "the switch to say it's saving");
        assert.equal(saveWordsOf(row), "", "the row doesn't say saving… too");
        requests.release();
        await flipped;
        await until(() => switchStatusOf(row) === "Saved", "the switch to say it saved");
        assert.equal(saveWordsOf(row), "", "the row doesn't say saved too");
    } finally {
        await runCleanups();
    }
});

test("stamps: the switch's Saved goes after as long as the row's ✓ stays", async () => {
    const { SUCCESS_MS } = await importRepo("src/ui/components/views/account/autoSave.js");
    try {
        const { row } = await openStampA1();
        await flip(row, true);
        await until(() => switchStatusOf(row) === "Saved", "the switch to say it saved");
        await until(() => switchStatusOf(row) === "", "Saved to go", SUCCESS_MS / 10 + 300);
    } finally {
        await runCleanups();
    }
});

test("stamps: a level committed after a switch flip saves after the flip", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        const requests = watchRequests(isLevelWrite);
        let field = typeLevel(row, before + 1);
        row.listeners.focusout({ currentTarget: row, target: field, relatedTarget: switchOf(row) });
        await until(requests.held, "the first level's write to reach the game");
        const flipped = requests.track(flip(row, true));
        field = typeLevel(row, before + 2);
        row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        requests.release();
        await flipped;
        await until(() => levels[0] === before + 2, "the second level to save");
        const writes = requests.log.filter((entry) => entry.endsWith("write"));
        assert.deepEqual(writes, ["level write", "switch write", "level write"]);
    } finally {
        await runCleanups();
    }
});

test("stamps: a level committed after a flip doesn't save before it, even while an earlier save repeats", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        const requests = watchRequests(isLevelWrite);
        const commit = (value) => {
            const field = typeLevel(row, value);
            row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        };
        commit(before + 1);
        await until(requests.held, "the first level's write to reach the game");
        commit(before + 2); // joins the running save
        const flipped = requests.track(flip(row, true));
        commit(before + 3); // after the flip: its own turn
        requests.release();
        await flipped;
        await until(() => levels[0] === before + 3, "the last level to save");
        assert.deepEqual(requests.levels, [before + 1, before + 2, before + 3]);
        const writes = requests.log.filter((entry) => entry.endsWith("write"));
        assert.deepEqual(writes, ["level write", "level write", "switch write", "level write"]);
    } finally {
        await runCleanups();
    }
});

test("stamps: a switch's failure is said on the switch, so the level saved after it shows its ✓", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        const restore = refuseWrites(game.gga.Compass, 4);
        cleanups.push(restore);
        await flip(row, true);
        await until(() => wordsOf(row) === "game kept old value", "the switch's failure, on the switch");
        assert.equal(saveWordsOf(row), "", "said once");

        const field = typeLevel(row, before + 1);
        row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        await until(() => saveWordsOf(row) === "saved", "the level's ✓");
        assert.equal(levels[0], before + 1);
        assert.equal(wordsOf(row), "game kept old value", "the switch still says its failure");
        assert.equal(byClass(row, "save-state__undo")[0].attributes.hidden, false, "Undo for the level");

        restore();
        await flip(row, true);
        await until(() => wordsOf(row) === "Exalted", "the switch's own ✓ to take its failure back");
    } finally {
        await runCleanups();
    }
});

test("stamps: a switch's old failure goes once a refresh shows the game holds something else", async () => {
    try {
        const { root, row } = await openStampA1();
        const restore = refuseWrites(game.gga.Compass, 4);
        cleanups.push(restore);
        await flip(row, true);
        await until(() => wordsOf(row) === "game kept old value", "the switch's failure");
        restore();
        game.gga.Compass[4] = [...game.gga.Compass[4], "_0"]; // exalted elsewhere (in the game, say)
        click(buttonNamed(root, "Refresh"));
        await until(() => wordsOf(row) === "Exalted", "the refresh to show the game's state");
        assert.equal(saveWordsOf(row), "");
    } finally {
        await runCleanups();
    }
});

test("stamps: a refused Undo of a switch flip is said once, and the next save's ✓ follows it", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        await flip(row, true);
        const undoButton = byClass(row, "save-state__undo")[0];
        await until(() => exalted() && undoButton.attributes.hidden === false, "the flip's Undo");
        cleanups.push(refuseWrites(game.gga.Compass, 4));
        await undoButton.listeners.click();
        await until(() => !["", "saving…", "saved"].includes(saveWordsOf(row)), "the refusal");

        const field = typeLevel(row, before + 1);
        row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        await until(() => levels[0] === before + 1, "the level to save");
        await until(() => saveWordsOf(row) === "saved", "the level's ✓");
    } finally {
        await runCleanups();
    }
});

test("stamps: a switch flipped while Undo runs waits for it", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        const field = typeLevel(row, before + 1);
        row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        const undoButton = byClass(row, "save-state__undo")[0];
        await until(() => levels[0] === before + 1 && undoButton.attributes.hidden === false, "the save's Undo");

        const requests = watchRequests(isLevelWrite); // the undo's write
        const undone = requests.track(undoButton.listeners.click());
        await until(requests.held, "the undo's write to reach the game");
        const flipped = requests.track(flip(row, true));
        requests.release();
        await Promise.all([undone, flipped]);
        switchStartedAfterHeld(requests.log);
        assert.equal(levels[0], before);
        assert.ok(exalted());
    } finally {
        await runCleanups();
    }
});

// ---- Emperor ----

const EMPEROR = "src/ui/pages/world-6/emperor/emperor.js";
// Emperor with some completed showdowns, its progress and base rewards put back afterwards.
const openEmperor = async () => {
    const ola = game.gga.OptionsListAccount;
    const before = { progress: ola[369], cache: JSON.stringify(game.gga.DNSM.h.EmperorBon) };
    cleanups.push(() => {
        ola[369] = before.progress;
        game.gga.DNSM.h.EmperorBon = JSON.parse(before.cache);
    });
    if (!(Number(ola[369]) > 0)) ola[369] = 5;
    const root = await openPage(EMPEROR, (root) => text(root).includes("Base daily replenishment"));
    const row = rowNamed(root, "Completed showdowns");
    return {
        ola,
        progress: ola[369],
        row,
        field: elements(row).find((node) => node.nodeName === "input"),
        reset: elements(row).find((node) => node.nodeName === "button" && text(node).trim() === "Reset"),
    };
};
const typeProgress = (row, field, value) => {
    field.value = String(value);
    field.listeners.input({ target: field });
    row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
};

test("emperor: a double-click on Reset doesn't answer the Click again its first click asks", async () => {
    try {
        const { ola, progress, reset } = await openEmperor();
        await Promise.all([click(reset), click(reset)]);
        assert.equal(ola[369], progress, "nothing reset");
        assert.equal(reset.attributes["data-again"], "Click again", "the first click asks");
        await click(reset);
        assert.equal(ola[369], 0, "a click after the question answers it");
    } finally {
        await runCleanups();
    }
});

test("emperor: Reset asking first leaves the field's failure; Reset saving takes it back", async () => {
    try {
        const { ola, progress, row, field, reset } = await openEmperor();
        const restore = refuseWrites(ola, 369);
        cleanups.push(restore);
        typeProgress(row, field, progress + 1);
        await until(() => saveWordsOf(row) === "game kept old value", "the field's failure");

        await click(reset); // only asks: a cancelled write answers nothing
        assert.equal(reset.attributes["data-again"], "Click again");
        await until(() => saveWordsOf(row) !== "saving…", "the ask to end");
        assert.equal(saveWordsOf(row), "game kept old value", "the typed value is still unsaved");

        restore();
        await click(reset); // answers
        assert.equal(ola[369], 0);
        await until(() => saveWordsOf(row) === "saved", "Reset's ✓");
    } finally {
        await runCleanups();
    }
});

test("emperor: Escape while Reset runs takes back the field's failure for good", async () => {
    try {
        const { ola, progress, row, field, reset } = await openEmperor();
        cleanups.push(refuseWrites(ola, 369));
        typeProgress(row, field, progress + 1);
        await until(() => saveWordsOf(row) === "game kept old value", "the field's failure");

        const requests = watchRequests(() => true); // Reset's first read waits, so Escape comes while Reset runs
        const clicked = requests.track(click(reset));
        await until(requests.held, "Reset to reach the game");
        row.listeners.keydown({ key: "Escape", target: field, preventDefault() {} });
        requests.release();
        await clicked; // only asks
        await until(() => saveWordsOf(row) !== "saving…", "Reset to end");
        assert.equal(saveWordsOf(row), "", "no failure for a draft that's gone");
    } finally {
        await runCleanups();
    }
});

test("emperor: Reset clicked while the typed progress saves doesn't split that save's History action", async () => {
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    try {
        const { ola, progress, row, field, reset } = await openEmperor();
        // Hold the progress save's first write, so Reset is clicked while that save runs.
        const requests = watchRequests(
            (url, body) => url.includes("/write") && body.includes("OptionsListAccount[369]")
        );
        typeProgress(row, field, progress + 1);
        await until(requests.held, "the progress write to reach the game");
        const clicked = requests.track(click(reset)); // waits its turn, then only asks
        requests.release();
        await clicked;
        assert.equal(ola[369], progress + 1);
        const { actions } = await fetchChanges();
        const saved = actions.find((action) =>
            action.entries.some((entry) => entry.path === "OptionsListAccount[369]")
        );
        assert.deepEqual(
            saved.entries.map((entry) => entry.path).sort(),
            ["DNSM.h.EmperorBon", "OptionsListAccount[369]"],
            "progress and its base rewards are one action"
        );
    } finally {
        await runCleanups();
    }
});

test("emperor: a progress typed after Reset is clicked doesn't save before Reset asks", async () => {
    try {
        const { ola, progress, row, field, reset } = await openEmperor();
        const requests = watchRequests(
            (url, body) => url.includes("/write") && body.includes("OptionsListAccount[369]")
        );
        typeProgress(row, field, progress + 1);
        await until(requests.held, "the first progress write to reach the game");
        typeProgress(row, field, progress + 2); // joins the running save
        const clicked = requests.track(click(reset)); // waits its turn
        typeProgress(row, field, progress + 3); // after Reset: its own turn
        requests.release();
        await clicked;
        assert.equal(ola[369], progress + 2, "Reset asked before the last typed value saved");
        await until(() => ola[369] === progress + 3, "the last typed value to save");
    } finally {
        await runCleanups();
    }
});

// ---- Local review of 2ded019 ----

test("stamps: Escape drops a commit still waiting; the one already writing ends", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        const requests = watchRequests(isLevelWrite);
        const commit = (value) => {
            const field = typeLevel(row, value);
            row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
            return field;
        };
        commit(before + 1);
        await until(requests.held, "the first level's write to reach the game");
        const field = commit(before + 2); // joins the running save
        row.listeners.keydown({ key: "Escape", target: field, preventDefault() {} });
        // The row's save is the operation: cleanup waits for it, so no level lands after the stamp is put back.
        const saved = requests.track(
            until(() => levels[0] === before + 1 && saveWordsOf(row) === "saved", "the first level's save to end")
        );
        requests.release();
        await saved;
        assert.deepEqual(requests.levels, [before + 1], "the commit Escape took back isn't saved");
        await until(() => field.attributes.value === String(before + 1), "the field to show what the game holds");
        row.listeners.focusout({ currentTarget: row, target: field, relatedTarget: null });
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.deepEqual(requests.levels, [before + 1], "leaving the field doesn't save the old level back");
    } finally {
        await runCleanups();
    }
});

test("stamps: a commit that joins a running save is logged on its own page after the player moved on", async () => {
    const { fetchChanges } = await importRepo("src/ui/services/api.js");
    try {
        const { root, row, levels, before } = await openStampA1();
        const { changeLog, store, done } = await startLog(root);
        cleanups.push(done);
        store.openMenu({ view: "PAGES" });
        store.openMenu({ world: 1 });
        const askedOn = changeLog.currentPlace();
        const requests = watchRequests(isLevelWrite);
        const commit = (value) => {
            const field = typeLevel(row, value);
            row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        };
        commit(before + 1);
        await until(requests.held, "the first level's write to reach the game");
        commit(before + 2); // joins the running save
        store.openMenu({ view: "HISTORY" }); // the player moves on before it runs
        const saved = requests.track(
            until(() => levels[0] === before + 2 && saveWordsOf(row) === "saved", "the second level to save")
        );
        requests.release();
        await saved;
        // The game holds the level before History logs it: wait for the commit's own entry.
        let second;
        for (let i = 0; i < 300 && !second; i++) {
            second = (await fetchChanges()).actions.find((action) =>
                action.entries.some((entry) => entry.path === "StampLevel[0][0]" && entry.after === before + 2)
            );
            if (!second) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(second, "the second level is in History");
        const { view, page } = second.place;
        assert.deepEqual({ view, page }, { view: askedOn.view, page: askedOn.page }, "logged where it was committed");
    } finally {
        await runCleanups();
    }
});

test("killroy: a failed flip the player already took back isn't said", async () => {
    const writes = holdEachWrite();
    let restore = () => {};
    try {
        ola[115] = 0;
        const root = await openPage(KILLROY, (root) => pageRead(root) && rowNamed(root, "AIRHORN RESET"));
        const row = rowNamed(root, "AIRHORN RESET");
        restore = refuseWrites(ola, 115);
        const save = flip(row, true);
        await until(() => writes.held() === 1, "On to reach the game");
        void flip(row, false); // taken back while On saves; the game keeps Off
        writes.all();
        await save;
        await until(() => ["Off", "game kept old value"].includes(wordsOf(row)), "the save to end");
        assert.equal(wordsOf(row), "Off", "the game holds what was asked last");
    } finally {
        writes.all();
        restore();
        ola[115] = 0;
    }
});

// The game takes the write but its answer is lost on the way back. `restore.lost()` counts the answers it replaced.
const loseAnswers = (path) => {
    const realFetch = globalThis.fetch;
    let lost = 0;
    globalThis.fetch = async (url, options) => {
        const response = await realFetch(url, options);
        if (!String(url).includes("/write") || !String(options?.body).includes(path)) return response;
        lost++;
        return new Response(JSON.stringify({ error: "connection lost" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    };
    return Object.assign(() => (globalThis.fetch = realFetch), { lost: () => lost });
};

test("slab: a registration whose answer was lost, but which the game kept, isn't said as failed", async () => {
    const before = [...game.gga.Cards[1]];
    let restore = () => {};
    try {
        const root = await openPage(
            "src/ui/pages/world-5/slab/slab.js",
            (root) => pageRead(root) && byClass(root, "state-switch").length > 1
        );
        const row = byClass(root, "account-row").find((row) => switchOf(row) && wordsOf(row) === "Missing");
        restore = loseAnswers("Cards[1]");
        await flip(row, true);
        await until(() => wordsOf(row) !== "Missing", "the save to end");
        assert.equal(restore.lost(), 1, "the write's answer was lost");
        assert.equal(game.gga.Cards[1].length, before.length + 1, "the game kept it");
        assert.equal(wordsOf(row), "Registered", "read back, not said as failed");
    } finally {
        restore();
        game.gga.Cards[1] = before;
    }
});

test("account options: an on/off save whose answer was lost shows what the game holds", async () => {
    const index = 690;
    let restore = () => {};
    try {
        ola[index] = true;
        const { AccountOptionsTab } = await importRepo("src/ui/components/views/account/AccountOptionsTab.js");
        const root = AccountOptionsTab();
        const optionRow = () => elements(root).find((node) => node.attributes["data-index"] === index);
        await until(() => optionRow() && switchOf(optionRow()), "Account Options to load");
        const row = optionRow();
        restore = loseAnswers(`OptionsListAccount[${index}]`);
        await flip(row, false);
        assert.equal(restore.lost(), 1, "the write's answer was lost");
        assert.equal(ola[index], false, "the game kept Off");
        await until(() => wordsOf(row) === "Off", "the switch to show Off, read back");
        assert.equal(saveWordsOf(row), "saved", "read back, not said as failed");
        // The save landed, so History has it once, with the value from before it.
        const { fetchChanges } = await importRepo("src/ui/services/api.js");
        const logged = (await fetchChanges()).actions
            .flatMap((action) => action.entries)
            .filter((entry) => entry.path === `OptionsListAccount[${index}]`);
        assert.deepEqual(
            logged.map(({ before, after }) => ({ before, after })),
            [{ before: true, after: false }],
            "one History entry"
        );
    } finally {
        restore();
        ola[index] = (index * 13) % 50;
    }
});

test("weekly bosses: a skin flipped while trophies save waits and saves", async () => {
    const weekly = game.gga.WeeklyBoss.h;
    const locked = Object.keys(weekly).filter((key) => key.startsWith("UI_") && Number(weekly[key]) === 0);
    const trophies = ola[188];
    try {
        const root = await openPage(
            "src/ui/pages/world-2/weekly-bosses/weekly-bosses.js",
            (root) => pageRead(root) && byClass(root, "state-switch").length > 1
        );
        const trophyRow = rowNamed(root, "Trophies");
        const field = elements(trophyRow).find((node) => node.nodeName === "input");
        const requests = watchRequests(
            (url, body) => url.includes("/write") && body.includes("OptionsListAccount[188]")
        );
        field.value = String(Number(trophies) + 1);
        field.listeners.input({ target: field });
        trophyRow.listeners.keydown({ key: "Enter", target: field, preventDefault() {} });
        await until(requests.held, "the trophy write to reach the game");
        const skin = byClass(root, "account-row").find((row) => switchOf(row) && wordsOf(row) === "Locked");
        const flipped = requests.track(flip(skin, true));
        requests.release();
        await flipped;
        assert.equal(locked.filter((key) => Number(weekly[key]) === 1).length, 1, "the skin saved");
        const answered = requests.bodies.findIndex((entry) => entry === "held answered");
        const skinWrite = requests.bodies.findIndex(
            (entry) => entry.includes("/write") && entry.includes("WeeklyBoss.h.UI_")
        );
        assert.ok(answered >= 0 && skinWrite > answered, "the skin's write waited for the trophies' answer");
    } finally {
        await runCleanups();
        for (const key of locked) weekly[key] = 0;
        ola[188] = trophies;
    }
});

test("a level row with no cap (max null or empty) shows no cap", async () => {
    const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
    const { ClampedLevelRow } = await importRepo("src/ui/components/views/account/ClampedLevelRow.js");
    for (const max of [null, ""]) {
        const row = ClampedLevelRow({ valueState: van.state(3), max, write: async (value) => value, name: "Test" });
        const cap = byClass(row, "number-input__cap")[0];
        assert.ok(!cap || cap.attributes.hidden, `max ${JSON.stringify(max)}`);
    }
});

test("stamps: a queued commit that changes nothing leaves a newer typed level in the field", async () => {
    try {
        const { row, levels, before } = await openStampA1();
        const requests = watchRequests((url, body) => url.includes("/write") && body.includes("Compass[4]"));
        const flipped = requests.track(flip(row, true));
        await until(requests.held, "the switch's write to reach the game");
        const field = levelFieldOf(row);
        row.listeners.keydown({ key: "Enter", target: field, preventDefault() {} }); // the level as stored: waits
        typeLevel(row, before + 2); // typed while that commit waits, not committed
        requests.release();
        await flipped;
        await until(() => switchStatusOf(row) === "Saved", "the switch's save to end");
        await until(() => saveWordsOf(row) !== "saving…", "the queued commit to run");
        assert.equal(String(field.attributes.value), String(before + 2), "the newer draft is still there");
        assert.equal(levels[0], before, "and not saved early");
    } finally {
        await runCleanups();
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

// ---- Round 3 (second read of 0a4de92) ----

test("bribes: a switch's queued second flip is logged on its page after the player moved on", async () => {
    const writes = holdEachWrite();
    try {
        resetBribes();
        const page = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Mandatory Fire Sale"));
        const { changeLog, store, done } = await startLog(page);
        cleanups.push(done);
        store.openMenu({ view: "PAGES" });
        store.openMenu({ world: 1 });
        const askedOn = changeLog.currentPlace();
        const row = rowNamed(page, "Mandatory Fire Sale");
        const first = flip(row, true);
        await until(() => writes.held() === 1, "On to reach the game");
        void flip(row, false); // waits in the switch, then queues again on the page
        store.openMenu({ view: "HISTORY" });
        writes.next();
        await until(() => writes.held() === 2, "Off to reach the game");
        const logged = changeLog.lastBulkAction.val;
        writes.all();
        await first;
        await until(() => changeLog.lastBulkAction.val !== logged, "Off to be logged");
        assert.equal(bribes()[2], 0);
        assert.deepEqual(changeLog.lastBulkAction.val.action.place, askedOn, "logged on Bribes, not History");
    } finally {
        await runCleanups();
        writes.all();
        resetBribes();
    }
});

test("bribes: a row flip that Disable all already covered claims no save", async () => {
    const writes = holdEachWrite();
    try {
        resetBribes(); // the first two are owned
        const root = await openPage(BRIBES, (root) => pageRead(root) && rowNamed(root, "Insider Trading"));
        const row = rowNamed(root, "Insider Trading");
        const disableAll = buttonNamed(root, "Disable all");
        await click(disableAll); // asks in the tray
        const bulk = click(byClass(root, "tabbed-list__yes")[0]); // confirmed
        await until(() => writes.held() === 1, "Disable all to reach the game");
        const rowSave = flip(row, false); // waits behind Disable all, which turns it off
        writes.all();
        await Promise.all([bulk, rowSave]);
        assert.equal(bribes()[0], 0);
        assert.equal(rowStatusOf(row), "", "nothing to save, so no SAVED");
        assert.doesNotMatch(classes(row), /account-row--success/);
    } finally {
        writes.all();
        resetBribes();
    }
});

test("weekly bosses: a skin switch reads out saving and saved", async () => {
    const writes = holdEachWrite();
    const weekly = game.gga.WeeklyBoss.h;
    const locked = Object.keys(weekly).filter((key) => key.startsWith("UI_") && Number(weekly[key]) === 0);
    try {
        const root = await openPage(
            "src/ui/pages/world-2/weekly-bosses/weekly-bosses.js",
            (root) => pageRead(root) && byClass(root, "state-switch").length > 1
        );
        const row = byClass(root, "account-row").find((row) => switchOf(row) && wordsOf(row) === "Locked");
        const save = flip(row, true);
        await until(() => writes.held() === 1, "the save to reach the game");
        await until(() => switchStatusOf(row) === "Saving…", "the switch to say it is saving");
        writes.all();
        await save;
        await until(() => switchStatusOf(row) === "Saved", "the switch to say it saved");
    } finally {
        writes.all();
        for (const key of locked) weekly[key] = 0;
    }
});

// Research › Observations: the unlock switch edits the tile's draft, saved with its other fields.
const OBSERVATIONS = "src/ui/pages/world-7/research/observations.js";
const research = () => game.gga.Research;
const openTile = async () => {
    const root = await openPage(OBSERVATIONS, (root) => pageRead(root) && byClass(root, "observation-tile").length > 0);
    const tile = byClass(root, "observation-tile")[0];
    const fields = elements(tile).filter((node) => node.nodeName === "input" && node !== switchOf(tile));
    return { tile, unlock: switchOf(tile), insightLevel: fields[0] };
};

test("observations: Enter on the unlock switch saves the tile", async () => {
    const before = structuredClone(research());
    try {
        const { tile, unlock } = await openTile();
        const was = Number(research()[2][0]) === 1;
        await flip(tile, !was);
        tile.listeners.keydown({ key: "Enter", target: unlock, preventDefault() {} });
        await until(() => (Number(research()[2][0]) === 1) !== was, "the tile to save its unlock");
    } finally {
        Object.assign(research(), before);
    }
});

test("observations: moving from a field to the unlock switch keeps editing, and Escape there puts it back", async () => {
    const writes = holdEachWrite();
    const before = structuredClone(research());
    try {
        const { tile, unlock, insightLevel } = await openTile();
        const stored = String(insightLevel.attributes.value ?? insightLevel.value);
        insightLevel.value = String(Number(stored) + 1);
        insightLevel.listeners.input({ target: insightLevel });
        tile.listeners.focusout({ currentTarget: tile, target: insightLevel, relatedTarget: unlock });
        tile.listeners.keydown({ key: "Escape", target: unlock, preventDefault() {} });
        await until(() => String(insightLevel.attributes.value) === stored, "Escape to put the field back");
        // A save started by leaving the field would read the game, then write: let a few game round trips pass.
        const { gga } = await importRepo("src/ui/services/api.js");
        for (let i = 0; i < 3; i++) await gga("Research");
        assert.equal(writes.held(), 0, "leaving the field for the switch didn't save the tile");
    } finally {
        writes.all();
        Object.assign(research(), before);
    }
});
