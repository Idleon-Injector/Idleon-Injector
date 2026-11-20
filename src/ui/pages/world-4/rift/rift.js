import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { toInt } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const RIFTS_UNLOCKED_PATH = "Rift[0]";

const RiftTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Rift" });
    const riftsUnlockedState = van.state(0);

    const load = async () =>
        run(async () => {
            riftsUnlockedState.val = toInt(await gga(RIFTS_UNLOCKED_PATH), { min: 0 });
        });

    load();

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "RIFTS",
            note: "Rift[0]",
            body: div(
                { class: "account-item-stack" },
                SimpleNumberRow({
                    entry: {
                        index: 0,
                        name: "Rifts Unlocked",
                        path: RIFTS_UNLOCKED_PATH,
                        formatted: false,
                    },
                    valueState: riftsUnlockedState,
                })
            ),
        })
    );

    return PersistentAccountListPage({
        title: "RIFT",
        description: "Edit W4 Rift unlock progress.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "READING RIFT",
        errorTitle: "RIFT READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w4.rift",
    world: 4,
    system: "Rift",
    description: "Rift unlock progress.",
    component: RiftTab,
});
