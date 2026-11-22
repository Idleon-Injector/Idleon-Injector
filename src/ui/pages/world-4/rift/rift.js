/**
 * W4 - Rift
 *
 * Data source:
 *   gga.Rift[0] - the rift levels the account has completed (the Tome's "Rift Levels Completed")
 *
 * One value in the shared panel, like every page.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { toInt } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const RIFT_PATH = "Rift[0]";

const RiftTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Rift" });
    const levelState = van.state(0);

    const load = async () =>
        run(async () => {
            levelState.val = toInt(await gga(RIFT_PATH), { min: 0 });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Rift",
        description: "How far the account is in the Rift.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the rift",
        errorTitle: "Couldn't read the rift",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: SimpleNumberRow({
                    entry: { name: "Rift levels completed", path: RIFT_PATH, formatted: false, showIndex: false },
                    valueState: levelState,
                }),
            })
        ),
    });
};

export default definePage({
    id: "w4.rift",
    world: 4,
    system: "Rift",
    description: "Rift levels completed.",
    keywords: ["Rift level"],
    component: RiftTab,
});
