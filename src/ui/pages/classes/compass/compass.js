import { definePage } from "../../../menu/menuModel.js";
import { MasterclassUpgradeTab } from "../../../components/views/account/MasterclassUpgradeTab.js";

const DUST_FIELDS = [
    { key: "stardust", optionIndex: 357, name: "Stardust" },
    { key: "moondust", optionIndex: 358, name: "Moondust" },
    { key: "solardust", optionIndex: 359, name: "Solardust" },
    { key: "cooldust", optionIndex: 360, name: "Cooldust" },
    { key: "novadust", optionIndex: 361, name: "Novadust" },
    { key: "totalDust", optionIndex: 362, name: "Total dust collected" },
];

const CompassTab = () =>
    MasterclassUpgradeTab({
        title: "Compass",
        description: "Manage Wind Walker Compass upgrades and Dust.",
        levelsPath: "Compass[0]",
        definitionPaths: ["CompassUpg"],
        fallbackPrefix: "Compass Upgrade",
        currencyTitle: "Dust",
        currencyFields: DUST_FIELDS,
    });

export default definePage({
    id: "classes.compass",
    world: "classes",
    system: "Compass",
    description: "Wind Walker Compass upgrades and dust.",
    keywords: ["Wind Walker"],
    component: CompassTab,
});
