import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { AllToTool } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    runBulkSet,
    toInt,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const SUSHI_RESOURCES_PATH = "Sushi[4]";
const SUSHI_PERFECT_PATH = "Sushi[5]";
const SUSHI_XP_PATH = "Sushi[6]";
const SUSHI_LEVEL_PATH = "Sushi[7]";

// A sushi's state as the game keeps it in Sushi[5]: -1 never made, 0 made, 1 made perfect.
const STATES = [
    { value: -1, label: "Locked" },
    { value: 0, label: "Unlocked" },
    { value: 1, label: "Perfect" },
];

const RESOURCE_FIELDS = [
    { id: "fuel", index: 0, label: "Fuel", mode: "currency" },
    { id: "money", index: 3, label: "Money", mode: "currency" },
    { id: "salt", index: 5, label: "Salt Shaker", mode: "int" },
    { id: "pepper", index: 6, label: "Pepper Shaker", mode: "int" },
    { id: "saffron", index: 7, label: "Saffron Shaker", mode: "int" },
];

// A sushi's line: its state, its Knowledge XP and its level, each in its column.
const KNOWLEDGE_FIELDS = [
    // Down to Locked (-1): a locked sushi shows locked, and stays so when only its XP or level is saved.
    { key: "perfect", label: "State", path: SUSHI_PERFECT_PATH, steps: STATES, min: -1 },
    { key: "xp", label: "Knowledge XP", path: SUSHI_XP_PATH, formatted: true },
    { key: "level", label: "Level", path: SUSHI_LEVEL_PATH },
];
const readKnowledge = (field, raw) =>
    field.key === "perfect"
        ? Math.min(1, toInt(raw, { min: -1 }))
        : field.key === "xp"
          ? Number(raw ?? 0)
          : toInt(raw, { min: 0 });

const ResourceRow = ({ field, valueState }) => {
    const isCurrency = field.mode === "currency";

    return SimpleNumberRow({
        entry: {
            ...field,
            path: `${SUSHI_RESOURCES_PATH}[${field.index}]`,
            name: field.label,
            showIndex: false,
            formatted: isCurrency,
            float: isCurrency,
        },
        valueState,
    });
};

// Only what the player changed is written: the others hold the page's last read, which the game may have moved past.
const KnowledgeRow = ({ entry, fieldStates }) =>
    ValueTableRow({
        name: entry.name,
        info: RowTitles({ bonus: entry.name, name: `Tier ${entry.index + 1}` }),
        fields: KNOWLEDGE_FIELDS.map((field) => ({
            ...field,
            valueState: getOrCreateState(fieldStates[field.key], entry.index),
            paths: [`${field.path}[${entry.index}]`],
        })),
        read: async () => {
            const values = await Promise.all(KNOWLEDGE_FIELDS.map((field) => gga(`${field.path}[${entry.index}]`)));
            return Object.fromEntries(KNOWLEDGE_FIELDS.map((field, i) => [field.key, readKnowledge(field, values[i])]));
        },
    });

function SushiGeneralTab() {
    const { loading, error, run } = useAccountLoad({ label: "Sushi General" });
    const resourceStates = new Map(RESOURCE_FIELDS.map((field) => [field.id, van.state(0)]));
    const sushiEntries = van.state([]);
    const fieldStates = {
        perfect: new Map(),
        xp: new Map(),
        level: new Map(),
    };
    const knowledgeListNode = div();
    const rowOf = new Map();
    const bulk = useWriteStatus();
    const reconcileKnowledgeRows = createStaticRowReconciler(knowledgeListNode);

    const buildSushiEntries = (rawNames) =>
        toIndexedArray(rawNames ?? [])
            .map((rawName, index) => {
                const rawId = String(rawName ?? "").trim();
                if (!rawId) return null;

                return {
                    index,
                    rawId,
                    name: cleanName(rawId, `Sushi ${index}`),
                };
            })
            .filter(Boolean);

    const reconcileRows = () => {
        reconcileKnowledgeRows(sushiEntries.val.map((entry) => entry.rawId).join("|"), () =>
            sushiEntries.val.map((entry) => {
                const row = KnowledgeRow({ entry, fieldStates });
                rowOf.set(entry.index, row);
                return row;
            })
        );
    };

    const load = async () =>
        run(async () => {
            sushiEntries.val = buildSushiEntries(await readCList("Research[30]"));
            reconcileRows();

            const [rawResources, rawPerfect, rawXp, rawLevels] = await Promise.all([
                gga(SUSHI_RESOURCES_PATH),
                gga(SUSHI_PERFECT_PATH),
                gga(SUSHI_XP_PATH),
                gga(SUSHI_LEVEL_PATH),
            ]);
            const resources = toIndexedArray(rawResources ?? []);
            const perfect = toIndexedArray(rawPerfect ?? []);
            const xp = toIndexedArray(rawXp ?? []);
            const levels = toIndexedArray(rawLevels ?? []);

            for (const field of RESOURCE_FIELDS) {
                resourceStates.get(field.id).val =
                    field.mode === "currency"
                        ? Number(resources[field.index] ?? 0)
                        : toInt(resources[field.index], { min: 0 });
            }

            const held = { perfect, xp, level: levels };
            for (const entry of sushiEntries.val)
                for (const field of KNOWLEDGE_FIELDS)
                    getOrCreateState(fieldStates[field.key], entry.index).val = readKnowledge(
                        field,
                        held[field.key][entry.index]
                    );
        });

    load();

    // All to: every sushi the top bar's search shows to one state; lowering one asks first.
    const shown = () => sushiEntries.val.filter((entry) => shownBySearch(rowOf.get(entry.index)));
    const tools = (_activeId, ask) =>
        div(
            { class: "tabbed-list__tool-group" },
            AllToTool({
                ask,
                bulk,
                steps: STATES,
                ordered: true,
                lines: shown,
                pickedOf: (entry) => getOrCreateState(fieldStates.perfect, entry.index).val,
                word: () => "sushi",
                disabled: () => loading.val,
                write: (lines, value) =>
                    runBulkSet({
                        entries: lines,
                        getTargetValue: () => value,
                        getValueState: (entry) => getOrCreateState(fieldStates.perfect, entry.index),
                        getPath: (entry) => `${SUSHI_PERFECT_PATH}[${entry.index}]`,
                    }),
            })
        );

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container sushi-general-tab",
        title: "General",
        description: "Sushi resources, and each sushi's state, Knowledge XP and level.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading sushi",
        errorTitle: "Couldn't read sushi",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                tools,
                // Set all is for the resources; a sushi's state has All to: the line names both.
                toolsLabel: () =>
                    `${RESOURCE_FIELDS.length} resources · ${shown().length}${isSearching() ? " matching" : ""} sushi`,
                setAll: { word: (n) => (n === 1 ? "resource" : "resources"), placeholder: "Value" },
                body: [
                    AccountSection({
                        title: "Resources",
                        body: div(
                            { class: "field-columns" },
                            ...RESOURCE_FIELDS.map((field) =>
                                ResourceRow({ field, valueState: resourceStates.get(field.id) })
                            )
                        ),
                    }),
                    AccountSection({
                        title: "Knowledge",
                        body: [
                            ValueTableHead({
                                name: "Sushi",
                                columns: KNOWLEDGE_FIELDS,
                            }),
                            knowledgeListNode,
                        ],
                    }),
                ],
            })
        ),
    });
}

export default definePage({
    id: "w7.sushistation.general",
    world: 7,
    system: "Sushi Station",
    tab: "General",
    description: "Sushi resources, and each tier's unlock, XP and knowledge level.",
    keywords: ["Sushi", "Knowledge"],
    component: SushiGeneralTab,
});
