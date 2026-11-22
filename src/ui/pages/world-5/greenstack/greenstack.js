import { definePage } from "../../../menu/menuModel.js";
import { ItemRegistrationTab } from "../../../components/views/account/ItemRegistrationTab.js";

const GreenstackTab = () =>
    ItemRegistrationTab({
        label: "Greenstack",
        historyPath: "GreenStacks",
        description: "Which items you have greenstacked. Your item amounts stay as they are.",
    });

export default definePage({
    id: "w5.greenstack",
    world: 5,
    system: "Greenstack",
    description: "Which items have been registered as Greenstacks.",
    keywords: ["Item Registration", "Greenstacks"],
    component: GreenstackTab,
});
