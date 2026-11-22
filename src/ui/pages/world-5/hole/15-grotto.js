/**
 * W5 - Hole › Grotto
 *
 * Data sources:
 *   gga.Holes[11][26]    - colonies cleared
 *   gga.Holes[11][27]    - gloomies killed this colony
 *   gga.Holes[11][28]    - gloomies killed in all
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [
    { index: 26, name: "Colonies cleared" },
    { index: 27, name: "Gloomies killed this colony" },
    { index: 28, name: "Gloomies killed in all" },
];

const GrottoTab = () =>
    SimpleAccountListPage({
        title: "Grotto",
        description: "Colonies cleared and Gloomies killed.",
        label: "Grotto",
        loadingText: "Reading the Grotto",
        errorTitle: "Couldn't read the Grotto",
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
    id: "w5.hole.grotto",
    world: 5,
    system: "Hole",
    tab: "Grotto",
    description: "Colonies cleared and Gloomies killed.",
    keywords: ["Gloomies", "Colonies"],
    component: GrottoTab,
});
