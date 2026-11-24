/**
 * W2 - Poppy Tab
 *
 * Reads/writes OptionsListAccount indices 267-304 for Poppy and the Tar Pit, in the game's order. Like the Owl: no
 * value is set apart or highlighted, and nothing tells the player which values to keep. The game's two places are
 * tabs: Poppy (her fish, upgrades, counters and Spiral upgrades) and the Tar Pit.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readGgaEntries } from "../../../services/api.js";
import { writeVerified } from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ClickerRow } from "../../../components/views/account/ClickerRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const POPPY_FIELDS = [
    { index: 267, label: "Bluefin Fish", live: true, formatted: true },
    { index: 268, label: "Tasty Fishbait" },
    { index: 269, label: "Quick Reeling" },
    { index: 270, label: "Shiny Lure" },
    { index: 271, label: "Poppy Permanent Bonus" },
    { index: 272, label: "Fishy Discount" },
    { index: 273, label: "Juicy Worm" },
    { index: 274, label: "Fisheroo Reset" },
    { index: 275, label: "Fishing Buddy" },
    { index: 276, label: "Lightning Quickness" },
    { index: 277, label: "Fisheroo Investing" },
    { index: 278, label: "Multihook Fishing" },
    { index: 279, label: "Greatest Catch" },
    { index: 280, label: "Lifetime Bluefin Caught", live: true, formatted: true },
    // The game draws the shiny fish and names none: the colours are Lumi's, read off Poppy's shiny fish row in the game
    // (#159), in slot order. Each keeps its counter's number under its name, so "Shiny Fish Counter 3" still finds it.
    { index: 281, label: "Yellow Shiny Fish", description: "Shiny Fish Counter 1", formatted: true },
    { index: 282, label: "Red Shiny Fish", description: "Shiny Fish Counter 2", formatted: true },
    { index: 283, label: "Green Shiny Fish", description: "Shiny Fish Counter 3", formatted: true },
    { index: 284, label: "Purple Shiny Fish", description: "Shiny Fish Counter 4", formatted: true },
    { index: 285, label: "Silver Shiny Fish", description: "Shiny Fish Counter 5", formatted: true },
    { index: 286, label: "Blue Shiny Fish", description: "Shiny Fish Counter 6", formatted: true },
    { index: 289, label: "Shiny Progress Bar", float: true },
    { index: 290, label: "Reset Points", formatted: true },
    { index: 291, label: "Spiral Upgrade 1" },
    { index: 292, label: "Spiral Upgrade 2" },
    { index: 293, label: "Spiral Upgrade 3" },
    { index: 294, label: "Spiral Upgrade 4" },
    { index: 295, label: "Spiral Upgrade 5" },
];

const TAR_PIT_FIELDS = [
    { index: 296, label: "Tartar Fish", live: true, formatted: true },
    { index: 297, label: "Super Yummy Bait" },
    { index: 298, label: "Bonus Catching" },
    { index: 299, label: "Bluefin Frenzy" },
    { index: 300, label: "Fishy Reductions" },
    { index: 301, label: "Super Tarbait" },
    { index: 302, label: "Tarrific Resets" },
    { index: 303, label: "Mongo Multipliers" },
    { index: 304, label: "King Worm" },
];

const ALL_FIELDS = [...POPPY_FIELDS, ...TAR_PIT_FIELDS];

const PoppyRow = ({ field, fieldState, onWrite }) =>
    ClickerRow({
        field,
        fieldState,
        onWrite,
        controlsClass: "account-row__controls--xl",
    });

const PoppyTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Poppy" });

    const fieldStates = new Map(ALL_FIELDS.map((f) => [f.index, van.state(undefined)]));
    const load = async () =>
        run(async () => {
            const keys = ALL_FIELDS.map((f) => String(f.index));
            const results = await readGgaEntries("OptionsListAccount", keys);
            for (const f of ALL_FIELDS) {
                fieldStates.get(f.index).val = results[String(f.index)] ?? 0;
            }
        });

    const onWrite = async (index, value) => {
        await writeVerified(`OptionsListAccount[${index}]`, value);
        return true;
    };

    const rows = (fields) =>
        div(
            { class: "account-page-pane" },
            ...fields.map((f) => PoppyRow({ field: f, fieldState: fieldStates.get(f.index), onWrite }))
        );

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Poppy",
        automation: { page: "automation.clickers", tab: "poppy" },
        description: "Poppy the kangaroo's fish, upgrades and Tar Pit.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading Poppy",
        errorTitle: "Couldn't read Poppy",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Kangaroo",
                setAll: { word: (n) => (n === 1 ? "line" : "lines"), placeholder: "Value" },
                tabs: [
                    { id: "poppy", label: "Poppy", content: rows(POPPY_FIELDS) },
                    { id: "tar-pit", label: "Tar Pit", content: rows(TAR_PIT_FIELDS) },
                ],
            })
        ),
    });
};

export default definePage({
    id: "account.poppy",
    world: "account",
    system: "Clickers",
    tab: "Poppy",
    description: "Poppy the kangaroo's fishing upgrades, Tar Pit and Spiral Upgrades.",
    keywords: ["Kangaroo", "Poppy", "Clicker", "Tar Pit", "Spiral", "Bluefin", "Megafish"],
    component: PoppyTab,
});
