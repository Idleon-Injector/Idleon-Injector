import van from "../../../vendor/van-1.6.0.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { NumberInput } from "../../../components/NumberInput.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { EditableFieldsRow } from "../../../components/views/account/EditableFieldsRow.js";
import { cleanName, writeManyVerified } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const OBSERVATION_COUNT = 80;
const OBSERVATION_FIELDS = [
    {
        key: "unlocked",
        label: "Unlock",
        toDraft: (value) => Number(value ?? 0) === 1,
    },
    {
        key: "insightLevel",
        label: "Insight Lv",
        toDraft: (value) => String(value ?? 0),
    },
    {
        key: "insightExp",
        label: "Insight EXP",
        toDraft: (value) => String(value ?? 0),
    },
];

const normalizeResearchValue = (raw, index, { round = false } = {}) => {
    const values = toIndexedArray(raw);
    let resolved;

    if (values.length > 0) {
        resolved = values[index] ?? values[0] ?? 0;
    } else {
        resolved = raw ?? 0;
    }

    const numeric = Number(resolved ?? 0);
    if (!Number.isFinite(numeric)) return 0;
    return round ? Math.round(numeric) : numeric;
};

const isMeaningfulObservationName = (rawName) => {
    const name = String(rawName ?? "").trim();
    return Boolean(name) && !/^Name\d*$/i.test(name);
};

const ObservationTile = ({ index, tileState }) => {
    const clampInt = (raw) => {
        const numeric = Math.round(Number(raw));
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, numeric);
    };

    return EditableFieldsRow({
        fields: OBSERVATION_FIELDS.map((field) => ({
            ...field,
            valueState: tileState[field.key],
        })),
        normalize: (rawValues) => ({
            unlocked: rawValues.unlocked ? 1 : 0,
            insightLevel: clampInt(rawValues.insightLevel),
            insightExp: clampInt(rawValues.insightExp),
        }),
        write: async (nextValues) => {
            // Only what the player changed: the others hold the page's last read, which the game may have moved past.
            await writeManyVerified(
                [
                    { key: "unlocked", path: `Research[2][${index}]` },
                    { key: "insightExp", path: `Research[3][${index}]` },
                    { key: "insightLevel", path: `Research[4][${index}]` },
                ]
                    .filter(({ key }) => nextValues[key] !== tileState[key].val)
                    .map(({ key, path }) => ({ path, value: nextValues[key] }))
            );
            return nextValues;
        },
        info: null,
        rowClass: () =>
            ["observation-tile", tileState.unlocked.val === 1 ? "observation-tile--unlocked" : ""]
                .filter(Boolean)
                .join(" "),
        controlsClass: "observation-tile__body",
        renderControls: ({ draftStates, setFieldFocused }) => [
            div(
                { class: "observation-tile__header" },
                div(
                    { class: "observation-tile__title-group" },
                    span({ class: "observation-tile__name" }, () => tileState.name.val)
                ),
                StateSwitch({
                    checked: () => Boolean(draftStates.unlocked.val),
                    words: ["Unlocked", "Locked"],
                    name: () => `${tileState.name.val} unlock`,
                    className: "observation-tile__toggle",
                    rowField: true, // a draft the tile saves with its other fields
                    onFlip: (next) => (draftStates.unlocked.val = next),
                })
            ),
            div(
                { class: "observation-tile__stats" },
                div(
                    { class: "observation-stat" },
                    span({ class: "observation-stat__label" }, "Insight Lv"),
                    div(
                        { class: "observation-stat__controls" },
                        NumberInput({
                            mode: "int",
                            value: draftStates.insightLevel,
                            onfocus: () => setFieldFocused("insightLevel", true),
                            onblur: () => setFieldFocused("insightLevel", false),
                            onDecrement: () =>
                                (draftStates.insightLevel.val = String(
                                    Math.max(0, clampInt(draftStates.insightLevel.val) - 1)
                                )),
                            onIncrement: () =>
                                (draftStates.insightLevel.val = String(clampInt(draftStates.insightLevel.val) + 1)),
                        }),
                        span({ class: "observation-stat__value" }, () => `CUR ${tileState.insightLevel.val}`)
                    )
                ),
                div(
                    { class: "observation-stat" },
                    span({ class: "observation-stat__label" }, "Insight EXP"),
                    div(
                        { class: "observation-stat__controls" },
                        NumberInput({
                            mode: "int",
                            value: draftStates.insightExp,
                            onfocus: () => setFieldFocused("insightExp", true),
                            onblur: () => setFieldFocused("insightExp", false),
                            onDecrement: () =>
                                (draftStates.insightExp.val = String(
                                    Math.max(0, clampInt(draftStates.insightExp.val) - 1)
                                )),
                            onIncrement: () =>
                                (draftStates.insightExp.val = String(clampInt(draftStates.insightExp.val) + 1)),
                        }),
                        span({ class: "observation-stat__value" }, () => `CUR ${tileState.insightExp.val}`)
                    )
                )
            ),
        ],
    });
};

const ObservationsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Observations" });

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
                const unlocked = normalizeResearchValue(rawUnlocks, index, { round: true }) ? 1 : 0;
                const insightExp = normalizeResearchValue(rawInsightExp, index, { round: true });
                const insightLevel = normalizeResearchValue(rawInsightLevels, index);
                const rawName = String(occurrence[0] ?? "").trim();
                tile.hasName.val = isMeaningfulObservationName(rawName);
                tile.name.val = cleanName(rawName);
                tile.unlocked.val = unlocked;
                tile.insightExp.val = insightExp;
                tile.insightLevel.val = insightLevel;
            }
        });

    load();

    const tileGrid = div({ class: "scrollable-panel content-stack" }, () => {
        const tiles = observationStates
            .map((tileState, index) => ({ tileState, index }))
            .filter(({ tileState }) => tileState.hasName.val);

        return tiles.length === 0
            ? div({ class: "tab-empty" }, "No named observations were found.")
            : div(
                  { class: "observations-grid" },
                  ...tiles.map(({ tileState, index }) => ObservationTile({ index, tileState }))
              );
    });

    return PersistentAccountListPage({
        title: "Observations",
        description: "Edit unlock, insight level, and insight EXP per observation tile.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "Reading observations",
        errorTitle: "Observation read failed",
        initialWrapperClass: "scrollable-panel",
        body: tileGrid,
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
