import { definePage } from "../../../menu/menuModel.js";
import { MasterclassUpgradeTab } from "../../../components/views/account/MasterclassUpgradeTab.js";

const LilOrbletShopTab = () =>
    MasterclassUpgradeTab({
        title: "LIL ORBLET SHOP",
        description: "Manage Royal Guard Lil Orblet Shop upgrades.",
        levelsPath: "RoyalG[23]",
        definitionPaths: ["OrbletMarket"],
        maxLevelIndex: 3,
        fallbackPrefix: "Orblet Shop Upgrade",
    });

export default definePage({
    id: "classes.royalarmory.orbletmarket",
    world: "classes",
    system: "Royal Armory",
    tab: "Orblet Market",
    description: "Lil Orblet Shop upgrades.",
    keywords: ["Lil Orblet Shop"],
    component: LilOrbletShopTab,
});
