/**
 * W5 - Hole › Motherlode
 *
 * Data sources:
 *   gga.Holes[11][0]     - ore mined this layer
 *   gga.Holes[11][1]     - layers completed
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [
    { index: 0, name: "Ore mined this layer" },
    { index: 1, name: "Layers completed" },
];

const MotherlodeTab = () =>
    SimpleAccountListPage({
        title: "Motherlode",
        description: "Ore mined toward the next layer, and the layers done.",
        label: "Motherlode",
        loadingText: "Reading the Motherlode",
        errorTitle: "Couldn't read the Motherlode",
        loadEntries: async () => {
            const stats = toIndexedArray(toIndexedArray(await gga("Holes"))[11] ?? []);
            return FIELDS.map((field) => ({
                key: String(field.index),
                name: field.name,
                path: `Holes[11][${field.index}]`,
                value: toNum(stats[field.index], 0),
            }));
        },
    });

export default definePage({
    id: "w5.hole.motherlode",
    world: 5,
    system: "Hole",
    group: "Caverns",
    tab: "Motherlode",
    description: "Ore mined toward the next layer, and the layers done.",
    keywords: ["Skill", "Mining", "Layers"],
    component: MotherlodeTab,
});
