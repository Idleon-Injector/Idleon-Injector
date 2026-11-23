/**
 * W1 - Orion Tab
 *
 * Reads/writes OptionsListAccount indices 253-264. One list in the game's order (its Owlz rows 0-8 are levels 254-262):
 * the feathers first, then every upgrade, then the run's counters. No upgrade is set apart or highlighted.
 *
 * Index map:
 *   253 - Feathers (current count)
 *   254 - Feather Generation (upgrade level)
 *   255 - Bonuses of Orion
 *   256 - Feather Multiplier
 *   257 - Feather Cheapener
 *   258 - Feather Restart
 *   259 - Super Feather Production
 *   260 - Shiny Feathers
 *   261 - Super Feather Cheapener
 *   262 - The Great Mega Reset
 *   263 - Feathers Made This Run (the next upgrade unlocks at its target)
 *   264 - Shiny Feathers (count)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readGgaEntries } from "../../../services/api.js";
import { writeVerified } from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ClickerRow } from "../../../components/views/account/ClickerRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const ALL_FIELDS = [
    { index: 253, label: "Feathers", live: true, formatted: true },
    { index: 254, label: "Feather Generation" },
    { index: 255, label: "Bonuses of Orion" },
    { index: 256, label: "Feather Multiplier" },
    { index: 257, label: "Feather Cheapener" },
    { index: 258, label: "Feather Restart" },
    { index: 259, label: "Super Feather Production" },
    { index: 260, label: "Shiny Feathers" },
    { index: 261, label: "Super Feather Cheapener" },
    { index: 262, label: "The Great Mega Reset" },
    { index: 263, label: "Feathers Made This Run", live: true, formatted: true },
    { index: 264, label: "Shiny Feathers (count)" },
];

const OrionRow = ({ field, fieldState, onWrite }) =>
    ClickerRow({
        field,
        fieldState,
        onWrite,
        controlsClass: "account-row__controls--xl",
    });

const OrionTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Orion" });

    const fieldStates = new Map(ALL_FIELDS.map((field) => [field.index, van.state(undefined)]));

    const load = async () =>
        run(async () => {
            const keys = ALL_FIELDS.map((field) => String(field.index));
            const results = await readGgaEntries("OptionsListAccount", keys);
            for (const field of ALL_FIELDS) {
                fieldStates.get(field.index).val = results[String(field.index)] ?? 0;
            }
        });

    const onWrite = async (index, value) => {
        await writeVerified(`OptionsListAccount[${index}]`, value);
        return true;
    };

    const rowList = div(
        { class: "account-list account-list--tabbed" },
        ListPanel({
            setAll: { word: (n) => (n === 1 ? "line" : "lines"), placeholder: "Value" },
            body: ALL_FIELDS.map((field) => OrionRow({ field, fieldState: fieldStates.get(field.index), onWrite })),
        })
    );

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Orion",
        automation: { page: "automation.clickers", tab: "orion" },
        description: "Orion the owl's feathers and upgrades.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading Orion",
        errorTitle: "Couldn't read Orion",
        initialWrapperClass: "account-list",
        body: rowList,
    });
};

export default definePage({
    id: "account.orion",
    world: "account",
    system: "Clickers",
    tab: "Orion",
    description: "Orion the owl's feathers and upgrades.",
    keywords: ["Owl", "Orion", "Great Horned Owl", "Feathers", "Clicker"],
    component: OrionTab,
});
