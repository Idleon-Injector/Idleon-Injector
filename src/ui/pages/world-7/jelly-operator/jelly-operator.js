import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { UpgradeDoublerButton, useUpgradeDoublers } from "../../../components/views/account/UpgradeDoublers.js";

const { div, span } = van.tags;
const CELL_NAMES = ["Amoeba", "Plasmid", "Ribosome", "Organelle", "Immunoid", "Virus", "Mitochondria", "Gigacyst"];
const CELL_LEVEL_LIMIT = Math.floor(Math.log(Number.MAX_VALUE / 20) / Math.log(1.3)) - 1;
const TABS = [
    { id: "upgrades", label: "Upgrades", keywords: ["Jelly Upgrades", "Bloodcells", "Operations", "Doublers"] },
    { id: "cells", label: "Cells", keywords: ["Jelly Cells"] },
];

const validLevel = (raw, max) => {
    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) && value <= max ? value : null;
};

// A level row: the bonus first where the game has one, its state word ("Locked") before the field. A level without a
// shown cap keeps Max's room before its doubler, so the fields line up.
const LevelRow = ({
    name,
    bonus = "",
    valueState,
    max,
    displayMax = false,
    write,
    locked = false,
    renderExtraActions = null,
}) =>
    EditableNumberRow({
        valueState,
        normalize: (raw) => {
            if (Number(raw) > max) throw new Error(`max ${max}`);
            return validLevel(raw, max);
        },
        write,
        renderInfo: () => (bonus ? RowTitles({ bonus, name }) : span({ class: "account-row__name" }, name)),
        renderBadge: () => ((typeof locked === "function" ? locked() : locked) ? "Locked" : ""),
        cap: displayMax ? max : null,
        adjustInput: (raw, delta, current) =>
            Math.max(0, Math.min(max, (validLevel(raw, max) ?? current ?? 0) + delta)),
        controlsClass: "account-row__controls--xl",
        rowClass: renderExtraActions ? "doubler-row" : "",
        renderExtraActions:
            renderExtraActions &&
            (() => [
                displayMax ? null : span({ class: "account-row__max-slot", "aria-hidden": "true" }),
                renderExtraActions(),
            ]),
        // A line of its tab's Set all, saved through its own write (a cache to clear, a cell's XP to reset).
        setAll: { refuse: (value) => (value > max ? `max ${max}` : null) },
    });

/** Jelly Operator account editor backed by current Research and JellyUPG definitions. */
const JellyTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Jelly Operator" });
    const doublers = useUpgradeDoublers(
        { path: "Spelunk[53]", ownedMethod: "JellyOpDoublersOwned", eligiblePath: "Research[61]" },
        loading
    );
    const bloodcells = van.state(0);
    const operationsLeft = van.state(0);
    const upgradeStates = new Map();
    const cellStates = new Map();
    const upgradeList = div();
    const cellList = div();
    const reconcileUpgrades = createStaticRowReconciler(upgradeList);
    const reconcileCells = createStaticRowReconciler(cellList);

    const load = async () =>
        run(async () => {
            const [rawDefinitions, rawOrder, rawResearch, rawLevel] = await Promise.all([
                readCList("JellyUPG"),
                readCList("Research[44]"),
                gga("Research"),
                gga("Lv0[20]"),
                doublers.load(),
            ]);
            const definitions = toIndexedArray(rawDefinitions);
            const order = toIndexedArray(rawOrder);
            const research = toIndexedArray(rawResearch);
            const stats = toIndexedArray(research[7]);
            const levels = toIndexedArray(research[17]);
            const cellLevels = toIndexedArray(research[16]);
            const accountLevel = Number(rawLevel) || 0;

            bloodcells.val = Number(stats[11]) || 0;
            operationsLeft.val = Number(stats[10]) || 0;

            const entries = order
                .map((rawId, orderIndex) => {
                    const id = Number(rawId);
                    const definition = toIndexedArray(definitions[id]);
                    if (!Number.isInteger(id) || !definition.length || !String(definition[0] ?? "").trim()) return null;
                    const gameCap = Number(definition[1]);
                    const costMultiplier = Number(definition[2]);
                    const costBase =
                        Math.max(0.1, Number(definition[4]) || 1) *
                        (1 + orderIndex / 7) *
                        (6 + 5 * orderIndex + orderIndex ** 2) *
                        Math.pow(1.4 + Math.max(0, orderIndex - 3) / 30, Math.max(0, orderIndex - 4)) *
                        Math.pow(1.3, Math.max(0, orderIndex - 20));
                    const safeCap =
                        costMultiplier > 1
                            ? Math.max(
                                  0,
                                  Math.floor(
                                      (Math.log(Number.MAX_VALUE) - Math.log(costBase)) / Math.log(costMultiplier)
                                  ) - 2
                              )
                            : Number.MAX_SAFE_INTEGER;
                    return {
                        id,
                        orderIndex,
                        name: cleanName(definition[0], `Upgrade ${id}`),
                        bonus: bonusText(definition[5]),
                        max: gameCap <= 998 ? gameCap : safeCap,
                        displayMax: gameCap <= 998,
                        locked:
                            accountLevel <
                            15 + 2 * orderIndex + Math.floor(orderIndex / 15) - Math.floor(orderIndex / 11),
                    };
                })
                .filter(Boolean);
            reconcileUpgrades(
                entries.map((entry) => `${entry.id}:${entry.name}:${entry.max}:${entry.locked}`).join("|"),
                () =>
                    entries.map((entry) =>
                        LevelRow({
                            ...entry,
                            valueState: getOrCreateState(upgradeStates, entry.id),
                            renderExtraActions: () =>
                                UpgradeDoublerButton({
                                    doublers,
                                    index: entry.id,
                                    name: entry.name,
                                }),
                            write: async (next) => {
                                await writeVerified(`Research[17][${entry.id}]`, next);
                                if (entry.id === 8 || entry.id === 9) await deleteGga("DNSM.h.JellySlotz");
                                return next;
                            },
                        })
                    )
            );
            for (const entry of entries) getOrCreateState(upgradeStates, entry.id).val = Number(levels[entry.id]) || 0;

            reconcileCells(CELL_NAMES.join("|"), () =>
                CELL_NAMES.map((name, id) =>
                    LevelRow({
                        name,
                        // Locked until the upgrades own this many cells; nothing shows once it's unlocked.
                        locked: () =>
                            id >=
                            CELL_NAMES.reduce(
                                (owned, _, upgradeId) => owned + getOrCreateState(upgradeStates, upgradeId).val,
                                0
                            ),
                        valueState: getOrCreateState(cellStates, id),
                        max: CELL_LEVEL_LIMIT,
                        write: async (next) => {
                            let writeError = null;
                            let cacheError = null;
                            try {
                                await writeManyVerified([
                                    { path: `Research[16][${id}]`, value: next },
                                    { path: `Research[15][${id}]`, value: 0 },
                                ]);
                            } catch (error) {
                                writeError = error;
                            }
                            try {
                                await deleteGga("DNSM.h.CellLV_tot");
                            } catch (error) {
                                cacheError = error;
                            }
                            if (writeError) throw new Error("Couldn't save all of it. Refresh.");
                            if (cacheError) throw new Error("Saved. Totals may be off. Refresh.");
                            return next;
                        },
                    })
                )
            );
            for (let id = 0; id < 9; id++) getOrCreateState(cellStates, id).val = Number(cellLevels[id]) || 0;
        });

    load();

    // A stat keeps Max's room and the doubler's, so its value stands in the upgrades' column.
    const keepRoom = () => [
        span({ class: "account-row__max-slot", "aria-hidden": "true" }),
        span({ class: "upgrade-doubler-slot" }),
    ];
    const content = {
        upgrades: div(
            { class: "field-columns" },
            AccountSection({
                title: "Stats",
                body: [
                    SimpleNumberRow({
                        entry: { name: "Bloodcells", path: "Research[7][11]", formatted: true, float: true },
                        valueState: bloodcells,
                        renderExtraActions: keepRoom,
                    }),
                    SimpleNumberRow({
                        entry: { name: "Operations left", path: "Research[7][10]" },
                        valueState: operationsLeft,
                        renderExtraActions: keepRoom,
                    }),
                ],
            }),
            AccountSection({
                title: "Upgrades",
                note: () => `${doublers.selected.val.length} of ${doublers.capacity.val} doubled`,
                body: upgradeList,
            })
        ),
        cells: cellList,
    };

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Jelly Operator",
        description: "Bloodcells, upgrades and cells. A typed cell level resets that cell's XP.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the Jelly Operator",
        errorTitle: "Couldn't read the Jelly Operator",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Jelly Operator",
                page: "w7.jellyoperator",
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: content[tab.id] })),
                setAll: {
                    word: (n, tab) => (tab === "cells" ? (n === 1 ? "cell" : "cells") : n === 1 ? "line" : "lines"),
                    placeholder: (tab) => (tab === "cells" ? "Level" : "Value"),
                },
            })
        ),
    });
};

export default definePage({
    id: "w7.jellyoperator",
    world: 7,
    system: "Jelly Operator",
    description: "Bloodcells, operations left, upgrade and cell levels, and which upgrades are doubled.",
    keywords: ["Jelly", "Bloodcells", "Upgrades", "Cells"],
    tabs: TABS,
    component: JellyTab,
});
