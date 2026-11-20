import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { toNum } from "../../../components/views/account/accountShared.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";

const GROTTO_FIELDS = [
    { key: "colonies", index: 26, name: "Colonies Cleared" },
    { key: "current-gloomies", index: 27, name: "Current Gloomies Killed" },
    { key: "total-gloomies", index: 28, name: "Total Gloomies Killed" },
];

const GrottoTab = () =>
    SimpleAccountListPage({
        title: "Grotto",
        description: "Edit Grotto clears and Gloomies from Holes[11].",
        label: "Hole Grotto",
        loadEntries: async () => {
            const holes = await gga("Holes");
            const stats = toIndexedArray(toIndexedArray(holes)[11]);
            return GROTTO_FIELDS.map((field) => ({
                key: `grotto-${field.key}`,
                index: field.index,
                name: field.name,
                path: `Holes[11][${field.index}]`,
                value: toNum(stats[field.index], 0),
            }));
        },
    });

export default definePage({
    id: "w5.hole.grotto",
    world: 5,
    system: "Hole",
    tab: "Grotto",
    description: "Grotto clears and Gloomies.",
    keywords: ["Gloomies"],
    component: GrottoTab,
});
