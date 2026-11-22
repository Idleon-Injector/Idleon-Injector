/**
 * W4 - Breeding › General
 *
 * Data sources:
 *   gga.Breeding[0][n]               - egg n's rarity (up to 11), for as many eggs as TotalEggCapacity
 *   gga.Breeding[2][n]               - breeding upgrade n's level; PetUpgMaxLV(0, n) is its max
 *   gga.Breeding[3][8]               - dead cells, what the upgrades cost
 *   cList.PetUpgradeINFO[n][0, 10]   - the upgrade's name and its bonus in the game's words
 *   gga.OptionsListAccount[89, 628]  - the best Pet Arena and Crucible rounds
 *   gga.OptionsListAccount[100]      - spice claims used today (the daily reset takes 25 off per Trasher pet, so it can
 *                                      be below 0)
 *
 * One list in four groups, like Anvil. Max all and Reset all sit in the tray and act on the eggs and upgrades the top
 * bar's search shows; Reset asks there first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList, readComputed, readComputedMany, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    runBulkSet,
    toInt,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const EGGS_PATH = "Breeding[0]";
const UPGRADES_PATH = "Breeding[2]";
const DEAD_CELLS_PATH = "Breeding[3][8]";
const EGG_MAX_RARITY = 11;

// "Gene_Splicing_}_Helps_unlock_next_Mob_type": the upgrade's name is what comes before the game's number mark.
const upgradeName = (raw, index) => cleanName(String(raw ?? "").split("}")[0], `Upgrade ${index}`);

const readUpgrades = async () => {
    const [rawLevels, rawDefs] = await Promise.all([gga(UPGRADES_PATH), readCList("PetUpgradeINFO")]);
    const levels = toIndexedArray(rawLevels ?? []);
    const upgrades = toIndexedArray(rawDefs ?? [])
        .map((raw, index) => {
            const def = toIndexedArray(raw ?? []);
            if (!String(def[0] ?? "").trim()) return null;
            return {
                index,
                name: upgradeName(def[0], index),
                // Its bonus marks the number with "}" ("+}_Egg_Max"), where most lists use "{" ("}x" stays: a multiplier).
                bonus: bonusText(def[10] === "_" ? "" : String(def[10] ?? "").replace(/}(?!x)/g, "{")),
                level: toInt(levels[index], { min: 0 }),
            };
        })
        .filter(Boolean);
    const maximums = await readComputedMany(
        "breeding",
        "PetUpgMaxLV",
        upgrades.map(({ index }) => [0, index])
    );
    return upgrades.map((upgrade, i) => {
        if (!maximums[i]?.ok) throw new Error(`Couldn't read the max level of ${upgrade.name}. Refresh.`);
        return { ...upgrade, max: toInt(maximums[i].value, { min: 0 }) };
    });
};

const GeneralTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({
        label: "Breeding general",
        busy: () => bulk.status.val === "loading",
    });
    const getEggState = createIndexedStateGetter(0);
    const getUpgradeState = createIndexedStateGetter(0);
    const deadCellsState = van.state(0);
    const arenaState = van.state(0);
    const crucibleState = van.state(0);
    const spiceClaimsState = van.state(0);
    // What the tray's tools act on: each egg and upgrade, with its path, max and row.
    const leveled = van.state([]);
    const rowOf = new Map();
    const eggNode = div();
    const upgradeNode = div();
    const reconcileEggs = createStaticRowReconciler(eggNode);
    const reconcileUpgrades = createStaticRowReconciler(upgradeNode);
    // After a read that failed, the levels shown may be old: the tools wait for one that works.
    const readPending = () => loading.val || Boolean(error.val);

    const numberRow = (name, path, valueState, extra = {}) =>
        SimpleNumberRow({ entry: { name, path, formatted: false, showIndex: false, ...extra }, valueState });
    const deadCellsRow = numberRow("Dead cells", DEAD_CELLS_PATH, deadCellsState, { formatted: true });

    const load = async () =>
        run(async () => {
            const [rawEggs, options, capacity, upgrades, deadCells] = await Promise.all([
                gga(EGGS_PATH),
                readGgaEntries("OptionsListAccount", ["89", "100", "628"]),
                readComputed("breeding", "TotalEggCapacity", []),
                readUpgrades(),
                gga(DEAD_CELLS_PATH),
            ]);
            // Empty means none claimed yet; anything else that isn't a number is refused, not shown as 0.
            const spiceClaims = options["100"] ?? 0;
            if (!Number.isFinite(Number(spiceClaims)) || String(spiceClaims).trim() === "") {
                throw new Error("Couldn't read the spice claims. Refresh to try again.");
            }
            const eggList = toIndexedArray(rawEggs ?? []);
            const eggs = Array.from({ length: toInt(capacity, { min: 0 }) }, (_, index) => ({
                key: `egg:${index}`,
                path: `${EGGS_PATH}[${index}]`,
                max: EGG_MAX_RARITY,
                state: getEggState(index),
                level: Math.max(0, toInt(eggList[index], { min: 0 })),
                name: `Egg ${index + 1}`,
            }));
            const upgradeEntries = upgrades.map((upgrade) => ({
                ...upgrade,
                key: `upgrade:${upgrade.index}`,
                path: `${UPGRADES_PATH}[${upgrade.index}]`,
                state: getUpgradeState(upgrade.index),
            }));

            const row = (entry, renderInfo) => {
                const node = ClampedLevelRow({
                    valueState: entry.state,
                    writePath: entry.path,
                    max: entry.max,
                    integerMode: "trunc",
                    name: entry.name,
                    renderInfo,
                });
                rowOf.set(entry.key, node);
                return node;
            };
            reconcileEggs(String(eggs.length), () => eggs.map((egg) => row(egg)));
            reconcileUpgrades(
                upgradeEntries.map((upgrade) => `${upgrade.index}:${upgrade.name}:${upgrade.max}`).join("|"),
                // Dead cells first, in the same list, so the rows read as one group.
                () => [
                    deadCellsRow,
                    ...upgradeEntries.map((upgrade) =>
                        row(upgrade, () => RowTitles({ bonus: upgrade.bonus, name: upgrade.name }))
                    ),
                ]
            );
            // The level the game holds, above the max too (the game counts it all): Max all lowers it.
            [...eggs, ...upgradeEntries].forEach((entry) => (entry.state.val = entry.level));
            leveled.val = [...eggs, ...upgradeEntries];
            deadCellsState.val = toInt(deadCells, { min: 0 });
            arenaState.val = toInt(options["89"], { min: 0 });
            crucibleState.val = toInt(options["628"], { min: 0 });
            spiceClaimsState.val = toInt(spiceClaims);
        });

    // The eggs and upgrades the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => leveled.val.filter((entry) => shownBySearch(rowOf.get(entry.key)));
    const words = (entries) => {
        const eggs = entries.filter((entry) => entry.key.startsWith("egg")).length;
        const upgrades = entries.length - eggs;
        return [
            eggs && `${eggs} egg${eggs === 1 ? "" : "s"}`,
            upgrades && `${upgrades} upgrade${upgrades === 1 ? "" : "s"}`,
        ]
            .filter(Boolean)
            .join(" and ");
    };

    const setLevels = async (entries, targetOf) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: targetOf,
                getValueState: (entry) => entry.state,
                getPath: (entry) => entry.path,
            })
        );
        // Some of it may have landed: the rows show what the game holds.
        if (!result.ok && !result.cancelled) await load();
    };

    // Max all only raises (and brings a level above its max down to it), so it runs on one press; Reset takes levels
    // away, so it asks first.
    const tools = (_activeId, ask) => {
        const resetAll = ActionButton({
            label: "Reset all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().length,
            onClick: (e) => {
                e.preventDefault();
                const entries = shown();
                ask({
                    question: `Reset ${words(entries)} to 0?`,
                    confirmLabel: entries.length === 1 ? "Reset it" : "Reset them",
                    from: resetAll,
                    onConfirm: () => setLevels(entries, () => 0),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Max all",
                status: bulk.status,
                disabled: () => readPending() || !shown().length,
                onClick: (e) => {
                    e.preventDefault();
                    return setLevels(shown(), (entry) => entry.max);
                },
            }),
            resetAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "General",
        description: "Eggs, breeding upgrades, Pet Arena records and today's spice claims.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading breeding",
        errorTitle: "Couldn't read breeding",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({ title: "Eggs", body: eggNode }),
                    AccountSection({
                        title: "Upgrades",
                        body: [upgradeNode],
                    }),
                    AccountSection({
                        title: "Pet Arena",
                        body: [
                            numberRow("Best round", "OptionsListAccount[89]", arenaState),
                            numberRow("Best Crucible round", "OptionsListAccount[628]", crucibleState),
                        ],
                    }),
                    AccountSection({
                        title: "Spices",
                        body: numberRow("Spice claims used today", "OptionsListAccount[100]", spiceClaimsState, {
                            // No max: the game works out the daily limit on the breeding screen, and a value past it
                            // only stops claims.
                            min: -Infinity,
                        }),
                    }),
                ],
                tools,
                toolsLabel: () => {
                    const entries = shown();
                    return isSearching() ? `${words(entries) || "Nothing"} matching` : `All ${words(entries)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w4.breeding.general",
    world: 4,
    system: "Breeding",
    tab: "General",
    description: "Egg rarity, pet upgrades, best Pet Arena and Crucible rounds, and the spice claim counter.",
    keywords: ["Eggs", "Pet Arena", "Crucible", "Pet Upgrades", "Dead cells"],
    component: GeneralTab,
});
