/**
 * W3 - Refinery Tab
 *
 * Data sources:
 *   gga.Refinery[3..11][0]                    - current charge (salt stored)
 *   gga.Refinery[3..11][1]                    - level
 *   gga.ItemDefinitionsGET.h.Refinery1..9.h.displayName - salt names
 *
 * One salt per line, its Level and Charge in the table's columns. Salts 7-9 need the "Polymer Refinery" research in
 * the game; the 9th has no effect in the game yet. Each says so in a plain word on its line.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    readLevelDefinitions,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const REFINERY_COUNT = 9;
const REFINERY_OFFSET = 3;
const POLYMER_LOCK_FROM = 6;
const PLACEHOLDER_INDEX = 8;

// A salt's two values as the game holds them.
const saltValues = (raw, gameIndex) => {
    const salt = toIndexedArray(toIndexedArray(raw)[gameIndex] ?? []);
    return { level: toNum(salt[1]), charge: toNum(salt[0]) };
};

const SaltRow = ({ refIndex, name, states }) => {
    const gameIndex = refIndex + REFINERY_OFFSET;
    const badge = refIndex === PLACEHOLDER_INDEX ? "Not in game" : refIndex >= POLYMER_LOCK_FROM ? "Polymer" : null;
    return ValueTableRow({
        name,
        info: span({ class: "account-row__name" }, name),
        badge,
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
    const listNode = div({ class: "account-page-pane" });
    const reconcileRows = createStaticRowReconciler(listNode);

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

            reconcileRows(refineries.map((salt) => salt.name).join("|"), () =>
                refineries.map((salt, refIndex) => SaltRow({ refIndex, name: salt.name, states: saltStates[refIndex] }))
            );
            refineries.forEach((salt, i) => {
                saltStates[i].level.val = salt.level;
                saltStates[i].charge.val = salt.charge;
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Refinery",
        description: "Salt levels and charge. Polymer salts need the Polymer Refinery research.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the refinery",
        errorTitle: "Couldn't read the refinery",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "refinery-table",
                body: [ValueTableHead({ name: "Salt", columns: ["Level", "Charge"] }), listNode],
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
