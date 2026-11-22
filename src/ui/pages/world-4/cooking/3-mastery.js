/**
 * W4 - Cooking › Mastery
 *
 * Data sources:
 *   gga.CookMaster[1]        - [rank - 1, mastery EXP, daily respec used, lifetime ladles]
 *   gga.CookMaster[2][n]     - mastery upgrade n's level; cList.RandoListo2[9][n] its name, [8][n] its number
 *   gga.CookMaster[0][n]     - meal n's mastery level; cList.MealINFO[n][0] the meal's name
 *   PtsLeftCook_P / _Y       - the points left for the upgrades and for the meals (the game works them out)
 *
 * One list in three groups, like Anvil: the rank, the upgrades (the bonus first) and each meal's mastery. Each group
 * of points says how many are left beside its name.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed, readComputedMany } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    normalCase,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
    toNum,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

const RANK_PATH = "CookMaster[1][0]";
const EXP_PATH = "CookMaster[1][1]";
const LADLES_PATH = "CookMaster[1][3]";
const PURPLE_PATH = "CookMaster[2]";
const MEAL_MASTERY_PATH = "CookMaster[0]";
const PURPLE_EFFECTS = [
    (value) => `+${value}% EXP per power of 10 lifetime ladles`,
    (value) => `+${value}% EXP per account Cooking level above 1000`,
    (value) => `+${value}% EXP per Divorce Cake level above 75`,
    () => "Raises the daily Cooking Ribbon rank-up chance",
    (value) => `+${value}% EXP per total meal Ribbon rank`,
    (value) => `+${value}% EXP per displayed Mastery rank`,
];

const buildPurpleEntries = (rawNames, rawCoefficients, rawRequirements, rawLevels) => {
    const names = toIndexedArray(rawNames ?? []);
    const coefficients = toIndexedArray(rawCoefficients ?? []);
    const requirements = toIndexedArray(rawRequirements ?? []);
    const levels = toIndexedArray(rawLevels ?? []);

    return names.map((rawName, index) => {
        const coefficient = toNum(coefficients[index], 0);
        const requiredStoredRank = toInt(requirements[index]?.ok ? requirements[index].value : 0, { min: 0 });

        return {
            key: `cooking-mastery-purple-${index}`,
            index,
            name: `${normalCase(cleanName(rawName, `Upgrade ${index + 1}`))} · from rank ${requiredStoredRank + 1}`,
            bonus: PURPLE_EFFECTS[index]?.(coefficient) ?? `${coefficient} per level`,
            path: `${PURPLE_PATH}[${index}]`,
            value: toInt(levels[index], { min: 0 }),
            formatted: false,
        };
    });
};

const buildMealEntries = (rawMealInfo, rawAllocations) => {
    const allocations = toIndexedArray(rawAllocations ?? []);

    return toIndexedArray(rawMealInfo ?? [])
        .slice(0, allocations.length)
        .map((rawMeal, index) => {
            const meal = toIndexedArray(rawMeal ?? []);
            const rawName = String(meal[0] ?? "").trim();
            if (!rawName) return null;

            return {
                key: `cooking-mastery-meal-${index}`,
                index,
                name: cleanName(rawName, `Meal ${index + 1}`),
                path: `${MEAL_MASTERY_PATH}[${index}]`,
                value: toInt(allocations[index], { min: 0 }),
            };
        })
        .filter(Boolean);
};

const MasteryRankRow = ({ rankState, refreshPointsAfterWrite }) =>
    ClampedLevelRow({
        valueState: rankState,
        min: 1,
        max: Infinity,
        integerMode: "round",
        write: async (displayedRank) => {
            await writeVerified(RANK_PATH, displayedRank - 1);
            await refreshPointsAfterWrite();
            return displayedRank;
        },
        name: "Mastery rank",
    });

const MasteryAllocationRow = ({ entry, valueState, refreshPointsAfterWrite }) =>
    ClampedLevelRow({
        valueState,
        min: 0,
        max: Infinity,
        integerMode: "round",
        write: async (level) => {
            const verified = await writeVerified(entry.path, level);
            await refreshPointsAfterWrite();
            return verified;
        },
        name: entry.name,
        renderInfo: entry.bonus ? () => RowTitles({ bonus: entry.bonus, name: entry.name }) : null,
    });

// The game sets the daily respec itself, so the row only says where it stands.
const RespecStatusRow = ({ respecState }) =>
    AccountRow({
        info: span({ class: "account-row__name" }, "Daily respec"),
        badge: () => (respecState.val === 0 ? "Ready" : "Used today"),
    });

const MasteryTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cooking Mastery" });
    const rankState = van.state(1);
    const expState = van.state(0);
    const ladlesState = van.state(0);
    const respecState = van.state(0);
    const unlockedState = van.state(false);
    const purplePointsState = van.state(0);
    const yellowPointsState = van.state(0);
    const purpleEntries = van.state([]);
    const mealEntries = van.state([]);
    const purpleStates = new Map();
    const mealStates = new Map();
    const purpleNode = div();
    const mealNode = div();
    const reconcilePurpleRows = createStaticRowReconciler(purpleNode);
    const reconcileMealRows = createStaticRowReconciler(mealNode);

    const pointsOff = van.state(false);
    let pointsRead = 0;
    // The save already landed, so a failed points read doesn't fail it; the points say they may be off until the next good read.
    const refreshPointsAfterWrite = async () => {
        const read = ++pointsRead;
        try {
            const [purple, yellow] = await Promise.all([
                readComputed("cookingMastery", "PtsLeftCook_P"),
                readComputed("cookingMastery", "PtsLeftCook_Y"),
            ]);
            // An older read answering last would show the points from before the newer save.
            if (read !== pointsRead) return;
            purplePointsState.val = toInt(purple, { min: 0 });
            yellowPointsState.val = toInt(yellow, { min: 0 });
            pointsOff.val = false;
        } catch {
            if (read === pointsRead) pointsOff.val = true;
        }
    };
    const pointsNote = (points) =>
        pointsOff.val ? "Points may be off. Refresh." : `${points} point${points === 1 ? "" : "s"} left`;

    const load = async () =>
        run(async () => {
            const [rawCookMaster, rawMealInfo, rawPurpleNames, rawPurpleCoefficients, computed] = await Promise.all([
                gga("CookMaster"),
                readCList("MealINFO"),
                readCList("RandoListo2[9]"),
                readCList("RandoListo2[8]"),
                Promise.all([
                    readComputed("cookingMastery", "isMasteryUnlocked"),
                    readComputed("cookingMastery", "PtsLeftCook_P"),
                    readComputed("cookingMastery", "PtsLeftCook_Y"),
                    readComputedMany(
                        "cookingMastery",
                        "RankREQcook",
                        Array.from({ length: 6 }, (_, index) => [index, 0])
                    ),
                ]),
            ]);
            const cookMaster = toIndexedArray(rawCookMaster ?? []);
            const progress = toIndexedArray(cookMaster[1] ?? []);
            const purpleLevels = toIndexedArray(cookMaster[2] ?? []);
            const mealAllocations = toIndexedArray(cookMaster[0] ?? []);

            rankState.val = toInt(progress[0], { min: 0 }) + 1;
            expState.val = toNum(progress[1], 0);
            respecState.val = toInt(progress[2], { min: 0 });
            ladlesState.val = toNum(progress[3], 0);
            unlockedState.val = toNum(computed[0], 0) > 0;
            purpleEntries.val = buildPurpleEntries(rawPurpleNames, rawPurpleCoefficients, computed[3], purpleLevels);
            mealEntries.val = buildMealEntries(rawMealInfo, mealAllocations);

            reconcilePurpleRows(purpleEntries.val.map((entry) => `${entry.key}:${entry.name}`).join("|"), () =>
                purpleEntries.val.map((entry) =>
                    MasteryAllocationRow({
                        entry,
                        valueState: getOrCreateState(purpleStates, entry.key),
                        refreshPointsAfterWrite,
                    })
                )
            );
            reconcileMealRows(mealEntries.val.map((entry) => `${entry.key}:${entry.name}`).join("|"), () =>
                mealEntries.val.map((entry) =>
                    MasteryAllocationRow({
                        entry,
                        valueState: getOrCreateState(mealStates, entry.key),
                        refreshPointsAfterWrite,
                    })
                )
            );

            for (const entry of purpleEntries.val) getOrCreateState(purpleStates, entry.key).val = entry.value;
            for (const entry of mealEntries.val) getOrCreateState(mealStates, entry.key).val = entry.value;

            // A good read; a points read still running from before it can no longer say the points are off.
            pointsRead++;
            purplePointsState.val = toInt(computed[1], { min: 0 });
            yellowPointsState.val = toInt(computed[2], { min: 0 });
            pointsOff.val = false;
        });

    load();

    const progressEntries = [
        {
            key: "cooking-mastery-exp",
            name: "Mastery EXP",
            path: EXP_PATH,
            float: true,
            showIndex: false,
        },
        {
            key: "cooking-mastery-ladles",
            name: "Lifetime ladles used",
            path: LADLES_PATH,
            showIndex: false,
        },
    ];

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Mastery",
        description: "Cooking Mastery: rank, upgrades and each meal's mastery.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading cooking mastery",
        errorTitle: "Couldn't read cooking mastery",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({
                        title: "Rank",
                        note: () => (unlockedState.val ? "" : "Not unlocked yet"),
                        body: [
                            MasteryRankRow({ rankState, refreshPointsAfterWrite }),
                            ...progressEntries.map((entry) =>
                                SimpleNumberRow({
                                    entry,
                                    valueState: entry.key.endsWith("exp") ? expState : ladlesState,
                                })
                            ),
                            RespecStatusRow({ respecState }),
                        ],
                    }),
                    AccountSection({
                        title: "Upgrades",
                        note: () => pointsNote(purplePointsState.val),
                        body: purpleNode,
                    }),
                    AccountSection({
                        title: "Meals",
                        note: () => pointsNote(yellowPointsState.val),
                        body: mealNode,
                    }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w4.cooking.mastery",
    world: 4,
    system: "Cooking",
    tab: "Mastery",
    description: "Cooking Mastery rank, EXP, perk levels and each meal's mastery.",
    keywords: ["Cooking Mastery", "Meal Mastery"],
    component: MasteryTab,
});
