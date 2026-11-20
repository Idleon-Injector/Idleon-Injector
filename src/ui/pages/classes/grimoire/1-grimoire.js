import { definePage } from "../../../menu/menuModel.js";
import { MasterclassUpgradeTab } from "../../../components/views/account/MasterclassUpgradeTab.js";

const BONE_FIELDS = [
    { key: "femur", optionIndex: 330, name: "Femur" },
    { key: "ribcage", optionIndex: 331, name: "Ribcage" },
    { key: "total", optionIndex: 329, name: "Total bones collected" },
    { key: "cranium", optionIndex: 332, name: "Cranium" },
    { key: "bovinae", optionIndex: 333, name: "Bovinae" },
    {
        key: "afkBones",
        optionIndex: 367,
        name: "AFK bone bonus",
        type: "toggle",
        title: "Enable or disable Charred Bones for AFK Deathbringer.",
    },
];

const GrimoireTab = () =>
    MasterclassUpgradeTab({
        title: "Grimoire",
        description: "Manage Deathbringer Grimoire upgrades and Bone Currency.",
        levelsPath: "Grimoire",
        definitionPaths: ["GrimoireUpg"],
        fallbackPrefix: "Grimoire Upgrade",
        currencyTitle: "Bone currency",
        currencyFields: BONE_FIELDS,
        deleteCachePaths: ["DNSM.h.GrimoireTotLV"],
    });

export default definePage({
    id: "classes.grimoire",
    world: "classes",
    system: "Grimoire",
    tab: "Grimoire",
    description: "Deathbringer Grimoire upgrades and bone currency.",
    keywords: ["Deathbringer"],
    component: GrimoireTab,
});
