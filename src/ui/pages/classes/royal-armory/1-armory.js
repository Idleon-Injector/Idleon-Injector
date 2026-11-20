import { definePage } from "../../../menu/menuModel.js";
import { MasterclassUpgradeTab } from "../../../components/views/account/MasterclassUpgradeTab.js";
import {
    UNIT_REBUILD_DISPLAY_SHELVES,
    resetRoyalGuardUnitsToVanilla,
} from "../../../components/views/account/royalGuardDomain.js";

const resourceFields = (resourceIds) =>
    resourceIds.map((resourceId) => ({
        key: `royalResource${resourceId}`,
        path: `RoyalG[1][${resourceId}]`,
        name: `RGres${resourceId}`,
        badge: `R${resourceId}`,
    }));

const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

const ROYAL_ARMORY_RESOURCE_TABS = [
    { id: "w1", label: "W1", fields: resourceFields(range(0, 9)) },
    { id: "w2", label: "W2", fields: resourceFields(range(10, 19)) },
    { id: "w3", label: "W3", fields: resourceFields(range(20, 29)) },
    { id: "w4", label: "W4", fields: resourceFields(range(30, 39)) },
];

const getDisplayShelf = (upgrade) => Number(upgrade.index) + 1;

const RoyalArmoryTab = () =>
    MasterclassUpgradeTab({
        title: "Royal Armory",
        description: "Manage Royal Guard Royal Armory upgrades.",
        levelsPath: "RoyalG[2]",
        definitionPaths: ["ArmoryUpg"],
        orderPath: "Research[43]",
        currencyTitle: "Royal resources",
        currencyTabs: ROYAL_ARMORY_RESOURCE_TABS,
        fallbackPrefix: "Royal Armory Upgrade",
        onUpgradeChanged: ({ upgrade }) =>
            UNIT_REBUILD_DISPLAY_SHELVES.has(getDisplayShelf(upgrade)) ? resetRoyalGuardUnitsToVanilla() : null,
        onBulkChanged: ({ upgrades }) => {
            return upgrades.some((upgrade) => UNIT_REBUILD_DISPLAY_SHELVES.has(getDisplayShelf(upgrade)))
                ? resetRoyalGuardUnitsToVanilla()
                : null;
        },
    });

export default definePage({
    id: "classes.royalarmory",
    world: "classes",
    system: "Royal Armory",
    tab: "Armory",
    description: "Royal Armory upgrades and royal resources.",
    keywords: ["Royal Guardian"],
    component: RoyalArmoryTab,
});
