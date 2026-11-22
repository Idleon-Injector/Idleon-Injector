/**
 * W2 - Liquid Tab (Alchemy Liquids)
 *
 * Liquid names are hardcoded - they couldn't be easily sourced from game data
 * at runtime and were taken from the IdleOn wiki / in-game descriptions:
 *   Liquid 1 (unlocked Alchemy Lv  1): Water Droplets
 *   Liquid 2 (unlocked Alchemy Lv 20): Liquid Nitrogen
 *   Liquid 3 (unlocked Alchemy Lv 35): Trench Seawater
 *   Liquid 4 (unlocked Alchemy Lv 80): Toxic Mercury
 *
 * One liquid per line, its values in columns (Amount, Cap upgrade, Rate upgrade).
 *
 * Data paths (all within CauldronInfo):
 *   [6][i]         -> current liquid amount   (i = 0..3)
 *   [8][4+i][2][1] -> cap upgrade level       (i = 0..3)
 *   [8][4+i][3][1] -> rate upgrade level      (i = 0..3)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

const LIQUIDS = [
    { id: "water-droplets", label: "Water Droplets", index: 0, upgradeIndex: 4 },
    { id: "liquid-nitrogen", label: "Liquid Nitrogen", index: 1, upgradeIndex: 5 },
    { id: "trench-seawater", label: "Trench Seawater", index: 2, upgradeIndex: 6 },
    { id: "toxic-mercury", label: "Toxic Mercury", index: 3, upgradeIndex: 7 },
];

// A liquid's three values as the game holds them.
const liquidValues = (raw, liquid) => {
    const upgrades = toIndexedArray(toIndexedArray(raw?.[8] ?? [])[liquid.upgradeIndex] ?? []);
    return {
        amount: Math.max(0, Math.round(Number(toIndexedArray(raw?.[6] ?? [])[liquid.index] ?? 0))),
        cap: Number(toIndexedArray(upgrades[2] ?? [])[1] ?? 0),
        rate: Number(toIndexedArray(upgrades[3] ?? [])[1] ?? 0),
    };
};

// One liquid per line: Amount, Cap upgrade and Rate upgrade in the list's columns. Both copies of an upgrade go in one
// request, so a dropped connection can't leave them split. The game still writes them one by one: if it refuses one,
// the other stays written (History lists it, and the row says why). ponytail: an all-or-nothing write needs the
// game's writePaths to put the first back.
const LiquidRow = ({ liquid, states }) =>
    ValueTableRow({
        name: liquid.label,
        info: span({ class: `account-row__name liquid-name liquid-name--${liquid.id}` }, liquid.label),
        fields: [
            { key: "amount", label: "Amount", valueState: states.amount, paths: [`CauldronInfo[6][${liquid.index}]`] },
            {
                key: "cap",
                label: "Cap upgrade",
                valueState: states.cap,
                paths: [
                    `CauldronInfo[8][${liquid.upgradeIndex}][2][1]`,
                    `OptionsListAccount[${371 + 2 * liquid.index}]`,
                ],
            },
            {
                key: "rate",
                label: "Rate upgrade",
                valueState: states.rate,
                paths: [
                    `CauldronInfo[8][${liquid.upgradeIndex}][3][1]`,
                    `OptionsListAccount[${372 + 2 * liquid.index}]`,
                ],
            },
        ],
        read: async () => liquidValues(await gga("CauldronInfo"), liquid),
    });

const LiquidTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Liquid" });

    const liquidStates = LIQUIDS.map(() => ({
        amount: van.state(0),
        cap: van.state(0),
        rate: van.state(0),
    }));

    const load = async () =>
        run(async () => {
            const raw = await gga("CauldronInfo");
            LIQUIDS.forEach((liquid, i) => {
                const values = liquidValues(raw, liquid);
                Object.keys(values).forEach((key) => (liquidStates[i][key].val = values[key]));
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Liquid",
        description: "Liquid amounts and each liquid cauldron's cap and rate upgrades.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading liquids",
        errorTitle: "Couldn't read liquids",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "liquid-table",
                body: [
                    ValueTableHead({ name: "Liquid", columns: ["Amount", "Cap upgrade", "Rate upgrade"] }),
                    ...LIQUIDS.map((liquid, i) => LiquidRow({ liquid, states: liquidStates[i] })),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w2.cauldrons.liquid",
    world: 2,
    system: "Cauldrons",
    tab: "Liquid",
    description: "Liquid amounts and the liquid cauldrons' cap and rate upgrades.",
    keywords: ["Alchemy", "Liquids"],
    component: LiquidTab,
});
