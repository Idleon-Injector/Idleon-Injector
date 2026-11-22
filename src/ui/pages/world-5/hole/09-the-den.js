/**
 * W5 - Hole › The Den
 *
 * Data sources:
 *   gga.Holes[11][8]     - highscore
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const FIELDS = [{ index: 8, name: "Highscore" }];

const DawgdenTab = () =>
    SimpleAccountListPage({
        title: "The Den",
        description: "The Dawg Den's highscore.",
        label: "The Den",
        loadingText: "Reading the Den",
        errorTitle: "Couldn't read the Den",
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
    id: "w5.hole.dawgden",
    world: 5,
    system: "Hole",
    tab: "The Den",
    description: "The Dawg Den's highscore.",
    keywords: ["Dawg Den"],
    component: DawgdenTab,
});
