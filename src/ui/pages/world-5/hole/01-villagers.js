/**
 * W5 - Hole › Villagers
 *
 * Data sources:
 *   gga.Holes[1][v]          - villager v's level
 *   gga.Holes[2][v]          - its EXP
 *   gga.Holes[3][v]          - the opals invested in it
 *   cList.HolesInfo[20][v]   - "Explorer_@___@_Each_LV_of_this_villager_unlocks..." (its name, then its job)
 *
 * The village as a table: one line per villager, its level, EXP and opals. Villagers the game hasn't named yet
 * ("???") stay off it.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const FIELDS = [
    { key: "level", label: "Level", group: 1 },
    { key: "exp", label: "EXP", group: 2, formatted: true, quiet: true },
    { key: "opals", label: "Opals", group: 3 },
];

const VillagersTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Villagers" });
    const states = new Map();
    const state = (key) => getOrCreateState(states, key);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const VillagerRow = (v, name) => {
        const at = (field) => `Holes[${field.group}][${v}]`;
        return ValueTableRow({
            name,
            info: span({ class: "account-row__name" }, name),
            fields: FIELDS.map((field) => ({ ...field, valueState: state(`${field.key}-${v}`), paths: [at(field)] })),
            read: async () => {
                const values = await Promise.all(FIELDS.map((field) => gga(at(field))));
                return Object.fromEntries(
                    FIELDS.map((field, i) => [
                        field.key,
                        field.formatted ? toNum(values[i], 0) : toInt(values[i], { min: 0 }),
                    ])
                );
            },
        });
    };

    const load = async () =>
        run(async () => {
            const [rawHoles, rawNames] = await Promise.all([gga("Holes"), readCList("HolesInfo[20]")]);
            const holes = toIndexedArray(rawHoles ?? []).map((part) => toIndexedArray(part ?? []));
            const villagers = toIndexedArray(rawNames ?? [])
                .map((raw, v) => ({ v, name: cleanName(String(raw ?? "").split("_@_")[0]) }))
                .filter((villager) => villager.name && !villager.name.includes("?"));
            reconcileRows(villagers.map((villager) => villager.name).join("|"), () =>
                villagers.map((villager) => VillagerRow(villager.v, villager.name))
            );
            villagers.forEach(({ v }) =>
                FIELDS.forEach((field) => {
                    const raw = holes[field.group]?.[v];
                    state(`${field.key}-${v}`).val = field.formatted ? toNum(raw, 0) : toInt(raw, { min: 0 });
                })
            );
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Villagers",
        description: "Each villager's level, EXP and the opals invested in it.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the villagers",
        errorTitle: "Couldn't read the villagers",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: [ValueTableHead({ name: "Villager", columns: FIELDS.map((field) => field.label) }), listNode],
            })
        ),
    });
};

export default definePage({
    id: "w5.hole.villagers",
    world: 5,
    system: "Hole",
    group: "Villagers",
    tab: "Villagers",
    description: "Villager levels, EXP and opals invested.",
    keywords: ["Explorer", "Engineer", "Conjuror", "Measurer", "Librarian", "Opals"],
    component: VillagersTab,
});
