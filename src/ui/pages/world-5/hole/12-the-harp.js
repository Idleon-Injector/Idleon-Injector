/**
 * W5 - Hole › The Harp
 *
 * Data sources:
 *   gga.Holes[9][10 + n]   - how many of note n you have (Crotchet Note, Natural Note, ...)
 *   gga.Holes[19][2s]      - string s's level (C, D, E, F, G, A); [2s + 1] its EXP
 *
 * The notes the Harp has made, then its strings as a table: Level and EXP.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { createIndexedStateGetter, toInt, toNum } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const NOTES = [
    "Crotchet Note",
    "Natural Note",
    "Bass Note",
    "Treble Note",
    "Eighth Note",
    "Quaver Note",
    "Sharp Note",
    "(F)Clef Note",
    "(G)Clef Note",
    "Sixteenth Note",
];
const STRINGS = ["C", "D", "E", "F", "G", "A"];
const FIELDS = [
    { key: "level", label: "Level", offset: 0 },
    { key: "exp", label: "EXP", offset: 1, formatted: true, quiet: true },
];

const TheHarpTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "The Harp" });
    const getNoteState = createIndexedStateGetter(0);
    const stringStates = STRINGS.map(() => Object.fromEntries(FIELDS.map((field) => [field.key, van.state(0)])));

    const noteRows = NOTES.map((name, n) =>
        SimpleNumberRow({ entry: { name, path: `Holes[9][${10 + n}]`, float: true }, valueState: getNoteState(n) })
    );
    const stringRows = STRINGS.map((note, s) => {
        const name = `${note} string`;
        const at = (field) => `Holes[19][${2 * s + field.offset}]`;
        return ValueTableRow({
            name,
            info: span({ class: "account-row__name" }, name),
            fields: FIELDS.map((field) => ({ ...field, valueState: stringStates[s][field.key], paths: [at(field)] })),
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
    });

    const load = async () =>
        run(async () => {
            const holes = toIndexedArray((await gga("Holes")) ?? []);
            const amounts = toIndexedArray(holes[9] ?? []);
            const strings = toIndexedArray(holes[19] ?? []);
            NOTES.forEach((_, n) => (getNoteState(n).val = toNum(amounts[10 + n], 0)));
            STRINGS.forEach((_, s) =>
                FIELDS.forEach((field) => {
                    const raw = strings[2 * s + field.offset];
                    stringStates[s][field.key].val = field.formatted ? toNum(raw, 0) : toInt(raw, { min: 0 });
                })
            );
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "The Harp",
        description: "The notes the Harp has made, and each string's level.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the harp",
        errorTitle: "Couldn't read the harp",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: [
                    AccountSection({ title: "Notes", body: noteRows }),
                    AccountSection({
                        title: "Strings",
                        body: [ValueTableHead({ name: "String", columns: FIELDS.map((f) => f.label) }), ...stringRows],
                    }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w5.hole.harp",
    world: 5,
    system: "Hole",
    group: "Caverns",
    tab: "The Harp",
    description: "Harp notes and each string's level and EXP.",
    keywords: ["Harp", "Notes", "Strings"],
    component: TheHarpTab,
});
