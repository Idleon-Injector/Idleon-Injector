/**
 * W5 - Hole › Villagers
 *
 * The village on top of the Hole: the villagers, then each one's own screen as a tab (the Explorer's opals, the
 * Engineer's schematics, the Conjuror's Majiks, the Measurer's measurements, the Librarian's studies). One read of the
 * game fills every tab.
 *
 * Data sources (gga.Holes is one list per system):
 *   Holes[1][v], [2][v], [3][v] - villager v's level, EXP and the opals invested in it; cList.HolesInfo[20][v] names it
 *                                 ("Explorer_@___@_...")
 *   Holes[7][c]                 - opals found in cavern c; cList.HolesInfo[68][c] names the cavern ("BRUH": to come)
 *   Holes[13][n]                - schematic n: 1 once unlocked; cList.HolesBuildings[n] [0] its name, [5] what it does;
 *                                 cList.HolesInfo[40] the order the Engineer lists them in
 *   Holes[4 + g][n]             - Majik n's level in group g (Hole, Village, Idleon); cList.CosmoUpgrades[g][n] [2] its
 *                                 name, [3] what it does
 *   Holes[22][n]                - measurement n's level; cList.HolesInfo[54][n] what it boosts ("访" stands for "&")
 *   Holes[26][c]                - the Librarian's study level for cavern c
 *
 * Schematics have a switch each; Unlock all runs on one press and Lock all asks in the tray, on the Engineer's tab.
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
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    normalCase,
    runBulkSet,
    toInt,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const SCHEMATICS = "Holes[13]";
const MAJIKS = ["Hole Majik", "Village Majik", "Idleon Majik"];

// The caverns, named; the game's "BRUH" marks one still to come.
const caverns = (data) =>
    data.caverns.map((raw, c) => ({ c, name: normalCase(raw) })).filter(({ name }) => name && name !== "Bruh");

const TABS = [
    {
        id: "villagers",
        label: "Villagers",
        rows: (data) =>
            data.villagers
                .map((raw, v) => ({ v, name: cleanName(String(raw ?? "").split("_@_")[0]) }))
                // Villagers the game hasn't named yet ("???") stay off.
                .filter(({ name }) => name && !name.includes("?"))
                .map(({ v, name }) => ({
                    key: `villager-${v}`,
                    head: "Villager",
                    name,
                    fields: [
                        { key: "level", label: "Level", group: 1 },
                        { key: "exp", label: "EXP", group: 2, formatted: true, quiet: true },
                        { key: "opals", label: "Opals", group: 3 },
                    ].map((field) => ({
                        ...field,
                        path: `Holes[${field.group}][${v}]`,
                        value: field.formatted
                            ? toNum(data.holes[field.group]?.[v], 0)
                            : toInt(data.holes[field.group]?.[v], { min: 0 }),
                    })),
                })),
    },
    {
        id: "opals",
        label: "Opals",
        rows: (data) =>
            caverns(data).map(({ c, name }) => ({
                key: `opals-${c}`,
                name,
                path: `Holes[7][${c}]`,
                value: toNum(data.holes[7]?.[c], 0),
                formatted: false,
            })),
    },
    { id: "engineer", label: "Engineer" },
    {
        id: "conjuror",
        label: "Conjuror",
        rows: (data) =>
            MAJIKS.flatMap((section, g) =>
                toIndexedArray(data.majiks[g] ?? []).map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    return {
                        key: `majik-${g}-${n}`,
                        section,
                        name: cleanName(def[2], `${section} ${n + 1}`),
                        bonus: bonusText(def[3]),
                        path: `Holes[${4 + g}][${n}]`,
                        value: toNum(data.holes[4 + g]?.[n], 0),
                        formatted: false,
                    };
                })
            ),
    },
    {
        id: "measurer",
        label: "Measurer",
        rows: (data) =>
            data.measurements
                .map((raw, n) => {
                    const bonus = normalCase(bonusText(String(raw ?? "").replace(/访/g, "&")));
                    return bonus
                        ? {
                              key: `measurement-${n}`,
                              name: `Measurement ${n + 1}`,
                              bonus,
                              path: `Holes[22][${n}]`,
                              value: toNum(data.holes[22]?.[n], 0),
                              formatted: false,
                          }
                        : null;
                })
                .filter(Boolean),
    },
    {
        id: "librarian",
        label: "Librarian",
        rows: (data) =>
            caverns(data).map(({ c, name }) => ({
                key: `study-${c}`,
                name,
                path: `Holes[26][${c}]`,
                value: toNum(data.holes[26]?.[c], 0),
                formatted: false,
            })),
    },
];

const readVillage = async () => {
    const [rawHoles, ...lists] = await Promise.all([
        gga("Holes"),
        ...["HolesInfo[20]", "HolesInfo[68]", "HolesBuildings", "HolesInfo[40]", "CosmoUpgrades", "HolesInfo[54]"].map(
            (path) => readCList(path)
        ),
    ]);
    const [villagers, cavernNames, buildings, order, majiks, measurements] = lists.map((list) =>
        toIndexedArray(list ?? [])
    );
    return {
        holes: toIndexedArray(rawHoles ?? []).map((part) => toIndexedArray(part ?? [])),
        villagers,
        caverns: cavernNames,
        buildings,
        order,
        majiks,
        measurements,
    };
};

const VillagersTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Villagers", busy: () => bulk.status.val === "loading" });
    const lists = new Map(TABS.filter((tab) => tab.rows).map((tab) => [tab.id, NumberList()]));
    const readPending = () => loading.val || Boolean(error.val);

    // The Engineer's schematics: a switch each.
    const getUnlocked = createIndexedStateGetter(0);
    const schematics = van.state([]);
    const rowOf = new Map();
    const schematicNode = div();
    const reconcileSchematics = createStaticRowReconciler(schematicNode);
    const unlocked = (schematic) => getUnlocked(schematic.index).val > 0;
    const SchematicRow = (schematic) =>
        AccountToggleRow({
            info: RowTitles({ bonus: schematic.bonus, name: schematic.name }),
            words: ["Unlocked", ""],
            name: schematic.name,
            checked: () => unlocked(schematic),
            write: async (on) => {
                const value = on ? 1 : 0;
                await writeVerified(`${SCHEMATICS}[${schematic.index}]`, value);
                getUnlocked(schematic.index).val = value;
            },
        });
    const showSchematics = (data) => {
        const order = new Map(data.order.map((index, place) => [Number(index), place]));
        const next = data.buildings
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
        reconcileSchematics(next.map((schematic) => `${schematic.index}:${schematic.name}`).join("|"), () =>
            next.map((schematic) => {
                const row = SchematicRow(schematic);
                rowOf.set(schematic.index, row);
                return row;
            })
        );
        next.forEach((schematic) => (getUnlocked(schematic.index).val = toNum(data.holes[13]?.[schematic.index], 0)));
        schematics.val = next;
    };

    const load = () =>
        run(async () => {
            const data = await readVillage();
            for (const tab of TABS) if (tab.rows) lists.get(tab.id).show(tab.rows(data));
            showSchematics(data);
        });

    const shown = () => schematics.val.filter((schematic) => shownBySearch(rowOf.get(schematic.index)));
    const words = (n) => `schematic${n === 1 ? "" : "s"}`;
    const setAll = async (entries, value) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => value,
                getValueState: (schematic) => getUnlocked(schematic.index),
                getPath: (schematic) => `${SCHEMATICS}[${schematic.index}]`,
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
        title: "Villagers",
        description: "The villagers, and each one's own screen.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the village",
        errorTitle: "Couldn't read the village",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Villagers",
                // Six tabs: on a phone they take two rows instead of running off the side.
                wrap: true,
                busy: () => bulk.status.val === "loading",
                tabs: TABS.map((tab) => ({
                    id: tab.id,
                    label: tab.label,
                    content: div({ class: "field-columns" }, tab.rows ? lists.get(tab.id).node : schematicNode),
                })),
                tools,
                toolsOn: (id) => id === "engineer",
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${words(n)}` : `All ${n} ${words(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w5.hole.villagers",
    world: 5,
    system: "Hole",
    tab: "Villagers",
    description: "Villager levels, opals, schematics, Majiks, measurements and studies.",
    keywords: [
        "Explorer",
        "Engineer",
        "Conjuror",
        "Measurer",
        "Librarian",
        "Opals",
        "Schematics",
        "Cosmo",
        "Majiks",
        "Measure",
        "Measurements",
        "Studies",
    ],
    component: VillagersTab,
});
