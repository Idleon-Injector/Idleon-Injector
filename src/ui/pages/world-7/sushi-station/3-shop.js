import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    realMax,
    toInt,
} from "../../../components/views/account/accountShared.js";
import { doublerRow, useUpgradeDoublers } from "../../../components/views/account/UpgradeDoublers.js";

const { div } = van.tags;

const SUSHI_SHOP_PATH = "Sushi[2]";

const ShopUpgradeRow = ({ entry, levelState, doublers }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `${SUSHI_SHOP_PATH}[${entry.index}]`,
        max: entry.maxLevel,
        integerMode: "round",
        renderInfo: () => RowTitles({ bonus: entry.bonus, name: entry.name }),
        ...doublerRow(entry, doublers),
    });

const getOrderKey = (rawOrderEntry) => {
    const values = toIndexedArray(rawOrderEntry ?? []);
    return String(values.length > 0 ? values[0] : (rawOrderEntry ?? "")).trim();
};

const buildShopEntries = (rawDefinitions, rawOrder) => {
    const orderKeys = toIndexedArray(rawOrder ?? []).map(getOrderKey);
    const orderByName = new Map(orderKeys.map((key, orderIndex) => [key, orderIndex]));
    const orderByIndex = new Map(
        orderKeys
            .map((key, orderIndex) => [Number(key), orderIndex])
            .filter(([index]) => Number.isInteger(index) && index >= 0)
    );
    const resolveSortOrder = (entry) =>
        orderByName.get(entry.rawName) ?? orderByIndex.get(entry.index) ?? Number.MAX_SAFE_INTEGER + entry.index;

    return toIndexedArray(rawDefinitions ?? [])
        .map((rawDefinition, index) => {
            const definition = toIndexedArray(rawDefinition ?? []);
            const rawName = String(definition[0] ?? "").trim();
            if (!rawName) return null;

            return {
                index,
                rawName,
                name: cleanName(rawName, `Sushi Upgrade ${index}`),
                bonus: bonusText(definition[5]),
                maxLevel: realMax(definition[1]),
            };
        })
        .filter(Boolean)
        .sort((a, b) => resolveSortOrder(a) - resolveSortOrder(b));
};

function SushiShopTab() {
    const { loading, error, run } = useAccountLoad({ label: "Sushi Shop" });
    const doublers = useUpgradeDoublers(
        { path: "Spelunk[52]", ownedMethod: "SushiDoublersOwned", eligiblePath: "Research[60]" },
        loading
    );
    const upgradeEntries = van.state([]);
    const levelStates = new Map();
    const shopListNode = div();
    const reconcileShopRows = createStaticRowReconciler(shopListNode);

    const reconcileRows = () => {
        reconcileShopRows(upgradeEntries.val.map((entry) => entry.rawName).join("|"), () =>
            upgradeEntries.val.map((entry) =>
                ShopUpgradeRow({
                    entry,
                    doublers,
                    levelState: getOrCreateState(levelStates, entry.index),
                })
            )
        );
    };

    const load = async () =>
        run(async () => {
            const [rawDefinitions, rawOrder] = await Promise.all([
                readCList("SushiUPG"),
                readCList("Research[32]"),
                doublers.load(),
            ]);
            upgradeEntries.val = buildShopEntries(rawDefinitions, rawOrder);
            reconcileRows();

            const levels = toIndexedArray((await gga(SUSHI_SHOP_PATH)) ?? []);
            for (const entry of upgradeEntries.val) {
                getOrCreateState(levelStates, entry.index).val = toInt(levels[entry.index], { min: 0 });
            }
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Shop",
        description: "Sushi shop upgrade levels, and which upgrades are doubled.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the sushi shop",
        errorTitle: "Couldn't read the sushi shop",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                empty: () => (upgradeEntries.val.length ? null : "No upgrades found"),
                setAll: { word: (n) => (n === 1 ? "upgrade" : "upgrades") },
                body: AccountSection({
                    title: "Upgrades",
                    note: () => `${doublers.selected.val.length} of ${doublers.capacity.val} doubled`,
                    body: shopListNode,
                }),
            })
        ),
    });
}

export default definePage({
    id: "w7.sushistation.shop",
    world: 7,
    system: "Sushi Station",
    tab: "Shop",
    description: "Sushi shop upgrade levels, and which upgrades are doubled.",
    keywords: ["Sushi", "Sushi Upgrades"],
    component: SushiShopTab,
});
