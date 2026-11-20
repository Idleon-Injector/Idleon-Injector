import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { toNum } from "../../../components/views/account/accountShared.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";

const TEMPLE_FIELDS = [
    { index: 55, name: "Centurions Killed" },
    { index: 56, name: "Current Torches" },
    { index: 57, name: "Illuminate Upgrades Purchased" },
    { index: 58, name: "Search Upgrade Level" },
    { index: 59, name: "Amplify Upgrades Purchased" },
    { index: 63, name: "Total Golems Killed" },
];

const TempleTab = () =>
    SimpleAccountListPage({
        title: "Temple",
        description: "Edit Temple counters from Holes[11].",
        label: "Hole Temple",
        sectionTitle: "The Temple",
        loadEntries: async () => {
            const holes = await gga("Holes");
            const stats = toIndexedArray(toIndexedArray(holes)[11]);
            return TEMPLE_FIELDS.map((field) => ({
                key: `temple-${field.index}`,
                index: field.index,
                name: field.name,
                path: `Holes[11][${field.index}]`,
                value: toNum(stats[field.index], 0),
            }));
        },
    });

export default definePage({
    id: "w5.hole.temple",
    world: 5,
    system: "Hole",
    tab: "Temple",
    description: "Temple counters.",
    component: TempleTab,
});
