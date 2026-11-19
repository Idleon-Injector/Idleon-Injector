import { definePage } from "../../../menu/menuModel.js";
import { MasterclassUpgradeTab } from "../../../components/views/account/MasterclassUpgradeTab.js";

const BONE_FIELDS = [
    { key: "femur", optionIndex: 330, name: "FEMUR" },
    { key: "ribcage", optionIndex: 331, name: "RIBCAGE" },
    { key: "total", optionIndex: 329, name: "TOTAL BONES COLLECTED" },
    { key: "cranium", optionIndex: 332, name: "CRANIUM" },
    { key: "bovinae", optionIndex: 333, name: "BOVINAE" },
    {
        key: "afkBones",
        optionIndex: 367,
        name: "AFK BONE BONUS",
        type: "toggle",
        title: "Enable or disable Charred Bones for AFK Deathbringer.",
    },
];

const GrimoireTab = () =>
    MasterclassUpgradeTab({
        title: "GRIMOIRE",
        description: "Manage Deathbringer Grimoire upgrades and Bone Currency.",
        levelsPath: "Grimoire",
        definitionPaths: ["GrimoireUpg"],
        fallbackPrefix: "Grimoire Upgrade",
        currencyTitle: "BONE CURRENCY",
        currencyFields: BONE_FIELDS,
        deleteCachePaths: ["DNSM.h.GrimoireTotLV"],
    });

export default definePage({
    id: "classes.grimoire",
    world: "classes",
    system: "Grimoire",
    description: "Deathbringer Grimoire upgrades and bone currency.",
    keywords: ["Deathbringer"],
    component: GrimoireTab,
});
