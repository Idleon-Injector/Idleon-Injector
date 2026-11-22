/**
 * W4 - Breeding › Territory
 *
 * Data source:
 *   gga.OptionsListAccount[85] - how many territories are unlocked, out of the 26 the game has
 *
 * One value in the shared panel; its cap is the game's territory count.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readGgaEntries } from "../../../services/api.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { toInt } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const TERRITORY_UNLOCK_PATH = "OptionsListAccount[85]";
// Grasslands to Murky Trenches.
const TERRITORY_COUNT = 26;

const TerritoryTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Breeding territory" });
    const unlockedState = van.state(0);

    const load = async () =>
        run(async () => {
            const options = await readGgaEntries("OptionsListAccount", ["85"]);
            unlockedState.val = toInt(options["85"], { min: 0 });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Territory",
        description: "Territories unlocked. The game may need a cloud save to show a change.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the territories",
        errorTitle: "Couldn't read the territories",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: ClampedLevelRow({
                    valueState: unlockedState,
                    writePath: TERRITORY_UNLOCK_PATH,
                    max: TERRITORY_COUNT,
                    integerMode: "trunc",
                    name: "Territories unlocked",
                    maxAction: true,
                }),
            })
        ),
    });
};

export default definePage({
    id: "w4.breeding.territory",
    world: 4,
    system: "Breeding",
    tab: "Territory",
    description: "Territories unlocked.",
    keywords: ["Territories"],
    component: TerritoryTab,
});
