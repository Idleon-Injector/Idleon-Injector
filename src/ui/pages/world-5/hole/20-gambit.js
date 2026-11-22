/**
 * W5 - Hole › Gambit
 *
 * Data sources:
 *   gga.Holes[11][65]    - king's gambit
 *   gga.Holes[11][66]    - horsey's gambit
 *   gga.Holes[11][67]    - bishop's gambit
 *   gga.Holes[11][68]    - queen's gambit
 *   gga.Holes[11][69]    - castle's gambit
 *   gga.Holes[11][70]    - noob's gambit
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [
    { index: 65, name: "King's Gambit" },
    { index: 66, name: "Horsey's Gambit" },
    { index: 67, name: "Bishop's Gambit" },
    { index: 68, name: "Queen's Gambit" },
    { index: 69, name: "Castle's Gambit" },
    { index: 70, name: "Noob's Gambit" },
];

const GambitTab = () =>
    SimpleAccountListPage({
        title: "Gambit",
        description: "Your best time in each gambit.",
        label: "Gambit",
        loadingText: "Reading the Gambit",
        errorTitle: "Couldn't read the Gambit",
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
    id: "w5.hole.gambit",
    world: 5,
    system: "Hole",
    tab: "Gambit",
    description: "Your best time in each gambit.",
    keywords: ["Gambit time", "Chess"],
    component: GambitTab,
});
