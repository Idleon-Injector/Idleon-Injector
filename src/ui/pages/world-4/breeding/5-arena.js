/**
 * W4 - Breeding › Arena
 *
 * Data sources:
 *   gga.OptionsListAccount[89]   - the best Pet Arena round
 *   gga.OptionsListAccount[628]  - the best Crucible round
 *
 * The Pet Arena's two records in the shared panel.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readGgaEntries } from "../../../services/api.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const RECORDS = [
    { key: "89", name: "Best round" },
    { key: "628", name: "Best Crucible round" },
];

// A best round. Untouched options read as undefined, null or "" (no round yet: 0); anything else that isn't a whole
// number from 0 up is refused, so a bad value never shows as an editable 0.
const bestRound = (raw, name) => {
    if (raw === undefined || raw === null || raw === "") return 0;
    const value = Number(raw);
    if (
        !["number", "string"].includes(typeof raw) ||
        !Number.isFinite(value) ||
        String(raw).trim() === "" ||
        value < 0
    ) {
        throw new Error(`Couldn't read the ${name.toLowerCase()}. Refresh to try again.`);
    }
    return Math.trunc(value);
};

const ArenaTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Pet Arena" });
    const states = RECORDS.map(() => van.state(0));

    const load = async () =>
        run(async () => {
            const options = await readGgaEntries(
                "OptionsListAccount",
                RECORDS.map((record) => record.key)
            );
            const rounds = RECORDS.map((record) => bestRound(options[record.key], record.name));
            rounds.forEach((round, i) => (states[i].val = round));
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Arena",
        description: "The Pet Arena's best rounds.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the arena",
        errorTitle: "Couldn't read the arena",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                setAll: { word: (n) => (n === 1 ? "record" : "records"), placeholder: "Round" },
                body: RECORDS.map((record, i) =>
                    SimpleNumberRow({
                        entry: {
                            name: record.name,
                            path: `OptionsListAccount[${record.key}]`,
                            formatted: false,
                            showIndex: false,
                        },
                        valueState: states[i],
                    })
                ),
            })
        ),
    });
};

export default definePage({
    id: "w4.breeding.arena",
    world: 4,
    system: "Breeding",
    tab: "Arena",
    description: "Best Pet Arena and Crucible rounds.",
    keywords: ["Pet Arena", "Crucible"],
    component: ArenaTab,
});
