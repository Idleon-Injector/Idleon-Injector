/**
 * W5 - Hole › Trench
 *
 * Data sources:
 *   gga.Holes[11][6]     - fish caught this layer
 *   gga.Holes[11][7]     - layers completed
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [
    { index: 6, name: "Fish caught this layer" },
    { index: 7, name: "Layers completed" },
];

const TrenchTab = () =>
    SimpleAccountListPage({
        title: "Trench",
        description: "Fish caught toward the next layer, and the layers done.",
        label: "Trench",
        loadingText: "Reading the Trench",
        errorTitle: "Couldn't read the Trench",
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
    id: "w5.hole.trench",
    world: 5,
    system: "Hole",
    tab: "Trench",
    description: "Fish caught toward the next layer, and the layers done.",
    keywords: ["Skill", "Bottomless Trench", "Fishing"],
    component: TrenchTab,
});
