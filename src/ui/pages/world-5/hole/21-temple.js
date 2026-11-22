/**
 * W5 - Hole › Temple
 *
 * Data sources:
 *   gga.Holes[11][56]    - torches
 *   gga.Holes[11][57]    - illuminate upgrades bought
 *   gga.Holes[11][58]    - search upgrade level
 *   gga.Holes[11][59]    - amplify upgrades bought
 *   gga.Holes[11][55]    - centurions killed
 *   gga.Holes[11][63]    - golems killed
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [
    { index: 56, name: "Torches" },
    { index: 57, name: "Illuminate upgrades bought" },
    { index: 58, name: "Search upgrade level" },
    { index: 59, name: "Amplify upgrades bought" },
    { index: 55, name: "Centurions killed" },
    { index: 63, name: "Golems killed" },
];

const TempleTab = () =>
    SimpleAccountListPage({
        title: "Temple",
        description: "Torches, the Temple's upgrades and the foes it has seen fall.",
        label: "Temple",
        loadingText: "Reading the Temple",
        errorTitle: "Couldn't read the Temple",
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
    id: "w5.hole.temple",
    world: 5,
    system: "Hole",
    tab: "Temple",
    description: "Torches, the Temple's upgrades and the foes it has seen fall.",
    keywords: ["Torches", "Illuminate", "Amplify", "Centurions", "Golems"],
    component: TempleTab,
});
