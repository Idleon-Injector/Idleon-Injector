import { definePage } from "../../../menu/menuModel.js";
import { ItemRegistrationTab } from "../../../components/views/account/ItemRegistrationTab.js";

const SlabTab = () =>
    ItemRegistrationTab({
        label: "Slab",
        historyPath: "Cards[1]",
        description: "Which items the Slab has registered. An item you own may register again in town.",
    });

export default definePage({
    id: "w5.slab",
    world: 5,
    system: "Slab",
    description: "Which items the Slab has registered.",
    keywords: ["Item Registration", "Registered Items"],
    component: SlabTab,
});
