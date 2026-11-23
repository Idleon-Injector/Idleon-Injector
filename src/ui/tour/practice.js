/**
 * The first-start tour's Practice page (#200): the real page layout and the real rows, with a write that does
 * nothing. Its values live here in the menu; each save is logged as practice (changeLog.js), so the row's ✓ and Undo
 * and History work as they do on every page, and nothing reaches the game. The page is in the menu only while the
 * tour runs (Tour.js adds and removes PRACTICE_WORLD).
 */
import van from "../vendor/van-1.6.0.js";
import { ClampedLevelRow } from "../components/views/account/ClampedLevelRow.js";
import { PersistentAccountListPage } from "../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../components/views/account/tabShared.js";
import { logPractice } from "../services/changeLog.js";

const { div } = van.tags;

/** Whether the tour is on screen (Tour.js sets it; Settings' "Show the tour again" waits while it is). */
export const tourRunning = van.state(false);

/** The practice rows, each 0 to MAX: names the top bar's search can tell apart, and where each starts. */
export const PRACTICE_ROWS = [
    { key: "stone", name: "Practice stone", start: 3 },
    { key: "ore", name: "Practice ore", start: 6 },
    { key: "log", name: "Practice log", start: 1 },
];
const MAX = 15;

/** Each practice row's value, by key. */
export const practiceValues = Object.fromEntries(PRACTICE_ROWS.map((row) => [row.key, van.state(row.start)]));

/** Every practice row back where it starts. */
export const resetPractice = () => PRACTICE_ROWS.forEach((row) => (practiceValues[row.key].val = row.start));

const PracticePage = () => {
    const loaded = { loading: van.state(false), error: van.state("") };
    const rows = PRACTICE_ROWS.map((row) => {
        const value = practiceValues[row.key];
        const held = { read: () => value.val, write: (next) => (value.val = next) };
        return ClampedLevelRow({
            valueState: value,
            max: MAX,
            name: row.name,
            maxAction: true,
            rowClass: `practice-row practice-row--${row.key}`,
            // The write that does nothing: logged as practice (before any await, as a page's save is), then kept here.
            write: async (next) => {
                logPractice(row.name, value.val, next, held);
                value.val = next;
                return next;
            },
        });
    });
    // Step 6 (Set all in the tray) adds the shared Set all here once it lands (feat/set-all): ListPanel's `setAll`.
    const body = div({ class: "account-list account-list--tabbed" }, ListPanel({ body: rows }));
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Practice",
        description: "Nothing here reaches your game.",
        state: loaded,
        initialWrapperClass: "account-list",
        body,
    });
};

/** The Practice page, as the menu holds a page. */
export const PRACTICE_PAGE = Object.freeze({
    id: "practice",
    world: "practice",
    system: "Practice",
    description: "Nothing here reaches your game.",
    keywords: [],
    component: PracticePage,
});

/**
 * The menu's place for it while the tour runs: a level of its own, like a world, found by search as "Practice".
 * `tour` keeps it off Home's list of worlds.
 */
export const PRACTICE_WORLD = Object.freeze({
    id: "practice",
    tour: true,
    code: "TRY",
    label: "Tour",
    name: "Tour",
    folder: null,
    systems: [{ name: "Practice", pages: [PRACTICE_PAGE] }],
});
