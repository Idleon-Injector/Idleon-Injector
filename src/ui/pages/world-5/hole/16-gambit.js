import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { toNum } from "../../../components/views/account/accountShared.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";

const GAMBIT_FIELDS = [
    { index: 65, name: "King's Gambit Time" },
    { index: 66, name: "Horsey's Gambit Time" },
    { index: 67, name: "Bishop's Gambit Time" },
    { index: 68, name: "Queen's Gambit Time" },
    { index: 69, name: "Castle's Gambit Time" },
    { index: 70, name: "Noob's Gambit Time" },
];

const GambitTab = () =>
    SimpleAccountListPage({
        title: "GAMBIT",
        description: "Edit Gambit times from Holes[11][65] through Holes[11][70].",
        label: "Hole Gambit",
        sectionTitle: "THE GAMBIT",
        loadEntries: async () => {
            const holes = await gga("Holes");
            const stats = toIndexedArray(toIndexedArray(holes)[11]);
            return GAMBIT_FIELDS.map((field) => ({
                key: `gambit-${field.index}`,
                index: field.index,
                name: field.name,
                path: `Holes[11][${field.index}]`,
                value: toNum(stats[field.index], 0),
            }));
        },
    });

export default definePage({
    id: "w5.hole.gambit",
    world: 5,
    system: "Hole",
    tab: "Gambit",
    description: "Gambit times.",
    component: GambitTab,
});
