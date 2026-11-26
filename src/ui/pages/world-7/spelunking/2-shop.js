import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    realMax,
    toInt,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const SHOP_LEVELS_PATH = "Spelunk[5]";

const ShopUpgradeRow = ({ entry }) =>
    ClampedLevelRow({
        valueState: entry.levelState,
        writePath: `${SHOP_LEVELS_PATH}[${entry.index}]`,
        max: entry.maxLevel,
        integerMode: "round",
        renderInfo: () => RowTitles({ bonus: entry.bonus, name: entry.name }),
        maxAction: entry.maxLevel === null ? null : true,
    });

const buildShopDefinitions = (rawDefinitions) =>
    toIndexedArray(rawDefinitions ?? [])
        .map((rawDefinition, index) => {
            const definition = toIndexedArray(rawDefinition ?? []);
            const rawName = String(definition[0] ?? "").trim();
            if (!rawName || rawName === "_") return null;

            return {
                index,
                rawName,
                name: cleanName(rawName, `Upgrade ${index + 1}`),
                bonus: bonusText(definition[12]),
                maxLevel: realMax(definition[3]),
            };
        })
        .filter(Boolean);

function SpelunkingShopTab() {
    const { loading, error, run } = useAccountLoad({ label: "Spelunking Shop" });
    const upgradeEntries = van.state([]);
    const shopListNode = div();
    const reconcileShopRows = createStaticRowReconciler(shopListNode);
    let definitionsCache = [];

    const reconcileRows = () => {
        reconcileShopRows(upgradeEntries.val.map((entry) => entry.rawName).join("|"), () =>
            upgradeEntries.val.map((entry) => ShopUpgradeRow({ entry }))
        );
    };

    const load = async () =>
        run(async () => {
            definitionsCache = buildShopDefinitions(await readCList("SpelunkUpg"));

            const rawLevels = toIndexedArray((await gga(SHOP_LEVELS_PATH)) ?? []);
            const existing = upgradeEntries.val;
            const sameShape =
                existing.length === definitionsCache.length &&
                existing.every(
                    (entry, i) =>
                        entry.index === definitionsCache[i].index && entry.rawName === definitionsCache[i].rawName
                );

            if (!sameShape) {
                upgradeEntries.val = definitionsCache.map((definition) => ({
                    ...definition,
                    levelState: van.state(toInt(rawLevels[definition.index], { min: 0 })),
                }));
                reconcileRows();
                return;
            }

            for (const entry of existing) {
                entry.levelState.val = toInt(rawLevels[entry.index], { min: 0 });
            }
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Shop",
        description: "Spelunking shop upgrade levels.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the spelunking shop",
        errorTitle: "Couldn't read the spelunking shop",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                setAll: { word: (n) => (n === 1 ? "upgrade" : "upgrades") },
                body: shopListNode,
                empty: () => (upgradeEntries.val.length ? null : "No upgrades found"),
            })
        ),
    });
}

export default definePage({
    id: "w7.spelunking.shop",
    world: 7,
    system: "Spelunking",
    tab: "Shop",
    description: "Spelunking shop upgrade levels.",
    keywords: ["Spelunk", "Spelunking Upgrades"],
    component: SpelunkingShopTab,
});
