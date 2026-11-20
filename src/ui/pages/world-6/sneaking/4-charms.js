import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const CHARM_UNLOCK_PATH = "Ninja[107]";
const CHARM_COUNT = 23;

const CharmRow = ({ entry, unlockedState }) => {
    const { status, run } = useWriteStatus();

    const writeToggle = async (enabled) => {
        return run(async () => {
            const nextValue = enabled ? 1 : 0;
            await writeVerified(`${CHARM_UNLOCK_PATH}[${entry.index}]`, nextValue);
            unlockedState.val = nextValue;
        });
    };

    return AccountRow({
        info: [
            span({ class: "account-row__index" }, `#${entry.index}`),
            div({ class: "account-row__name-group" }, span({ class: "account-row__name" }, entry.name)),
        ],
        rowClass: () =>
            unlockedState.val ? "sneaking-toggle-row sneaking-toggle-row--enabled" : "sneaking-toggle-row",
        status,
        controls: StateSwitch({
            checked: () => Boolean(unlockedState.val),
            words: ["Unlocked", "Locked"],
            name: entry.name,
            title: "Charm unlock",
            status, // nothing else on the row reads out saving and saved
            onFlip: writeToggle,
        }),
    });
};

const buildCharmEntries = (rawUnlocks, rawCharmRecords) => {
    const unlocks = toIndexedArray(rawUnlocks ?? []);
    return rawCharmRecords.map((rawRecord, index) => {
        const record = toIndexedArray(rawRecord ?? []);
        return {
            index,
            rawName: String(record[2] ?? `Charm_${index}`).trim(),
            name: cleanName(record[2], `Charm ${index + 1}`),
            unlocked: Number(unlocks[index] ?? 0) ? 1 : 0,
        };
    });
};

const CharmsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Sneaking Charms" });
    const entries = van.state([]);
    const unlockedStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawUnlocks, rawCharmRecords] = await Promise.all([
                gga(CHARM_UNLOCK_PATH),
                Promise.all(
                    Array.from({ length: CHARM_COUNT }, (_, index) => gga(`CustomMaps.h.NjEQ.h.NjTrP${index}`))
                ),
            ]);

            entries.val = buildCharmEntries(rawUnlocks, rawCharmRecords);
            reconcileRows(entries.val.map((entry) => entry.rawName).join("|"), () =>
                entries.val.map((entry) =>
                    CharmRow({
                        entry,
                        unlockedState: getOrCreateState(unlockedStates, entry.index),
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(unlockedStates, entry.index).val = entry.unlocked;
            }
        });

    load();

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "Pristine Charms",
            note: () =>
                `${entries.val.filter((entry) => getOrCreateState(unlockedStates, entry.index).val).length} / ${
                    entries.val.length
                } unlocked`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: "Charms",
        description: "Toggle Pristine Charm unlocks from Ninja[107]. Names come from NjTrP0 through NjTrP22.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "Reading sneaking charms",
        errorTitle: "Sneaking charms read failed",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w6.sneaking.charms",
    world: 6,
    system: "Sneaking",
    tab: "Charms",
    description: "Which Pristine Charms are unlocked.",
    keywords: ["Pristine Charms"],
    component: CharmsTab,
});
