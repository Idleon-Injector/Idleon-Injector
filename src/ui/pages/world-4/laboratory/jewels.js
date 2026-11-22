/**
 * W4 - Laboratory › Jewels
 *
 * Data sources:
 *   gga.Lab[14][n]          - 1 when jewel n is unlocked
 *   cList.JewelDesc[n][4]   - what the jewel does, in short ("Boosts Meal Cooking speed")
 *   cList.JewelDesc[n][11]  - the jewel's name
 *
 * One list in the game's order, the bonus first, each jewel with an Unlocked switch. Unlock all and Lock all sit in the
 * tray and act on the jewels the top bar's search shows; Lock all asks there first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    readLevelDefinitions,
    toInt,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const JEWEL_UNLOCKS_PATH = "Lab[14]";

const readJewels = () =>
    readLevelDefinitions({
        levelsPath: JEWEL_UNLOCKS_PATH,
        definitionsPath: "JewelDesc",
        mapEntry: ({ index, definition, rawLevel }) => {
            const rawName = String(definition[11] ?? "").trim();
            if (!rawName) return null;
            return {
                index,
                name: cleanName(rawName, `Jewel ${index + 1}`),
                bonus: cleanName(definition[4] ?? ""),
                unlocked: toInt(rawLevel, { min: 0 }) > 0 ? 1 : 0,
            };
        },
    });

const JewelsTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Lab jewels", busy: () => bulk.status.val === "loading" });
    const getUnlockedState = createIndexedStateGetter(0);
    const jewels = van.state([]);
    const rowOf = new Map();
    const listNode = div({ class: "account-page-pane" });
    const reconcileRows = createStaticRowReconciler(listNode);
    // Switch saves still running, which Unlock all and Lock all wait for.
    const pending = new Set();
    const track = (task) => {
        const running = task();
        pending.add(running);
        running.then(
            () => pending.delete(running),
            () => pending.delete(running)
        );
        return running;
    };
    // After a read that failed, the switches shown may be old: the tools wait for one that works.
    const readPending = () => loading.val || Boolean(error.val);

    const load = async () =>
        run(async () => {
            const next = await readJewels();
            reconcileRows(next.map((jewel) => `${jewel.index}:${jewel.name}`).join("|"), () =>
                next.map((jewel) => {
                    const unlockedState = getUnlockedState(jewel.index);
                    const row = AccountToggleRow({
                        info: RowTitles({ bonus: jewel.bonus, name: jewel.name }),
                        words: ["Unlocked", ""],
                        name: `${jewel.name} unlocked`,
                        checked: () => unlockedState.val > 0,
                        write: (on) =>
                            track(async () => {
                                await writeVerified(`${JEWEL_UNLOCKS_PATH}[${jewel.index}]`, on ? 1 : 0);
                                unlockedState.val = on ? 1 : 0;
                            }),
                    });
                    rowOf.set(jewel.index, row);
                    return row;
                })
            );
            next.forEach((jewel) => (getUnlockedState(jewel.index).val = jewel.unlocked));
            jewels.val = next;
        });

    // The jewels the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => jewels.val.filter((jewel) => shownBySearch(rowOf.get(jewel.index)));
    const jewelWord = (n) => `jewel${n === 1 ? "" : "s"}`;

    const setAll = async (entries, value) => {
        const result = await bulk.run(async () => {
            // A switch flipped just before still saving: wait for it, so the tool sees what it saved.
            await Promise.allSettled([...pending]);
            const writes = entries
                .filter((jewel) => getUnlockedState(jewel.index).val !== value)
                .map((jewel) => ({ path: `${JEWEL_UNLOCKS_PATH}[${jewel.index}]`, value }));
            if (!writes.length) return { cancelled: true };
            await writeManyVerified(writes);
        });
        // The switches show what the game holds now, whether the writes all landed or not.
        if (!result.cancelled) await load();
    };

    // Unlocking only adds, so it runs on one press; locking takes jewels away, so it asks first.
    const tools = (_activeId, ask) => {
        const lockAll = ActionButton({
            label: "Lock all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().some((jewel) => getUnlockedState(jewel.index).val > 0),
            onClick: (e) => {
                e.preventDefault();
                const entries = shown();
                const n = entries.filter((jewel) => getUnlockedState(jewel.index).val > 0).length;
                ask({
                    question: `Lock ${n} ${jewelWord(n)}?`,
                    confirmLabel: n === 1 ? "Lock it" : "Lock them",
                    from: lockAll,
                    onConfirm: () => setAll(entries, 0),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Unlock all",
                status: bulk.status,
                disabled: () => readPending() || shown().every((jewel) => getUnlockedState(jewel.index).val > 0),
                onClick: (e) => {
                    e.preventDefault();
                    return setAll(shown(), 1);
                },
            }),
            lockAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Jewels",
        description: "Lab jewels the account has unlocked.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the jewels",
        errorTitle: "Couldn't read the jewels",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    const on = shown().filter((jewel) => getUnlockedState(jewel.index).val > 0).length;
                    const which = isSearching() ? `${n} matching ${jewelWord(n)}` : `All ${n} ${jewelWord(n)}`;
                    return `${which} · ${on} unlocked`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w4.lab.jewels",
    world: 4,
    system: "Laboratory",
    tab: "Jewels",
    description: "Which lab jewels are unlocked.",
    keywords: ["Lab"],
    component: JewelsTab,
});
