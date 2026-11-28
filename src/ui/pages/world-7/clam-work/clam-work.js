import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { parseNumber } from "../../../utils/numberFormat.js";
import { ClickerRow } from "../../../components/views/account/ClickerRow.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import {
    bonusText,
    createStaticRowReconciler,
    getOrCreateState,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const PEARL_FIELD = { index: 454, label: "Pearls", live: true, formatted: true, float: true };
const CLAMWORKS_FIELDS = [
    { index: 455, label: "Pearl Value" },
    { index: 456, label: "Clam Comrades" },
    { index: 457, label: "Lucky Day" },
    { index: 458, label: "Multi-Scalping" },
    { index: 459, label: "Frugality" },
    { index: 460, label: "Pure Pearls" },
    { index: 461, label: "Encystation Up" },
    { index: 462, label: "Shinier Pearls" },
    { index: 463, label: "Anti Inflation" },
    { index: 464, label: "Worker Class" },
];
const ALL_FIELDS = [PEARL_FIELD, ...CLAMWORKS_FIELDS];
const SCURGE_FIELDS = [
    { name: "Scurge EXP", path: "Menagerie[0][7]", coreIndex: 7, float: true },
    { name: "Scurge level", path: "Menagerie[0][8]", coreIndex: 8 },
    ...[
        "Reckoning",
        "Pearl Infection",
        "Self Affliction",
        "Cost Dissolving",
        "Even Better",
        "Cross Culting",
        "Gravestart",
        "Swarming",
        "True Scurge",
    ].map((name, index) => ({ name, path: `Menagerie[5][${index}]`, index })),
];

const ClamRow = ({ field, fieldState, onWrite }) =>
    ClickerRow({ field, fieldState, onWrite, controlsClass: "account-row__controls--xl" });

const ClamTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Clam" });
    const fieldStates = new Map(ALL_FIELDS.map((field) => [field.index, van.state(undefined)]));
    const scurgeStates = new Map();
    const scurgeReady = van.state(false);
    const scurgeList = div();
    const reconcileScurge = createStaticRowReconciler(scurgeList);

    const load = async () =>
        run(async () => {
            const [results, rawCore, rawLevels, rawDescriptions] = await Promise.all([
                readGgaEntries(
                    "OptionsListAccount",
                    ALL_FIELDS.map((field) => String(field.index))
                ),
                gga("Menagerie[0]"),
                gga("Menagerie[5]"),
                readCList("Spelunky[27]"),
            ]);
            const core = toIndexedArray(rawCore);
            const levels = toIndexedArray(rawLevels);
            const descriptions = toIndexedArray(rawDescriptions);
            for (const field of ALL_FIELDS) {
                fieldStates.get(field.index).val = results[String(field.index)] ?? 0;
            }
            scurgeReady.val = core.length >= 9 && levels.length >= 9;
            if (!scurgeReady.val) {
                reconcileScurge("uninitialized", () => []);
                return;
            }
            for (const field of SCURGE_FIELDS) {
                getOrCreateState(scurgeStates, field.path).val = Number(
                    field.index === undefined ? core[field.coreIndex] : levels[field.index]
                );
            }
            reconcileScurge(JSON.stringify(descriptions.slice(9, 18)), () =>
                SCURGE_FIELDS.map((field) =>
                    EditableNumberRow({
                        valueState: getOrCreateState(scurgeStates, field.path),
                        normalize: (raw) => {
                            const value = parseNumber(raw);
                            return Number.isFinite(value) && value >= 0 && (field.float || Number.isSafeInteger(value))
                                ? value
                                : null;
                        },
                        write: (next) => writeVerified(field.path, next),
                        renderInfo: () =>
                            // An upgrade's bonus first, its name under it; "$" is a number's place here too.
                            RowTitles({
                                bonus:
                                    field.index === undefined
                                        ? ""
                                        : bonusText(
                                              String(descriptions[9 + field.index] ?? "")
                                                  .replace(/\$x/g, "}x")
                                                  .replace(/\$/g, "{")
                                          ),
                                name: field.name,
                            }),
                        adjustInput: (raw, delta, current) => Math.max(0, (parseNumber(raw) ?? current) + delta),
                        controlsClass: "account-row__controls--xl",
                        inputMode: field.float ? "float" : "int",
                        inputProps: { "aria-label": field.name },
                        // A line of the list's Set all, saved where it lives.
                        // A whole-number field takes only whole numbers from Set all too.
                        setAll: {
                            min: 0,
                            path: field.path,
                            refuse: (value) =>
                                field.float || Number.isSafeInteger(value) ? null : "whole numbers only",
                        },
                    })
                )
            );
        });

    const onWrite = async (index, value) => {
        await writeVerified(`OptionsListAccount[${index}]`, value);
        return true;
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Clam Work",
        description: "Pearls, Clamworks upgrades, and Scurge's EXP, level and upgrades.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading Clam Work",
        errorTitle: "Couldn't read Clam Work",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                setAll: { word: (n) => (n === 1 ? "line" : "lines"), placeholder: "Value" },
                body: [
                    AccountSection({
                        title: "Pearls",
                        body: ClamRow({ field: PEARL_FIELD, fieldState: fieldStates.get(PEARL_FIELD.index), onWrite }),
                    }),
                    AccountSection({
                        title: "Clamworks",
                        body: CLAMWORKS_FIELDS.map((field) =>
                            ClamRow({ field, fieldState: fieldStates.get(field.index), onWrite })
                        ),
                    }),
                    AccountSection({
                        title: "Scurge",
                        note: () => (scurgeReady.val ? "A Clamworks promotion resets these" : "Not started yet"),
                        body: scurgeList,
                    }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w7.clamwork",
    world: 7,
    system: "Clam Work",
    description: "Pearls, Clamworks upgrades, and Scurge EXP, level and upgrades.",
    keywords: ["Clam", "Clamworks", "Pearls", "Scurge"],
    component: ClamTab,
});
