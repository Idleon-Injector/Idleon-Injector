/**
 * W3 - Refinery Tab
 *
 * Data sources:
 *   gga.Refinery[3..11][0]                    - current charge (salt stored)
 *   gga.Refinery[3..11][1]                    - level
 *   gga.ItemDefinitionsGET.h.Refinery1..9.h.displayName - salt names
 *
 * The refinery's three tabs as the game has them (Combustion, Synthesis, Polymerization, three salts each), one salt per
 * line with its Level and Charge in the table's columns. Polymerization needs the "Polymer Refinery" research.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    readLevelDefinitions,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const REFINERY_COUNT = 9;
const REFINERY_OFFSET = 3;
// The game's refinery tabs, three salts (chambers) each.
const TABS = [
    { id: "combustion", label: "Combustion" },
    { id: "synthesis", label: "Synthesis" },
    { id: "polymerization", label: "Polymerization" },
];

// A salt's two values as the game holds them.
const saltValues = (raw, gameIndex) => {
    const salt = toIndexedArray(toIndexedArray(raw)[gameIndex] ?? []);
    return { level: toNum(salt[1]), charge: toNum(salt[0]) };
};

const SaltRow = ({ refIndex, name, states }) => {
    const gameIndex = refIndex + REFINERY_OFFSET;
    return ValueTableRow({
        name,
        info: span({ class: "account-row__name" }, name),
        fields: [
            { key: "level", label: "Level", valueState: states.level, paths: [`Refinery[${gameIndex}][1]`] },
            { key: "charge", label: "Charge", valueState: states.charge, paths: [`Refinery[${gameIndex}][0]`] },
        ],
        read: async () => saltValues(await gga("Refinery"), gameIndex),
    });
};

const RefineryTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Refinery" });
    const saltStates = Array.from({ length: REFINERY_COUNT }, () => ({ level: van.state(0), charge: van.state(0) }));
    const listNodes = TABS.map(() => div());
    const reconcilers = listNodes.map((node) => createStaticRowReconciler(node));

    const load = async () =>
        run(async () => {
            const refineryKeys = Array.from({ length: REFINERY_COUNT }, (_, i) => `Refinery${i + 1}`);
            const refineries = await readLevelDefinitions({
                levelsPath: "Refinery",
                readDefinitions: () => readGgaEntries("ItemDefinitionsGET.h", refineryKeys, ["displayName"]),
                selectLevels: (_, levels) => levels.slice(REFINERY_OFFSET, REFINERY_OFFSET + REFINERY_COUNT),
                selectDefinitions: (nameEntries) => refineryKeys.map((key) => nameEntries[key]),
                mapEntry: ({ rawDefinition, rawLevel, index }) => ({
                    name: cleanName(rawDefinition?.displayName, `Salt ${index + 1}`),
                    charge: toNum(rawLevel?.[0]),
                    level: toNum(rawLevel?.[1]),
                }),
            });

            TABS.forEach((_, tab) => {
                const salts = refineries.slice(tab * 3, tab * 3 + 3);
                reconcilers[tab](salts.map((salt) => salt.name).join("|"), () =>
                    salts.map((salt, i) =>
                        SaltRow({ refIndex: tab * 3 + i, name: salt.name, states: saltStates[tab * 3 + i] })
                    )
                );
            });
            refineries.forEach((salt, i) => {
                saltStates[i].level.val = salt.level;
                saltStates[i].charge.val = salt.charge;
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Refinery",
        description: "Salt levels and charge. Polymerization needs the Polymer Refinery research.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the refinery",
        errorTitle: "Couldn't read the refinery",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed refinery-table" },
            TabbedList({
                name: "Refinery",
                tabs: TABS.map((tab, i) => ({
                    id: tab.id,
                    label: tab.label,
                    content: [ValueTableHead({ name: "Salt", columns: ["Level", "Charge"] }), listNodes[i]],
                })),
            })
        ),
    });
};

export default definePage({
    id: "w3.refinery",
    world: 3,
    system: "Refinery",
    description: "Refinery salt charge and levels.",
    keywords: ["Salts", "Polymer"],
    component: RefineryTab,
});
