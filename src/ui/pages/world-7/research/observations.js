/**
 * W7 - Research: Observations
 *
 * A table of the named observations: each one's Insight Lv and Insight EXP in their columns, and its Unlocked switch
 * last (a setting on its line). A typed value saves on Enter or on leaving the line, only the values the player
 * changed; the switch saves on flip.
 *
 * Data sources:
 *   gga.Research[2][n] - observation n unlocked (1) or not (0)
 *   gga.Research[3][n] - its Insight EXP
 *   gga.Research[4][n] - its Insight Lv
 *   cList.Occurrences  - the observations, the name first (a placeholder "Name7" for one the game hasn't named)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const OBSERVATION_COUNT = 80;
const UNLOCKED_PATH = "Research[2]";
const FIELDS = [
    { key: "insightLevel", label: "Insight Lv", path: "Research[4]" },
    { key: "insightExp", label: "Insight EXP", path: "Research[3]" },
];

const normalizeResearchValue = (raw, index, { round = false } = {}) => {
    const values = toIndexedArray(raw);
    const resolved = values.length > 0 ? (values[index] ?? values[0] ?? 0) : (raw ?? 0);
    const numeric = Number(resolved ?? 0);
    if (!Number.isFinite(numeric)) return 0;
    return round ? Math.round(numeric) : numeric;
};

const isMeaningfulObservationName = (rawName) => {
    const name = String(rawName ?? "").trim();
    return Boolean(name) && !/^Name\d*$/i.test(name);
};

// Unlocked, on its line: saved on flip, said only when on.
const UnlockSwitch = ({ index, tile }) => {
    const { run } = useWriteStatus();
    return StateSwitch({
        checked: () => tile.unlocked.val === 1,
        words: ["Unlocked", ""],
        name: () => `${tile.name.val} unlocked`,
        ownStatus: true,
        onFlip: (on) =>
            run(async () => {
                await writeVerified(`${UNLOCKED_PATH}[${index}]`, on ? 1 : 0);
                tile.unlocked.val = on ? 1 : 0;
            }),
    });
};

const ObservationRow = ({ index, tile }) =>
    ValueTableRow({
        name: tile.name.val,
        info: span({ class: "account-row__name" }, () => tile.name.val),
        // Only the values the player changed are written: the others hold the page's last read.
        fields: FIELDS.map((field) => ({ ...field, valueState: tile[field.key], paths: [`${field.path}[${index}]`] })),
        read: async () => {
            const [level, exp] = await Promise.all(FIELDS.map((field) => gga(`${field.path}[${index}]`)));
            return {
                insightLevel: normalizeResearchValue(level, 0),
                insightExp: normalizeResearchValue(exp, 0, { round: true }),
            };
        },
        action: UnlockSwitch({ index, tile }),
        // Set all sets an observation's Insight Lv.
        setAll: "insightLevel",
    });

const ObservationsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Observations" });
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const named = van.state(0);

    const observationStates = Array.from({ length: OBSERVATION_COUNT }, () => ({
        name: van.state(""),
        hasName: van.state(false),
        unlocked: van.state(0),
        insightLevel: van.state(0),
        insightExp: van.state(0),
    }));

    const load = async () =>
        run(async () => {
            const [rawUnlocks, rawInsightExp, rawInsightLevels, rawOccurrences] = await Promise.all([
                gga("Research[2]"),
                gga("Research[3]"),
                gga("Research[4]"),
                readCList("Occurrences"),
            ]);

            const occurrences = toIndexedArray(rawOccurrences);

            for (let index = 0; index < OBSERVATION_COUNT; index++) {
                const tile = observationStates[index];
                const occurrence = toIndexedArray(occurrences[index]);
                const rawName = String(occurrence[0] ?? "").trim();
                tile.hasName.val = isMeaningfulObservationName(rawName);
                tile.name.val = cleanName(rawName);
                tile.unlocked.val = normalizeResearchValue(rawUnlocks, index, { round: true }) ? 1 : 0;
                tile.insightExp.val = normalizeResearchValue(rawInsightExp, index, { round: true });
                tile.insightLevel.val = normalizeResearchValue(rawInsightLevels, index);
            }

            const shown = observationStates
                .map((tile, index) => ({ tile, index }))
                .filter(({ tile }) => tile.hasName.val);
            named.val = shown.length;
            reconcileRows(shown.map(({ tile, index }) => `${index}:${tile.name.val}`).join("|"), () =>
                shown.map(ObservationRow)
            );
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container research-observations-tab",
        title: "Observations",
        description: "Each observation's Insight Lv and Insight EXP, and whether it's unlocked.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading observations",
        errorTitle: "Couldn't read observations",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                setAll: { word: (n) => (n === 1 ? "observation" : "observations") },
                body: [
                    // The last column is the Unlocked switch's.
                    ValueTableHead({
                        name: "Observation",
                        columns: [...FIELDS.map((field) => field.label), { label: "", column: "switch" }],
                    }),
                    listNode,
                ],
                empty: () => (named.val ? null : "No named observations found"),
            })
        ),
    });
};

export default definePage({
    id: "w7.research.observations",
    world: 7,
    system: "Research",
    tab: "Observations",
    description: "Unlock, insight level and insight EXP of each observation.",
    keywords: ["Insight"],
    component: ObservationsTab,
});
