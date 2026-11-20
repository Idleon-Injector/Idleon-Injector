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
import { gga, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    cleanName,
    oneAtATime,
    sortPrefixedNumericCodes,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { renderPersistentPagePanes, renderTabNav } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const PAGES = [
    { id: 0, label: "COMBAT" },
    { id: 1, label: "SKILLS" },
    { id: 2, label: "MISC" },
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

const StampRow = ({ page, order, name, step, levelState, maxLevelState, exaltedCodes, setExalted }) => {
    const stampCode = makeExaltedStampCode(page, order);
    const isExalted = van.derive(() => exaltedCodes.val.has(stampCode));

    return ClampedLevelRow({
        valueState: levelState,
        max: Infinity,
        write: async (nextLevel) => {
            const maxLevel = step > 0 && nextLevel > 0 ? Math.ceil(nextLevel / step) * step : nextLevel;
            const levelPath = `StampLevel[${page}][${order}]`;
            const maxPath = `StampLevelMAX[${page}][${order}]`;

            await writeManyVerified([
                { path: levelPath, value: nextLevel },
                { path: maxPath, value: maxLevel },
            ]);
            maxLevelState.val = maxLevel;

            return nextLevel;
        },
        indexLabel: `#${order}`,
        name,
        rowClass: () => (isExalted.val ? "stamp-row--exalted" : ""),
        renderExtraActions: ({ status, run, applyValue }) => [
            StateSwitch({
                checked: isExalted,
                words: ["Exalted", "Not exalted"],
                name: `${name} exalted`,
                title: `Exalted stamp (${stampCode})`,
                // The switch says how its save went; the row's save state says saving… and ✓ (or the level's failure).
                ownStatus: true,
                onFlip: (exalted) => setExalted(stampCode, exalted, run),
            }),
            ActionButton({
                label: "Relock",
                status,
                variant: "danger",
                tooltip: "Set both StampLevel and StampLevelMAX to 0",
                onClick: (e) => {
                    e.preventDefault();
                    void applyValue(0);
                },
            }),
        ],
    });
};

const StampsTab = () => {
    const activePage = van.state(0);
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

    const pageContainers = renderPersistentPagePanes({
        tabs: PAGES,
        activeId: activePage,
    });

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
                const rows = Array.from({ length: count }, (_, i) => {
                    const stampKey = `Stamp${letter}${i + 1}`;
                    const entry = rawItemDefs[stampKey];
                    const name = cleanName(entry?.displayName, `Stamp ${letter}${i + 1}`);
                    const parts = (entry?.desc_line1 || "").split(",");
                    const step = parseInt(parts[4], 10) || 0;

                    return StampRow({
                        page,
                        order: i,
                        name,
                        step,
                        levelState: getCellState(levelStatesByPage, page, i),
                        maxLevelState: getCellState(maxLevelStatesByPage, page, i),
                        exaltedCodes,
                        setExalted,
                    });
                });

                pageContainers[page].replaceChildren(...rows);
                pageRowCounts[page] = count;
            }
        });

    load();

    const body = div({ class: "account-list" }, ...pageContainers);

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "STAMPS",
        description: "Change stamp levels and toggle exalted stamps",
        actions: RefreshButton({
            onRefresh: load,
            tooltip: "Re-read stamp data from game memory",
        }),
        subNav: renderTabNav({
            tabs: PAGES,
            activeId: activePage,
            navClass: "account-page-nav",
            buttonClass: "account-page-btn",
        }),
        state: { loading, error },
        loadingText: "READING STAMPS",
        errorTitle: "STAMP READ FAILED",
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
