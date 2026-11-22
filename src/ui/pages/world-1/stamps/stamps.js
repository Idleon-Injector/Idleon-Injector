/**
 * W1 - Stamps Tab
 *
 * Data sources:
 *   StampLevel[page][order]    -> current stamp level
 *   StampLevelMAX[page][order] -> unlocked max level
 *   Compass[4]                 -> exalted stamp codes
 *
 * Stamp definition lookup:
 *   ItemDefinitionsGET.h.Stamp{A|B|C}{N}.displayName -> stamp name
 *   ItemDefinitionsGET.h.Stamp{A|B|C}{N}.desc_line1  -> step metadata (index 4)
 *
 * Exalted code format in Compass[4]:
 *   "_1" -> page 0, stamp index 1
 *   "a0" -> page 1, stamp index 0
 *   "b4" -> page 2, stamp index 4
 *
 * SET behavior:
 *   Writes both StampLevel and StampLevelMAX.
 *   StampLevelMAX is rounded up to the next step boundary.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { SetAllNumberControl, refuseSetAll } from "../../../components/views/account/BulkActionBar.js";
import {
    cleanName,
    oneAtATime,
    resolveNumberInput,
    runBulkSet,
    sortPrefixedNumericCodes,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// `noun` is the tab in a sentence ("30 skill stamps").
const PAGES = [
    { id: 0, section: "combat", label: "Combat", noun: "combat" },
    { id: 1, section: "skills", label: "Skills", noun: "skill" },
    { id: 2, section: "misc", label: "Misc", noun: "misc" },
];
const PAGE_LETTERS = ["A", "B", "C"];
const EXALTED_PAGE_PREFIXES = ["_", "a", "b"];
const EXALTED_CODE_REGEX = /^[_ab]\d+$/;

const normalizeExaltedCodes = (rawCodes) =>
    (rawCodes instanceof Set
        ? [...rawCodes]
        : rawCodes && typeof rawCodes !== "string" && typeof rawCodes[Symbol.iterator] === "function"
          ? [...rawCodes]
          : toIndexedArray(rawCodes)
    )
        .map((code) =>
            String(code ?? "")
                .trim()
                .toLowerCase()
        )
        .filter((code) => EXALTED_CODE_REGEX.test(code));

const makeExaltedStampCode = (page, order) => `${EXALTED_PAGE_PREFIXES[page] ?? "_"}${order}`;

// A stamp's bonus in the game's own words: its description's 12th part, "{}%_Total_Damage" -> "Total Damage %". The
// number is the game's, worked out with many multipliers, so only the words show.
const stampBonus = (template = "") => {
    const words = template.replace(/{}%?/, "").replace(/[_|]/g, " ").trim();
    return words && template.includes("{}%") ? `${words} %` : words;
};

// A stamp's max level goes up in its step: a level saved is rounded up to the next step for the max.
const maxLevelFor = (step, level) => (step > 0 && level > 0 ? Math.ceil(level / step) * step : level);

const StampRow = ({ page, order, name, bonus, step, levelState, maxLevelState, exaltedCodes, setExalted }) => {
    const stampCode = makeExaltedStampCode(page, order);
    const isExalted = van.derive(() => exaltedCodes.val.has(stampCode));

    return ClampedLevelRow({
        valueState: levelState,
        max: Infinity,
        write: async (nextLevel) => {
            const maxLevel = maxLevelFor(step, nextLevel);
            const levelPath = `StampLevel[${page}][${order}]`;
            const maxPath = `StampLevelMAX[${page}][${order}]`;

            await writeManyVerified([
                { path: levelPath, value: nextLevel },
                { path: maxPath, value: maxLevel },
            ]);
            maxLevelState.val = maxLevel;

            return nextLevel;
        },
        renderInfo: () => [span({ class: "account-row__index" }, `#${order}`), RowTitles({ bonus, name })],
        rowClass: () => (isExalted.val ? "stamp-row--exalted" : ""),
        renderExtraActions: ({ status, run, applyValue }) => [
            StateSwitch({
                checked: isExalted,
                // Only an exalted stamp says so; "Not exalted" on every other row was noise (the switch already shows it).
                words: ["Exalted", ""],
                name: `${name} exalted`,
                // The switch says how its save went; the row's save state says saving… and ✓ (or the level's failure).
                ownStatus: true,
                onFlip: (exalted) => setExalted(stampCode, exalted, run),
            }),
            ActionButton({
                label: "Relock",
                status,
                variant: "danger",
                onClick: (e) => {
                    e.preventDefault();
                    void applyValue(0);
                },
            }),
        ],
    });
};

const StampsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Stamps" });
    const exaltedCodes = van.state(new Set());
    const levelStatesByPage = PAGE_LETTERS.map(() => []);
    const maxLevelStatesByPage = PAGE_LETTERS.map(() => []);
    const pageRowCounts = Array(PAGE_LETTERS.length).fill(-1);

    const getCellState = (grid, page, order) => {
        if (!grid[page][order]) grid[page][order] = van.state(0);
        return grid[page][order];
    };

    const readExaltedCodes = async () => (exaltedCodes.val = new Set(normalizeExaltedCodes(await gga("Compass[4]"))));

    // Every exalted stamp lives in one list, so flips save one at a time, each from the list the game holds now:
    // a stamp exalted in the game, or by a flip still saving, isn't written over.
    // The row's run is asked at once, so a level committed after the flip on that row still saves after it.
    const inTurn = oneAtATime();
    const setExalted = (code, exalted, run) =>
        run(
            () =>
                inTurn(async () => {
                    try {
                        const next = new Set(normalizeExaltedCodes(await gga("Compass[4]")));
                        if (exalted) next.add(code);
                        else next.delete(code);
                        await writeVerified("Compass[4]", [...next].sort(sortPrefixedNumericCodes));
                        exaltedCodes.val = next;
                    } catch (error) {
                        await readExaltedCodes().catch(() => {}); // the switch then shows what the game holds
                        throw error;
                    }
                }),
            "switch"
        );

    // Each stamp page is a tab; its rows live in its pane.
    const pageContainers = PAGES.map(() => div({ class: "account-page-pane" }));
    // What a tab's bulk tools act on: each stamp's order, step and states, kept by load beside its rows.
    const stampsByPage = van.state(PAGES.map(() => []));

    // The open tab's tools. They share one status, so a bulk write runs alone; each reads its tab when pressed, and a
    // question asked on one tab is asked again on another.
    const bulk = useWriteStatus();
    const setAllInput = van.state("");
    const typedLevel = () => resolveNumberInput(setAllInput.val, { min: 0, fallback: null });

    const pageOf = (activeId) => PAGES.find((p) => p.section === activeId.val);
    // A tab's stamps the tools act on: all of them, or the ones the top bar's search shows.
    const stampsOn = (p) => stampsByPage.val[p.id].filter((stamp) => shownBySearch(stamp.row));
    const stampWord = (p, n) => `${p.noun} stamp${n === 1 ? "" : "s"}`;
    const toolsLabel = (activeId) => {
        const p = pageOf(activeId);
        const n = stampsOn(p).length;
        return isSearching() ? `${n} matching ${stampWord(p, n)}` : `All ${n} ${stampWord(p, n)}`;
    };

    const tools = (activeId, ask) => {
        const page = () => pageOf(activeId);
        const codesOn = (p) => stampsOn(p).map((stamp) => makeExaltedStampCode(p.id, stamp.order));
        const exaltedOn = (p) => codesOn(p).filter((code) => exaltedCodes.val.has(code)).length;

        const writeLevels = (p, level) =>
            bulk.run(() =>
                runBulkSet({
                    entries: stampsOn(p),
                    getTargetValue: () => level,
                    getValueState: (stamp) => stamp.levelState,
                    getWrites: ({ entry, currentValue, targetValue }) =>
                        Number(currentValue) === targetValue
                            ? []
                            : [
                                  { path: `StampLevel[${p.id}][${entry.order}]`, value: targetValue },
                                  {
                                      path: `StampLevelMAX[${p.id}][${entry.order}]`,
                                      value: maxLevelFor(entry.step, targetValue),
                                  },
                              ],
                    applyLocal: (stamp, _, target) => {
                        stamp.levelState.val = target;
                        stamp.maxLevelState.val = maxLevelFor(stamp.step, target);
                    },
                })
            );
        // Lowering takes levels away, so it asks first (in the tray); raising runs on one click.
        const setAll = () => {
            const level = typedLevel();
            if (level === null) return refuseSetAll(setAllInput);
            const p = page();
            const lowered = stampsOn(p).filter((stamp) => Number(stamp.levelState.val) > level).length;
            if (!lowered) return writeLevels(p, level);
            ask({
                question: `Lower ${lowered} ${stampWord(p, lowered)} to level ${level}?`,
                confirmLabel: lowered === 1 ? "Lower it" : "Lower them",
                from: setAllControl.querySelector(".account-btn"),
                onConfirm: () => writeLevels(p, level),
            });
            return undefined;
        };

        // Every exalt lives in one list: the tab's codes go in (or out) in one write, in turn with the rows' switches.
        const exaltAll = (exalted) => {
            const p = page();
            const codes = codesOn(p);
            return bulk.run(() =>
                inTurn(async () => {
                    try {
                        const next = new Set(normalizeExaltedCodes(await gga("Compass[4]")));
                        codes.forEach((code) => (exalted ? next.add(code) : next.delete(code)));
                        await writeVerified("Compass[4]", [...next].sort(sortPrefixedNumericCodes));
                        exaltedCodes.val = next;
                    } catch (error) {
                        await readExaltedCodes().catch(() => {});
                        throw error;
                    }
                })
            );
        };

        const setAllControl = SetAllNumberControl({
            label: "",
            placeholder: "Level",
            value: setAllInput,
            status: bulk.status,
            onApply: setAll,
        });
        // Taking exalts away asks first, in the tray.
        const unexaltAll = ActionButton({
            label: "Unexalt all",
            status: bulk.status,
            variant: "danger",
            disabled: () => exaltedOn(page()) === 0,
            onClick: (e) => {
                e.preventDefault();
                const p = page();
                const n = exaltedOn(p);
                ask({
                    question: `Unexalt ${n} ${stampWord(p, n)}?`,
                    confirmLabel: n === 1 ? "Unexalt it" : "Unexalt them",
                    from: unexaltAll,
                    onConfirm: () => exaltAll(false),
                });
            },
        });

        return [
            setAllControl,
            div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Exalt all",
                    status: bulk.status,
                    disabled: () => exaltedOn(page()) === stampsOn(page()).length,
                    onClick: (e) => {
                        e.preventDefault();
                        void exaltAll(true);
                    },
                }),
                unexaltAll
            ),
        ];
    };

    const load = async () =>
        run(async () => {
            const [levels, maxLevels, rawExaltedCodes] = await Promise.all([
                gga("StampLevel"),
                gga("StampLevelMAX"),
                gga("Compass[4]"),
            ]);

            const levelsByPage = toIndexedArray(levels);
            const maxLevelsByPage = toIndexedArray(maxLevels);

            const stampCounts = PAGE_LETTERS.map((_, page) => {
                const levelsOnPage = toIndexedArray(levelsByPage[page]);
                const maxLevelsOnPage = toIndexedArray(maxLevelsByPage[page]);
                return Math.max(levelsOnPage.length, maxLevelsOnPage.length);
            });
            const needsRowRebuild = stampCounts.some((count, page) => pageRowCounts[page] !== count);
            const stampKeys = needsRowRebuild
                ? PAGE_LETTERS.flatMap((letter, page) =>
                      Array.from({ length: stampCounts[page] }, (_, i) => `Stamp${letter}${i + 1}`)
                  )
                : [];

            const rawItemDefs = stampKeys.length
                ? await readGgaEntries("ItemDefinitionsGET.h", stampKeys, ["displayName", "desc_line1"])
                : {};

            exaltedCodes.val = new Set(normalizeExaltedCodes(rawExaltedCodes));

            for (let page = 0; page < PAGE_LETTERS.length; page++) {
                const count = stampCounts[page];
                const levelsOnPage = toIndexedArray(levelsByPage[page]);
                const maxLevelsOnPage = toIndexedArray(maxLevelsByPage[page]);
                for (let i = 0; i < count; i++) {
                    getCellState(levelStatesByPage, page, i).val = Number(levelsOnPage[i] ?? 0);
                    getCellState(maxLevelStatesByPage, page, i).val = Number(maxLevelsOnPage[i] ?? 0);
                }
            }

            for (let page = 0; page < PAGE_LETTERS.length; page++) {
                const count = stampCounts[page];
                if (pageRowCounts[page] === count) continue;

                const letter = PAGE_LETTERS[page];
                const stamps = [];
                const rows = Array.from({ length: count }, (_, i) => {
                    const stampKey = `Stamp${letter}${i + 1}`;
                    const entry = rawItemDefs[stampKey];
                    const name = cleanName(entry?.displayName, `Stamp ${letter}${i + 1}`);
                    const parts = (entry?.desc_line1 || "").split(",");
                    const step = parseInt(parts[4], 10) || 0;
                    const bonus = stampBonus(parts[11]);
                    const row = StampRow({
                        page,
                        order: i,
                        name,
                        bonus,
                        step,
                        levelState: getCellState(levelStatesByPage, page, i),
                        maxLevelState: getCellState(maxLevelStatesByPage, page, i),
                        exaltedCodes,
                        setExalted,
                    });
                    // The row goes with its stamp, so the tools act only on stamps the top bar's search shows.
                    stamps.push({
                        order: i,
                        step,
                        levelState: getCellState(levelStatesByPage, page, i),
                        maxLevelState: getCellState(maxLevelStatesByPage, page, i),
                        row,
                    });
                    return row;
                });

                pageContainers[page].replaceChildren(...rows);
                pageRowCounts[page] = count;
                stampsByPage.val = stampsByPage.val.map((list, at) => (at === page ? stamps : list));
            }
        });

    load();

    const body = div(
        { class: "account-list account-list--tabbed" },
        TabbedList({
            name: "Stamps",
            tabs: PAGES.map((page, i) => ({ id: page.section, label: page.label, content: pageContainers[i] })),
            tools,
            toolsLabel,
        })
    );

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Stamps",
        description: "Change stamp levels and toggle exalted stamps.",
        actions: RefreshButton({
            onRefresh: load,
            tooltip: "Re-read stamp data from game memory",
        }),
        state: { loading, error },
        loadingText: "Reading stamps",
        errorTitle: "Stamp read failed",
        initialWrapperClass: "account-list",
        body,
    });
};

export default definePage({
    id: "w1.stamps",
    world: 1,
    system: "Stamps",
    description: "Stamp levels and exalted stamps.",
    keywords: ["Exalted", "Combat", "Skills", "Misc"],
    component: StampsTab,
});
