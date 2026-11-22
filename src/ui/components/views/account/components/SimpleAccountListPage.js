import van from "../../../../vendor/van-1.6.0.js";
import { SimpleNumberRow } from "../SimpleNumberRow.js";
import { useAccountLoad } from "../accountLoadPolicy.js";
import { createStaticRowReconciler, getOrCreateState } from "../accountShared.js";
import { ListPanel } from "../tabShared.js";
import { RefreshButton } from "./AccountPageChrome.js";
import { RowTitles } from "./AccountRow.js";
import { AccountSection } from "./AccountSection.js";
import { PersistentAccountListPage } from "./PersistentAccountListPage.js";

const { div } = van.tags;

/**
 * A page that is a list of numbers, each saved to one game path, in the shared panel. `loadEntries` returns the rows
 * in order: `{ key, name, path, value }`, with `bonus` (the row's main line, the name under it), `max` (a real cap:
 * the field reads "2 / 15"), `float`, `formatted` (false for small whole numbers), `badge` (a state word before the
 * field) and `section` (rows of one section sit under its quiet heading, in the order the sections first come). A
 * row's definition stays fixed for its key.
 *
 * ponytail: no tray; no list on it has two capped rows yet. Add Max all / Reset all (Salt Lick's) when one does.
 *
 * @param {object} opts
 * @param {string} opts.title the page's sidebar name
 * @param {string} opts.description one short line
 * @param {string} opts.label what is read, for the load's messages ("The Well")
 * @param {string} opts.loadingText "Reading the well"
 * @param {string} opts.errorTitle "Couldn't read the well"
 * @param {() => Promise<object[]>} opts.loadEntries
 */
export const SimpleAccountListPage = ({ title, description, label, loadingText, errorTitle, loadEntries }) => {
    const { loading, error, run } = useAccountLoad({ label });
    const valueStates = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const rowFor = (entry) =>
        SimpleNumberRow({
            entry: {
                ...entry,
                cap: entry.max ?? null,
                info: entry.bonus ? RowTitles({ bonus: entry.bonus, name: entry.name }) : null,
            },
            valueState: getOrCreateState(valueStates, entry.key),
        });

    const load = () =>
        run(async () => {
            const next = await loadEntries();
            reconcileRows(next.map((entry) => `${entry.section ?? ""}:${entry.key}:${entry.name}`).join("|"), () => {
                const sections = [...new Set(next.map((entry) => entry.section ?? ""))];
                if (sections.length === 1 && !sections[0]) return next.map(rowFor);
                return sections.map((section) =>
                    AccountSection({
                        title: section,
                        body: next.filter((entry) => (entry.section ?? "") === section).map(rowFor),
                    })
                );
            });
            for (const entry of next) getOrCreateState(valueStates, entry.key).val = entry.value;
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title,
        description,
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText,
        errorTitle,
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({ className: "field-columns", body: listNode })
        ),
    });
};
