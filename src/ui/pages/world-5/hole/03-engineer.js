/**
 * W5 - Hole › Engineer
 *
 * Data sources:
 *   gga.Holes[13][n]          - schematic n: 1 once unlocked
 *   cList.HolesBuildings[n]   - [0] the schematic's name, [5] what it does in the game's words
 *   cList.HolesInfo[40]       - the order the Engineer's screen lists them in
 *
 * The Engineer's schematics in the game's order, each with a switch and what it does first. Unlock all runs on one
 * press; Lock all asks in the tray. Both act on the schematics the top bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    runBulkSet,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const PATH = "Holes[13]";

const EngineerTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Engineer", busy: () => bulk.status.val === "loading" });
    const getState = createIndexedStateGetter(0);
    const schematics = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const readPending = () => loading.val || Boolean(error.val);
    const unlocked = (schematic) => getState(schematic.index).val > 0;

    const SchematicRow = (schematic) =>
        AccountToggleRow({
            info: RowTitles({ bonus: schematic.bonus, name: schematic.name }),
            words: ["Unlocked", ""],
            name: schematic.name,
            checked: () => unlocked(schematic),
            write: async (on) => {
                const value = on ? 1 : 0;
                await writeVerified(`${PATH}[${schematic.index}]`, value);
                getState(schematic.index).val = value;
            },
        });

    const load = async () =>
        run(async () => {
            const [rawBuilt, rawDefs, rawOrder] = await Promise.all([
                gga(PATH),
                readCList("HolesBuildings"),
                readCList("HolesInfo[40]"),
            ]);
            const values = toIndexedArray(rawBuilt ?? []);
            const order = new Map(toIndexedArray(rawOrder ?? []).map((index, place) => [Number(index), place]));
            const next = toIndexedArray(rawDefs ?? [])
                .map((raw, index) => {
                    const def = toIndexedArray(raw ?? []);
                    const name = cleanName(def[0]);
                    // Some lines lead with the number's unit ("/hr Bucket Fill Rate") or are only a multiplier ("X").
                    const bonus = bonusText(def[5])
                        .replace(/^\/hr\s+/, "")
                        .replace(/^X(\s+|$)/, "");
                    return name ? { index, name, bonus } : null;
                })
                .filter(Boolean)
                .sort((a, b) => (order.get(a.index) ?? a.index + 1e4) - (order.get(b.index) ?? b.index + 1e4));
            reconcileRows(next.map((schematic) => `${schematic.index}:${schematic.name}`).join("|"), () =>
                next.map((schematic) => {
                    const row = SchematicRow(schematic);
                    rowOf.set(schematic.index, row);
                    return row;
                })
            );
            next.forEach((schematic) => (getState(schematic.index).val = toNum(values[schematic.index], 0)));
            schematics.val = next;
        });

    const shown = () => schematics.val.filter((schematic) => shownBySearch(rowOf.get(schematic.index)));
    const words = (n) => `schematic${n === 1 ? "" : "s"}`;

    const setAll = async (entries, value) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => value,
                getValueState: (schematic) => getState(schematic.index),
                getPath: (schematic) => `${PATH}[${schematic.index}]`,
            })
        );
        if (!result.ok && !result.cancelled) await load();
    };

    const tools = (_activeId, ask) => {
        const lockAll = ActionButton({
            label: "Lock all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().some(unlocked),
            onClick: (e) => {
                e.preventDefault();
                const entries = shown().filter(unlocked);
                const n = entries.length;
                ask({
                    question: `Lock ${n} ${words(n)}?`,
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
                disabled: () => readPending() || !shown().length,
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
        title: "Engineer",
        description: "Which of the Engineer's schematics are unlocked.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the schematics",
        errorTitle: "Couldn't read the schematics",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${words(n)}` : `All ${n} ${words(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w5.hole.engineer",
    world: 5,
    system: "Hole",
    group: "Villagers",
    tab: "Engineer",
    description: "Engineer schematics unlocked.",
    keywords: ["Schematics", "Buildings"],
    component: EngineerTab,
});
