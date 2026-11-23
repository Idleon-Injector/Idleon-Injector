import van from "../../../../vendor/van-1.6.0.js";
import { gga } from "../../../../services/api.js";
import { ValueTableHead, ValueTableRow } from "../EditableFieldsRow.js";
import { SimpleNumberRow } from "../SimpleNumberRow.js";
import { createStaticRowReconciler, getOrCreateState, toInt, toNum } from "../accountShared.js";
import { RowTitles } from "./AccountRow.js";
import { AccountSection } from "./AccountSection.js";

const { div, span } = van.tags;

/**
 * A list of numbers, each saved to the game where it lives, for a page or one of its tabs (a Hole cavern). `show`
 * takes the rows in order and puts the game's values in them; a row's definition stays fixed for its key, so a row
 * keeps its save state and Undo across reads.
 *
 * A row is `{ key, name, path, value }`, with `bonus` (its main line, the name under it), `max` (a real cap: the field
 * reads "2 / 15"), `min`, `float`, `formatted` (false for small whole numbers), `badge` (a state word before the
 * field) and `section` (rows of one section sit under its quiet heading, in the order the sections first come).
 * A table row has `fields` instead of `path`/`value` (`{ key, label, path, value, formatted, quiet }`): its section
 * starts with a column head, named by the row's `head` ("String", "Upgrade"). Its `setAll` is the key of the column
 * the list's Set all sets (ValueTableRow's).
 */
export const NumberList = () => {
    const node = div();
    const reconcile = createStaticRowReconciler(node);
    const states = new Map();
    const state = (key) => getOrCreateState(states, key);
    const title = (entry) => (entry.bonus ? RowTitles({ bonus: entry.bonus, name: entry.name }) : null);

    const tableRow = (entry) =>
        ValueTableRow({
            name: entry.name,
            info: title(entry) ?? span({ class: "account-row__name" }, entry.name),
            fields: entry.fields.map((field) => ({
                ...field,
                valueState: state(`${entry.key}:${field.key}`),
                paths: [field.path],
            })),
            read: async () => {
                const values = await Promise.all(entry.fields.map((field) => gga(field.path)));
                return Object.fromEntries(
                    entry.fields.map((field, i) => [
                        field.key,
                        field.formatted ? toNum(values[i], 0) : toInt(values[i], { min: 0 }),
                    ])
                );
            },
            setAll: entry.setAll,
        });
    const numberRow = (entry) =>
        SimpleNumberRow({
            entry: { ...entry, cap: entry.max ?? null, info: title(entry) },
            valueState: state(entry.key),
        });
    const rowsOf = (entries) => [
        ...(entries[0]?.fields
            ? [ValueTableHead({ name: entries[0].head, columns: entries[0].fields.map((field) => field.label) })]
            : []),
        ...entries.map((entry) => (entry.fields ? tableRow(entry) : numberRow(entry))),
    ];

    const show = (entries) => {
        reconcile(entries.map((entry) => `${entry.section ?? ""}:${entry.key}:${entry.name}`).join("|"), () => {
            const sections = [...new Set(entries.map((entry) => entry.section ?? ""))];
            if (sections.length === 1 && !sections[0]) return rowsOf(entries);
            return sections.map((section) =>
                AccountSection({
                    title: section,
                    body: rowsOf(entries.filter((entry) => (entry.section ?? "") === section)),
                })
            );
        });
        for (const entry of entries) {
            if (!entry.fields) state(entry.key).val = entry.value;
            else for (const field of entry.fields) state(`${entry.key}:${field.key}`).val = field.value;
        }
    };

    return { node, show };
};
