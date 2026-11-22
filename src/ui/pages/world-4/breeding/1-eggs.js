/**
 * W4 - Breeding › Eggs
 *
 * Data sources:
 *   gga.Breeding[0][n]   - egg n's rarity, up to 11
 *   TotalEggCapacity     - how many eggs the incubator holds (the game works it out)
 *
 * The incubator's eggs as one list. Max all and Reset all sit in the tray and act on the eggs the top bar's search
 * shows; Reset asks there first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    createIndexedStateGetter,
    createStaticRowReconciler,
    runBulkSet,
    toInt,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const EGGS_PATH = "Breeding[0]";
const EGG_MAX_RARITY = 11;

const EggsTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({
        label: "Breeding eggs",
        busy: () => bulk.status.val === "loading",
    });
    const getRarityState = createIndexedStateGetter(0);
    const eggCount = van.state(0);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    // After a read that failed, the rarities shown may be old: the tools wait for one that works.
    const readPending = () => loading.val || Boolean(error.val);

    const load = async () =>
        run(async () => {
            const [rawEggs, capacity] = await Promise.all([
                gga(EGGS_PATH),
                readComputed("breeding", "TotalEggCapacity", []),
            ]);
            const eggs = toIndexedArray(rawEggs ?? []);
            const count = toInt(capacity, { min: 0 });
            reconcileRows(String(count), () =>
                Array.from({ length: count }, (_, index) => {
                    const row = ClampedLevelRow({
                        valueState: getRarityState(index),
                        writePath: `${EGGS_PATH}[${index}]`,
                        max: EGG_MAX_RARITY,
                        integerMode: "trunc",
                        name: `Egg ${index + 1}`,
                    });
                    rowOf.set(index, row);
                    return row;
                })
            );
            for (let index = 0; index < count; index++) getRarityState(index).val = toInt(eggs[index], { min: 0 });
            eggCount.val = count;
        });

    // The eggs the tools act on: every one, or the ones the top bar's search shows.
    const shown = () =>
        Array.from({ length: eggCount.val }, (_, index) => index).filter((i) => shownBySearch(rowOf.get(i)));
    const eggWord = (n) => `egg${n === 1 ? "" : "s"}`;

    const setRarities = async (entries, target) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => target,
                getValueState: (index) => getRarityState(index),
                getPath: (index) => `${EGGS_PATH}[${index}]`,
            })
        );
        // Some of it may have landed: the rows show what the game holds.
        if (!result.ok && !result.cancelled) await load();
    };

    // Max all only raises (and brings one above 11 down to it), so it runs on one press; Reset asks first.
    const tools = (_activeId, ask) => {
        const resetAll = ActionButton({
            label: "Reset all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().length,
            onClick: (e) => {
                e.preventDefault();
                const entries = shown();
                const n = entries.length;
                ask({
                    question: `Reset ${n} ${eggWord(n)} to 0?`,
                    confirmLabel: n === 1 ? "Reset it" : "Reset them",
                    from: resetAll,
                    onConfirm: () => setRarities(entries, 0),
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
                    return setRarities(shown(), EGG_MAX_RARITY);
                },
            }),
            resetAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Eggs",
        description: "The rarity of each egg in the incubator.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the eggs",
        errorTitle: "Couldn't read the eggs",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${eggWord(n)}` : `All ${n} ${eggWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w4.breeding.eggs",
    world: 4,
    system: "Breeding",
    tab: "Eggs",
    description: "Egg rarity in the incubator.",
    keywords: ["Incubator", "Egg rarity"],
    component: EggsTab,
});
