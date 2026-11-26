import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
} from "../../../components/views/account/accountShared.js";
import { toIndexedArray } from "../../../utils/index.js";

const { div } = van.tags;

const NAMETAG_COUNTS_PATH = "Spelunk[17]";
const ITEM_DEFS_PATH = "ItemDefinitionsGET.h";
// The game names nametag 6 "EquipmentNametag6b" (there is no EquipmentNametag6); its count is still Spelunk[17][6].
const NAMETAG_KEY_PATTERN = /^EquipmentNametag(\d+)b?$/;

const buildNametagCatalog = (rawItemDefs) =>
    Object.entries(rawItemDefs && typeof rawItemDefs === "object" ? rawItemDefs : {})
        .map(([itemId, raw]) => {
            const def = raw?.h ?? raw;
            const match = itemId.match(NAMETAG_KEY_PATTERN);
            if (!match) return null;

            return {
                itemId,
                nametagNumber: Number(match[1]),
                name: cleanName(
                    def?.displayName || def?.DisplayName || def?.name || def?.Name || def?.desc_line1 || itemId
                ),
                defId: def?.ID ?? null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.nametagNumber - b.nametagNumber);

const NametagRow = ({ row, amountState }) =>
    SimpleNumberRow({
        entry: {
            ...row,
            path: `${NAMETAG_COUNTS_PATH}[${row.nametagNumber}]`,
            formatted: false,
        },
        valueState: amountState,
    });

const NametagTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Nametags" });
    const amountStates = new Map();
    const catalogState = van.state([]);
    const listNode = div();
    const reconcileNametagRows = createStaticRowReconciler(listNode);
    let catalogCache = [];

    const reconcileRows = () => {
        reconcileNametagRows(catalogCache.map((row) => row.itemId).join("|"), () =>
            catalogCache.map((row) =>
                NametagRow({
                    row,
                    amountState: getOrCreateState(amountStates, row.nametagNumber),
                })
            )
        );
    };

    const load = async () =>
        run(async () => {
            catalogCache = buildNametagCatalog(await gga(ITEM_DEFS_PATH));
            catalogState.val = catalogCache;

            const counts = toIndexedArray((await gga(NAMETAG_COUNTS_PATH)) ?? []);
            for (const row of catalogCache) {
                getOrCreateState(amountStates, row.nametagNumber).val = toInt(counts[row.nametagNumber], { min: 0 });
            }

            reconcileRows();
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Nametag",
        description: "How many of each nametag you have delivered.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading nametags",
        errorTitle: "Couldn't read nametags",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                empty: () => (catalogState.val.length ? null : "No nametags found"),
                setAll: { word: (n) => (n === 1 ? "nametag" : "nametags"), placeholder: "Amount" },
            })
        ),
    });
};

export default definePage({
    id: "w7.gallery.nametag",
    world: 7,
    system: "Gallery",
    tab: "Nametag",
    description: "How many of each nametag you have delivered.",
    keywords: ["Nametags"],
    component: NametagTab,
});
