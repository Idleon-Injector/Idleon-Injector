/**
 * W4 - Breeding › Territory
 *
 * Data sources:
 *   gga.OptionsListAccount[85]   - how many territories are unlocked, out of the 26 the game has
 *   gga.OptionsListAccount[100]  - spice claims used today (the daily reset takes 25 off per Trasher pet, so it can be
 *                                  below 0)
 *
 * The territory screen's two values in the shared panel.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readGgaEntries } from "../../../services/api.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { toInt } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const TERRITORY_UNLOCK_PATH = "OptionsListAccount[85]";
const SPICE_CLAIMS_PATH = "OptionsListAccount[100]";
// Grasslands to Murky Trenches.
const TERRITORY_COUNT = 26;

const TerritoryTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Breeding territory" });
    const unlockedState = van.state(0);
    const spiceClaimsState = van.state(0);

    const load = async () =>
        run(async () => {
            const options = await readGgaEntries("OptionsListAccount", ["85", "100"]);
            // Empty means none claimed yet; anything else that isn't a number is refused, not shown as 0.
            const spiceClaims = options["100"] ?? 0;
            if (!Number.isFinite(Number(spiceClaims)) || String(spiceClaims).trim() === "") {
                throw new Error("Couldn't read the spice claims. Refresh to try again.");
            }
            unlockedState.val = toInt(options["85"], { min: 0 });
            spiceClaimsState.val = toInt(spiceClaims);
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Territory",
        description: "Territories unlocked and today's spice claims. The game may need a cloud save to show a change.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the territories",
        errorTitle: "Couldn't read the territories",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    ClampedLevelRow({
                        valueState: unlockedState,
                        writePath: TERRITORY_UNLOCK_PATH,
                        max: TERRITORY_COUNT,
                        integerMode: "trunc",
                        name: "Territories unlocked",
                    }),
                    SimpleNumberRow({
                        entry: {
                            name: "Spice claims used today",
                            path: SPICE_CLAIMS_PATH,
                            formatted: false,
                            showIndex: false,
                            // No max: the game works out the daily limit on the breeding screen, and a value past it
                            // only stops claims.
                            min: -Infinity,
                        },
                        valueState: spiceClaimsState,
                    }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w4.breeding.territory",
    world: 4,
    system: "Breeding",
    tab: "Territory",
    description: "Territories unlocked and the spice claim counter.",
    keywords: ["Territories", "Spice claims"],
    component: TerritoryTab,
});
