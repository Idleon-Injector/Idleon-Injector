/**
 * W5 - Hole › Fountain
 *
 * Data sources:
 *   gga.Holes[9][30 + c]          - how many of coin c you have (Bronze ... Greane)
 *   gga.Holes[30][c]              - coin c's lucky coin level (-1 while locked)
 *   gga.Holes[11][80]             - the water the Fountain uses (0 Blue, 1 Yellow, 2 Green)
 *   gga.Holes[33][w]              - water w's fill bar
 *   gga.Holes[11][81], [84]       - marbles, and lanterns used (up to 12)
 *   gga.OptionsListAccount[601]   - rubber duckies
 *   gga.Holes[31][w][n]           - water w's upgrade n level; gga.Holes[32][w][n] the marbles in it
 *   cList.HoleFountUPG[w][n]      - [0] the upgrade's name, [7] its bonus in the game's words
 *
 * The Fountain's coins and water as the first two tabs, then each water's upgrades as a table: Level and Marbles.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const COINS = ["Bronze", "Silver", "Gold", "Dollar", "Credit", "Treasury", "Moolah", "Shilling", "Greane"];
const WATERS = ["Blue", "Yellow", "Green"];
const FIELDS = [
    { key: "level", label: "Level", group: 31 },
    { key: "marbles", label: "Marbles", group: 32 },
];

const FountainTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Fountain" });
    const states = new Map();
    const state = (key) => getOrCreateState(states, key);
    const upgradeNodes = WATERS.map(() => div());
    const reconcilers = upgradeNodes.map((node) => createStaticRowReconciler(node));

    const row = (key, entry) => SimpleNumberRow({ entry, valueState: state(key) });
    const coinRows = COINS.map((coin, c) => row(`coin-${c}`, { name: `${coin} coins`, path: `Holes[9][${30 + c}]` }));
    const luckyRows = COINS.map((coin, c) =>
        row(`lucky-${c}`, {
            name: `Lucky ${coin} coin`,
            path: `Holes[30][${c}]`,
            min: -1,
            formatted: false,
            badge: (level) => (Number(level) === -1 ? "Locked" : ""),
        })
    );
    const waterRows = [
        row("water", {
            name: "Water in use",
            path: "Holes[11][80]",
            max: WATERS.length - 1,
            formatted: false,
            badge: (water) => `${WATERS[Number(water)] ?? WATERS[0]} Water`,
        }),
        ...WATERS.map((water, w) =>
            row(`bar-${w}`, { name: `${water} Water fill bar`, path: `Holes[33][${w}]`, float: true })
        ),
        row("marbles", { name: "Marbles", path: "Holes[11][81]" }),
        row("lanterns", { name: "Lanterns used", path: "Holes[11][84]", max: 12, cap: 12, formatted: false }),
        row("duckies", { name: "Rubber duckies", path: "OptionsListAccount[601]", formatted: false }),
    ];

    const UpgradeRow = (w, n, upgrade) => {
        const at = (field) => `Holes[${field.group}][${w}][${n}]`;
        return ValueTableRow({
            name: upgrade.name,
            info: RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
            fields: FIELDS.map((field) => ({
                ...field,
                valueState: state(`${field.key}-${w}-${n}`),
                paths: [at(field)],
            })),
            read: async () => {
                const values = await Promise.all(FIELDS.map((field) => gga(at(field))));
                return Object.fromEntries(FIELDS.map((field, i) => [field.key, toInt(values[i], { min: 0 })]));
            },
        });
    };

    const load = async () =>
        run(async () => {
            const [rawHoles, rawUpgrades, duckies] = await Promise.all([
                gga("Holes"),
                readCList("HoleFountUPG"),
                gga("OptionsListAccount[601]"),
            ]);
            const holes = toIndexedArray(rawHoles ?? []).map((part) => toIndexedArray(part ?? []));
            const defs = toIndexedArray(rawUpgrades ?? []);
            COINS.forEach((_, c) => {
                state(`coin-${c}`).val = toNum(holes[9]?.[30 + c], 0);
                state(`lucky-${c}`).val = toNum(holes[30]?.[c], -1);
            });
            state("water").val = toInt(holes[11]?.[80], { min: 0 });
            WATERS.forEach((_, w) => (state(`bar-${w}`).val = toNum(holes[33]?.[w], 0)));
            state("marbles").val = toNum(holes[11]?.[81], 0);
            state("lanterns").val = toInt(holes[11]?.[84], { min: 0 });
            state("duckies").val = toNum(duckies, 0);
            WATERS.forEach((water, w) => {
                const upgrades = toIndexedArray(defs[w] ?? []).map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    const name = cleanName(def[0], `${water} Water upgrade ${n + 1}`);
                    return { n, name, bonus: bonusText(def[7]) };
                });
                reconcilers[w](upgrades.map((upgrade) => upgrade.name).join("|"), () =>
                    upgrades.map((upgrade) => UpgradeRow(w, upgrade.n, upgrade))
                );
                upgrades.forEach((upgrade) =>
                    FIELDS.forEach(
                        (field) =>
                            (state(`${field.key}-${w}-${upgrade.n}`).val = toInt(
                                toIndexedArray(holes[field.group]?.[w] ?? [])[upgrade.n],
                                { min: 0 }
                            ))
                    )
                );
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container hole-table-tab",
        title: "Fountain",
        description: "Coins, water and each water's upgrades.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the fountain",
        errorTitle: "Couldn't read the fountain",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Fountain",
                tabs: [
                    {
                        id: "coins",
                        label: "Coins",
                        content: [
                            AccountSection({ title: "Coins", body: coinRows }),
                            AccountSection({ title: "Lucky coins", body: luckyRows }),
                        ],
                    },
                    { id: "water", label: "Water", content: waterRows },
                    ...WATERS.map((water, w) => ({
                        id: water.toLowerCase(),
                        label: water,
                        content: [
                            ValueTableHead({ name: `${water} Water upgrade`, columns: FIELDS.map((f) => f.label) }),
                            upgradeNodes[w],
                        ],
                    })),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w5.hole.fountain",
    world: 5,
    system: "Hole",
    tab: "Fountain",
    description: "Fountain coins, lucky coins, water and water upgrades.",
    keywords: ["Lucky Coins", "Marbles", "Rubber Duckies", "Blue Water", "Yellow Water", "Green Water"],
    component: FountainTab,
});
