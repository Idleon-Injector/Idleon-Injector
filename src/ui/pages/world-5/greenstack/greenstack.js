import { definePage } from "../../../menu/menuModel.js";
import { ItemRegistrationTab } from "../../../components/views/account/ItemRegistrationTab.js";

const GreenstackTab = () =>
    ItemRegistrationTab({
        label: "Greenstack",
        historyPath: "GreenStacks",
        description:
            "Edit Greenstack registration history without changing item quantities. The game refreshes bonuses during normal recalculation.",
    });

export default definePage({
    id: "w5.greenstack",
    world: 5,
    system: "Greenstack",
    description: "Which items have been registered as Greenstacks.",
    keywords: ["Item Registration", "Greenstacks"],
    component: GreenstackTab,
});
