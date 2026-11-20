import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { parseNumber } from "../../../utils/numberFormat.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const OmniJadeTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Omni Jade" });
    const saving = van.state(false);
    const dailyLevels = van.state(null);
    const states = new Map();
    const state = (path) => getOrCreateState(states, path);
    const disabled = () => loading.val || saving.val;
    const list = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(list);

    const load = async () =>
        run(async () => {
            const [rawToggles, rawLevels, rawDefinitions, dailyGain] = await Promise.all([
                gga("Menagerie[6]"),
                gga("Menagerie[7]"),
                readCList("NinjaUpg"),
                readComputed("menagerie", "OmniJadeDailyLVs", [0, 0]),
            ]);
            const toggles = toIndexedArray(rawToggles);
            const levels = toIndexedArray(rawLevels);
            const definitions = toIndexedArray(rawDefinitions).slice(0, 17);
            if (toggles.length < 17 || levels.length < 17 || definitions.length < 17) {
                throw new Error("Omni Jade data is not initialized.");
            }
            dailyLevels.val = dailyGain;
            for (let i = 0; i < 17; i++) {
                state(`Menagerie[6][${i}]`).val = Number(toggles[i]);
                state(`Menagerie[7][${i}]`).val = Number(levels[i]);
            }
            reconcileRows(JSON.stringify(definitions), () =>
                definitions.map((definition, i) => {
                    const rawName = toIndexedArray(definition)[4];
                    const name = /^Name\d*$/i.test(String(rawName))
                        ? `Node ${i + 1}`
                        : cleanName(rawName, `Node ${i + 1}`);
                    const path = `Menagerie[7][${i}]`;
                    return div(
                        { class: "account-item-stack" },
                        toggleRow(name, `Menagerie[6][${i}]`, `Node #${i}`),
                        EditableNumberRow({
                            valueState: state(path),
                            normalize: (raw) => {
                                const value = parseNumber(raw);
                                return Number.isSafeInteger(value) && value >= 0 ? value : null;
                            },
                            write: (next) => save(() => writeVerified(path, next)),
                            renderInfo: () => span({ class: "account-row__name" }, `${name} bonus levels`),
                            adjustInput: (raw, delta, current) => Math.max(0, (parseNumber(raw) ?? current) + delta),
                            disabled,
                            rowClass: "account-row--wide-controls",
                            controlsClass: "account-row__controls--xl",
                            inputProps: { "aria-label": `${name} bonus levels` },
                        })
                    );
                })
            );
        });

    const save = async (task) => {
        if (disabled()) throw new Error("Another Omni Jade operation is in progress.");
        saving.val = true;
        try {
            return await task();
        } finally {
            await load();
            saving.val = false;
        }
    };

    // Saves on flip, then reads the game again; a failed save says why on the switch.
    const toggleRow = (name, path, note) => {
        const { status, run: write } = useWriteStatus();
        return AccountRow({
            status,
            info: div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, name),
                span({ class: "account-row__sub-label" }, note)
            ),
            controls: StateSwitch({
                checked: () => state(path).val >= 1,
                words: ["On", "Off"],
                name,
                disabled,
                onFlip: (on) => write(() => save(() => writeVerified(path, on ? 1 : 0))),
            }),
        });
    };

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "OMNI JADE",
            note: "Disabling a node preserves its earned bonus levels.",
            body: list,
        })
    );
    load();
    return PersistentAccountListPage({
        title: "OMNI JADE",
        description: () =>
            `Daily bonus levels per selected Sneaking upgrade: ${dailyLevels.val === null ? "…" : `+${dailyLevels.val}`}. Purchase costs stay the same.`,
        actions: RefreshButton({ onRefresh: load, disabled }),
        state: { loading, error },
        loadingText: "READING OMNI JADE",
        errorTitle: "OMNI JADE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w6.sneaking.omnijade",
    world: 6,
    system: "Sneaking",
    tab: "Omni Jade",
    description: "Daily Omni Jade bonus levels for the Sneaking upgrades you pick.",
    component: OmniJadeTab,
});
