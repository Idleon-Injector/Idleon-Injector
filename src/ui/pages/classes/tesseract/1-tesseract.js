import { definePage } from "../../../menu/menuModel.js";
import { MasterclassUpgradeTab } from "../../../components/views/account/MasterclassUpgradeTab.js";

const TACHYON_FIELDS = [
    { key: "tachyon1", optionIndex: 388, name: "Tachyon 1" },
    { key: "tachyon2", optionIndex: 389, name: "Tachyon 2" },
    { key: "tachyon3", optionIndex: 390, name: "Tachyon 3" },
    { key: "tachyon4", optionIndex: 391, name: "Tachyon 4" },
    { key: "tachyon5", optionIndex: 392, name: "Tachyon 5" },
    { key: "tachyon6", optionIndex: 393, name: "Tachyon 6" },
    { key: "tachyonTotal", optionIndex: 394, name: "Total tachyon collected" },
];

const TesseractTab = () =>
    MasterclassUpgradeTab({
        title: "Tesseract",
        description: "Manage Arcane Cultist Tesseract upgrades and Tachyons.",
        levelsPath: "Arcane",
        definitionPaths: ["ArcaneUpg"],
        fallbackPrefix: "Tesseract Upgrade",
        currencyTitle: "Tachyons",
        currencyFields: TACHYON_FIELDS,
    });

export default definePage({
    id: "classes.tesseract",
    world: "classes",
    system: "Tesseract",
    tab: "Tesseract",
    description: "Arcane Cultist Tesseract upgrades and tachyons.",
    keywords: ["Arcane Cultist"],
    component: TesseractTab,
});
