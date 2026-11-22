/**
 * W5 - Hole › Evertree
 *
 * Data sources:
 *   gga.Holes[11][4]     - everlog chopped this trunk
 *   gga.Holes[11][5]     - trunks whittled
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [
    { index: 4, name: "Everlog chopped this trunk" },
    { index: 5, name: "Trunks whittled" },
];

const EvertreeTab = () =>
    SimpleAccountListPage({
        title: "Evertree",
        description: "Everlog chopped toward the next trunk, and the trunks done.",
        label: "Evertree",
        loadingText: "Reading the Evertree",
        errorTitle: "Couldn't read the Evertree",
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
    id: "w5.hole.evertree",
    world: 5,
    system: "Hole",
    tab: "Evertree",
    description: "Everlog chopped toward the next trunk, and the trunks done.",
    keywords: ["Skill", "Choppin", "Trunks"],
    component: EvertreeTab,
});
