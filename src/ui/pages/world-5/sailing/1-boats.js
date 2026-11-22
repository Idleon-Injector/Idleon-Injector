/**
 * W5 - Sailing › Boats
 *
 * Data sources:
 *   gga.Boats[b][3]            - boat b's Loot Value level
 *   gga.Boats[b][5]            - boat b's Speed level
 *   gga.GemItemsPurchased[8]   - Davey Jones Training buys (gem shop, up to 8): each one is +50% boat speed, loot
 *                                value, artifact find chance and captain EXP, and 4 minutes off the shortest trip
 *                                (_customBlock_Sailing "DaveyJonesBonus" and "Minimumtraveltime")
 *
 * The dock as a table: one line per boat with its two upgrade levels. Davey Jones Training sits above it, its own
 * quiet group, because it boosts every boat.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { createStaticRowReconciler, toInt } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const DAVEY_JONES_PATH = "GemItemsPurchased[8]";
const DAVEY_JONES_MAX = 8;
const FIELDS = [
    { key: "loot", label: "Loot Value", index: 3 },
    { key: "speed", label: "Speed", index: 5 },
];

const BoatsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Boats" });
    const states = new Map();
    const stateOf = (index) => {
        if (!states.has(index)) states.set(index, Object.fromEntries(FIELDS.map((field) => [field.key, van.state(0)])));
        return states.get(index);
    };
    const daveyState = van.state(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const BoatRow = (index) => {
        const name = `Boat ${index + 1}`;
        const at = (field) => `Boats[${index}][${field.index}]`;
        return ValueTableRow({
            name,
            info: span({ class: "account-row__name" }, name),
            fields: FIELDS.map((field) => ({ ...field, valueState: stateOf(index)[field.key], paths: [at(field)] })),
            read: async () => {
                const values = await Promise.all(FIELDS.map((field) => gga(at(field))));
                return Object.fromEntries(FIELDS.map((field, i) => [field.key, toInt(values[i], { min: 0 })]));
            },
        });
    };

    const daveyRow = ClampedLevelRow({
        valueState: daveyState,
        writePath: DAVEY_JONES_PATH,
        max: DAVEY_JONES_MAX,
        integerMode: "trunc",
        name: "Davey Jones Training",
        renderInfo: () =>
            RowTitles({
                bonus: "1.50x Boat Speed, Loot Value, Artifact Find and Captain EXP each",
                name: "Davey Jones Training",
            }),
    });

    const load = async () =>
        run(async () => {
            const [rawBoats, davey] = await Promise.all([gga("Boats"), gga(DAVEY_JONES_PATH)]);
            const boats = toIndexedArray(rawBoats ?? []).map((raw) => toIndexedArray(raw ?? []));
            reconcileRows(String(boats.length), () => boats.map((_, index) => BoatRow(index)));
            boats.forEach((boat, index) =>
                FIELDS.forEach((field) => (stateOf(index)[field.key].val = toInt(boat[field.index], { min: 0 })))
            );
            // The buys the game holds, above the shop's 8 too: the field brings them down.
            daveyState.val = toInt(davey, { min: 0 });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Boats",
        description: "Each boat's Loot Value and Speed levels.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the boats",
        errorTitle: "Couldn't read the boats",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: [
                    AccountSection({ title: "Gem shop", body: daveyRow }),
                    AccountSection({
                        title: "Boats",
                        body: [ValueTableHead({ name: "Boat", columns: FIELDS.map((field) => field.label) }), listNode],
                    }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w5.sailing.boats",
    world: 5,
    system: "Sailing",
    tab: "Boats",
    description: "Boat Loot Value and Speed levels, and Davey Jones Training.",
    keywords: ["Davey Jones Training", "Davey Jones", "Gem shop", "Limited", "Fomo", "Loot Value", "Boat Speed"],
    component: BoatsTab,
});
