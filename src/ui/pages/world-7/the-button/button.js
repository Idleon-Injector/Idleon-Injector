import van from "../../../vendor/van-1.6.0.js";
import { gga, readComputed, readGgaEntries } from "../../../services/api.js";
import { definePage } from "../../../menu/menuModel.js";
import { ClickerRow } from "../../../components/views/account/ClickerRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { getOrCreateState, writeVerified } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const BUTTON_FIELDS = [
    { index: 594, label: "Presses done", formatted: true },
    { index: 595, label: "Insta skips", formatted: true },
];

const ButtonRow = ({ field, fieldState, onWrite }) =>
    ClickerRow({
        field,
        fieldState,
        onWrite,
        controlsClass: "account-row__controls--xl",
    });

const ButtonPage = () => {
    const { loading, error, run } = useAccountLoad({ label: "Button" });
    const fieldStates = new Map();

    const load = async () =>
        run(async () => {
            const results = await readGgaEntries(
                "OptionsListAccount",
                BUTTON_FIELDS.map((field) => String(field.index))
            );
            for (const field of BUTTON_FIELDS) {
                getOrCreateState(fieldStates, field.index).val = results[String(field.index)] ?? 0;
            }
        });

    const onWrite = async (index, value) => {
        await writeVerified(`OptionsListAccount[${index}]`, value, { write: gga });
        await readComputed("minehead", "Button_Bonuses", [0, -1]);
        return true;
    };

    // Two unrelated numbers, not a list, so no Set all (checks.mjs' NOT_LISTS).
    const body = div(
        { class: "account-list account-list--tabbed" },
        ListPanel({
            body: BUTTON_FIELDS.map((field) =>
                ButtonRow({ field, fieldState: getOrCreateState(fieldStates, field.index), onWrite })
            ),
        })
    );

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "The Button",
        description: "Presses done and insta skips of World 7's Button.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the Button",
        errorTitle: "Couldn't read the Button",
        initialWrapperClass: "account-list",
        body,
    });
};

export default definePage({
    id: "w7.button",
    world: 7,
    system: "The Button",
    description: "Presses done and remaining charges of World 7's Button.",
    keywords: ["Button", "Presses", "Charges"],
    component: ButtonPage,
});
