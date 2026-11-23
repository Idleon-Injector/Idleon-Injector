/**
 * W4 - Cooking › Mastery
 *
 * Data sources:
 *   gga.CookMaster[1]        - [rank - 1, mastery EXP, daily respec used, lifetime ladles]
 *   gga.CookMaster[2][n]     - mastery upgrade n's level; cList.RandoListo2[9][n] its name, [8][n] its number
 *   PtsLeftCook_P            - the points left for the upgrades (the game works them out)
 *
 * Tabs Rank and Upgrades (the upgrades with their bonus first); the open tab's points sit beside the title. Each
 * meal's mastery is a column on the Meals page, with its own points there (Lumi's pick).
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
    createIndexedStateGetter,
    createStaticRowReconciler,
    normalCase,
    toInt,
    toNum,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { AmountLeft, RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

const RANK_PATH = "CookMaster[1][0]";
const EXP_PATH = "CookMaster[1][1]";
const LADLES_PATH = "CookMaster[1][3]";
const UPGRADES_PATH = "CookMaster[2]";
const UPGRADE_EFFECTS = [
    (value) => `+${value}% EXP per power of 10 lifetime ladles`,
    (value) => `+${value}% EXP per account Cooking level above 1000`,
    (value) => `+${value}% EXP per Divorce Cake level above 75`,
    () => "Raises the daily Cooking Ribbon rank-up chance",
    (value) => `+${value}% EXP per total meal Ribbon rank`,
    (value) => `+${value}% EXP per displayed Mastery rank`,
];

const MasteryTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cooking Mastery" });
    const activeTab = van.state("rank");
    const rankState = van.state(1);
    const expState = van.state(0);
    const ladlesState = van.state(0);
    const respecState = van.state(0);
    const unlockedState = van.state(true);
    const pointsState = van.state(0);
    const getLevelState = createIndexedStateGetter(0);
    const upgradeNode = div();
    const reconcileUpgrades = createStaticRowReconciler(upgradeNode);

    // The save already landed, so a failed points read doesn't fail it; the points say they may be off until the next
    // good read.
    const pointsOff = van.state(false);
    let pointsRead = 0;
    const refreshPoints = async () => {
        const read = ++pointsRead;
        try {
            const points = await readComputed("cookingMastery", "PtsLeftCook_P");
            // An older read answering last would show the points from before the newer save.
            if (read !== pointsRead) return;
            pointsState.val = toInt(points, { min: 0 });
            pointsOff.val = false;
        } catch {
            if (read === pointsRead) pointsOff.val = true;
        }
    };

    const load = async () =>
        run(async () => {
            const [rawCookMaster, rawNames, rawCoefficients, unlocked, points, requirements] = await Promise.all([
                gga("CookMaster"),
                readCList("RandoListo2[9]"),
                readCList("RandoListo2[8]"),
                readComputed("cookingMastery", "isMasteryUnlocked"),
                readComputed("cookingMastery", "PtsLeftCook_P"),
                readComputedMany(
                    "cookingMastery",
                    "RankREQcook",
                    Array.from({ length: 6 }, (_, index) => [index, 0])
                ),
            ]);
            const cookMaster = toIndexedArray(rawCookMaster ?? []);
            const progress = toIndexedArray(cookMaster[1] ?? []);
            const levels = toIndexedArray(cookMaster[2] ?? []);
            const coefficients = toIndexedArray(rawCoefficients ?? []);
            const upgrades = toIndexedArray(rawNames ?? []).map((rawName, index) => {
                const coefficient = toNum(coefficients[index], 0);
                const rank = toInt(requirements[index]?.ok ? requirements[index].value : 0, { min: 0 }) + 1;
                return {
                    index,
                    name: `${normalCase(cleanName(rawName, `Upgrade ${index + 1}`))} · from rank ${rank}`,
                    bonus: UPGRADE_EFFECTS[index]?.(coefficient) ?? `${coefficient} per level`,
                };
            });

            reconcileUpgrades(upgrades.map((upgrade) => upgrade.name).join("|"), () =>
                upgrades.map((upgrade) =>
                    ClampedLevelRow({
                        valueState: getLevelState(upgrade.index),
                        max: Infinity,
                        integerMode: "round",
                        write: async (level) => {
                            const verified = await writeVerified(`${UPGRADES_PATH}[${upgrade.index}]`, level);
                            await refreshPoints();
                            return verified;
                        },
                        name: upgrade.name,
                        renderInfo: () => RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
                    })
                )
            );
            upgrades.forEach(
                (upgrade) => (getLevelState(upgrade.index).val = toInt(levels[upgrade.index], { min: 0 }))
            );
            rankState.val = toInt(progress[0], { min: 0 }) + 1;
            expState.val = toNum(progress[1], 0);
            respecState.val = toInt(progress[2], { min: 0 });
            ladlesState.val = toNum(progress[3], 0);
            unlockedState.val = toNum(unlocked, 0) > 0;
            // A good read; a points read still running from before it can no longer say the points are off.
            pointsRead++;
            pointsState.val = toInt(points, { min: 0 });
            pointsOff.val = false;
        });

    load();

    const rankRows = [
        ClampedLevelRow({
            valueState: rankState,
            min: 1,
            max: Infinity,
            integerMode: "round",
            write: async (displayedRank) => {
                await writeVerified(RANK_PATH, displayedRank - 1);
                await refreshPoints();
                return displayedRank;
            },
            name: "Mastery rank",
        }),
        SimpleNumberRow({
            entry: { name: "Mastery EXP", path: EXP_PATH, float: true, showIndex: false },
            valueState: expState,
        }),
        SimpleNumberRow({
            entry: { name: "Lifetime ladles used", path: LADLES_PATH, showIndex: false },
            valueState: ladlesState,
        }),
        // The game sets the daily respec itself, so the row only says where it stands.
        AccountRow({
            info: span({ class: "account-row__name" }, "Daily respec"),
            badge: () => (respecState.val === 0 ? "Ready" : "Used today"),
        }),
    ];

    // Beside the title: the open tab's points (Upgrades), or that mastery isn't unlocked yet (Rank).
    const total = () =>
        activeTab.val === "upgrades"
            ? pointsOff.val
                ? span({ class: "amount-left" }, "Points may be off. Refresh.")
                : AmountLeft({ value: () => pointsState.val })
            : span({ class: "amount-left" }, unlockedState.val ? "" : "Not unlocked yet");

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Mastery",
        description: "Cooking Mastery's rank and upgrades.",
        total,
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading cooking mastery",
        errorTitle: "Couldn't read cooking mastery",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Cooking Mastery",
                activeId: activeTab,
                setAll: {
                    word: (n, tab) =>
                        tab === "upgrades" ? `upgrade${n === 1 ? "" : "s"}` : n === 1 ? "line" : "lines",
                    placeholder: "Value",
                },
                tabs: [
                    { id: "rank", label: "Rank", content: div({ class: "field-columns" }, ...rankRows) },
                    { id: "upgrades", label: "Upgrades", content: div({ class: "field-columns" }, upgradeNode) },
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
    description: "Cooking Mastery rank, EXP and upgrade levels.",
    keywords: ["Cooking Mastery", "Salty", "Spicy", "Sweet", "Smoky", "Sour", "Savory"],
    component: MasteryTab,
});
