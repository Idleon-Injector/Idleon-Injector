import { definePage } from "../../../menu/menuModel.js";
import { ItemRegistrationTab } from "../../../components/views/account/ItemRegistrationTab.js";

const SlabTab = () =>
    ItemRegistrationTab({
        label: "Slab",
        historyPath: "Cards[1]",
        description:
            "Edit Slab registration history. Owned items may register again during W5 town sync. The game refreshes bonuses during normal recalculation.",
    });

export default definePage({
    id: "w5.slab",
    world: 5,
    system: "Slab",
    description: "Which items the Slab has registered.",
    keywords: ["Item Registration", "Registered Items"],
    component: SlabTab,
});
