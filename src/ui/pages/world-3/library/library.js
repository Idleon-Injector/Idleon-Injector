/**
 * W3 - Active Player Library Tab
 *
 * Shows all talents for the currently active in-game character only.
 * Reads live game state — not a selected database character.
 *
 * Data sources:
 *   readCharacterInPlay()                - who is in play; rejects at character select
 *   gga.CharacterClass                   - active player's class ID
 *   gga.SkillLevelsMAX[talentId]         - max talent level (editable)
 *   cList.TalentOrder        - talent IDs per class page + slot
 *   cList.TalentIconNames    - talent names
 *   cList.ClassNames         - class display names
 *   cList.RANDOlist[16]      - talents shown in Library but blocked with
 *                                          "This Book is not Available"
 *   gga.DNSM.h.TalentDL2                 - available talent points per class page (indexed by group order)
 *
 * Computed:
 *   p._customBlock_WorkbenchStuff("maxBookLv", 0, 0)             — global max book level cap
 *
 * The game's talent pages are tabs: the class path to the character in play, then the special talents. Max books sits
 * in the tray and acts on the open tab's talents the top bar's search shows; the special talents have no book cap.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { CappedValue } from "../../../components/NumberInput.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    CHARACTER_CHANGED,
    NO_CHARACTER,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    normalCase,
    readCharacterInPlay,
    runBulkSet,
    toNum,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const LIBRARY_CLASS_PARENT_OFFSETS = [null, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7];
const SPECIAL_TALENT_ORDER_START = 615;

/**
 * Returns the Library class-page IDs available to the active character.
 * Each 12-class family is a small parent tree; Library shows the path from
 * family root to the active class.
 */
function getLibraryClassPageIds(classId) {
    if (classId < 6) {
        const pageIds = [];
        for (let pageId = 1; pageId <= classId; pageId++) pageIds.push(pageId);
        return pageIds;
    }

    const familyBase = 6 + 12 * Math.floor((classId - 6) / 12);
    const offsets = [];

    for (let offset = classId - familyBase; offset !== null; offset = LIBRARY_CLASS_PARENT_OFFSETS[offset]) {
        offsets.unshift(offset);
    }

    return offsets.map((offset) => familyBase + offset);
}

const getBlockedLibraryTalentIds = (rawBlockedList) => {
    const out = new Set();
    for (const value of toIndexedArray(rawBlockedList ?? [])) {
        const n = Number(value);
        if (Number.isFinite(n)) out.add(n);
    }
    return out;
};

/**
 * The field is the talent's max level (SkillLevelsMAX); its cap is the book cap, what Max books sets it to, so a row
 * reads "150 / 200". Special talents have no book cap and show the value alone. The talent's own points aren't shown.
 */
const TalentRow = ({
    talentId,
    talentName,
    maxState,
    maxBookLvState,
    isBookAvailable,
    isSpecial,
    character,
    checkCharacter,
}) => {
    // A talent the Library has no book for: it says so in its state word, and its max shows without a field.
    if (!isBookAvailable) {
        return AccountRow({
            rowClass: "talent-row",
            rowProps: { "data-talent": talentId },
            info: span({ class: "account-row__name" }, talentName),
            badge: () => (maxState.val === -1 ? "Locked" : "Not a book"),
            controls: () => (maxState.val === -1 ? span() : CappedValue({ value: () => maxState.val })),
        });
    }

    return ClampedLevelRow({
        valueState: maxState,
        // The character the rows were read for, kept by the save even when it waits behind another: it refuses once
        // another is in play, and the game checks again as it writes.
        write: async (nextLevel) => {
            await checkCharacter(character);
            await writeManyVerified([{ path: `SkillLevelsMAX[${talentId}]`, value: nextLevel }], { character });
            return nextLevel;
        },
        max: isSpecial ? Infinity : () => maxBookLvState.val,
        integerMode: isSpecial ? "floor" : null,
        renderInfo: () => span({ class: "account-row__name" }, talentName),
        // A max level of -1 is a talent the character hasn't unlocked: the word says so and the field shows empty.
        renderBadge: () => (maxState.val === -1 ? "Locked" : ""),
        unset: -1,
        rowClass: "talent-row",
    });
};

const buildStaticMeta = async () => {
    const [rawTalentOrder, rawTalentIconNames, rawClassNames, rawBlockedLibraryTalents, rawTalentDescriptions] =
        await Promise.all([
            readCList("TalentOrder"),
            readCList("TalentIconNames"),
            readCList("ClassNames"),
            readCList("RANDOlist[16]"),
            readCList("TalentDescriptions"),
        ]);

    return {
        talentOrder: toIndexedArray(rawTalentOrder ?? []),
        talentIconNames: toIndexedArray(rawTalentIconNames ?? []),
        classNames: toIndexedArray(rawClassNames ?? []),
        blockedLibraryTalentIds: getBlockedLibraryTalentIds(rawBlockedLibraryTalents),
        talentDescriptions: toIndexedArray(rawTalentDescriptions ?? []),
    };
};

const LibraryTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Library" });
    const { status: bulkStatus, run: runBulk } = useWriteStatus();
    const activeClassNameState = van.state("");
    const maxBookLvState = van.state(null);
    const maxStates = new Map();
    const availablePointsStates = new Map();
    const listNode = div({ class: "account-list account-list--tabbed" });
    // Each talent's row and each tab's talents, so Max books acts on the open tab's talents the search shows.
    const rowOf = new Map();
    let groupsShown = [];

    let staticMeta = null;
    let loadedCharacter = null;

    // SkillLevelsMAX is the live copy of whoever is in play: a save goes there only while that is still the
    // character the page shows.
    // The character is taken before the read: a Refresh that ends meanwhile doesn't make the rows the new one's.
    const checkCharacter = async (shown = loadedCharacter) => {
        if (String(await gga("UserInfo[0]")) !== shown) {
            throw new Error(CHARACTER_CHANGED);
        }
    };

    // Each character has its own: a save that lands for one after a Refresh to another stays on its own rows.
    const getMaxState = (character, talentId) => getOrCreateState(maxStates, `${character}:${talentId}`);
    const getAvailablePointsState = (classId) => getOrCreateState(availablePointsStates, classId);

    const rowReconciler = createStaticRowReconciler(listNode);

    const doMaxAll = async (talentIds) => {
        const cap = toNum(maxBookLvState.val, 0);
        if (!talentIds.length || cap <= 0) return;

        // The character the rows were read for: the game checks it again as it writes.
        const character = loadedCharacter;
        await runBulk(async () => {
            try {
                await checkCharacter(character);
            } catch (caughtError) {
                // The page shows who is in play now.
                await load();
                throw caughtError;
            }
            await runBulkSet({
                character,
                entries: talentIds,
                getTargetValue: () => cap,
                getValueState: (talentId) => getMaxState(character, talentId),
                getPath: (talentId) => `SkillLevelsMAX[${talentId}]`,
                shouldWrite: ({ currentValue, targetValue }) => toNum(currentValue) !== targetValue,
            });
        });
    };

    // The open tab's talents Max books can set: books, not the special talents, and only those the search shows.
    const booksShown = (tabId) => {
        const group = groupsShown.find((entry) => String(entry.classId) === tabId);
        if (!group || group.isSpecial) return [];
        return group.talents
            .filter((talent) => talent.isBookAvailable && shownBySearch(rowOf.get(talent.talentId)))
            .map((talent) => talent.talentId);
    };
    const talentWord = (n) => `book${n === 1 ? "" : "s"}`;

    const reconcileRows = ({ activeClassName, maxBookLv, groups }) => {
        activeClassNameState.val = activeClassName;
        maxBookLvState.val = maxBookLv;
        groupsShown = groups;

        // Another character gets new rows, so a save still waiting in the old ones stays with the old character.
        rowReconciler(
            loadedCharacter +
                "||" +
                groups
                    .map((group) =>
                        [
                            group.classId,
                            group.className,
                            ...group.talents.map((talent) => `${talent.talentId}:${talent.isBookAvailable ? 1 : 0}`),
                        ].join("|")
                    )
                    .join("||"),
            () =>
                TabbedList({
                    // Named for the class, so another class's page doesn't come back on a tab it hasn't got.
                    name: `Library ${activeClassName}`,
                    tabs: groups.map((group) => ({
                        id: String(group.classId),
                        label: group.className,
                        content: div(
                            { class: "account-page-pane" },
                            ...group.talents.map((talent) => {
                                const row = TalentRow({
                                    talentId: talent.talentId,
                                    talentName: talent.talentName,
                                    maxState: getMaxState(loadedCharacter, talent.talentId),
                                    maxBookLvState,
                                    isBookAvailable: talent.isBookAvailable,
                                    isSpecial: group.isSpecial,
                                    character: loadedCharacter,
                                    checkCharacter,
                                });
                                rowOf.set(talent.talentId, row);
                                return row;
                            })
                        ),
                    })),
                    toolsOn: (tabId) => groups.some((group) => String(group.classId) === tabId && !group.isSpecial),
                    toolsLabel: (activeId) => {
                        const n = booksShown(activeId.val).length;
                        const left = getAvailablePointsState(activeId.val).val;
                        const books = isSearching() ? `${n} matching ${talentWord(n)}` : `All ${n} ${talentWord(n)}`;
                        return `${books} · ${toNum(left) < 0 ? "−" + Math.abs(left) : left} points left`;
                    },
                    tools: (activeId) =>
                        div(
                            { class: "tabbed-list__tool-group" },
                            ActionButton({
                                label: "Max books",
                                status: bulkStatus,
                                disabled: () => loading.val || !booksShown(activeId.val).length,
                                onClick: (e) => {
                                    e.preventDefault();
                                    return doMaxAll(booksShown(activeId.val));
                                },
                            })
                        ),
                })
        );
    };

    const load = async () =>
        run(async () => {
            if (!staticMeta) staticMeta = await buildStaticMeta();

            const [rawUserInfo, rawCharClass, rawSkillLevelsMAX, rawMaxBookLv, rawTalentDL2] = await Promise.all([
                readCharacterInPlay(),
                gga("CharacterClass"),
                gga("SkillLevelsMAX"),
                readComputed("workbench", "maxBookLv", [0, 0]),
                gga("DNSM.h.TalentDL2"),
            ]);

            const character = String(rawUserInfo);
            const classId = toNum(rawCharClass);
            if (!classId) throw new Error(NO_CHARACTER);

            const maxBookLv = Math.max(1, toNum(rawMaxBookLv));
            const skillLevelsMAX = toIndexedArray(rawSkillLevelsMAX ?? []);
            const talentDL2 = toIndexedArray(rawTalentDL2 ?? []);
            const classIds = getLibraryClassPageIds(classId);
            const activeClassName = cleanName(staticMeta.classNames[classId]) || `Class ${classId}`;
            const getTalentName = (talentId) =>
                normalCase(staticMeta.talentIconNames?.[talentId] ?? "") || `Talent ${talentId}`;
            const groups = classIds
                .map((cId, groupIndex) => {
                    const className = cleanName(staticMeta.classNames[cId]) || `Class ${cId}`;
                    const talents = [];
                    getAvailablePointsState(String(cId)).val = toNum(talentDL2[groupIndex]);

                    for (let slot = 0; slot < 15; slot++) {
                        const rawTalentId = staticMeta.talentOrder[15 * (cId - 1) + slot];
                        if (rawTalentId === null || rawTalentId === undefined) continue;

                        const talentId = Number(rawTalentId);
                        const isBookAvailable = !staticMeta.blockedLibraryTalentIds.has(talentId);
                        getMaxState(character, talentId).val = toNum(skillLevelsMAX[talentId]);

                        talents.push({
                            talentId,
                            talentName: getTalentName(talentId),
                            isBookAvailable,
                        });
                    }

                    return { classId: cId, className, talents };
                })
                .filter((group) => group.talents.length > 0);

            const specialTalents = staticMeta.talentOrder
                .slice(SPECIAL_TALENT_ORDER_START)
                .filter((talentId) => staticMeta.talentDescriptions[talentId][0][0] !== "_")
                .map((talentId) => {
                    getMaxState(character, talentId).val = toNum(skillLevelsMAX[talentId]);
                    return { talentId, talentName: getTalentName(talentId), isBookAvailable: true };
                });
            if (specialTalents.length) {
                groups.push({
                    classId: "special",
                    className: "Special",
                    isSpecial: true,
                    talents: specialTalents,
                });
            }

            // Only now do the rows show this character; a Refresh that failed leaves them, and saves, with the last.
            loadedCharacter = character;
            reconcileRows({ activeClassName, maxBookLv, groups });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Library",
        description: () =>
            `Talent max levels for the ${activeClassNameState.val || "character"} in play. Max books sets them to the book cap${maxBookLvState.val ? ` (${maxBookLvState.val})` : ""}.`,
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the library",
        errorTitle: "Couldn't read the library",
        initialWrapperClass: "account-list",
        body: listNode,
    });
};

export default definePage({
    id: "w3.library",
    world: 3,
    system: "Library",
    description: "Talent max levels for the character you are playing.",
    keywords: ["Talents"],
    component: LibraryTab,
});
