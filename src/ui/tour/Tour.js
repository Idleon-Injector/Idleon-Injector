/**
 * The first-start tour (#200): the player learns the menu by doing it. One short line under (or beside) the thing it
 * points at; the tour waits for the player to do it and moves on by itself. Small dots show how far along it is; Skip
 * or Escape ends it at once. Everything is practised on the Practice page (practice.js), which is in the menu only
 * while the tour runs: nothing the tour does writes to the game, so it works with the game closed.
 *
 * Steps are a list: a step is `{ start?, parts }`, and `parts()` gives its lines in order, each
 * `{ say, target, side?, yields?, done }`: `say()` the words, `target()` the element it points at (null: the line
 * waits at the bottom of the window), `side` "below" (the default) or "right", `yields` a selector the line hides
 * behind while it shows (the search's results), `done()` true once the player did it. A new step (Set all, a config
 * pick) is one entry; the dots count the steps.
 */
import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS } from "../state/constants.js";
import { menuTree } from "../menu/pageRegistry.js";
import { searchHits } from "../menu/pageSearch.js";
import { searchScope } from "../components/MenuSearch.js";
import { isRail, menuLevel } from "../components/MenuLevels.js";
import { holdUndo } from "../components/views/account/autoSave.js";
import { clearPractice, practiceActions } from "../services/changeLog.js";
import { fetchTour, saveTour } from "../services/api.js";
import {
    PRACTICE_PAGE,
    PRACTICE_ROWS,
    PRACTICE_WORLD,
    practiceValues,
    resetPractice,
    tourRunning,
} from "./practice.js";

const { div, span, button, kbd, b } = van.tags;

const $ = (selector) => document.querySelector(selector);
// An element the player can see, or null.
const seen = (node) => (node && node.getClientRects().length > 0 ? node : null);
const key = (name) => kbd({ class: "tour-key" }, name);
const word = (text) => b({ class: "tour-word" }, text);

const onPractice = () => store.app.activeTab === VIEWS.PAGES.id && store.app.menuWorld === PRACTICE_WORLD.id;
const openPractice = () => onPractice() || store.openMenu({ world: PRACTICE_WORLD.id, page: PRACTICE_PAGE.id });
// The sidebar's entry for a world or area, in the list on screen (not one sliding away).
const entry = (id) => seen($(`.sidebar .menu-panel:not(.is-leaving) [data-key="${id}"]`));
const practiceRow = (id) => $(`#pages-tab [data-page="${PRACTICE_PAGE.id}"] .practice-row--${id}`);
const searchBar = () => seen($(".menu-bar .search-wrapper"));
// The top list on screen in the sidebar, so a world or area can be pointed at (Back, as the player would).
const showTopList = () => {
    if (!isRail()) menuLevel.val = null;
};
const undone = () => practiceActions.val.filter((action) => action.undoneAt).length;
let undoneBefore = 0;

const STEPS = [
    {
        parts: () => [
            {
                say: () => ["Press ", key("Ctrl K"), ". Type ", word("practice"), "."],
                target: searchBar,
                yields: ".menu-search-results:not([hidden])",
                done: onPractice,
            },
        ],
    },
    {
        parts: () => [
            {
                say: () => ["Type ", word("stone"), ". Only this page's rows stay."],
                target: searchBar,
                done: () => onPractice() && searchHits.val?.size > 0 && searchHits.val.size < PRACTICE_ROWS.length,
            },
            {
                say: () => ["Now try ", word("Everywhere"), "."],
                target: () =>
                    seen([...document.querySelectorAll(".menu-search-scope button")].pop()) ?? seen($(".menu-bar")),
                done: () => searchScope.val === "everywhere",
            },
        ],
    },
    {
        // In the icon rail (the narrow overlay) a world opens at once and its list is the line above the page.
        start: showTopList,
        parts: () =>
            isRail()
                ? [
                      {
                          say: () => ["Your worlds live here. Tap ", word("W1"), "."],
                          target: () => entry(1),
                          side: "right",
                          done: () => store.app.activeTab === VIEWS.PAGES.id && store.app.menuWorld === 1,
                      },
                      {
                          say: () => ["Its list opens here."],
                          target: () => seen($(".syslist-toggle")),
                          done: () => $(".syslist-toggle")?.getAttribute("aria-expanded") === "true",
                      },
                  ]
                : [
                      {
                          say: () => ["Your worlds live here. Open ", word("World 1"), "."],
                          target: () => entry(1),
                          side: "right",
                          done: () => menuLevel.val === 1,
                      },
                      {
                          say: () => [word("Back"), " takes you up."],
                          target: () => seen($(".sidebar .menu-panel:not(.is-leaving) .drill-back")),
                          side: "right",
                          done: () => menuLevel.val === null,
                      },
                  ],
    },
    {
        start: openPractice,
        parts: () => [
            {
                say: () => ["Make it ", word("10"), ". Press ", key("Enter"), "."],
                target: () => seen(practiceRow("stone")?.querySelector(".number-input-wrapper")),
                done: () => practiceValues.stone.val === 10,
            },
        ],
    },
    {
        start: () => (undoneBefore = undone()),
        parts: () => [
            {
                say: () => ["Changed your mind? ", word("Undo"), "."],
                target: () => seen(practiceRow("stone")?.querySelector(".save-state__undo")),
                done: () => undone() > undoneBefore,
            },
        ],
    },
    // Step 6, Set all in the practice tray, goes here once the shared Set all lands (feat/set-all).
    {
        start: showTopList,
        parts: () => [
            {
                say: () => ["Every change lands in ", word("History"), "."],
                target: () => entry("history"),
                side: "right",
                done: () => store.app.activeTab === VIEWS.HISTORY.id,
            },
            {
                say: () => ["The tour lives in ", word("Settings"), "."],
                target: () => entry("settings"),
                side: "right",
                done: () => store.app.activeTab === VIEWS.CONFIG.id,
            },
        ],
    },
];
// The last line, under Settings' "Show the tour again"; it leaves by itself.
const FINISH = { say: () => ["You're set."], target: () => seen($(".tour-again button")) };
const FINISH_MS = 4000;

// The line: its words, the dots and Skip, with a notch toward what it points at.
const words = span({ class: "tour-line__words", "aria-live": "polite" });
const dots = span({ class: "tour-line__dots", "aria-hidden": "true" });
const skip = button({ type: "button", class: "btn-quiet btn-sm tour-line__skip", onclick: () => end() }, "Skip");
const line = div(
    { class: "tour-line" },
    span({ class: "tour-line__notch", "aria-hidden": "true" }),
    words,
    span({ class: "tour-line__foot" }, dots, skip)
);

let step = 0;
let parts = [];
let part = 0;
let finishing = false;
let frame = 0;
let finishTimer = null;
let recheck = null;
let shownAt = null;

const say = (current) => {
    const last = current === FINISH;
    words.replaceChildren(
        last ? "" : span({ class: "sr-only" }, `Step ${step + 1} of ${STEPS.length}. `),
        ...current.say()
    );
    dots.replaceChildren(
        ...STEPS.map((_s, i) =>
            span({ class: `tour-dot ${last || i === step ? "is-now" : i < step ? "is-done" : ""}` })
        )
    );
    skip.hidden = last;
    // A new line rises in once; following its target as the page moves doesn't.
    line.classList.remove("is-new");
    void line.offsetWidth;
    line.classList.add("is-new");
};

const begin = (index) => {
    step = index;
    STEPS[step].start?.();
    parts = STEPS[step].parts();
    part = 0;
    say(parts[0]);
};

const GAP = 10;
const EDGE = 14;

// Put the line by its target: under it (or above, without room), or to its right; a missing target docks it at the
// bottom of the window. Runs every frame while the tour is on, so it follows scrolling, sliding lists and resizing.
const place = (current) => {
    const target = current.target();
    const yielded = current.yields && seen($(current.yields));
    line.hidden = Boolean(yielded);
    if (yielded) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const own = line.getBoundingClientRect();
    let x;
    let y;
    let side = target ? current.side || "below" : "docked";
    let notch = 0;
    if (side === "right") {
        const box = target.getBoundingClientRect();
        x = box.right + GAP;
        y = Math.min(Math.max(box.top + box.height / 2 - own.height / 2, EDGE), height - own.height - EDGE);
        notch = box.top + box.height / 2 - y;
    } else if (side === "below") {
        const box = target.getBoundingClientRect();
        // A wide target (the search bar) is pointed at near its start; a small one at its middle.
        const aim = box.width > 240 ? box.left + 36 : box.left + box.width / 2;
        x = Math.min(Math.max(aim - (box.width > 240 ? 24 : own.width / 2), EDGE), width - own.width - EDGE);
        y = box.bottom + GAP;
        if (y + own.height > height - EDGE && box.top - GAP - own.height > EDGE) {
            side = "above";
            y = box.top - GAP - own.height;
        }
        notch = aim - x;
    } else {
        x = (width - own.width) / 2;
        y = height - own.height - EDGE * 2;
    }
    line.dataset.side = side;
    line.style.setProperty("--tour-x", `${Math.round(x)}px`);
    line.style.setProperty("--tour-y", `${Math.round(y)}px`);
    line.style.setProperty("--tour-notch", `${Math.round(notch)}px`);
};

const tick = () => {
    if (!tourRunning.val) return;
    if (!finishing) {
        while (parts[part].done()) {
            part++;
            if (part < parts.length) say(parts[part]);
            else if (step + 1 < STEPS.length) begin(step + 1);
            else {
                finish();
                break;
            }
        }
    }
    place(finishing ? FINISH : parts[part]);
    frame = requestAnimationFrame(tick);
};

const markDone = () =>
    saveTour(true).catch((error) => console.warn("[tour] Couldn't keep the tour as done; it shows next start.", error));

// "You're set." under Settings' row, all dots lit, then the tour ends by itself, or on the player's next press.
const finish = () => {
    finishing = true;
    shownAt = Date.now();
    markDone();
    say(FINISH);
    finishTimer = setTimeout(() => end({ saved: true }), FINISH_MS);
};

const onKey = (e) => {
    if (e.key === "Escape") end();
};
// A press after "You're set." has been read ends it early.
const onPress = () => {
    if (finishing && Date.now() - shownAt > 600) end({ saved: true });
};
// The browser menu and the in-game overlay can both show the tour: once one of them ends it, the other follows.
const checkElsewhere = () =>
    fetchTour()
        .then(({ done }) => done && tourRunning.val && !finishing && end({ saved: true }))
        .catch(() => {});

/** End the tour: Skip, Escape, the last line leaving, or the other menu ending it. */
const end = ({ saved = false } = {}) => {
    if (!tourRunning.val) return;
    if (!saved) markDone();
    tourRunning.val = false;
    finishing = false;
    cancelAnimationFrame(frame);
    clearTimeout(finishTimer);
    clearInterval(recheck);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onPress, true);
    window.removeEventListener("focus", checkElsewhere);
    line.remove();
    holdUndo.on = false;
    // The Practice page and its History go with the tour.
    if (onPractice()) store.openMenu({ view: "HOME" });
    if (store.app.menuWorld === PRACTICE_WORLD.id) {
        store.app.menuWorld = null;
        store.app.menuPage = "";
    }
    if (menuTree.val) menuTree.val = menuTree.val.filter((world) => world !== PRACTICE_WORLD);
    clearPractice();
};

const whenPagesLoaded = () =>
    new Promise((resolve) => {
        if (menuTree.val) return resolve();
        van.derive(() => menuTree.val && resolve());
    });

/**
 * Start the tour. `again` (Settings' "Show the tour again") counts it as not done until it ends again, so a reload
 * on the way starts it over, as on the first start.
 */
export const startTour = async ({ again = false } = {}) => {
    if (tourRunning.val) return;
    tourRunning.val = true;
    if (again) saveTour(false).catch(() => {});
    await whenPagesLoaded();
    if (!tourRunning.val) return;
    resetPractice();
    clearPractice();
    menuTree.val = [...menuTree.val.filter((world) => world.id !== PRACTICE_WORLD.id), PRACTICE_WORLD];
    holdUndo.on = true;
    // First in the page, so Tab from the top of the page reaches Skip first.
    document.body.prepend(line);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("focus", checkElsewhere);
    recheck = setInterval(checkElsewhere, 15000);
    begin(0);
    frame = requestAnimationFrame(tick);
};

/** At the menu's start: the tour starts by itself until it was finished or skipped, here or in the other menu. */
export const startTourOnFirstOpen = () =>
    fetchTour()
        .then(({ done }) => done || startTour())
        .catch((error) => console.warn("[tour] Couldn't tell whether the tour was done; it waits.", error));
