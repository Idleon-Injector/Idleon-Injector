/**
 * W3 - Equinox Tab
 *
 * Data sources:
 *   gga.Dream[0]                           - current bar fill value
 *   gga.Dream[2]                           - first upgrade level (controls visible cloud count)
 *   gga.Dream[i+2]                         - level of upgrade i
 *   cList.DreamUpg[i][0]       - name of upgrade i
 *   cList.DreamChallenge[i][0] - cloud name (underscore-separated)
 *   cList.DreamChallenge[i][1] - cloud required progress (string int)
 *   gga.WeeklyBoss.h.d_i                   - current cloud progress (-1 = not active)
 *   gga.OptionsListAccount[320]            - Pingy penguins, a past limited gem shop buy: the bar fills 10% faster
 *                                            per penguin, and that many walk around one map
 *
 * Computed via events(579)._customBlock_Dreamstuff:
 *   readComputed("dream", "BarFillReq", [0])   - bar fill requirement
 *   readComputed("dream", "BarFillRate", [0])  - fill rate
 *   readComputed("dream", "UpgUnlocked", [0])  - number of unlocked upgrades
 *   readComputed("dream", "UpgMaxLV", [i])     - max level for upgrade i
 */

import van from "../../../vendor/van-1.6.0.js";
import { CappedValue } from "../../../components/NumberInput.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed, readComputedMany, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, p } = van.tags;

const fmtInt = (value) => String(toInt(value, { mode: "floor" }));

// An upgrade's description up to its first full stop: what it does, in the game's words, with the game's own numbers
// ("Defeating a Random Event boss lowers Meal upgrade cost by -20%"); the rest is detail and jokes.
const firstSentence = (raw) =>
    cleanName(String(raw ?? "").split(/(?<=[.!?])_/)[0])
        .replace(/\s*@.*$/, "")
        .replace(/\.$/, "");

const getVisibleCloudIndexes = (firstUpgLevel, dreamChallengeArr, weeklyBossMap) => {
    const visibleCount = Math.max(0, Math.min(5, toInt(firstUpgLevel, { mode: "floor" })));
    const out = [];

    for (let i = 0; i < dreamChallengeArr.length && out.length < visibleCount; i++) {
        if (toNum(weeklyBossMap[`d_${i}`]) !== -1) out.push(i);
    }

    return out;
};

// The bar as one row: how full it is and how fast it fills, with Fill bar.
const BarRow = ({ barFillState, barFillReqState, barFillRateState, fillBarStatus, doFillBar }) =>
    AccountRow({
        rowClass: "equinox-action-row",
        // How fast it fills supports the bar's value, so it sits under the name, small and muted.
        info: RowTitles({ bonus: "Dream bar", name: () => `Fills ${fmtInt(barFillRateState.val)} an hour` }),
        controls: [
            CappedValue({ value: () => barFillState.val, cap: () => barFillReqState.val, formatter: fmtInt }),
            ActionButton({
                label: "Fill bar",
                status: fillBarStatus,
                disabled: () => !barFillReqState.val || barFillState.val >= barFillReqState.val,
                onClick: (e) => {
                    e.preventDefault();
                    doFillBar();
                },
            }),
        ],
    });

// A cloud: its challenge first (the first sentence; the rest is the game's jokes), its reward under it, small.
const CloudRow = ({ entry }) => {
    const { status, run } = useWriteStatus();

    const doComplete = async () => {
        await run(async () => {
            const path = `WeeklyBoss.h.d_${entry.cloudIndex}`;
            const required = toInt(entry.requiredState.val, { mode: "floor" });
            await writeVerified(path, required);
            entry.progressState.val = required;
        });
    };

    return AccountRow({
        rowClass: "equinox-action-row",
        info: RowTitles({ bonus: entry.challenge, name: entry.reward }),
        controls: [
            // Complete fills progress up to what the cloud requires: a capped value with no field.
            CappedValue({
                value: () => entry.progressState.val,
                cap: () => entry.requiredState.val,
                formatter: fmtInt,
            }),
            ActionButton({
                label: "Complete",
                status,
                disabled: () => entry.progressState.val >= entry.requiredState.val,
                onClick: (e) => {
                    e.preventDefault();
                    doComplete();
                },
            }),
        ],
    });
};

// The penguins from a past limited gem shop sale. The game sets no max, so neither does the row.
const PenguinRow = ({ valueState, onAfterSet }) =>
    ClampedLevelRow({
        valueState,
        integerMode: "floor",
        write: async (count) => {
            const verified = await writeVerified("OptionsListAccount[320]", count);
            await onAfterSet();
            return verified;
        },
        renderInfo: () => RowTitles({ bonus: "Bar fills 10% faster each", name: "Pingy penguins" }),
    });

const UpgradeRow = ({ entry, onAfterSet }) =>
    ClampedLevelRow({
        valueState: entry.levelState,
        max: entry.maxLevelState,
        integerMode: "floor",
        write: async (nextLevel) => {
            const path = `Dream[${entry.index + 2}]`;
            const verified = await writeVerified(path, nextLevel);
            await onAfterSet();
            return verified;
        },
        renderInfo: () => RowTitles({ bonus: entry.bonus, name: entry.name }),
    });

const buildStaticMeta = async () => {
    const [rawDreamUpg, rawDreamChallenge] = await Promise.all([readCList("DreamUpg"), readCList("DreamChallenge")]);

    return {
        dreamUpgArr: toIndexedArray(rawDreamUpg ?? []),
        dreamChallengeArr: toIndexedArray(rawDreamChallenge ?? []),
    };
};

const EquinoxTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Equinox" });
    const { status: fillBarStatus, run: fillBarRun } = useWriteStatus();

    const barFillState = van.state(0);
    const barFillReqState = van.state(0);
    const barFillRateState = van.state(0);
    const cloudCountState = van.state(0);
    const penguinState = van.state(0);

    const cloudProgressStates = new Map();
    const cloudRequiredStates = new Map();
    const upgradeLevelStates = new Map();
    const upgradeMaxLevelStates = new Map();

    const cloudRowsNode = div();
    const upgradeRowsNode = div();

    let staticMeta = null;

    const getCloudProgressState = (index) => getOrCreateState(cloudProgressStates, index);
    const getCloudRequiredState = (index) => getOrCreateState(cloudRequiredStates, index);
    const getUpgradeLevelState = (index) => getOrCreateState(upgradeLevelStates, index);
    const getUpgradeMaxLevelState = (index) => getOrCreateState(upgradeMaxLevelStates, index);

    const reconcileCloudRows = createStaticRowReconciler(cloudRowsNode);
    const reconcileUpgradeRows = createStaticRowReconciler(upgradeRowsNode);

    const updateCloudRows = (visibleIndexes, weeklyBossMap, dreamChallengeArr) => {
        const clouds = visibleIndexes.map((index) => {
            const row = toIndexedArray(dreamChallengeArr[index] ?? []);
            return {
                cloudIndex: index,
                challenge: bonusText(row[0]) || `Cloud ${index + 1}`,
                reward: cleanName(row[2]),
                required: toInt(row[1], { mode: "floor" }),
                progress: toInt(weeklyBossMap[`d_${index}`] ?? 0, { mode: "floor" }),
            };
        });

        cloudCountState.val = clouds.length;

        for (const cloud of clouds) {
            getCloudProgressState(cloud.cloudIndex).val = cloud.progress;
            getCloudRequiredState(cloud.cloudIndex).val = cloud.required;
        }

        reconcileCloudRows(clouds.map((cloud) => `${cloud.cloudIndex}:${cloud.challenge}`).join("|"), () =>
            clouds.map((cloud) =>
                CloudRow({
                    entry: {
                        cloudIndex: cloud.cloudIndex,
                        challenge: cloud.challenge,
                        reward: cloud.reward,
                        progressState: getCloudProgressState(cloud.cloudIndex),
                        requiredState: getCloudRequiredState(cloud.cloudIndex),
                    },
                })
            )
        );
    };

    const updateUpgradeRows = (upgrades) => {
        for (const upgrade of upgrades) {
            getUpgradeLevelState(upgrade.index).val = upgrade.level;
            getUpgradeMaxLevelState(upgrade.index).val = upgrade.maxLevel;
        }

        reconcileUpgradeRows(
            upgrades.map((upgrade) => `${upgrade.index}:${upgrade.name}:${upgrade.bonus}`).join("|"),
            () =>
                upgrades.map((upgrade) =>
                    UpgradeRow({
                        entry: {
                            index: upgrade.index,
                            name: upgrade.name,
                            bonus: upgrade.bonus,
                            levelState: getUpgradeLevelState(upgrade.index),
                            maxLevelState: getUpgradeMaxLevelState(upgrade.index),
                        },
                        onAfterSet: refreshAfterUpgrade,
                    })
                )
        );
    };

    const refreshAfterUpgrade = async () => {
        try {
            const [rawDream, rawWeeklyBoss, newBarFillReq] = await Promise.all([
                gga("Dream"),
                gga("WeeklyBoss.h").catch(() => ({})),
                readComputed("dream", "BarFillReq", [0]).catch(() => barFillReqState.val),
            ]);

            const dreamArr = toIndexedArray(rawDream ?? []);
            const weeklyBossMap = rawWeeklyBoss ?? {};
            barFillReqState.val = toInt(newBarFillReq, { mode: "floor" });

            const visibleIndexes = getVisibleCloudIndexes(
                toInt(dreamArr[2], { mode: "floor" }),
                staticMeta?.dreamChallengeArr ?? [],
                weeklyBossMap
            );
            updateCloudRows(visibleIndexes, weeklyBossMap, staticMeta?.dreamChallengeArr ?? []);
        } catch (err) {
            console.warn("[EquinoxTab] refreshAfterUpgrade failed", err);
        }
    };

    // The penguins change how fast the bar fills: read the rate again.
    const refreshFillRate = async () => {
        try {
            barFillRateState.val = toInt(await readComputed("dream", "BarFillRate", [0]), { mode: "floor" });
        } catch (err) {
            console.warn("[EquinoxTab] refreshFillRate failed", err);
        }
    };

    const doFillBar = () =>
        fillBarRun(async () => {
            const req = barFillReqState.val;
            if (!req) return;

            await writeVerified("Dream[0]", req);
            barFillState.val = req;
        });

    const load = async () =>
        run(async () => {
            if (!staticMeta) staticMeta = await buildStaticMeta();

            const [rawDream, rawWeeklyBoss, barFillReq, barFillRate, upgUnlocked, rawPenguins] = await Promise.all([
                gga("Dream"),
                gga("WeeklyBoss.h"),
                readComputed("dream", "BarFillReq", [0]),
                readComputed("dream", "BarFillRate", [0]),
                readComputed("dream", "UpgUnlocked", [0]),
                gga("OptionsListAccount[320]"),
            ]);

            const dreamArr = toIndexedArray(rawDream ?? []);
            const weeklyBossMap = rawWeeklyBoss ?? {};
            const upgradeCount = toInt(upgUnlocked, { mode: "floor" });
            const computedResults = await readComputedMany(
                "dream",
                "UpgMaxLV",
                Array.from({ length: upgradeCount }, (_, index) => [index])
            );

            const upgrades = Array.from({ length: upgradeCount }, (_, index) => {
                const item = computedResults[index];
                if (!item?.ok) throw new Error(`UpgMaxLV failed for upgrade ${index}`);

                const definition = toIndexedArray(staticMeta.dreamUpgArr[index] ?? []);
                return {
                    index,
                    name: cleanName(definition[0], `Upgrade ${index + 1}`),
                    bonus: firstSentence(definition[1]),
                    maxLevel: toInt(item.value, { mode: "floor" }),
                    level: toInt(dreamArr[index + 2], { mode: "floor" }),
                };
            });
            const visibleIndexes = getVisibleCloudIndexes(
                toInt(dreamArr[2], { mode: "floor" }),
                staticMeta.dreamChallengeArr,
                weeklyBossMap
            );

            barFillState.val = toInt(dreamArr[0], { mode: "floor" });
            barFillReqState.val = toInt(barFillReq, { mode: "floor" });
            barFillRateState.val = toInt(barFillRate, { mode: "floor" });
            // An account that never bought one holds 0 or nothing.
            const penguins = Number(rawPenguins ?? 0);
            penguinState.val = Number.isFinite(penguins) ? penguins : 0;
            updateUpgradeRows(upgrades);
            updateCloudRows(visibleIndexes, weeklyBossMap, staticMeta.dreamChallengeArr);
        });

    load();

    // One list, like the Anvil's: the bar, then the clouds showing now and the upgrades, each under its name.
    const content = div(
        { class: "account-list account-list--tabbed" },
        ListPanel({
            className: "field-columns",
            body: [
                BarRow({ barFillState, barFillReqState, barFillRateState, fillBarStatus, doFillBar }),
                PenguinRow({ valueState: penguinState, onAfterSet: refreshFillRate }),
                AccountSection({
                    title: "Clouds",
                    body: [
                        cloudRowsNode,
                        p(
                            { class: "equinox-empty", hidden: () => cloudCountState.val > 0 },
                            "No clouds showing. Equinox Dreams opens more."
                        ),
                    ],
                }),
                AccountSection({ title: "Upgrades", body: upgradeRowsNode }),
            ],
        })
    );

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Equinox",
        description: "The dream bar, the clouds showing now and upgrade levels. Claim a cloud's reward in the game.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the equinox",
        errorTitle: "Couldn't read the equinox",
        initialWrapperClass: "account-list",
        body: content,
    });
};

export default definePage({
    id: "w3.equinox",
    world: 3,
    system: "Equinox",
    description: "Equinox bar, Pingy penguins, upgrade levels and cloud challenges.",
    // The penguins were a limited gem shop item, so search finds them by the shop's words too.
    keywords: ["Dream", "Clouds", "Pingy", "Pengy", "Penguin", "Penguins", "Limited", "Gem shop", "FOMO"],
    component: EquinoxTab,
});
