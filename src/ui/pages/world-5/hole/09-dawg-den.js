import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { toNum } from "../../../components/views/account/accountShared.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";

const DawgDenTab = () =>
    SimpleAccountListPage({
        title: "DAWG DEN",
        description: "Edit Dawg Den highscore from Holes[11][8].",
        label: "Hole Dawg Den",
        loadEntries: async () => {
            const holes = await gga("Holes");
            const stats = toIndexedArray(toIndexedArray(holes)[11]);
            return [
                {
                    key: "dawg-den-highscore",
                    index: 8,
                    name: "Highscore",
                    path: "Holes[11][8]",
                    value: toNum(stats[8], 0),
                },
            ];
        },
    });

export default definePage({
    id: "w5.hole.dawgden",
    world: 5,
    system: "Hole",
    tab: "Dawg Den",
    description: "The Dawg Den highscore.",
    keywords: ["The Den"],
    component: DawgDenTab,
});
