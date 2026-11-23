/**
 * The first-start tour (#200): the player learns the menu by doing it. One short line by the thing it points at; the
 * tour waits for the player to do it and moves on by itself. Small dots show how far along it is; Skip or Escape ends
 * it at once. Everything is practised on the Practice page (practice.js), which is in the menu only while the tour
 * runs: nothing the tour does writes to the game, so it works with the game closed. It ends with the player finding a
 * real page; "You're set." shows once under its title.
 *
 * A line never covers what the player reads: it sits in the free room beside the page when the window has it, else it
 * makes room for itself in the page, right after something (it moves what is under it down while it shows).
 *
 * Steps are a list: a step is `{ start?, parts }`, and `parts()` gives its lines in order, each
 * `{ say, target, beside?, after?, yields?, done }`: `say()` the words; `target()` the element the notch points at
 * (null: the line waits at the bottom of the window); `beside()` the element whose free right side it takes when
 * there is room; `after()` the element it follows in the page otherwise (none: it floats beside its target); `yields`
 * a selector it keeps its room but hides behind while that shows (the search's results); `done()` true once the
 * player did it. A new step (a config pick, with #198) is one entry; the dots count the steps.
 */
import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS } from "../state/constants.js";
import { menuTree } from "../menu/pageRegistry.js";
import { searchHits } from "../menu/pageSearch.js";
import { closeSearch, searchScope } from "../components/MenuSearch.js";
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
const practicePanel = () => practiceRow("stone")?.closest(".tabbed-list");
const bar = () => seen($(".menu-bar"));
const searchBar = () => seen($(".menu-bar .search-wrapper"));
// Right under the search bar, in the page: a line there makes room for itself.
const underBar = () => $(".menu-top > .menu-bar");
const RESULTS = ".menu-search-results:not([hidden])";
// The top list on screen in the sidebar, so a world or area can be pointed at (Back, as the player would).
const showTopList = () => {
    if (!isRail()) menuLevel.val = null;
};
const undone = () => practiceActions.val.filter((action) => action.undoneAt).length;
let undoneBefore = 0;
let opensBefore = 0;
// The practice saves that set several rows at once (Set all's).
const bulkSaves = () => practiceActions.val.filter((action) => action.entries.length > 1).length;
let bulkBefore = 0;

const STEPS = [
    {
        // On a page with rows the bar searches the page first: here it searches the menu, so "practice" is found.
        start: () => (searchScope.val = "everywhere"),
        parts: () => [
            {
                say: () => ["Press ", key("Ctrl K"), ". Type ", word("practice"), "."],
                target: searchBar,
                beside: bar,
                after: underBar,
                yields: RESULTS,
                done: onPractice,
            },
        ],
    },
    {
        parts: () => [
            {
                say: () => ["Type ", word("stone"), ". Only this page's rows stay."],
                target: searchBar,
                beside: bar,
                after: underBar,
                done: () => onPractice() && searchHits.val?.size > 0 && searchHits.val.size < PRACTICE_ROWS.length,
            },
        ],
    },
    {
        start: openPractice,
        parts: () => [
            {
                say: () => ["Make it ", word("10"), ". Press ", key("Enter"), "."],
                target: () => seen(practiceRow("stone")?.querySelector(".number-input-wrapper")),
                beside: practicePanel,
                after: () => practiceRow("stone"),
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
                beside: practicePanel,
                after: () => practiceRow("stone"),
                done: () => undone() > undoneBefore,
            },
        ],
    },
    {
        // The search from "stone" is cleared, so Set all acts on every practice row.
        start: () => {
            closeSearch();
            bulkBefore = bulkSaves();
        },
        parts: () => [
            {
                say: () => [word("Set all"), " of them at once."],
                target: () => seen(practicePanel()?.querySelector(".tabbed-list__head .account-setall-row")),
                beside: practicePanel,
                after: () => practicePanel()?.querySelector(".tabbed-list__head"),
                done: () => bulkSaves() > bulkBefore,
            },
        ],
    },
    {
        start: showTopList,
        parts: () => [
            {
                say: () => ["Every change lands in ", word("History"), "."],
                // Beside the entry, over the Practice page's empty lower end. In the rail the rows reach down there,
                // so it makes room for itself under the Practice list instead, the notch toward the rail.
                target: () => entry("history"),
                after: () => (isRail() ? practicePanel() : null),
                done: () => store.app.activeTab === VIEWS.HISTORY.id,
            },
        ],
    },
    {
        // The search finds the whole menu here; any real place the player opens (by search, the sidebar or Home)
        // ends the tour. It only moves around, so nothing is written.
        start: () => {
            searchScope.val = "everywhere";
            opensBefore = store.app.menuOpens;
        },
        parts: () => [
            {
                say: () => ["Now find something real."],
                target: searchBar,
                beside: bar,
                after: underBar,
                yields: RESULTS,
                done: () =>
                    store.app.menuOpens > opensBefore && !onPractice() && store.app.activeTab !== VIEWS.HISTORY.id,
            },
        ],
    },
];
// The last line, once, under the title of the real page the player opened; it leaves by itself.
const pageTitle = () =>
    [...document.querySelectorAll(".tab-pane.active .account-tab-header__title")].find(
        (title) => seen(title) && !title.closest(".world-sub-pane:not(.active)")
    ) ?? null;
const FINISH = { say: () => ["You're set."], target: pageTitle, after: pageTitle };
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
let fadeTimer = null;

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
// The least free room beside the page a line takes; with less it makes room for itself in the page instead.
const ROOM = 300;

const px = (name, value) => line.style.setProperty(name, `${Math.round(value)}px`);

// Over the page at `x` (the free room right of the page, or right of its target), level with its target; `room` is
// the width it may take there.
const float = (target, x, room) => {
    if (line.parentElement !== document.body) document.body.prepend(line);
    line.classList.remove("is-flow", "is-waiting");
    px("--tour-max", room);
    const own = line.getBoundingClientRect();
    const height = window.innerHeight;
    if (!target) {
        line.dataset.side = "docked";
        px("--tour-x", (window.innerWidth - own.width) / 2);
        px("--tour-y", height - own.height - EDGE * 2);
        return;
    }
    const box = target.getBoundingClientRect();
    const y = Math.min(Math.max(box.top + box.height / 2 - own.height / 2, EDGE), height - own.height - EDGE);
    line.dataset.side = "right";
    px("--tour-x", x);
    px("--tour-y", y);
    px("--tour-notch", box.top + box.height / 2 - y);
};

// In the page after `anchor`, making room for itself: under its target with the notch up at it, or beside the rail
// with the notch toward it. While `waiting` it keeps its room, hidden, so nothing under it jumps.
const flow = (target, anchor, waiting) => {
    if (anchor.nextElementSibling !== line) anchor.after(line);
    line.classList.add("is-flow");
    line.classList.toggle("is-waiting", waiting);
    const own = line.getBoundingClientRect();
    const start = own.left - (parseFloat(line.style.getPropertyValue("--tour-shift")) || 0);
    const box = target.getBoundingClientRect();
    if (box.right <= start) {
        line.dataset.side = "right";
        px("--tour-shift", 0);
        px("--tour-notch", box.top + box.height / 2 - own.top);
        return;
    }
    const parent = line.parentElement;
    const end = parent.getBoundingClientRect().right - parseFloat(getComputedStyle(parent).paddingRight);
    // A wide target (the search bar) is pointed at near its start; a small one at its middle.
    const aim = box.width > 240 ? box.left + 36 : box.left + box.width / 2;
    const left = Math.max(Math.min(aim - (box.width > 240 ? 24 : own.width / 2), end - own.width), start);
    line.dataset.side = "below";
    px("--tour-shift", left - start);
    px("--tour-notch", aim - left);
};

// Where the line goes for `current`; runs every frame while the tour is on, so it follows scrolling, sliding lists
// and resizing.
const place = (current) => {
    const target = current.target();
    const width = window.innerWidth;
    const besideBox = target && current.beside?.()?.getBoundingClientRect();
    const anchor = target && current.after?.();
    if (besideBox && width - besideBox.right - GAP - EDGE >= ROOM)
        float(target, besideBox.right + GAP, width - besideBox.right - GAP - EDGE);
    else if (anchor) flow(target, anchor, Boolean(current.yields && seen($(current.yields))));
    else if (target) {
        const box = target.getBoundingClientRect();
        float(target, box.right + GAP, width - box.right - GAP - EDGE);
    } else float(null, 0, Math.min(width - EDGE * 2, 432));
};

const tick = () => {
    if (!tourRunning.val && !finishing) return;
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

// The tour is done: it ends at once (the Practice page goes, it's kept as done), and "You're set." shows under the
// real page's title, all dots lit, then fades by itself, or on the player's next press or Escape.
const finish = () => {
    end();
    finishing = true;
    shownAt = Date.now();
    say(FINISH);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    finishTimer = setTimeout(close, FINISH_MS);
};

// The line goes: at once, or (the last one) fading.
const close = () => {
    cancelAnimationFrame(frame);
    clearTimeout(finishTimer);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onPress, true);
    clearTimeout(fadeTimer);
    line.classList.remove("is-leaving");
    if (!finishing) return line.remove();
    finishing = false;
    line.classList.add("is-leaving");
    fadeTimer = setTimeout(() => {
        line.remove();
        line.classList.remove("is-leaving");
    }, 300);
};

const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (finishing) close();
    else end();
};
// A press after "You're set." has been read closes it early.
const onPress = () => {
    if (finishing && Date.now() - shownAt > 600) close();
};
// The browser menu and the in-game overlay can both show the tour: once one of them ends it, the other follows.
const checkElsewhere = () =>
    fetchTour()
        .then(({ done }) => done && tourRunning.val && end({ saved: true }))
        .catch(() => {});

/** End the tour: Skip, Escape, finding a real page, or the other menu ending it. */
const end = ({ saved = false } = {}) => {
    if (!tourRunning.val) return;
    if (!saved) markDone();
    tourRunning.val = false;
    clearInterval(recheck);
    window.removeEventListener("focus", checkElsewhere);
    close();
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
    // "You're set." from the last time, still on screen or fading, goes at once.
    finishing = false;
    close();
    tourRunning.val = true;
    if (again) saveTour(false).catch(() => {});
    await whenPagesLoaded();
    if (!tourRunning.val) return;
    resetPractice();
    clearPractice();
    menuTree.val = [...menuTree.val.filter((world) => world.id !== PRACTICE_WORLD.id), PRACTICE_WORLD];
    holdUndo.on = true;
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
