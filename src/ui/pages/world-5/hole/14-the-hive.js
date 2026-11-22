/**
 * W5 - Hole › The Hive
 *
 * Data sources:
 *   gga.Holes[11][2]     - bugs caught this harvest
 *   gga.Holes[11][3]     - harvests completed
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [
    { index: 2, name: "Bugs caught this harvest" },
    { index: 3, name: "Harvests completed" },
];

const HiveTab = () =>
    SimpleAccountListPage({
        title: "The Hive",
        description: "Bugs caught toward the next harvest, and the harvests done.",
        label: "The Hive",
        loadingText: "Reading the Hive",
        errorTitle: "Couldn't read the Hive",
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
    id: "w5.hole.hive",
    world: 5,
    system: "Hole",
    group: "Caverns",
    tab: "The Hive",
    description: "Bugs caught toward the next harvest, and the harvests done.",
    keywords: ["Skill", "Undying Hive", "Catching", "Fractal Fly"],
    component: HiveTab,
});
