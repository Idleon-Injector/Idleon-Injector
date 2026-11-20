/**
 * W3 - Active Player Library Tab
 *
 * Shows all talents for the currently active in-game character only.
 * Reads live game state — not a selected database character.
 *
 * Data sources:
 *   gga.UserInfo[0]                      - null when no live character is loaded
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
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { CappedValue } from "../../../components/NumberInput.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    CHARACTER_CHANGED,
    createStaticRowReconciler,
    getOrCreateState,
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
    if (!isBookAvailable) {
        return AccountRow({
            rowClass: "talent-row talent-row--unavailable",
            info: [
                span({ class: "account-row__index" }, `#${talentId}`),
                div(
                    { class: "talent-row__text" },
                    span({ class: "account-row__name" }, talentName),
                    div({ class: "talent-row__notice" }, "This is not a Library book and can't be set.")
                ),
            ],
            badge: () => (maxState.val === -1 ? "Locked" : CappedValue({ value: () => maxState.val })),
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
        renderInfo: () => [
            span({ class: "account-row__index" }, `#${talentId}`),
            div({ class: "talent-row__text" }, span({ class: "account-row__name" }, talentName)),
        ],
        // A max level of -1 is a talent the character hasn't unlocked: the word says so and the field shows empty.
        renderBadge: () => (maxState.val === -1 ? "Locked" : ""),
        unset: -1,
        rowClass: "talent-row",
        controlsClass: "account-row__controls--xl",
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
    const listNode = div({ class: "account-list" });
    const availableTalentCount = van.state(0);

    let staticMeta = null;
    let currentAvailableTalentIds = [];
    let loadedCharacter = null;

    // SkillLevelsMAX is the live copy of whoever is in play: a save goes there only while that is still the
    // character the page shows.
    // The character is taken before the read: a Refresh that ends meanwhile doesn't make the rows the new one's.
    const checkCharacter = async (shown = loadedCharacter) => {
        if (String(await gga("UserInfo[0]")) !== shown) {
            throw new Error(CHARACTER_CHANGED);
        }
    };

    const getMaxState = (talentId) => getOrCreateState(maxStates, talentId);
    const getAvailablePointsState = (classId) => getOrCreateState(availablePointsStates, classId);

    const rowReconciler = createStaticRowReconciler(listNode);

    const doMaxAll = async () => {
        const cap = toNum(maxBookLvState.val, 0);
        if (!currentAvailableTalentIds.length || cap <= 0) return;

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
                entries: currentAvailableTalentIds,
                getTargetValue: () => cap,
                getValueState: (talentId) => getMaxState(talentId),
                getPath: (talentId) => `SkillLevelsMAX[${talentId}]`,
                shouldWrite: ({ currentValue, targetValue }) => toNum(currentValue) !== targetValue,
            });
        });
    };

    const reconcileRows = ({ activeClassName, maxBookLv, groups, availableTalentIds }) => {
        currentAvailableTalentIds = availableTalentIds;
        availableTalentCount.val = availableTalentIds.length;
        activeClassNameState.val = activeClassName;
        maxBookLvState.val = maxBookLv;

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
            () => [
                AccountRow({
                    rowClass: "account-row--info",
                    info: span({ class: "account-row__name" }, "Active Class"),
                    badge: () => activeClassNameState.val || "-",
                }),
                ...groups.map((group) =>
                    AccountSection({
                        title: group.className,
                        note: group.isSpecial
                            ? "Individual maximums only. Excluded from MAX BOOKS and the Library book cap."
                            : null,
                        meta: group.isSpecial
                            ? null
                            : span(
                                  { class: "library-section-points" },
                                  () => getAvailablePointsState(group.classId).val.toLocaleString(),
                                  span({ class: "library-section-points__label" }, " pts")
                              ),
                        body: div(
                            { class: "content-stack" },
                            ...group.talents.map((talent) =>
                                TalentRow({
                                    talentId: talent.talentId,
                                    talentName: talent.talentName,
                                    maxState: getMaxState(talent.talentId),
                                    maxBookLvState,
                                    isBookAvailable: talent.isBookAvailable,
                                    isSpecial: group.isSpecial,
                                    character: loadedCharacter,
                                    checkCharacter,
                                })
                            )
                        ),
                    })
                ),
            ]
        );
    };

    const load = async () =>
        run(async () => {
            if (!staticMeta) staticMeta = await buildStaticMeta();

            const [rawUserInfo, rawCharClass, rawSkillLevelsMAX, rawMaxBookLv, rawTalentDL2] = await Promise.all([
                gga("UserInfo[0]"),
                gga("CharacterClass"),
                gga("SkillLevelsMAX"),
                readComputed("workbench", "maxBookLv", [0, 0]),
                gga("DNSM.h.TalentDL2"),
            ]);

            if (rawUserInfo === null || rawUserInfo === undefined) {
                throw new Error("Select a character in-game before using this tab.");
            }

            const classId = toNum(rawCharClass);
            if (!classId) throw new Error("No active character loaded.");

            const maxBookLv = Math.max(1, toNum(rawMaxBookLv));
            const skillLevelsMAX = toIndexedArray(rawSkillLevelsMAX ?? []);
            const talentDL2 = toIndexedArray(rawTalentDL2 ?? []);
            const classIds = getLibraryClassPageIds(classId);
            const activeClassName = staticMeta.classNames[classId] || `Class ${classId}`;
            const getTalentName = (talentId) => staticMeta.talentIconNames?.[talentId] || `Talent ${talentId}`;
            const availableTalentIds = [];
            const groups = classIds
                .map((cId, groupIndex) => {
                    const className = staticMeta.classNames[cId] || `Class ${cId}`;
                    const talents = [];
                    getAvailablePointsState(cId).val = toNum(talentDL2[groupIndex]);

                    for (let slot = 0; slot < 15; slot++) {
                        const rawTalentId = staticMeta.talentOrder[15 * (cId - 1) + slot];
                        if (rawTalentId === null || rawTalentId === undefined) continue;

                        const talentId = Number(rawTalentId);
                        const isBookAvailable = !staticMeta.blockedLibraryTalentIds.has(talentId);
                        getMaxState(talentId).val = toNum(skillLevelsMAX[talentId]);
                        if (isBookAvailable) availableTalentIds.push(talentId);

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
                    getMaxState(talentId).val = toNum(skillLevelsMAX[talentId]);
                    return { talentId, talentName: getTalentName(talentId), isBookAvailable: true };
                });
            if (specialTalents.length) {
                groups.push({
                    classId: "special",
                    className: "SPECIAL TALENTS",
                    isSpecial: true,
                    talents: specialTalents,
                });
            }

            // Only now do the rows show this character; a Refresh that failed leaves them, and saves, with the last.
            loadedCharacter = String(rawUserInfo);
            reconcileRows({ activeClassName, maxBookLv, groups, availableTalentIds });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "LIBRARY",
        description: "Set max talent levels for the active in-game character.",
        wrapActions: false,
        actions: BulkActionBar({
            leading: div(
                {
                    class: () => `library-maxbooklv${maxBookLvState.val === null ? " library-maxbooklv--hidden" : ""}`,
                },
                span({ class: "library-maxbooklv__label" }, "Max Library Book:"),
                span({ class: "library-maxbooklv__value" }, () =>
                    maxBookLvState.val !== null ? String(maxBookLvState.val) : "-"
                )
            ),
            actions: [
                {
                    label: "Max books",
                    status: bulkStatus,
                    disabled: () => loading.val || availableTalentCount.val <= 0,
                    tooltip: "Set all available Library books to the current max book level",
                    onClick: doMaxAll,
                },
            ],
            refresh: {
                onClick: load,
                disabled: () => loading.val,
                tooltip: "Re-read Library values from game memory",
            },
        }),
        state: { loading, error },
        loadingText: "READING LIBRARY",
        errorTitle: "LIBRARY READ FAILED",
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
